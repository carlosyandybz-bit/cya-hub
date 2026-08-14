begin;

-- CYA Hub · AUD-004 · Invariante de visibilidad para contenido archivado
--
-- Regla canónica:
-- - contenido activo: draft o published;
-- - contenido archivado: active=false, publication_status='archived', visibility='staff'.
--
-- No se elimina historial ni se alteran asignaciones. Las rutas de lectura del
-- alumno ya exigen active + complete + published + student; este cambio evita
-- estados ambiguos y hace que una futura consulta incompleta no pueda tratar un
-- archivado como contenido potencialmente visible para alumno.

update public.teaching_contents
set visibility='staff'
where not active
  and publication_status='archived'
  and visibility<>'staff';

create or replace function public.archive_teaching_content(p_content_id bigint)
returns void
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para archivar enseñanza.' using errcode='42501';
  end if;

  if not exists(
    select 1
    from public.teaching_contents
    where id=p_content_id
      and active
  ) then
    raise exception 'El contenido no existe o ya está archivado.' using errcode='P0002';
  end if;

  if exists(
    select 1
    from public.student_content_assignments
    where content_id=p_content_id
      and assignment_status not in ('corrected','explained','completed')
  ) then
    raise exception 'No puedes archivar un contenido con asignaciones activas.' using errcode='23503';
  end if;

  update public.teaching_contents
  set active=false,
      publication_status='archived',
      visibility='staff'
  where id=p_content_id;
end;
$$;

alter table public.teaching_contents
  drop constraint if exists teaching_contents_lifecycle_visibility_check;

alter table public.teaching_contents
  add constraint teaching_contents_lifecycle_visibility_check
  check (
    (active and publication_status in ('draft','published'))
    or
    (not active and publication_status='archived' and visibility='staff')
  );

commit;
