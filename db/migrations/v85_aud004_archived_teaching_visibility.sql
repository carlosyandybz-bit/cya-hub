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

-- Mantiene exactamente la firma pública existente (RETURNS teaching_contents).
create or replace function public.archive_teaching_content(p_content_id bigint)
returns public.teaching_contents
language plpgsql
set search_path=''
as $$
declare
  v_content public.teaching_contents;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para archivar enseñanza.' using errcode='42501';
  end if;

  update public.teaching_contents
  set active=false,
      publication_status='archived',
      visibility='staff'
  where id=p_content_id
    and active
  returning * into v_content;

  if not found then
    raise exception 'El contenido no existe o ya está archivado.' using errcode='P0002';
  end if;

  return v_content;
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
