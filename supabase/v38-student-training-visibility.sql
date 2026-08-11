-- CYA Hub · v38 · visibilidad coherente de Formación en área Alumno
--
-- Una única regla de publicación para los cuatro tipos:
-- - Corrección: corrected
-- - Explicación: explained
-- - Secuencia: explained
-- - Ejercicio: active o completed
--
-- Si la asignación nace de una clase, no se publica hasta el cierre pedagógico.
-- Si es manual (sin clase origen), se publica al alcanzar un estado visible.

create or replace function private.assignment_is_student_releasable(
  p_content_type text,
  p_assignment_status text
)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when p_content_type='correction' then p_assignment_status='corrected'
    when p_content_type in ('explanation','sequence') then p_assignment_status='explained'
    when p_content_type='exercise' then p_assignment_status in ('active','completed')
    else false
  end;
$$;

create or replace function public.update_teaching_assignment_status(
  p_assignment_id bigint,
  p_assignment_status text
)
returns public.student_content_assignments
language plpgsql
set search_path=''
as $$
declare
  v_assignment public.student_content_assignments;
  v_type text;
  v_done boolean;
  v_releasable boolean;
  v_source_closed boolean:=false;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar enseñanza.' using errcode='42501';
  end if;

  select a into v_assignment
  from public.student_content_assignments a
  where a.id=p_assignment_id
  for update;

  if not found then
    raise exception 'La asignación no existe.' using errcode='P0002';
  end if;

  select t.content_type into v_type
  from public.teaching_contents t
  where t.id=v_assignment.content_id;

  if (v_type='correction' and p_assignment_status not in ('pending','corrected'))
     or (v_type in ('explanation','sequence') and p_assignment_status not in ('pending','explained'))
     or (v_type='exercise' and p_assignment_status not in ('pending','active','completed')) then
    raise exception 'Estado no válido para este tipo de contenido.' using errcode='22023';
  end if;

  v_done:=p_assignment_status in ('corrected','explained','completed');
  v_releasable:=private.assignment_is_student_releasable(v_type,p_assignment_status);

  if v_assignment.source_class_id is not null then
    select c.pedagogy_closed_at is not null into v_source_closed
    from public.classes c
    where c.id=v_assignment.source_class_id;
  end if;

  update public.student_content_assignments
  set assignment_status=p_assignment_status,
      completed_at=case when v_done then coalesce(completed_at,now()) else null end,
      student_visible_at=case
        when not v_releasable then null
        when source_class_id is null then coalesce(student_visible_at,now())
        when v_source_closed then coalesce(student_visible_at,now())
        else student_visible_at
      end
  where id=p_assignment_id
  returning * into v_assignment;

  insert into public.student_content_measurements(
    assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
  )
  values(
    v_assignment.id,null,p_assignment_status,
    v_assignment.current_frequency,v_assignment.current_importance,(select auth.uid())
  );

  return v_assignment;
end;
$$;

create or replace function public.close_class_pedagogy_v2(
  p_class_id bigint,
  p_student_message text default null,
  p_internal_note text default null
)
returns public.classes
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para cerrar clases.' using errcode='42501';
  end if;

  select * into v_class
  from public.classes
  where id=p_class_id
  for update;

  if not found then
    raise exception 'La clase no existe.' using errcode='P0002';
  end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then
    raise exception 'Termina primero la parte administrativa.' using errcode='22023';
  end if;

  insert into public.class_pedagogy_summaries(
    class_id,student_message,internal_note,closed_by,closed_at,updated_at
  )
  values(
    p_class_id,
    nullif(btrim(p_student_message),''),
    nullif(btrim(p_internal_note),''),
    (select auth.uid()),now(),now()
  )
  on conflict(class_id) do update
  set student_message=excluded.student_message,
      internal_note=excluded.internal_note,
      closed_by=excluded.closed_by,
      closed_at=now(),
      updated_at=now();

  update public.student_content_assignments a
  set student_visible_at=coalesce(a.student_visible_at,now())
  from public.teaching_contents t
  where t.id=a.content_id
    and a.person_id in (
      select person_id from public.class_participants where class_id=p_class_id
    )
    and exists(
      select 1
      from public.class_content_events e
      where e.class_id=p_class_id
        and e.person_id=a.person_id
        and e.content_id=a.content_id
    )
    and t.active
    and t.completion_status='complete'
    and t.publication_status='published'
    and t.visibility='student'
    and private.assignment_is_student_releasable(t.content_type,a.assignment_status);

  update public.class_content_events e
  set visible_to_student=true
  where e.class_id=p_class_id
    and (
      e.event_type='reviewed'
      or e.event_type in ('exercise_active','exercise_completed')
      or (
        e.event_type='status_changed'
        and e.new_status in ('corrected','explained')
        and exists(
          select 1
          from public.teaching_contents t
          where t.id=e.content_id
            and t.active
            and t.completion_status='complete'
            and t.publication_status='published'
            and t.visibility='student'
        )
      )
    );

  update public.classes
  set pedagogy_closed_at=coalesce(pedagogy_closed_at,now()),
      workflow_stage='closed'
  where id=p_class_id
  returning * into v_class;

  return v_class;
end;
$$;

create or replace function private.student_visible_assignments_json(p_person_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current bigint;
  v_result jsonb;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff())
     and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para consultar esta formación.' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',a.id,
        'content_id',a.content_id,
        'title',tc.title,
        'content_type',tc.content_type,
        'description',tc.description,
        'correction_guidance',tc.correction_guidance,
        'assignment_status',a.assignment_status,
        'current_frequency',a.current_frequency,
        'current_importance',a.current_importance,
        'updated_at',a.updated_at,
        'media',coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id',media.id,
              'media_type',media.media_type,
              'provider',media.provider,
              'external_file_id',media.external_file_id,
              'title',media.title,
              'mime_type',media.mime_type,
              'group_label',media.group_label,
              'is_cover',media.is_cover,
              'is_preview',media.is_preview,
              'display_in_resources',media.display_in_resources,
              'thumbnail_external_file_id',media.thumbnail_external_file_id,
              'thumbnail_mime_type',media.thumbnail_mime_type,
              'preview_start_seconds',media.preview_start_seconds,
              'preview_end_seconds',media.preview_end_seconds
            )
            order by media.sort_order,media.id
          )
          from public.teaching_content_media media
          where media.content_id=tc.id
        ),'[]'::jsonb)
      )
      order by a.updated_at desc,a.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from public.student_content_assignments a
  join public.teaching_contents tc on tc.id=a.content_id
  where a.person_id=p_person_id
    and a.student_visible_at is not null
    and tc.active
    and tc.completion_status='complete'
    and tc.publication_status='published'
    and tc.visibility='student'
    and private.assignment_is_student_releasable(tc.content_type,a.assignment_status);

  return v_result;
end;
$$;

revoke all on function private.student_visible_assignments_json(bigint) from public,anon;
grant execute on function private.student_visible_assignments_json(bigint) to authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_result jsonb;
begin
  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;

  v_result:=private.student_portal_snapshot_for(v_person);
  v_result:=jsonb_set(
    v_result,
    '{assignments}',
    private.student_visible_assignments_json(v_person),
    true
  );
  v_result:=jsonb_set(
    v_result,
    '{evaluations}',
    private.student_visible_evaluations_json(v_person),
    true
  );

  return v_result;
end;
$$;

revoke all on function public.student_portal_snapshot_for(bigint) from public,anon;
grant execute on function public.student_portal_snapshot_for(bigint) to authenticated;

-- RLS equivalente al snapshot para consultas directas del área Alumno.
drop policy if exists student_content_assignments_select on public.student_content_assignments;
create policy student_content_assignments_select
on public.student_content_assignments
for select
to authenticated
using (
  (select private.is_staff())
  or (
    person_id=(select private.current_person_id())
    and student_visible_at is not null
    and exists(
      select 1
      from public.teaching_contents t
      where t.id=student_content_assignments.content_id
        and t.active
        and t.completion_status='complete'
        and t.publication_status='published'
        and t.visibility='student'
        and private.assignment_is_student_releasable(
          t.content_type,
          student_content_assignments.assignment_status
        )
    )
  )
);
