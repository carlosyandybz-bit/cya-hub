-- ATTENDANCE-START-01
-- R1 forward migration: a real class start records durable PRESENT attendance.
-- STAGING authoring only. No historical backfill.

-- Extend durable attendance provenance without rewriting applied Attendance migrations.
alter table public.class_attendance_events
  drop constraint if exists class_attendance_events_source_check;

alter table public.class_attendance_events
  add constraint class_attendance_events_source_check
  check (source = any (array[
    'administrative_finish'::text,
    'explicit_record'::text,
    'correction'::text,
    'session_start'::text
  ]));

-- The original auto-start fact is unique by session(class)+person+provenance.
-- This is deliberately independent from the latest projected attendance state so a later
-- correction cannot be semantically undone by a delayed/repeated start request.
create unique index if not exists class_attendance_events_session_start_once_uidx
  on public.class_attendance_events(class_id, person_id)
  where source = 'session_start';

create or replace function private.record_class_attendance_fact(
  p_class_id bigint,
  p_person_id bigint,
  p_attendance_status text,
  p_absence_reason text,
  p_effective_at timestamptz,
  p_source text,
  p_supersedes_event_id bigint default null,
  p_correction_reason text default null,
  p_detail jsonb default '{}'::jsonb
)
returns public.class_attendance_events
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing public.class_attendance_events;
  v_start_existing public.class_attendance_events;
  v_event public.class_attendance_events;
  v_actor uuid := (select auth.uid());
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para registrar hechos de asistencia.' using errcode='42501';
  end if;

  if p_attendance_status not in ('present','absent') then
    raise exception 'Asistencia no válida.' using errcode='22023';
  end if;
  if p_attendance_status='present' and p_absence_reason is not null then
    raise exception 'Una asistencia presente no admite motivo de ausencia.' using errcode='22023';
  end if;
  if p_attendance_status='absent' and p_absence_reason is not null
     and p_absence_reason not in ('no_show','excused','cancelled_by_student','other') then
    raise exception 'Motivo de ausencia no válido.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.class_participants cp
    where cp.class_id=p_class_id and cp.person_id=p_person_id
  ) then
    raise exception 'La persona no participa en esta clase.' using errcode='22023';
  end if;

  -- Idempotency for the original start event is provenance-based, not projection-based.
  -- If a later correction exists, a repeated start must reuse the original start fact
  -- instead of inserting a new PRESENT fact after the correction.
  if p_source='session_start' then
    select * into v_start_existing
    from public.class_attendance_events e
    where e.class_id=p_class_id
      and e.person_id=p_person_id
      and e.source='session_start'
    order by e.recorded_at asc,e.id asc
    limit 1
    for update;

    if v_start_existing.id is not null then
      return v_start_existing;
    end if;
  end if;

  select * into v_existing
  from public.class_attendance_events e
  where e.class_id=p_class_id and e.person_id=p_person_id
  order by e.recorded_at desc,e.id desc
  limit 1
  for update;

  if p_source<>'correction' and v_existing.id is not null then
    if v_existing.attendance_status=p_attendance_status
       and (p_absence_reason is null or v_existing.absence_reason is not distinct from p_absence_reason) then
      return v_existing;
    end if;
    raise exception 'La asistencia ya fue registrada; utiliza correct_class_attendance().' using errcode='22023';
  end if;

  if p_source='correction' then
    if v_existing.id is null or p_supersedes_event_id is distinct from v_existing.id then
      raise exception 'La corrección debe superseder el último hecho de asistencia.' using errcode='40001';
    end if;
    if nullif(btrim(p_correction_reason),'') is null then
      raise exception 'La corrección requiere motivo.' using errcode='22023';
    end if;
  elsif p_source not in ('administrative_finish','explicit_record','session_start') then
    raise exception 'Origen de asistencia no válido.' using errcode='22023';
  end if;

  insert into public.class_attendance_events(
    class_id,person_id,attendance_status,absence_reason,effective_at,recorded_by,
    source,supersedes_event_id,correction_reason,detail
  ) values(
    p_class_id,p_person_id,p_attendance_status,p_absence_reason,p_effective_at,v_actor,
    p_source,p_supersedes_event_id,nullif(btrim(p_correction_reason),''),coalesce(p_detail,'{}'::jsonb)
  ) returning * into v_event;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values(
    case when p_source='correction' then 'class_attendance_corrected' else 'class_attendance_recorded' end,
    'class_attendance',v_event.id::text,
    case when p_source='correction' then 'Asistencia corregida' else 'Asistencia real registrada' end,
    jsonb_build_object(
      'class_id',p_class_id,'person_id',p_person_id,'attendance_status',p_attendance_status,
      'absence_reason',p_absence_reason,'effective_at',p_effective_at,'source',p_source,
      'supersedes_event_id',p_supersedes_event_id,'correction_reason',nullif(btrim(p_correction_reason),'')
    ),v_actor
  );

  return v_event;
end;
$function$;

alter function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb)
  owner to postgres;
revoke execute on function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb) from public;
revoke execute on function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb) from anon;
revoke execute on function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb) from authenticated;
revoke execute on function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb) from service_role;

create or replace function public.start_class(p_class_id bigint)
returns public.classes
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_class public.classes;
  v_person_id bigint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para iniciar clases.' using errcode='42501';
  end if;

  select * into v_class
  from public.classes
  where id=p_class_id
  for update;

  if not found then
    raise exception 'La clase no existe.' using errcode='P0002';
  end if;

  -- A retry after a committed start is a no-op for Attendance. In particular, if
  -- attendance was subsequently corrected, retrying start cannot restore PRESENT.
  if v_class.status='active' then
    update public.classes
    set workflow_stage='live'
    where id=p_class_id
    returning * into v_class;
    return v_class;
  end if;

  if v_class.status<>'scheduled' then
    raise exception 'Solo se puede iniciar una clase programada.' using errcode='22023';
  end if;

  if v_class.style_term_id is null or not exists(
    select 1 from public.catalog_terms
    where id=v_class.style_term_id and taxonomy='dance_style' and active
  ) then
    raise exception 'Indica el estilo antes de empezar la clase.' using errcode='22023';
  end if;

  if exists(
    select 1 from public.class_participants
    where class_id=p_class_id and (role_term_id is null or level_term_id is null)
  ) then
    raise exception 'Confirma rol y nivel antes de empezar.' using errcode='22023';
  end if;

  update public.classes
  set status='active',
      started_at=coalesce(started_at,now()),
      workflow_stage='live'
  where id=p_class_id
  returning * into v_class;

  for v_person_id in
    select cp.person_id
    from public.class_participants cp
    where cp.class_id=p_class_id
    order by cp.person_id
  loop
    perform private.record_class_attendance_fact(
      p_class_id,
      v_person_id,
      'present',
      null,
      v_class.started_at,
      'session_start',
      null,
      null,
      jsonb_build_object(
        'origin','class_start',
        'class_type',v_class.class_type,
        'started_at',v_class.started_at
      )
    );
  end loop;

  return v_class;
end;
$function$;

alter function public.start_class(bigint) owner to postgres;
revoke execute on function public.start_class(bigint) from public;
revoke execute on function public.start_class(bigint) from anon;
grant execute on function public.start_class(bigint) to authenticated;
grant execute on function public.start_class(bigint) to service_role;

create or replace function public.start_manual_class(
  p_class_type text,
  p_student_ids bigint[],
  p_scheduled_start_at timestamptz,
  p_duration_minutes integer,
  p_style_term_id bigint,
  p_location_term_id bigint default null,
  p_notes text default null
)
returns public.classes
language plpgsql
security definer
set search_path=''
as $function$
declare
  clean_ids bigint[];
  new_class public.classes;
  expected_count integer;
  v_person_id bigint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para iniciar clases.' using errcode='42501';
  end if;
  if p_class_type not in ('individual','pair') then
    raise exception 'Tipo de clase no valido.' using errcode='22023';
  end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[])
  into clean_ids
  from (select distinct unnest(p_student_ids) id) s;
  expected_count:=case when p_class_type='pair' then 2 else 1 end;
  if cardinality(clean_ids)<>expected_count then
    raise exception 'La clase requiere % alumno(s) distintos.',expected_count using errcode='22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes<=0 or p_duration_minutes>480 then
    raise exception 'Duracion no valida.' using errcode='22023';
  end if;
  if p_scheduled_start_at is null then
    raise exception 'Fecha y hora obligatorias.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.catalog_terms
    where id=p_style_term_id and taxonomy='dance_style' and active
  ) then
    raise exception 'Estilo no valido.' using errcode='22023';
  end if;
  if (
    select count(*)
    from public.student_profiles sp
    join public.people p on p.id=sp.person_id
    where sp.person_id=any(clean_ids) and sp.active and p.active
  )<>expected_count then
    raise exception 'Hay alumnos no validos o inactivos.' using errcode='22023';
  end if;

  insert into public.classes(
    teacher_user_id,class_type,status,scheduled_start_at,duration_minutes,
    style_term_id,location_term_id,notes,started_at,created_by
  ) values(
    (select auth.uid()),p_class_type,'active',p_scheduled_start_at,p_duration_minutes,
    p_style_term_id,p_location_term_id,nullif(btrim(p_notes),''),now(),(select auth.uid())
  ) returning * into new_class;

  insert into public.class_participants(class_id,person_id)
  select new_class.id,unnest(clean_ids);

  for v_person_id in
    select cp.person_id
    from public.class_participants cp
    where cp.class_id=new_class.id
    order by cp.person_id
  loop
    perform private.record_class_attendance_fact(
      new_class.id,
      v_person_id,
      'present',
      null,
      new_class.started_at,
      'session_start',
      null,
      null,
      jsonb_build_object(
        'origin','manual_class_start',
        'class_type',new_class.class_type,
        'started_at',new_class.started_at
      )
    );
  end loop;

  return new_class;
end;
$function$;

alter function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) owner to postgres;
revoke execute on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) from public;
revoke execute on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) from anon;
grant execute on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) to authenticated;
grant execute on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) to service_role;

-- Fail closed if the private durable-write helper was accidentally exposed.
do $guard$
declare
  v_helper regprocedure := to_regprocedure('private.record_class_attendance_fact(bigint,bigint,text,text,timestamp with time zone,text,bigint,text,jsonb)');
begin
  if v_helper is null then
    raise exception 'ATTENDANCE-START-01 guard: private attendance helper missing.';
  end if;
  if has_function_privilege('public',v_helper,'EXECUTE')
     or has_function_privilege('anon',v_helper,'EXECUTE')
     or has_function_privilege('authenticated',v_helper,'EXECUTE')
     or has_function_privilege('service_role',v_helper,'EXECUTE') then
    raise exception 'ATTENDANCE-START-01 guard: private attendance helper has external EXECUTE.';
  end if;
end;
$guard$;
