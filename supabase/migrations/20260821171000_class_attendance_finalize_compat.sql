-- CLASS-ATTENDANCE-01 — compatibility hardening before first apply.
-- Preserves an already-recorded absence reason (including no_show) when administrative close
-- records the same attendance status without an explicit reason. No data backfill.

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
  v_event public.class_attendance_events;
  v_actor uuid:=(select auth.uid());
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
  elsif p_source not in ('administrative_finish','explicit_record') then
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
