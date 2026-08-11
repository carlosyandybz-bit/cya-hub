-- CYA Hub v21: real class duration, robust billing and explicit negative-balance incidents.

alter table public.classes
  add column if not exists actual_end_at timestamptz,
  add column if not exists actual_duration_minutes integer,
  add column if not exists billed_duration_minutes integer,
  add column if not exists duration_source text,
  add column if not exists administratively_finished_by uuid references auth.users(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='classes_actual_duration_minutes_check') then
    alter table public.classes add constraint classes_actual_duration_minutes_check
      check (actual_duration_minutes is null or (actual_duration_minutes > 0 and actual_duration_minutes <= 480));
  end if;
  if not exists (select 1 from pg_constraint where conname='classes_billed_duration_minutes_check') then
    alter table public.classes add constraint classes_billed_duration_minutes_check
      check (billed_duration_minutes is null or (billed_duration_minutes > 0 and billed_duration_minutes <= 480));
  end if;
  if not exists (select 1 from pg_constraint where conname='classes_duration_source_check') then
    alter table public.classes add constraint classes_duration_source_check
      check (duration_source is null or duration_source in ('elapsed','manual','legacy_scheduled'));
  end if;
end $$;

alter table public.class_participants
  add column if not exists billed_minutes integer not null default 0,
  add column if not exists uncovered_minutes integer not null default 0,
  add column if not exists billing_status text not null default 'planned';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='class_participants_billed_minutes_check') then
    alter table public.class_participants add constraint class_participants_billed_minutes_check
      check (billed_minutes >= 0 and billed_minutes <= 480);
  end if;
  if not exists (select 1 from pg_constraint where conname='class_participants_uncovered_minutes_check') then
    alter table public.class_participants add constraint class_participants_uncovered_minutes_check
      check (uncovered_minutes >= 0 and uncovered_minutes <= 480 and uncovered_minutes <= billed_minutes);
  end if;
  if not exists (select 1 from pg_constraint where conname='class_participants_billing_status_check') then
    alter table public.class_participants add constraint class_participants_billing_status_check
      check (billing_status in ('planned','covered','partial','uncovered','not_billable','accepted_uncovered'));
  end if;
end $$;

create table if not exists public.student_incidents (
  id bigint generated always as identity primary key,
  incident_type text not null,
  status text not null default 'open',
  title text not null,
  related_class_id bigint references public.classes(id) on delete restrict,
  related_grant_id bigint references public.credit_grants(id) on delete set null,
  debt_minutes integer not null default 0,
  remaining_minutes integer not null default 0,
  dedupe_key text not null unique,
  resolution_mode text,
  resolution_note text,
  resolution_grant_id bigint references public.credit_grants(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint student_incidents_type_check check (incident_type in ('negative_balance')),
  constraint student_incidents_status_check check (status in ('open','resolved','accepted')),
  constraint student_incidents_minutes_check check (debt_minutes > 0 and remaining_minutes >= 0 and remaining_minutes <= debt_minutes),
  constraint student_incidents_resolution_mode_check check (resolution_mode is null or resolution_mode in ('regularized','accepted_without_regularization'))
);

create table if not exists public.student_incident_people (
  incident_id bigint not null references public.student_incidents(id) on delete cascade,
  person_id bigint not null references public.student_profiles(person_id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (incident_id, person_id)
);

create index if not exists student_incidents_status_idx on public.student_incidents(status, incident_type, created_at desc);
create index if not exists student_incidents_class_idx on public.student_incidents(related_class_id) where related_class_id is not null;
create index if not exists student_incident_people_person_idx on public.student_incident_people(person_id, incident_id);

alter table public.student_incidents enable row level security;
alter table public.student_incident_people enable row level security;

drop policy if exists student_incidents_staff_select on public.student_incidents;
create policy student_incidents_staff_select on public.student_incidents
  for select to authenticated using ((select private.is_staff()));
drop policy if exists student_incidents_staff_insert on public.student_incidents;
create policy student_incidents_staff_insert on public.student_incidents
  for insert to authenticated with check ((select private.is_staff()) and created_by=(select auth.uid()));
drop policy if exists student_incidents_staff_update on public.student_incidents;
create policy student_incidents_staff_update on public.student_incidents
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));

drop policy if exists student_incident_people_staff_select on public.student_incident_people;
create policy student_incident_people_staff_select on public.student_incident_people
  for select to authenticated using ((select private.is_staff()));
drop policy if exists student_incident_people_staff_insert on public.student_incident_people;
create policy student_incident_people_staff_insert on public.student_incident_people
  for insert to authenticated with check ((select private.is_staff()));
drop policy if exists student_incident_people_staff_update on public.student_incident_people;
create policy student_incident_people_staff_update on public.student_incident_people
  for update to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists student_incident_people_staff_delete on public.student_incident_people;
create policy student_incident_people_staff_delete on public.student_incident_people
  for delete to authenticated using ((select private.is_staff()));

grant select,insert,update on public.student_incidents to authenticated;
grant select,insert,update,delete on public.student_incident_people to authenticated;
grant usage,select on sequence public.student_incidents_id_seq to authenticated;

create or replace function private.upsert_negative_balance_incident(
  p_class_id bigint,
  p_grant_id bigint,
  p_debt_minutes integer,
  p_person_ids bigint[],
  p_dedupe_key text
) returns public.student_incidents
language plpgsql
set search_path=''
as $$
declare
  v_incident public.student_incidents;
  v_person bigint;
begin
  if p_debt_minutes is null or p_debt_minutes <= 0 then
    raise exception 'La deuda de la incidencia debe ser positiva.' using errcode='22023';
  end if;
  if cardinality(coalesce(p_person_ids,'{}'::bigint[]))=0 then
    raise exception 'La incidencia necesita al menos un alumno.' using errcode='22023';
  end if;

  insert into public.student_incidents(
    incident_type,status,title,related_class_id,related_grant_id,debt_minutes,remaining_minutes,dedupe_key,detail,created_by
  ) values(
    'negative_balance','open','Saldo negativo pendiente',p_class_id,p_grant_id,p_debt_minutes,p_debt_minutes,p_dedupe_key,
    jsonb_build_object('origin','class_finish'),(select auth.uid())
  )
  on conflict (dedupe_key) do update
    set updated_at=now()
  returning * into v_incident;

  foreach v_person in array p_person_ids loop
    insert into public.student_incident_people(incident_id,person_id)
    values(v_incident.id,v_person)
    on conflict do nothing;
  end loop;

  return v_incident;
end;
$$;

revoke all on function private.upsert_negative_balance_incident(bigint,bigint,integer,bigint[],text) from public;

create or replace function public.administratively_finish_class_v2(
  p_class_id bigint,
  p_person_ids bigint[],
  p_attendance text[],
  p_grant_ids bigint[],
  p_actual_duration_minutes integer default null
) returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_expected integer;
  v_end_at timestamptz:=now();
  v_duration integer;
  v_duration_source text;
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

  -- Idempotency: a repeated click or concurrent retry never consumes credit twice.
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

  if p_actual_duration_minutes is not null then
    if p_actual_duration_minutes<=0 or p_actual_duration_minutes>480 then
      raise exception 'La duración real debe estar entre 1 y 480 minutos.' using errcode='22023';
    end if;
    v_duration:=p_actual_duration_minutes;
    v_duration_source:='manual';
  elsif v_class.started_at is not null then
    v_duration:=greatest(1,least(480,round(extract(epoch from (v_end_at-v_class.started_at))/60.0)::integer));
    v_duration_source:='elapsed';
  else
    v_duration:=v_class.duration_minutes;
    v_duration_source:='legacy_scheduled';
  end if;

  -- Validate attendance and selected grants before changing anything.
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

  -- Persist attendance first; billing details are filled below in the same transaction.
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

  -- A selected pair grant is consumed once even when both participants point to it.
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

  -- Present participants without a grant become explicitly negative instead of silently unbilled.
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
        actual_end_at=v_end_at,
        actual_duration_minutes=v_duration,
        billed_duration_minutes=v_duration,
        duration_source=v_duration_source,
        administrative_finished_at=v_end_at,
        administratively_finished_by=(select auth.uid()),
        updated_at=now()
  where id=p_class_id
  returning * into v_class;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('class_administratively_finished','class',p_class_id::text,'Clase terminada administrativamente',
    jsonb_build_object(
      'scheduled_duration_minutes',v_class.duration_minutes,
      'actual_duration_minutes',v_duration,
      'duration_source',v_duration_source,
      'actual_end_at',v_end_at
    ),(select auth.uid()));

  return v_class;
end;
$$;

create or replace function public.administratively_finish_class(
  p_class_id bigint,
  p_person_ids bigint[],
  p_attendance text[],
  p_grant_ids bigint[]
) returns public.classes
language sql
volatile
set search_path=''
as $$
  select public.administratively_finish_class_v2(p_class_id,p_person_ids,p_attendance,p_grant_ids,null);
$$;

create or replace function public.regularize_student_incident(
  p_incident_id bigint,
  p_grant_id bigint
) returns public.student_incidents
language plpgsql
set search_path=''
as $$
declare
  v_incident public.student_incidents;
  v_balance integer;
  v_apply integer;
  v_people bigint[];
  v_movement_person bigint;
  v_grant_modality text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para gestionar incidencias.' using errcode='42501';
  end if;

  select * into v_incident from public.student_incidents where id=p_incident_id for update;
  if not found then raise exception 'La incidencia no existe.' using errcode='P0002'; end if;
  if v_incident.incident_type<>'negative_balance' or v_incident.status<>'open' then
    raise exception 'La incidencia ya no tiene saldo pendiente.' using errcode='22023';
  end if;

  select modality into v_grant_modality from public.credit_grants where id=p_grant_id and status='active' for update;
  if not found then raise exception 'El bono no está activo.' using errcode='22023'; end if;

  select array_agg(person_id order by person_id), case when count(*)=1 then min(person_id) else null end
    into v_people,v_movement_person
  from public.student_incident_people where incident_id=p_incident_id;

  if v_grant_modality='individual' and cardinality(v_people)<>1 then
    raise exception 'Una incidencia compartida necesita un bono de pareja.' using errcode='22023';
  end if;
  if exists(
    select 1 from unnest(v_people) p(person_id)
    where not exists(select 1 from public.credit_grant_members gm where gm.grant_id=p_grant_id and gm.person_id=p.person_id)
  ) then
    raise exception 'El bono no pertenece a todos los alumnos de esta incidencia.' using errcode='22023';
  end if;

  select coalesce(sum(delta_minutes),0)::integer into v_balance from public.credit_movements where grant_id=p_grant_id;
  if v_balance<=0 then raise exception 'Ese bono no tiene saldo disponible.' using errcode='22023'; end if;

  v_apply:=least(v_balance,v_incident.remaining_minutes);
  insert into public.credit_movements(grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by)
  values(p_grant_id,v_movement_person,v_incident.related_class_id,'adjustment',-v_apply,
    'Regularización de saldo pendiente · incidencia '||p_incident_id::text,(select auth.uid()));

  if v_balance-v_apply<=0 then
    update public.credit_grants set status='exhausted',updated_at=now() where id=p_grant_id;
  end if;

  update public.student_incidents
    set remaining_minutes=remaining_minutes-v_apply,
        resolution_grant_id=p_grant_id,
        status=case when remaining_minutes-v_apply=0 then 'resolved' else 'open' end,
        resolution_mode=case when remaining_minutes-v_apply=0 then 'regularized' else null end,
        resolved_at=case when remaining_minutes-v_apply=0 then now() else null end,
        resolved_by=case when remaining_minutes-v_apply=0 then (select auth.uid()) else null end,
        updated_at=now()
  where id=p_incident_id
  returning * into v_incident;

  update public.class_participants cp
    set uncovered_minutes=v_incident.remaining_minutes,
        billing_status=case when v_incident.remaining_minutes=0 then 'covered' else 'partial' end,
        billing_grant_id=coalesce(cp.billing_grant_id,p_grant_id),
        updated_at=now()
  where cp.class_id=v_incident.related_class_id and cp.person_id=any(v_people);

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('financial_incident_regularized','student_incident',p_incident_id::text,
    case when v_incident.status='resolved' then 'Incidencia de saldo regularizada' else 'Incidencia de saldo regularizada parcialmente' end,
    jsonb_build_object('grant_id',p_grant_id,'applied_minutes',v_apply,'remaining_minutes',v_incident.remaining_minutes),
    (select auth.uid()));

  return v_incident;
end;
$$;

create or replace function public.accept_student_incident_without_regularization(
  p_incident_id bigint,
  p_note text
) returns public.student_incidents
language plpgsql
set search_path=''
as $$
declare
  v_incident public.student_incidents;
  v_people bigint[];
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para gestionar incidencias.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_note,'')))<3 then
    raise exception 'Escribe un motivo breve para dejar constancia de la decisión.' using errcode='22023';
  end if;

  select * into v_incident from public.student_incidents where id=p_incident_id for update;
  if not found then raise exception 'La incidencia no existe.' using errcode='P0002'; end if;
  if v_incident.incident_type<>'negative_balance' or v_incident.status<>'open' then
    raise exception 'La incidencia ya está gestionada.' using errcode='22023';
  end if;

  select array_agg(person_id order by person_id) into v_people
  from public.student_incident_people where incident_id=p_incident_id;

  update public.student_incidents
    set status='accepted',resolution_mode='accepted_without_regularization',resolution_note=btrim(p_note),
        resolved_at=now(),resolved_by=(select auth.uid()),updated_at=now()
  where id=p_incident_id returning * into v_incident;

  update public.class_participants
    set billing_status='accepted_uncovered',updated_at=now()
  where class_id=v_incident.related_class_id and person_id=any(v_people);

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('financial_incident_accepted','student_incident',p_incident_id::text,
    'Saldo pendiente aceptado sin regularización',
    jsonb_build_object('remaining_minutes',v_incident.remaining_minutes,'note',btrim(p_note),'person_ids',v_people),
    (select auth.uid()));

  return v_incident;
end;
$$;

revoke all on function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer) from public,anon;
revoke all on function public.administratively_finish_class(bigint,bigint[],text[],bigint[]) from public,anon;
revoke all on function public.regularize_student_incident(bigint,bigint) from public,anon;
revoke all on function public.accept_student_incident_without_regularization(bigint,text) from public,anon;
grant execute on function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer) to authenticated;
grant execute on function public.administratively_finish_class(bigint,bigint[],text[],bigint[]) to authenticated;
grant execute on function public.regularize_student_incident(bigint,bigint) to authenticated;
grant execute on function public.accept_student_incident_without_regularization(bigint,text) to authenticated;

-- Backfill historical finished classes with their previous scheduled duration; no existing financial history is rewritten.
update public.classes
set actual_end_at=coalesce(actual_end_at,administrative_finished_at),
    actual_duration_minutes=coalesce(actual_duration_minutes,duration_minutes),
    billed_duration_minutes=coalesce(billed_duration_minutes,duration_minutes),
    duration_source=coalesce(duration_source,'legacy_scheduled')
where status='finished' and administrative_finished_at is not null;

update public.class_participants cp
set billed_minutes=case when cp.attendance_status='present' then c.duration_minutes else 0 end,
    uncovered_minutes=case when cp.attendance_status='present' and cp.billing_grant_id is null then c.duration_minutes else 0 end,
    billing_status=case
      when cp.attendance_status='absent' then 'not_billable'
      when cp.attendance_status='present' and cp.billing_grant_id is null then 'uncovered'
      when cp.attendance_status='present' then 'covered'
      else 'planned'
    end
from public.classes c
where c.id=cp.class_id and c.status='finished';

-- Expose a safe financial summary in the student snapshot without exposing internal incident notes.
create or replace function private.student_portal_snapshot_for(p_person_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_current bigint;
  v_credit integer;
  v_debt integer;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff()) and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para ver esta experiencia de alumno.' using errcode='42501';
  end if;
  if not exists(select 1 from public.student_profiles where person_id=p_person_id and active) then
    raise exception 'La ficha de alumno no está activa.' using errcode='P0002';
  end if;

  select coalesce(sum(greatest(0,coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0))),0)::integer
    into v_credit
  from public.credit_grant_members gm join public.credit_grants g on g.id=gm.grant_id
  where gm.person_id=p_person_id and g.status='active';

  select coalesce(sum(i.remaining_minutes),0)::integer into v_debt
  from public.student_incidents i
  join public.student_incident_people ip on ip.incident_id=i.id
  where ip.person_id=p_person_id and i.incident_type='negative_balance' and i.status='open';

  select jsonb_build_object(
    'profile',(select jsonb_build_object('id',p.id,'display_name',p.display_name,'first_name',p.first_name,'last_name',p.last_name,
      'email',p.email,'phone',p.phone,'country_code',p.country_code,'student_since',sp.student_since,'goals',sp.goals)
      from public.people p join public.student_profiles sp on sp.person_id=p.id where p.id=p_person_id),
    'financial',jsonb_build_object(
      'available_credit_minutes',v_credit,
      'pending_debt_minutes',v_debt,
      'net_balance_minutes',v_credit-v_debt,
      'open_incident_count',(select count(distinct i.id) from public.student_incidents i join public.student_incident_people ip on ip.incident_id=i.id where ip.person_id=p_person_id and i.status='open')
    ),
    'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'class_type',c.class_type,'status',c.status,
      'scheduled_start_at',c.scheduled_start_at,'duration_minutes',c.duration_minutes,'actual_duration_minutes',c.actual_duration_minutes,
      'billed_duration_minutes',c.billed_duration_minutes,'style',style.label,'attendance_status',cp.attendance_status,
      'billing_status',cp.billing_status,'uncovered_minutes',cp.uncovered_minutes,'role',role_term.label,'level',level_term.label) order by c.scheduled_start_at desc)
      from public.class_participants cp join public.classes c on c.id=cp.class_id
      left join public.catalog_terms style on style.id=c.style_term_id left join public.catalog_terms role_term on role_term.id=cp.role_term_id
      left join public.catalog_terms level_term on level_term.id=cp.level_term_id where cp.person_id=p_person_id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'modality',g.modality,
      'total_minutes',g.total_minutes,'balance_minutes',coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0),
      'status',g.status,'purchased_at',g.purchased_at,'expires_at',g.expires_at) order by g.purchased_at desc)
      from public.credit_grant_members gm join public.credit_grants g on g.id=gm.grant_id where gm.person_id=p_person_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'content_id',a.content_id,'title',tc.title,
      'content_type',tc.content_type,'description',tc.description,'correction_guidance',tc.correction_guidance,
      'assignment_status',a.assignment_status,'current_frequency',a.current_frequency,'current_importance',a.current_importance,
      'updated_at',a.updated_at,'media',coalesce((select jsonb_agg(jsonb_build_object(
        'id',media.id,'media_type',media.media_type,'provider',media.provider,'external_file_id',media.external_file_id,
        'title',media.title,'mime_type',media.mime_type,'group_label',media.group_label,'is_cover',media.is_cover,
        'is_preview',media.is_preview,'display_in_resources',media.display_in_resources,
        'thumbnail_external_file_id',media.thumbnail_external_file_id,'thumbnail_mime_type',media.thumbnail_mime_type,
        'preview_start_seconds',media.preview_start_seconds,'preview_end_seconds',media.preview_end_seconds
      ) order by media.sort_order,media.id)
        from public.teaching_content_media media where media.content_id=tc.id),'[]'::jsonb)) order by a.updated_at desc)
      from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
      where a.person_id=p_person_id and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'),'[]'::jsonb),
    'evaluations',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'class_id',e.class_id,'score',e.score,
      'aptitude',apt.label,'created_at',e.created_at) order by e.created_at desc)
      from public.student_evaluations e join public.catalog_terms apt on apt.id=e.aptitude_term_id where e.person_id=p_person_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;