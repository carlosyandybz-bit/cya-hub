-- CYA Hub · v38 · Point 12R regression polish
-- Preserve existing class/media flows while restoring the three-state
-- correction lifecycle and explicit student-summary visibility.

begin;

-- Corrections have three persistent states. "Mejorado" remains a class event.
alter table public.student_content_assignments
  drop constraint if exists student_content_assignments_assignment_status_check;
alter table public.student_content_assignments
  add constraint student_content_assignments_assignment_status_check
  check (assignment_status in ('pending','in_correction','corrected','explained','active','completed'));

-- Keep old measurement history valid while allowing the current three-state
-- correction model and the current exercise model.
alter table public.student_content_measurements
  drop constraint if exists student_content_measurements_assignment_status_check;
alter table public.student_content_measurements
  add constraint student_content_measurements_assignment_status_check
  check (assignment_status in ('pending','in_correction','corrected','explained','active','completed','practicing'));

create or replace function public.update_correction_assignment(
  p_assignment_id bigint,
  p_class_id bigint,
  p_assignment_status text,
  p_frequency smallint,
  p_importance smallint
)
returns public.student_content_assignments
language plpgsql
set search_path=''
as $$
declare
  v_assignment public.student_content_assignments;
  v_mode text;
  v_old_status text;
  v_old_frequency smallint;
  v_old_importance smallint;
  v_recent bigint;
  v_event text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar correcciones.' using errcode='42501';
  end if;
  if p_assignment_status not in ('pending','in_correction','corrected') then
    raise exception 'Estado de corrección no válido.' using errcode='22023';
  end if;

  select a.* into v_assignment
  from public.student_content_assignments a
  join public.teaching_contents t on t.id=a.content_id
  where a.id=p_assignment_id and t.content_type='correction'
  for update of a;

  if not found then
    raise exception 'La corrección no existe.' using errcode='P0002';
  end if;
  if not exists(
    select 1 from public.class_participants
    where class_id=p_class_id and person_id=v_assignment.person_id
  ) or not exists(
    select 1 from public.classes
    where id=p_class_id and status in ('active','finished') and pedagogy_closed_at is null
  ) then
    raise exception 'La corrección no pertenece a una clase abierta.' using errcode='22023';
  end if;

  v_mode:=v_assignment.snapshot_measurement_mode;
  v_old_status:=v_assignment.assignment_status;
  v_old_frequency:=v_assignment.current_frequency;
  v_old_importance:=v_assignment.current_importance;

  if (p_frequency is not null and (p_frequency<0 or p_frequency>100))
     or (p_importance is not null and (p_importance<0 or p_importance>100)) then
    raise exception 'Medición fuera de rango.' using errcode='22023';
  end if;
  if v_mode in ('frequency','both') and p_frequency is null then
    raise exception 'Indica la frecuencia.' using errcode='22023';
  end if;
  if v_mode in ('importance','both') and p_importance is null then
    raise exception 'Indica la importancia.' using errcode='22023';
  end if;

  update public.student_content_assignments
  set assignment_status=p_assignment_status,
      current_frequency=p_frequency,
      current_importance=p_importance,
      completed_at=case
        when p_assignment_status='corrected' then coalesce(completed_at,now())
        else null
      end,
      student_visible_at=case
        when p_assignment_status in ('pending','in_correction') then null
        else student_visible_at
      end
  where id=p_assignment_id
  returning * into v_assignment;

  select id into v_recent
  from public.student_content_measurements
  where assignment_id=p_assignment_id
    and created_at>=now()-interval '120 seconds'
  order by created_at desc
  limit 1
  for update;

  if v_recent is null then
    insert into public.student_content_measurements(
      assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
    ) values(
      p_assignment_id,p_class_id,p_assignment_status,p_frequency,p_importance,(select auth.uid())
    );
  else
    update public.student_content_measurements
    set class_id=p_class_id,
        assignment_status=p_assignment_status,
        frequency_score=p_frequency,
        importance_score=p_importance,
        measured_by=(select auth.uid())
    where id=v_recent;
  end if;

  v_event:=case
    when v_old_status is distinct from p_assignment_status then 'status_changed'
    else 'measurement_changed'
  end;

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_by
  ) values(
    p_class_id,
    v_assignment.person_id,
    v_assignment.content_id,
    v_event,
    v_old_status,
    p_assignment_status,
    jsonb_build_object(
      'content_type','correction',
      'old_frequency',v_old_frequency,
      'new_frequency',p_frequency,
      'old_importance',v_old_importance,
      'new_importance',p_importance
    ),
    (select auth.uid())
  );

  return v_assignment;
end;
$$;

revoke all on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint)
  from public,anon;
grant execute on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint)
  to authenticated;

-- v2 remains available for existing callers. v3 adds the explicit list of
-- class events that the teacher chooses to expose in the student summary.
create or replace function public.close_class_pedagogy_v3(
  p_class_id bigint,
  p_student_message text default null,
  p_internal_note text default null,
  p_visible_event_ids bigint[] default '{}'::bigint[]
)
returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_result public.classes;
  v_ids bigint[]:=coalesce(p_visible_event_ids,'{}'::bigint[]);
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para cerrar clases.' using errcode='42501';
  end if;

  if exists(
    select 1
    from unnest(v_ids) requested(event_id)
    where not exists(
      select 1 from public.class_content_events e
      where e.id=requested.event_id and e.class_id=p_class_id
    )
  ) then
    raise exception 'Hay elementos del resumen que no pertenecen a esta clase.' using errcode='22023';
  end if;

  v_result:=public.close_class_pedagogy_v2(
    p_class_id,
    p_student_message,
    p_internal_note
  );

  update public.class_content_events
  set visible_to_student=(id=any(v_ids))
  where class_id=p_class_id;

  insert into public.audit_events(
    event_type,entity_type,entity_id,summary,detail,actor_user_id
  ) values(
    'class_summary_visibility',
    'class',
    p_class_id::text,
    'Visibilidad del resumen pedagógico confirmada',
    jsonb_build_object('visible_event_ids',to_jsonb(v_ids),'visible_count',cardinality(v_ids)),
    (select auth.uid())
  );

  return v_result;
end;
$$;

revoke all on function public.close_class_pedagogy_v3(bigint,text,text,bigint[])
  from public,anon;
grant execute on function public.close_class_pedagogy_v3(bigint,text,text,bigint[])
  to authenticated;

commit;
