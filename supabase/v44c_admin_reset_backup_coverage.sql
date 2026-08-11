-- CYA Hub · v44c · cobertura real de copia completa antes del reset
-- G8: el mapa histórico de backup no incluía cinco tablas actuales que el reset
-- completo puede eliminar. Las añadimos en un orden restaurable.

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language plpgsql
stable
set search_path=''
as $$
declare
  v_tables text[];
  v_extra text;
begin
  v_tables := private.backup_tables_for_domain_pre_v40(p_domain);
  if v_tables is null then return null; end if;

  -- v40 añadió esta tabla al modelo de enseñanza.
  if p_domain in ('teaching','settings','complete')
     and not ('teaching_content_evaluation_recommendations'=any(v_tables)) then
    v_tables := array_append(v_tables,'teaching_content_evaluation_recommendations');
  end if;

  -- Estas tablas actuales faltaban en el mapa histórico de copia completa.
  -- Se añaden al final para que sus padres (personas, clases y enseñanza) ya
  -- hayan sido restaurados cuando private.restore_json_table las procese.
  if p_domain='complete' then
    foreach v_extra in array array[
      'class_content_events',
      'class_media_resources',
      'class_pedagogy_summaries',
      'class_preparation_requests',
      'data_transfer_jobs'
    ]::text[] loop
      if not (v_extra=any(v_tables)) then
        v_tables := array_append(v_tables,v_extra);
      end if;
    end loop;
  end if;

  return v_tables;
end;
$$;

-- Los helpers privados del reset son solo piezas internas de RPC SECURITY DEFINER.
-- Defense in depth: ningún rol cliente recibe EXECUTE directo.
revoke all on function private.reset_scope_label(text) from public,anon,authenticated;
revoke all on function private.is_staff_identity_person(bigint) from public,anon,authenticated;
revoke all on function private.count_jsonb_total(jsonb) from public,anon,authenticated;
revoke all on function private.admin_reset_preview_counts(text,bigint) from public,anon,authenticated;
revoke all on function private.delete_single_person(bigint) from public,anon,authenticated;
revoke all on function private.execute_admin_data_reset(text,bigint) from public,anon,authenticated;
