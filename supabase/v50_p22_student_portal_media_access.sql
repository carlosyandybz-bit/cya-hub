-- CYA Hub · v50 · P22 Portal del alumno · autorización multimedia coherente
--
-- Objetivos:
-- 1. alinear tickets de Drive con las mismas reglas de publicación del portal;
-- 2. permitir class_media_resources cerrados que el snapshot ya entrega;
-- 3. no abrir SELECT directo de teaching_content_media al alumnado;
-- 4. preservar acceso completo del staff.

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

  -- Vídeo privado de una clase: mismo alumno + cierre pedagógico.
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

  -- Documentación / baile final de la clase: mismo alumno + cierre pedagógico.
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

  -- Multimedia de enseñanza: la asignación debe ser exactamente la que el
  -- portal puede liberar al alumno. La tabla de media sigue sin SELECT directo.
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

create or replace function public.can_access_teaching_media(
  p_external_file_id text
)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select private.can_access_student_portal_media(p_external_file_id);
$$;

revoke all on function public.can_access_teaching_media(text) from public,anon;
grant execute on function public.can_access_teaching_media(text) to authenticated;

commit;
