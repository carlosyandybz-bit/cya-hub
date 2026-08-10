-- CYA Hub v26
-- A class never derives billable duration from elapsed wall-clock time.
-- started_at / administrative_finished_at remain audit/state timestamps only.

alter table public.classes drop constraint if exists classes_duration_source_check;
alter table public.classes add constraint classes_duration_source_check
  check (duration_source is null or duration_source in ('elapsed','manual','legacy_scheduled','scheduled'));

create or replace function public.administratively_finish_class_v2(
  p_class_id bigint,
  p_person_ids bigint[],
  p_attendance text[],
  p_grant_ids bigint[],
  p_actual_duration_minutes integer default null
)
returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_expected integer;
  v_end_at timestamptz:=now();
  v_duration integer;
  i integer;
  v_person_id bigint;
  v_grant_id bigint;
  v_attendance text;
  v_balance integer;
  v_covered integer;
  v_shortfall integer;
  v_people bigint[];
  v_movement_person bigint;
  v_incident public.student_incidents;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para terminar clases.' using errcode='42501';
  end if;

  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;

  if v_class.status='finished' and v_class.administrative_finished_at is not null then
    return v_class;
  end if;
  if v_class.status<>'active' then
    raise exception 'Solo se puede terminar una clase activa.' using errcode='22023';
  end if;

  select count(*) into v_expected from public.class_participants where class_id=p_class_id;
  if cardinality(coalesce(p_person_ids,'{}'::bigint[]))<>v_expected
     or cardinality(coalesce(p_attendance,'{}'::text[]))<>v_expected
     or cardinality(coalesce(p_grant_ids,'{}'::bigint[]))<>v_expected then
    raise exception 'Faltan datos de asistencia o bono.' using errcode='22023';
  end if;
  if (select count(distinct x) from unnest(p_person_ids) x)<>v_expected
     or (select count(*) from public.class_participants where class_id=p_class_id and person_id=any(p_person_ids))<>v_expected then
    raise exception 'La lista de alumnos no coincide con la clase.' using errcode='22023';
  end if;

  -- Compatibility argument intentionally ignored. Billing always uses the class plan.
  v_duration:=v_class.duration_minutes;
  if v_duration is null or v_duration<=0 or v_duration>480 then
    raise exception 'La duración prevista de la clase no es válida.' using errcode='22023';
  end if;

  for i in 1..v_expected loop
    v_person_id:=p_person_ids[i];
    v_attendance:=p_attendance[i];
    v_grant_id:=p_grant_ids[i];
    if v_attendance not in ('present','absent') then
      raise exception 'Asistencia no válida.' using errcode='22023';
    end if;
    if v_attendance='absent' and v_grant_id is not null then
      raise exception 'Un alumno ausente no puede consumir bono.' using errcode='22023';
    end if;
    if v_grant_id is not null and not exists(
      select 1
      from public.credit_grants g
      join public.credit_grant_members gm on gm.grant_id=g.id
      where g.id=v_grant_id and gm.person_id=v_person_id and g.status='active'
    ) then
      raise exception 'El bono seleccionado no está disponible para este alumno.' using errcode='22023';
    end if;
  end loop;

  for i in 1..v_expected loop
    v_person_id:=p_person_ids[i];
    v_attendance:=p_attendance[i];
    v_grant_id:=p_grant_ids[i];
    update public.class_participants
      set attendance_status=v_attendance,
          billing_grant_id=case when v_attendance='present' then v_grant_id else null end,
          billed_minutes=case when v_attendance='present' then v_duration else 0 end,
          uncovered_minutes=0,
          billing_status=case when v_attendance='present' then 'covered' else 'not_billable' end
    where class_id=p_class_id and person_id=v_person_id;
  end loop;

  for v_grant_id in
    select distinct x.grant_id
    from unnest(p_person_ids,p_attendance,p_grant_ids) as x(person_id,attendance,grant_id)
    where x.attendance='present' and x.grant_id is not null
  loop
    perform 1 from public.credit_grants where id=v_grant_id for update;
    select coalesce(sum(delta_minutes),0)::integer into v_balance
      from public.credit_movements where grant_id=v_grant_id;

    v_covered:=least(greatest(v_balance,0),v_duration);
    v_shortfall:=v_duration-v_covered;

    select array_agg(x.person_id order by x.person_id),
           case when count(*)=1 then min(x.person_id) else null end
      into v_people,v_movement_person
    from unnest(p_person_ids,p_attendance,p_grant_ids) as x(person_id,attendance,grant_id)
    where x.attendance='present' and x.grant_id=v_grant_id;

    if v_covered>0 then
      insert into public.credit_movements(grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by)
      values(v_grant_id,v_movement_person,p_class_id,'class',-v_covered,
        case when v_shortfall>0 then 'Consumo de clase · saldo parcial' else 'Consumo de clase' end,
        (select auth.uid()));
    end if;

    if v_balance-v_covered<=0 then
      update public.credit_grants set status='exhausted',updated_at=now() where id=v_grant_id;
    end if;

    if v_shortfall>0 then
      update public.class_participants
        set uncovered_minutes=v_shortfall,billing_status='partial'
      where class_id=p_class_id and person_id=any(v_people);

      v_incident:=private.upsert_negative_balance_incident(
        p_class_id,v_grant_id,v_shortfall,v_people,
        'class:'||p_class_id::text||':grant:'||v_grant_id::text
      );
      insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
      values('financial_incident_created','student_incident',v_incident.id::text,'Saldo insuficiente al terminar una clase',
        jsonb_build_object('class_id',p_class_id,'grant_id',v_grant_id,'debt_minutes',v_shortfall,'person_ids',v_people),
        (select auth.uid()));
    end if;
  end loop;

  for i in 1..v_expected loop
    v_person_id:=p_person_ids[i];
    v_attendance:=p_attendance[i];
    v_grant_id:=p_grant_ids[i];
    if v_attendance='present' and v_grant_id is null then
      update public.class_participants
        set uncovered_minutes=v_duration,billing_status='uncovered'
      where class_id=p_class_id and person_id=v_person_id;

      v_incident:=private.upsert_negative_balance_incident(
        p_class_id,null,v_duration,array[v_person_id],
        'class:'||p_class_id::text||':person:'||v_person_id::text
      );
      insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
      values('financial_incident_created','student_incident',v_incident.id::text,'Clase terminada sin bono: saldo negativo pendiente',
        jsonb_build_object('class_id',p_class_id,'person_id',v_person_id,'debt_minutes',v_duration),
        (select auth.uid()));
    end if;
  end loop;

  update public.classes
    set status='finished',
        actual_end_at=null,
        actual_duration_minutes=null,
        billed_duration_minutes=v_duration,
        duration_source='scheduled',
        administrative_finished_at=v_end_at,
        administratively_finished_by=(select auth.uid()),
        updated_at=now()
  where id=p_class_id
  returning * into v_class;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('class_administratively_finished','class',p_class_id::text,'Clase terminada administrativamente',
    jsonb_build_object(
      'scheduled_duration_minutes',v_class.duration_minutes,
      'billed_duration_minutes',v_duration,
      'duration_source','scheduled',
      'administrative_finished_at',v_end_at
    ),(select auth.uid()));

  return v_class;
end;
$$;
