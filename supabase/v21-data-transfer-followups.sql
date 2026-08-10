-- Follow-up migrations for v21 data transfer: CRM enrichment, API hardening and safe teaching imports.

create or replace function public.apply_data_import_v2(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
set search_path = ''
as $$
declare
  v_before public.data_transfer_jobs; v_after public.data_transfer_jobs; v_item jsonb;
  v_person_id bigint; v_person_created_at timestamptz; v_rate_id bigint; v_rate_name text;
  v_contact_text text; v_contact_date date; v_reserved boolean; v_amount integer; v_inquiry text;
  v_original_notes text; v_bonus_note text; v_source text; v_should_enrich boolean;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501'; end if;
  select * into v_before from public.data_transfer_jobs where id=p_job_id and direction='import' and status='validated' for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;
  v_after:=public.apply_data_import(p_job_id);
  if v_after.status<>'completed' or v_before.domain<>'people' then return v_after; end if;

  for v_item in select value from jsonb_array_elements(v_before.payload) loop
    v_person_id:=null; v_person_created_at:=null;
    select p.id,p.created_at into v_person_id,v_person_created_at from public.people p
    where (nullif(btrim(v_item->>'email'),'') is not null and lower(p.email)=lower(btrim(v_item->>'email')))
       or (nullif(btrim(v_item->>'phone'),'') is not null and p.phone=btrim(v_item->>'phone'))
       or (nullif(btrim(v_item->>'display_name'),'') is not null and nullif(btrim(v_item->>'email'),'') is null and nullif(btrim(v_item->>'phone'),'') is null and lower(p.display_name)=lower(btrim(v_item->>'display_name')))
    order by p.id limit 1;
    if v_person_id is null then continue; end if;
    v_should_enrich:=v_before.duplicate_strategy<>'skip' or v_person_created_at>=v_before.created_at;
    if not v_should_enrich then continue; end if;

    v_source:=nullif(btrim(v_item->>'source'),'');
    v_original_notes:=nullif(btrim(v_item->>'notes'),''); v_bonus_note:=null;
    v_rate_name:=coalesce(nullif(btrim(v_item->>'rate_name'),''),nullif(btrim(v_item->>'Bono'),''),nullif(btrim(v_item->>'bono'),''),nullif(btrim(v_item->>'bonus'),''),nullif(btrim(v_item->>'package'),''));
    v_rate_id:=null;
    if v_rate_name is not null then
      select r.id into v_rate_id from public.marketing_rates r where lower(r.name)=lower(v_rate_name) order by r.active desc,r.sort_order,r.id limit 1;
      if v_rate_id is null then v_bonus_note:='Bono/interés: '||v_rate_name; end if;
    end if;

    if v_source is not null or v_original_notes is not null or v_bonus_note is not null then
      update public.people p set
        source=case when v_before.duplicate_strategy='update' then coalesce(v_source,p.source) when p.source is null then coalesce(v_source,p.source) else p.source end,
        notes=case when v_bonus_note is null then p.notes when p.notes is null or btrim(p.notes)='' then concat_ws(E'\n',v_original_notes,v_bonus_note) when position(v_bonus_note in p.notes)>0 then p.notes else concat_ws(E'\n',p.notes,v_bonus_note) end,
        updated_at=now()
      where p.id=v_person_id;
    end if;

    v_contact_text:=coalesce(nullif(btrim(v_item->>'contact_date'),''),nullif(btrim(v_item->>'Fecha'),''),nullif(btrim(v_item->>'fecha'),'')); v_contact_date:=null;
    if v_contact_text is not null then
      begin
        if v_contact_text~'^\d{4}-\d{2}-\d{2}' then v_contact_date:=left(v_contact_text,10)::date;
        elsif v_contact_text~'^\d{1,2}/\d{1,2}/\d{4}$' then v_contact_date:=to_date(v_contact_text,'DD/MM/YYYY');
        elsif v_contact_text~'^\d{1,2}-\d{1,2}-\d{4}$' then v_contact_date:=to_date(v_contact_text,'DD-MM-YYYY'); end if;
      exception when others then v_contact_date:=null; end;
    end if;
    v_inquiry:=coalesce(nullif(btrim(v_item->>'inquiry'),''),nullif(btrim(v_item->>'Qué quería'),''),nullif(btrim(v_item->>'que queria'),''));
    v_reserved:=case lower(btrim(coalesce(v_item->>'reserved',v_item->>'Reservó',v_item->>'reservo',''))) when 'true' then true when '1' then true when 'sí' then true when 'si' then true when 'yes' then true when 'false' then false when '0' then false when 'no' then false else null end;
    v_amount:=null; begin v_amount:=nullif(coalesce(v_item->>'quoted_amount_cents',v_item->>'importe_cents'),'')::integer; exception when others then v_amount:=null; end;

    if v_contact_date is not null or v_inquiry is not null or v_reserved is not null or v_rate_id is not null or v_amount is not null then
      insert into public.crm_profiles(person_id,contact_date,inquiry,reserved,rate_id,quoted_amount_cents,contact_permission,created_by)
      values(v_person_id,coalesce(v_contact_date,current_date),v_inquiry,coalesce(v_reserved,false),v_rate_id,v_amount,'unknown',(select auth.uid()))
      on conflict(person_id) do update set
        contact_date=case when v_before.duplicate_strategy='update' then coalesce(v_contact_date,public.crm_profiles.contact_date) else public.crm_profiles.contact_date end,
        inquiry=case when v_before.duplicate_strategy='update' or public.crm_profiles.inquiry is null then coalesce(v_inquiry,public.crm_profiles.inquiry) else public.crm_profiles.inquiry end,
        reserved=case when v_before.duplicate_strategy='update' and v_reserved is not null then v_reserved else public.crm_profiles.reserved end,
        rate_id=case when v_before.duplicate_strategy='update' or public.crm_profiles.rate_id is null then coalesce(v_rate_id,public.crm_profiles.rate_id) else public.crm_profiles.rate_id end,
        quoted_amount_cents=case when v_before.duplicate_strategy='update' or public.crm_profiles.quoted_amount_cents is null then coalesce(v_amount,public.crm_profiles.quoted_amount_cents) else public.crm_profiles.quoted_amount_cents end,
        updated_at=now();
    end if;
  end loop;
  update public.data_transfer_jobs set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('crm_enriched',true) where id=p_job_id returning * into v_after;
  return v_after;
end;
$$;
revoke all on function public.apply_data_import_v2(bigint) from public, anon;
grant execute on function public.apply_data_import_v2(bigint) to authenticated;

-- Keep privileged backup logic out of the exposed API schema.
alter function public.export_data_bundle(text) set schema private;
alter function public.preview_backup_restore(jsonb,text,text) set schema private;
alter function public.apply_backup_restore(bigint) set schema private;
revoke all on function private.export_data_bundle(text) from public, anon;
revoke all on function private.preview_backup_restore(jsonb,text,text) from public, anon;
revoke all on function private.apply_backup_restore(bigint) from public, anon;
grant execute on function private.export_data_bundle(text) to authenticated;
grant execute on function private.preview_backup_restore(jsonb,text,text) to authenticated;
grant execute on function private.apply_backup_restore(bigint) to authenticated;

create or replace function public.export_data_bundle(p_domain text default 'complete') returns jsonb language plpgsql security invoker set search_path='' as $$
begin if not (select private.is_admin()) then raise exception 'Solo un administrador puede exportar una copia de CYA Hub.' using errcode='42501'; end if; return private.export_data_bundle(p_domain); end; $$;
create or replace function public.preview_backup_restore(p_bundle jsonb,p_file_name text default null,p_format text default 'json') returns public.data_transfer_jobs language plpgsql security invoker set search_path='' as $$
begin if not (select private.is_admin()) then raise exception 'Solo un administrador puede verificar una copia.' using errcode='42501'; end if; return private.preview_backup_restore(p_bundle,p_file_name,p_format); end; $$;
create or replace function public.apply_backup_restore(p_job_id bigint) returns public.data_transfer_jobs language plpgsql security invoker set search_path='' as $$
begin if not (select private.is_admin()) then raise exception 'Solo un administrador puede restaurar una copia.' using errcode='42501'; end if; return private.apply_backup_restore(p_job_id); end; $$;
revoke all on function public.export_data_bundle(text) from public, anon;
revoke all on function public.preview_backup_restore(jsonb,text,text) from public, anon;
revoke all on function public.apply_backup_restore(bigint) from public, anon;
grant execute on function public.export_data_bundle(text) to authenticated;
grant execute on function public.preview_backup_restore(jsonb,text,text) to authenticated;
grant execute on function public.apply_backup_restore(bigint) to authenticated;

-- Route flat imports through a safety layer so new teaching content cannot be published by spreadsheet state columns.
alter function public.apply_data_import_v2(bigint) set schema private;
revoke all on function private.apply_data_import_v2(bigint) from public, anon;
grant execute on function private.apply_data_import_v2(bigint) to authenticated;

create or replace function public.apply_safe_data_import(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare v_before public.data_transfer_jobs; v_after public.data_transfer_jobs; v_item jsonb; v_hardened integer:=0;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501'; end if;
  select * into v_before from public.data_transfer_jobs where id=p_job_id and direction='import' and status='validated' for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;
  v_after:=private.apply_data_import_v2(p_job_id); if v_after.status<>'completed' then return v_after; end if;
  if v_before.domain='teaching' then
    for v_item in select value from jsonb_array_elements(v_before.payload) loop
      update public.teaching_contents tc set completion_status='incomplete',publication_status='draft',visibility='staff',published_at=null,updated_at=now()
      where tc.content_type=v_item->>'content_type' and lower(tc.title)=lower(btrim(v_item->>'title')) and tc.created_at>=v_before.created_at and tc.created_by=(select auth.uid());
      if found then v_hardened:=v_hardened+1; end if;
    end loop;
    update public.data_transfer_jobs set result=coalesce(result,'{}'::jsonb)||jsonb_build_object('teaching_import_safety','incomplete_draft_staff','hardened_new_contents',v_hardened) where id=p_job_id returning * into v_after;
  end if;
  return v_after;
end;
$$;

create or replace function public.apply_data_import_v2(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
begin if not (select private.is_admin()) then raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501'; end if; return public.apply_safe_data_import(p_job_id); end; $$;
revoke all on function public.apply_data_import_v2(bigint) from public, anon;
grant execute on function public.apply_data_import_v2(bigint) to authenticated;
