alter function public.apply_data_import_v2(bigint) set schema private;

revoke all on function private.apply_data_import_v2(bigint) from public, anon;
grant execute on function private.apply_data_import_v2(bigint) to authenticated;

create or replace function public.apply_safe_data_import(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.data_transfer_jobs;
  v_after public.data_transfer_jobs;
  v_item jsonb;
  v_hardened integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501';
  end if;

  select * into v_before
  from public.data_transfer_jobs
  where id=p_job_id and direction='import' and status='validated'
  for update;
  if not found then
    raise exception 'La previsualización ya no está disponible.' using errcode='P0002';
  end if;

  v_after := private.apply_data_import_v2(p_job_id);
  if v_after.status <> 'completed' then return v_after; end if;

  if v_before.domain='teaching' then
    for v_item in select value from jsonb_array_elements(v_before.payload)
    loop
      update public.teaching_contents tc
      set completion_status='incomplete',
          publication_status='draft',
          visibility='staff',
          published_at=null,
          updated_at=now()
      where tc.content_type=v_item->>'content_type'
        and lower(tc.title)=lower(btrim(v_item->>'title'))
        and tc.created_at >= v_before.created_at
        and tc.created_by=(select auth.uid());
      if found then v_hardened := v_hardened + 1; end if;
    end loop;

    update public.data_transfer_jobs
    set result=coalesce(result,'{}'::jsonb) || jsonb_build_object(
      'teaching_import_safety','incomplete_draft_staff',
      'hardened_new_contents',v_hardened
    )
    where id=p_job_id
    returning * into v_after;
  end if;

  return v_after;
end;
$$;

create or replace function public.apply_data_import_v2(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501';
  end if;
  return public.apply_safe_data_import(p_job_id);
end;
$$;

revoke all on function public.apply_data_import_v2(bigint) from public, anon;
grant execute on function public.apply_data_import_v2(bigint) to authenticated;