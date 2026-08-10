create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select case p_domain
    when 'people' then array[
      'people','student_profiles','student_dance_profiles','crm_profiles','crm_activities',
      'student_incidents','student_incident_people'
    ]::text[]
    when 'classes' then array[
      'catalog_terms','classes','class_participants','class_notes','student_evaluations'
    ]::text[]
    when 'credits' then array[
      'people','student_profiles','credit_grants','credit_grant_members','credit_movements',
      'student_incidents','student_incident_people'
    ]::text[]
    when 'teaching' then array[
      'catalog_terms','teaching_contents','teaching_content_styles','teaching_content_roles',
      'teaching_content_levels','teaching_content_tags','teaching_content_relations',
      'teaching_content_media','student_content_assignments','student_content_measurements',
      'student_evaluations'
    ]::text[]
    when 'missions' then array[
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence'
    ]::text[]
    when 'marketing' then array[
      'marketing_rates','marketing_content','marketing_content_media','marketing_events',
      'marketing_campaigns','marketing_campaign_media','marketing_campaign_metrics',
      'communication_recipients','communication_events'
    ]::text[]
    when 'forms' then array['form_definitions','form_versions','form_fields','form_submissions']::text[]
    when 'calendar' then array['calendar_connections','calendar_events']::text[]
    when 'settings' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms',
      'daily_quotes','notification_rules','notification_deliveries','internal_notifications','integration_settings'
    ]::text[]
    when 'complete' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms','marketing_rates',
      'people','student_profiles','crm_profiles','crm_activities','student_dance_profiles',
      'integration_settings','calendar_connections','calendar_events',
      'marketing_events','marketing_content','marketing_content_media','marketing_campaigns',
      'marketing_campaign_media','marketing_campaign_metrics','communication_recipients','communication_events',
      'classes','credit_grants','credit_grant_members','class_participants','credit_movements','class_notes',
      'student_incidents','student_incident_people',
      'teaching_contents','teaching_content_styles','teaching_content_roles','teaching_content_levels',
      'teaching_content_tags','teaching_content_media','teaching_content_relations',
      'student_content_assignments','student_content_measurements','student_evaluations',
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence',
      'daily_quotes','notification_rules','internal_notifications','notification_deliveries',
      'form_definitions','form_versions','form_fields','form_submissions','audit_events'
    ]::text[]
    else null
  end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public, anon, authenticated;

create or replace function public.export_data_bundle(p_domain text default 'complete')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tables text[]; v_table text; v_rows jsonb; v_tables_json jsonb := '{}'::jsonb;
  v_columns_json jsonb := '{}'::jsonb; v_counts_json jsonb := '{}'::jsonb;
  v_column_names jsonb; v_schema_version text; v_checksum text;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede exportar una copia de CYA Hub.' using errcode='42501'; end if;
  v_tables := private.backup_tables_for_domain(p_domain);
  if v_tables is null then raise exception 'Tipo de exportación no válido.' using errcode='22023'; end if;
  foreach v_table in array v_tables loop
    if v_table='integration_settings' then
      execute 'select coalesce(jsonb_agg(row_data order by row_data::text), ''[]''::jsonb) from (select to_jsonb(t)-''secret_reference'' as row_data from public.integration_settings t) s' into v_rows;
    elsif v_table='calendar_connections' then
      execute 'select coalesce(jsonb_agg(row_data order by row_data::text), ''[]''::jsonb) from (select to_jsonb(t)-''credential_reference'' as row_data from public.calendar_connections t) s' into v_rows;
    else
      execute format('select coalesce(jsonb_agg(row_data order by row_data::text), ''[]''::jsonb) from (select to_jsonb(t) as row_data from public.%I t) s',v_table) into v_rows;
    end if;
    select coalesce(jsonb_agg(a.attname order by a.attnum),'[]'::jsonb) into v_column_names
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=v_table and a.attnum>0 and not a.attisdropped and a.attgenerated=''
      and not (v_table='integration_settings' and a.attname='secret_reference')
      and not (v_table='calendar_connections' and a.attname='credential_reference');
    v_tables_json := v_tables_json || jsonb_build_object(v_table,v_rows);
    v_columns_json := v_columns_json || jsonb_build_object(v_table,v_column_names);
    v_counts_json := v_counts_json || jsonb_build_object(v_table,jsonb_array_length(v_rows));
  end loop;
  begin select max(version)::text into v_schema_version from supabase_migrations.schema_migrations; exception when others then v_schema_version:=null; end;
  v_checksum := md5(v_tables_json::text);
  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('data_export_created','data_backup',p_domain,'Copia de datos exportada',jsonb_build_object('domain',p_domain,'checksum',v_checksum,'row_counts',v_counts_json),(select auth.uid()));
  return jsonb_build_object('format','cya-hub-backup','version',2,'exported_at',now(),'schema_version',v_schema_version,'domain',p_domain,
    'restore_mode','merge','requires_existing_auth_users',true,
    'excluded_sensitive_fields',jsonb_build_array('integration_settings.secret_reference','calendar_connections.credential_reference','auth.users credentials and password material'),
    'columns',v_columns_json,'row_counts',v_counts_json,'tables',v_tables_json,'checksum',v_checksum);
end;
$$;
revoke all on function public.export_data_bundle(text) from public, anon;
grant execute on function public.export_data_bundle(text) to authenticated;

create or replace function public.preview_data_import_v2(p_domain text,p_payload jsonb,p_strategy text,p_file_name text default null,p_format text default 'json')
returns public.data_transfer_jobs
language plpgsql
set search_path = ''
as $$
declare v_job public.data_transfer_jobs;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede importar datos.' using errcode='42501'; end if;
  if p_format not in ('json','csv','xlsx') then raise exception 'Formato de archivo no válido.' using errcode='22023'; end if;
  v_job := public.preview_data_import(p_domain,p_payload,p_strategy,p_file_name);
  update public.data_transfer_jobs set format=p_format where id=v_job.id returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.preview_data_import_v2(text,jsonb,text,text,text) from public, anon;
grant execute on function public.preview_data_import_v2(text,jsonb,text,text,text) to authenticated;

create or replace function public.preview_backup_restore(p_bundle jsonb,p_file_name text default null,p_format text default 'json')
returns public.data_transfer_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.data_transfer_jobs; v_domain text; v_tables jsonb; v_allowed text[]; v_table text; v_rows jsonb;
  v_counts jsonb := '{}'::jsonb; v_total bigint:=0; v_checksum_valid boolean:=false; v_auth_col text; v_auth_value text;
  v_missing_auth text[] := '{}'::text[]; v_restorable boolean;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede verificar una copia.' using errcode='42501'; end if;
  if p_format not in ('json','csv','xlsx') then raise exception 'Formato de archivo no válido.' using errcode='22023'; end if;
  if pg_catalog.octet_length(p_bundle::text)>50*1024*1024 then raise exception 'La copia supera el máximo de 50 MB para restauración directa.' using errcode='22023'; end if;
  if coalesce(p_bundle->>'format','')<>'cya-hub-backup' or coalesce((p_bundle->>'version')::integer,0)<>2 then raise exception 'El archivo no es una copia CYA Hub v2 compatible.' using errcode='22023'; end if;
  v_domain:=p_bundle->>'domain'; v_allowed:=private.backup_tables_for_domain(v_domain);
  if v_allowed is null then raise exception 'El dominio de la copia no es compatible.' using errcode='22023'; end if;
  v_tables:=p_bundle->'tables'; if jsonb_typeof(v_tables)<>'object' then raise exception 'La copia no contiene tablas válidas.' using errcode='22023'; end if;
  for v_table in select jsonb_object_keys(v_tables) loop
    if not (v_table=any(v_allowed)) then raise exception 'La copia contiene una tabla no permitida: %',v_table using errcode='22023'; end if;
    v_rows:=v_tables->v_table; if jsonb_typeof(v_rows)<>'array' then raise exception 'La tabla % no contiene una lista de registros.',v_table using errcode='22023'; end if;
    v_counts:=v_counts||jsonb_build_object(v_table,jsonb_array_length(v_rows)); v_total:=v_total+jsonb_array_length(v_rows);
    for v_auth_col in
      select a.attname from pg_catalog.pg_constraint con
      join pg_catalog.pg_class src on src.oid=con.conrelid join pg_catalog.pg_namespace sn on sn.oid=src.relnamespace
      join pg_catalog.pg_class tgt on tgt.oid=con.confrelid join pg_catalog.pg_namespace tn on tn.oid=tgt.relnamespace
      join lateral unnest(con.conkey) with ordinality k(attnum,ord) on true join pg_catalog.pg_attribute a on a.attrelid=src.oid and a.attnum=k.attnum
      where con.contype='f' and sn.nspname='public' and src.relname=v_table and tn.nspname='auth' and tgt.relname='users'
    loop
      for v_auth_value in select distinct nullif(btrim(item->>v_auth_col),'') from jsonb_array_elements(v_rows) item where nullif(btrim(item->>v_auth_col),'') is not null loop
        if not exists(select 1 from auth.users u where u.id::text=v_auth_value) and not (v_auth_value=any(v_missing_auth)) then v_missing_auth:=array_append(v_missing_auth,v_auth_value); end if;
      end loop;
    end loop;
  end loop;
  v_checksum_valid:=coalesce(p_bundle->>'checksum','')=md5(v_tables::text); v_restorable:=v_checksum_valid and cardinality(v_missing_auth)=0;
  insert into public.data_transfer_jobs(direction,domain,file_name,format,duplicate_strategy,status,payload,preview,created_by)
  values('import',v_domain,p_file_name,p_format,'update','validated',p_bundle,jsonb_build_object('backup',true,'total',v_total,'tables',v_counts,'checksum_valid',v_checksum_valid,'missing_auth_users',to_jsonb(v_missing_auth),'restorable',v_restorable,'restore_mode','merge','secrets_preserved',true),(select auth.uid()))
  returning * into v_job; return v_job;
end;
$$;
revoke all on function public.preview_backup_restore(jsonb,text,text) from public, anon;
grant execute on function public.preview_backup_restore(jsonb,text,text) to authenticated;

create or replace function private.restore_json_table(p_table_name text,p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[]:=private.backup_tables_for_domain('complete'); v_excluded text[]:='{}'::text[]; v_columns text; v_select_columns text;
  v_pk_columns text; v_update_columns text; v_sql text; v_count integer:=0; v_seq text; v_has_rows boolean; v_has_id boolean:=false;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede restaurar datos.' using errcode='42501'; end if;
  if not (p_table_name=any(v_allowed)) then raise exception 'Tabla no permitida para restauración: %',p_table_name using errcode='22023'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'Los datos de % no son una lista.',p_table_name using errcode='22023'; end if;
  if jsonb_array_length(p_rows)=0 then return 0; end if;
  if p_table_name='integration_settings' then v_excluded:=array['secret_reference']; elsif p_table_name='calendar_connections' then v_excluded:=array['credential_reference']; end if;
  select string_agg(format('%I',a.attname),', ' order by a.attnum),string_agg(format('x.%I',a.attname),', ' order by a.attnum),bool_or(a.attname='id')
  into v_columns,v_select_columns,v_has_id
  from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=p_table_name and a.attnum>0 and not a.attisdropped and a.attgenerated='' and not (a.attname=any(v_excluded));
  select string_agg(format('%I',a.attname),', ' order by k.ord) into v_pk_columns
  from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join lateral unnest(i.indkey) with ordinality k(attnum,ord) on true join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
  where n.nspname='public' and c.relname=p_table_name and i.indisprimary;
  if v_pk_columns is null then raise exception 'La tabla % no tiene clave primaria restaurable.',p_table_name using errcode='22023'; end if;
  select string_agg(format('%1$I=excluded.%1$I',a.attname),', ' order by a.attnum) into v_update_columns
  from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=p_table_name and a.attnum>0 and not a.attisdropped and a.attgenerated='' and not (a.attname=any(v_excluded))
    and a.attnum not in (select k.attnum from pg_catalog.pg_index i2 join lateral unnest(i2.indkey) k(attnum) on true where i2.indrelid=c.oid and i2.indisprimary);
  v_sql:=format('insert into public.%1$I (%2$s) overriding system value select %3$s from jsonb_populate_recordset(null::public.%1$I,$1) x on conflict (%4$s) %5$s',p_table_name,v_columns,v_select_columns,v_pk_columns,case when coalesce(v_update_columns,'')='' then 'do nothing' else 'do update set '||v_update_columns end);
  execute v_sql using p_rows; get diagnostics v_count=row_count;
  if v_has_id then
    select pg_catalog.pg_get_serial_sequence(format('public.%I',p_table_name),'id') into v_seq;
    if v_seq is not null then execute format('select exists(select 1 from public.%I)',p_table_name) into v_has_rows; if v_has_rows then execute format('select pg_catalog.setval(%L::regclass,(select max(id) from public.%I),true)',v_seq,p_table_name); end if; end if;
  end if;
  return v_count;
end;
$$;
revoke all on function private.restore_json_table(text,jsonb) from public, anon, authenticated;

create or replace function public.apply_backup_restore(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare v_job public.data_transfer_jobs; v_bundle jsonb; v_tables jsonb; v_order text[]:=private.backup_tables_for_domain('complete'); v_table text; v_count integer; v_results jsonb:='{}'::jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede restaurar una copia.' using errcode='42501'; end if;
  select * into v_job from public.data_transfer_jobs where id=p_job_id and direction='import' and status='validated' for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;
  if coalesce((v_job.preview->>'backup')::boolean,false) is not true or coalesce((v_job.preview->>'restorable')::boolean,false) is not true then raise exception 'La copia no ha superado la verificación de restauración.' using errcode='22023'; end if;
  v_bundle:=v_job.payload; v_tables:=v_bundle->'tables'; if coalesce(v_bundle->>'checksum','')<>md5(v_tables::text) then raise exception 'La copia ha cambiado desde la previsualización.' using errcode='22023'; end if;
  update public.data_transfer_jobs set status='running' where id=v_job.id;
  foreach v_table in array v_order loop if v_tables?v_table then v_count:=private.restore_json_table(v_table,v_tables->v_table); v_results:=v_results||jsonb_build_object(v_table,v_count); end if; end loop;
  if not exists(select 1 from public.app_member_roles where user_id=(select auth.uid()) and role='admin' and active) then raise exception 'La restauración desactivaría tu propio acceso administrativo y ha sido cancelada.' using errcode='42501'; end if;
  update public.data_transfer_jobs set status='completed',result=jsonb_build_object('restored',v_results,'mode','merge','checksum',v_bundle->>'checksum','secrets_preserved',true),payload=null,completed_at=now(),error_message=null where id=v_job.id returning * into v_job;
  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id) values('backup_restore_completed','data_transfer_job',v_job.id::text,'Copia CYA Hub restaurada',v_job.result,(select auth.uid()));
  return v_job;
exception when others then
  update public.data_transfer_jobs set status='failed',error_message=sqlerrm,payload=null,completed_at=now() where id=p_job_id returning * into v_job; return v_job;
end;
$$;
revoke all on function public.apply_backup_restore(bigint) from public, anon;
grant execute on function public.apply_backup_restore(bigint) to authenticated;
