-- CYA-AUD-018 — cierre de cobertura backup/reset.
-- P32 recompuso el inventario canónico después de v44c y dejó fuera
-- data_transfer_jobs, aunque el reset full sigue eliminando ese historial.
-- Este wrapper restaura la garantía G6: todo dato de negocio que el reset
-- completo puede eliminar debe estar incluido en la copia completa restaurable.

do $$
begin
  if to_regprocedure('private.backup_tables_for_domain_pre_aud018(text)') is null then
    alter function private.backup_tables_for_domain(text)
      rename to backup_tables_for_domain_pre_aud018;
  end if;
end;
$$;

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language plpgsql
stable
set search_path=''
as $$
declare
  v_tables text[];
begin
  v_tables := private.backup_tables_for_domain_pre_aud018(p_domain);
  if v_tables is null then return null; end if;

  if p_domain='complete'
     and not ('data_transfer_jobs'=any(v_tables)) then
    v_tables := array_append(v_tables,'data_transfer_jobs');
  end if;

  return v_tables;
end;
$$;

revoke all on function private.backup_tables_for_domain(text)
  from public,anon,authenticated;
revoke all on function private.backup_tables_for_domain_pre_aud018(text)
  from public,anon,authenticated;
