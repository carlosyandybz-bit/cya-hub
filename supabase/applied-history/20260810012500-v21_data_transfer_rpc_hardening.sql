alter function public.export_data_bundle(text) set schema private;
alter function public.preview_backup_restore(jsonb,text,text) set schema private;
alter function public.apply_backup_restore(bigint) set schema private;

revoke all on function private.export_data_bundle(text) from public, anon;
revoke all on function private.preview_backup_restore(jsonb,text,text) from public, anon;
revoke all on function private.apply_backup_restore(bigint) from public, anon;
grant execute on function private.export_data_bundle(text) to authenticated;
grant execute on function private.preview_backup_restore(jsonb,text,text) to authenticated;
grant execute on function private.apply_backup_restore(bigint) to authenticated;

create or replace function public.export_data_bundle(p_domain text default 'complete')
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede exportar una copia de CYA Hub.' using errcode='42501';
  end if;
  return private.export_data_bundle(p_domain);
end;
$$;

create or replace function public.preview_backup_restore(
  p_bundle jsonb,
  p_file_name text default null,
  p_format text default 'json'
)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede verificar una copia.' using errcode='42501';
  end if;
  return private.preview_backup_restore(p_bundle,p_file_name,p_format);
end;
$$;

create or replace function public.apply_backup_restore(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede restaurar una copia.' using errcode='42501';
  end if;
  return private.apply_backup_restore(p_job_id);
end;
$$;

revoke all on function public.export_data_bundle(text) from public, anon;
revoke all on function public.preview_backup_restore(jsonb,text,text) from public, anon;
revoke all on function public.apply_backup_restore(bigint) from public, anon;
grant execute on function public.export_data_bundle(text) to authenticated;
grant execute on function public.preview_backup_restore(jsonb,text,text) to authenticated;
grant execute on function public.apply_backup_restore(bigint) to authenticated;