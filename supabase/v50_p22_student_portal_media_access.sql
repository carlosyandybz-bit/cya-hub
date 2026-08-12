-- CYA Hub · v50 · P22 Portal del alumno · proyección y multimedia coherentes
--
-- Objetivos:
-- 1. alinear tickets de Drive con las mismas reglas de publicación del portal;
-- 2. permitir class_media_resources cerrados que el snapshot ya entrega;
-- 3. no abrir SELECT directo de teaching_content_media al alumnado;
-- 4. preservar acceso completo del staff;
-- 5. mantener el helper de media fuera del alcance directo del cliente;
-- 6. conservar estilo/rol/nivel en evaluaciones visibles para no mezclar contextos;
-- 7. preservar el contrato v36b: el snapshot SECURITY INVOKER necesita ejecutar
--    el helper de evaluaciones, que mantiene su guard interno de identidad.

begin;

create or replace function private.can_access_student_portal_media(
  p_external_file_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person bigint;
begin
  if p_external_file_id is null
     or p_external_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    return false;
  end if;

  if (select private.is_staff()) then
    return exists(
      select 1
      from public.teaching_content_media m
      where m.external_file_id=p_external_file_id
         or m.thumbnail_external_file_id=p_external_file_id
    )
    or exists(
      select 1
      from public.class_video_resources v
      where v.external_file_id=p_external_file_id
    )
    or exists(
      select 1
      from public.class_media_resources m
      where m.external_file_id=p_external_file_id
    );
  end if;

  if not (select private.has_app_role('student')) then
    return false;
  end if;

  select private.current_person_id() into v_person;
  if v_person is null then
    return false;
  end if;

  if exists(
    select 1
    from public.class_video_resources v
    join public.classes c on c.id=v.class_id
    where v.external_file_id=p_external_file_id
      and v.visibility_scope='private_student'
      and v.person_id=v_person
      and c.pedagogy_closed_at is not null
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.class_media_resources m
    join public.classes c on c.id=m.class_id
    where m.external_file_id=p_external_file_id
      and m.person_id=v_person
      and c.pedagogy_closed_at is not null
  ) then
    return true;
  end if;

  return exists(
    select 1
    from public.teaching_content_media m
    join public.student_content_assignments a
      on a.content_id=m.content_id
     and a.person_id=v_person
    where (m.external_file_id=p_external_file_id
       or m.thumbnail_external_file_id=p_external_file_id)
      and private.student_can_read_assignment(
        a.person_id,
        a.content_id,
        a.assignment_status,
        a.student_visible_at
      )
  );
end;
$$;

revoke all on function private.can_access_student_portal_media(text)
from public,anon,authenticated;

-- El wrapper público solo devuelve un booleano. El helper privado conserva la
-- decisión de identidad/propiedad y sigue sin ser ejecutable por el cliente.
create or replace function public.can_access_teaching_media(
  p_external_file_id text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.can_access_student_portal_media(p_external_file_id);
$$;

revoke all on function public.can_access_teaching_media(text) from public,anon;
grant execute on function public.can_access_teaching_media(text) to authenticated;

create or replace function private.student_visible_evaluations_json(
  p_person_id bigint
)
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
    raise exception 'No tienes permiso para consultar estas evaluaciones.' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'session_id',e.session_id,
        'class_id',e.class_id,
        'score',e.score,
        'aptitude_term_id',e.aptitude_term_id,
        'aptitude',apt.label,
        'style_term_id',e.style_term_id,
        'style',style.label,
        'role_term_id',e.role_term_id,
        'role',role.label,
        'level_term_id',e.level_term_id,
        'level',level.label,
        'evaluation_kind',e.evaluation_kind,
        'created_at',e.created_at
      )
      order by e.created_at desc,e.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from public.student_evaluations e
  join public.catalog_terms apt on apt.id=e.aptitude_term_id
  join public.catalog_terms style on style.id=e.style_term_id
  join public.catalog_terms role on role.id=e.role_term_id
  join public.catalog_terms level on level.id=e.level_term_id
  left join public.evaluation_sessions s on s.id=e.session_id
  left join public.classes c on c.id=coalesce(s.class_id,e.class_id)
  where e.person_id=p_person_id
    and (
      (e.session_id is not null and s.status='completed' and (s.class_id is null or c.pedagogy_closed_at is not null))
      or
      (e.session_id is null and (e.class_id is null or c.pedagogy_closed_at is not null))
    );

  return v_result;
end;
$$;

-- El snapshot público es SECURITY INVOKER y delega en este helper. Se conserva
-- EXECUTE para authenticated; el helper rechaza por sí mismo cualquier persona
-- distinta de la identidad actual salvo staff autorizado.
revoke all on function private.student_visible_evaluations_json(bigint) from public,anon;
grant execute on function private.student_visible_evaluations_json(bigint) to authenticated;

commit;
