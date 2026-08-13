-- P28 — Importación / exportación integral
-- Canonicaliza el inventario de backup y endurece las importaciones planas.
-- No borra datos. Las importaciones siguen siendo preview -> apply y atómicas.

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language sql
stable
set search_path=''
as $$
  select case p_domain
    when 'people' then array[
      'people','student_profiles','student_dance_profiles','crm_profiles','crm_activities',
      'student_incidents','student_incident_people'
    ]::text[]
    when 'classes' then array[
      'catalog_terms','evaluation_milestones','evaluation_descriptors',
      'classes','class_participants','class_notes','evaluation_sessions','student_evaluations',
      'student_aptitude_progress','evaluation_progress_awards','evaluation_milestone_decisions',
      'class_financial_items','class_financial_accounts','class_payment_movements',
      'class_video_resources','class_close_grant_artifacts','class_content_events',
      'class_media_resources','class_pedagogy_summaries','class_preparation_requests'
    ]::text[]
    when 'credits' then array[
      'people','student_profiles','credit_grants','credit_grant_members','credit_movements',
      'student_incidents','student_incident_people','class_financial_items',
      'class_financial_accounts','class_payment_movements','class_close_grant_artifacts'
    ]::text[]
    when 'teaching' then array[
      'catalog_terms','evaluation_milestones','evaluation_descriptors',
      'teaching_contents','teaching_content_styles','teaching_content_roles',
      'teaching_content_levels','teaching_content_tags','teaching_content_relations',
      'teaching_content_media','teaching_content_evaluation_points',
      'teaching_content_evaluation_recommendations','class_video_resources',
      'student_content_assignments','student_content_measurements','evaluation_sessions',
      'student_evaluations','student_aptitude_progress','evaluation_progress_awards',
      'evaluation_milestone_decisions'
    ]::text[]
    when 'missions' then array[
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence'
    ]::text[]
    when 'marketing' then array[
      'marketing_rates','marketing_content','marketing_content_media','marketing_events',
      'marketing_campaigns','marketing_campaign_media','marketing_campaign_metrics',
      'communication_recipients','communication_events'
    ]::text[]
    when 'forms' then array[
      'form_definitions','form_versions','form_fields','form_submissions'
    ]::text[]
    when 'calendar' then array[
      'calendar_connections','calendar_events'
    ]::text[]
    when 'settings' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms',
      'evaluation_milestones','evaluation_descriptors','teaching_content_evaluation_points',
      'teaching_content_evaluation_recommendations','daily_quotes','daily_quote_assignments',
      'notification_rules','notification_deliveries','internal_notifications','integration_settings'
    ]::text[]
    when 'complete' then array[
      'user_profiles','user_preferences','app_members','app_member_roles','catalog_terms',
      'evaluation_milestones','evaluation_descriptors','marketing_rates',
      'people','student_profiles','crm_profiles','crm_activities','student_dance_profiles',
      'integration_settings','calendar_connections','calendar_events',
      'marketing_events','marketing_content','marketing_content_media','marketing_campaigns',
      'marketing_campaign_media','marketing_campaign_metrics','communication_recipients','communication_events',
      'classes','credit_grants','credit_grant_members','class_participants','credit_movements','class_notes',
      'evaluation_sessions','student_evaluations','student_aptitude_progress','evaluation_progress_awards',
      'evaluation_milestone_decisions','class_financial_items','class_financial_accounts',
      'class_payment_movements','class_video_resources','class_close_grant_artifacts',
      'student_incidents','student_incident_people',
      'teaching_contents','teaching_content_styles','teaching_content_roles','teaching_content_levels',
      'teaching_content_tags','teaching_content_media','teaching_content_relations',
      'teaching_content_evaluation_points','teaching_content_evaluation_recommendations',
      'student_content_assignments','student_content_measurements',
      'mission_engine_settings','mission_rules','missions','mission_comments','mission_evidence',
      'daily_quotes','daily_quote_assignments','notification_rules','internal_notifications',
      'notification_deliveries','form_definitions','form_versions','form_fields','form_submissions',
      'class_content_events','class_media_resources','class_pedagogy_summaries','class_preparation_requests',
      'audit_events'
    ]::text[]
    else null
  end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public, anon, authenticated;

create or replace function private.import_bool(p_value text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case lower(btrim(coalesce(p_value,'')))
    when 'true' then true when '1' then true when 'yes' then true when 'si' then true when 'sí' then true
    when 'false' then false when '0' then false when 'no' then false
    else null end;
$$;
revoke all on function private.import_bool(text) from public, anon, authenticated;

create or replace function public.preview_data_import(
  p_domain text,
  p_payload jsonb,
  p_strategy text,
  p_file_name text default null
)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.data_transfer_jobs;
  v_item jsonb;
  v_total integer;
  v_duplicates integer:=0;
  v_existing bigint;
  v_seen_people bigint[]:='{}'::bigint[];
  v_email text;
  v_phone text;
  v_display_name text;
  v_bool boolean;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede previsualizar importaciones.' using errcode='42501';
  end if;
  if p_domain not in ('people','teaching','daily_quotes','mission_rules','marketing_rates') then
    raise exception 'Este tipo requiere un paquete CYA compatible.' using errcode='22023';
  end if;
  if p_strategy not in ('fill_empty','update','skip') then
    raise exception 'Estrategia de duplicados no válida.' using errcode='22023';
  end if;
  if jsonb_typeof(p_payload)<>'array' then
    raise exception 'El archivo debe contener una lista de registros.' using errcode='22023';
  end if;

  v_total:=jsonb_array_length(p_payload);
  if v_total=0 then raise exception 'El archivo no contiene registros.' using errcode='22023'; end if;
  if v_total>5000 then raise exception 'El archivo supera el máximo de 5.000 registros.' using errcode='22023'; end if;

  if p_domain='people' then
    if exists(
      select 1 from (
        select 'email' as kind, private.normalize_person_email(x->>'email') as identity_value
        from jsonb_array_elements(p_payload) x
        union all
        select 'phone', case when length(coalesce(private.normalize_person_phone(x->>'phone'),''))>=7 then private.normalize_person_phone(x->>'phone') end
        from jsonb_array_elements(p_payload) x
      ) identities
      where identity_value is not null
      group by kind,identity_value having count(*)>1
    ) then
      raise exception 'El archivo contiene el mismo email o teléfono en varias filas. Unifica esas filas antes de importar.' using errcode='22023';
    end if;

    for v_item in select value from jsonb_array_elements(p_payload) loop
      v_email:=private.normalize_person_email(v_item->>'email');
      v_phone:=private.normalize_person_phone(v_item->>'phone');
      v_display_name:=coalesce(
        nullif(btrim(v_item->>'display_name'),''),
        nullif(btrim(concat_ws(' ',nullif(btrim(v_item->>'first_name'),''),nullif(btrim(v_item->>'last_name'),''))),'')
      );
      if v_display_name is null then raise exception 'Cada persona necesita un nombre.' using errcode='22023'; end if;
      if v_email is null and (v_phone is null or length(v_phone)<7) then
        raise exception 'Para importar personas de forma segura cada fila necesita email o teléfono.' using errcode='22023';
      end if;
      if nullif(btrim(v_item->>'is_student'),'') is not null then
        v_bool:=private.import_bool(v_item->>'is_student');
        if v_bool is null then raise exception 'El campo «Es alumno» debe ser sí/no.' using errcode='22023'; end if;
      end if;
      v_existing:=private.match_person_identity(v_email,v_phone,null);
      if v_existing is not null then
        if v_existing=any(v_seen_people) then
          raise exception 'Varias filas del archivo resuelven a la misma persona existente. Unifícalas antes de importar.' using errcode='22023';
        end if;
        v_seen_people:=array_append(v_seen_people,v_existing);
        v_duplicates:=v_duplicates+1;
      end if;
    end loop;

  elsif p_domain='teaching' then
    if exists(
      select 1 from jsonb_array_elements(p_payload) x
      group by lower(btrim(x->>'content_type')),lower(btrim(x->>'title')) having count(*)>1
    ) then
      raise exception 'El archivo repite el mismo contenido (tipo + título). Unifica las filas antes de importar.' using errcode='22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if coalesce(v_item->>'content_type','') not in ('correction','explanation','exercise','sequence') then
        raise exception 'Tipo de contenido no válido: %',coalesce(v_item->>'content_type','vacío') using errcode='22023';
      end if;
      if nullif(btrim(v_item->>'title'),'') is null then raise exception 'Cada contenido necesita título.' using errcode='22023'; end if;
      if coalesce(nullif(v_item->>'measurement_mode',''),'none') not in ('none','frequency','importance','both') then
        raise exception 'Medición no válida en «%».',v_item->>'title' using errcode='22023';
      end if;
      if nullif(btrim(v_item->>'requires_partner'),'') is not null then
        v_bool:=private.import_bool(v_item->>'requires_partner');
        if v_bool is null then raise exception '«Necesita pareja» debe ser sí/no.' using errcode='22023'; end if;
        if v_bool and v_item->>'content_type'<>'exercise' then
          raise exception '«Necesita pareja» solo puede utilizarse en Ejercicios.' using errcode='22023';
        end if;
      end if;
      if exists(select 1 from public.teaching_contents t where t.content_type=v_item->>'content_type' and lower(t.title)=lower(btrim(v_item->>'title'))) then
        v_duplicates:=v_duplicates+1;
      end if;
    end loop;

  elsif p_domain='daily_quotes' then
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if length(btrim(coalesce(v_item->>'quote_text','')))<3 or length(btrim(coalesce(v_item->>'quote_text','')))>280 then
        raise exception 'Cada frase debe tener entre 3 y 280 caracteres.' using errcode='22023';
      end if;
      if (nullif(btrim(v_item->>'override_date'),'') is null)=(nullif(btrim(v_item->>'month_day'),'') is null) then
        raise exception 'Cada frase necesita una fecha concreta o un día anual, pero no ambos.' using errcode='22023';
      end if;
      if nullif(btrim(v_item->>'override_date'),'') is not null then
        begin perform (v_item->>'override_date')::date; exception when others then raise exception 'Fecha no válida en frases diarias.' using errcode='22023'; end;
        if exists(select 1 from public.daily_quotes q where q.override_date=(v_item->>'override_date')::date) then v_duplicates:=v_duplicates+1; end if;
      else
        if (v_item->>'month_day')!~'^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'El día anual debe usar MM-DD.' using errcode='22023'; end if;
        if exists(select 1 from public.daily_quotes q where q.month_day=v_item->>'month_day') then v_duplicates:=v_duplicates+1; end if;
      end if;
    end loop;

  elsif p_domain='mission_rules' then
    if exists(select 1 from jsonb_array_elements(p_payload) x group by x->>'rule_key' having count(*)>1) then
      raise exception 'El archivo repite una misma regla de misión.' using errcode='22023';
    end if;
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if nullif(btrim(v_item->>'rule_key'),'') is null then raise exception 'Cada regla necesita rule_key.' using errcode='22023'; end if;
      if not exists(select 1 from public.mission_rules r where r.rule_key=v_item->>'rule_key') then
        raise exception 'La regla «%» no existe. La importación configura reglas existentes; no crea evaluadores nuevos.',v_item->>'rule_key' using errcode='22023';
      end if;
      v_duplicates:=v_duplicates+1;
    end loop;

  elsif p_domain='marketing_rates' then
    if exists(
      select 1 from jsonb_array_elements(p_payload) x
      group by lower(btrim(x->>'name')),x->>'rate_type' having count(*)>1
    ) then raise exception 'El archivo repite la misma tarifa.' using errcode='22023'; end if;
    for v_item in select value from jsonb_array_elements(p_payload) loop
      if nullif(btrim(v_item->>'name'),'') is null or nullif(btrim(v_item->>'rate_type'),'') is null then
        raise exception 'Cada tarifa necesita nombre y tipo.' using errcode='22023';
      end if;
      if coalesce(v_item->>'duration_minutes','')!~'^\d+$' or coalesce(v_item->>'price_cents','')!~'^\d+$' then
        raise exception 'Duración e importe deben ser números enteros.' using errcode='22023';
      end if;
      if exists(select 1 from public.marketing_rates r where lower(r.name)=lower(btrim(v_item->>'name')) and r.rate_type=v_item->>'rate_type') then
        v_duplicates:=v_duplicates+1;
      end if;
    end loop;
  end if;

  insert into public.data_transfer_jobs(direction,domain,file_name,format,duplicate_strategy,status,payload,preview,created_by)
  values(
    'import',p_domain,p_file_name,'json',p_strategy,'validated',p_payload,
    jsonb_build_object(
      'total',v_total,'duplicates',v_duplicates,'new',v_total-v_duplicates,
      'strategy',p_strategy,'validation_version','p28-v66','atomic',true
    ),
    (select auth.uid())
  ) returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.preview_data_import(text,jsonb,text,text) from public, anon;
grant execute on function public.preview_data_import(text,jsonb,text,text) to authenticated;

create or replace function public.apply_data_import(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_job public.data_transfer_jobs;
  v_item jsonb;
  v_processed integer:=0;
  v_skipped integer:=0;
  v_existing bigint;
  v_requires_partner boolean;
  v_is_student boolean;
  v_override_date date;
  v_month_day text;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501';
  end if;
  select * into v_job from public.data_transfer_jobs
  where id=p_job_id and direction='import' and status='validated'
  for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;

  update public.data_transfer_jobs set status='running' where id=v_job.id;

  for v_item in select value from jsonb_array_elements(v_job.payload) loop
    v_existing:=null;

    if v_job.domain='people' then
      v_existing:=private.match_person_identity(v_item->>'email',v_item->>'phone',null);
      if v_existing is null then
        insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,active,created_by)
        values(
          coalesce(nullif(btrim(v_item->>'display_name'),''),nullif(btrim(concat_ws(' ',v_item->>'first_name',v_item->>'last_name')),'')),
          nullif(btrim(v_item->>'first_name'),''),nullif(btrim(v_item->>'last_name'),''),
          private.normalize_person_email(v_item->>'email'),private.normalize_person_phone(v_item->>'phone'),
          nullif(upper(btrim(v_item->>'country_code')),''),coalesce(nullif(v_item->>'crm_stage',''),'new'),
          nullif(v_item->>'source',''),nullif(v_item->>'notes',''),true,(select auth.uid())
        ) returning id into v_existing;
        v_is_student:=coalesce(private.import_bool(v_item->>'is_student'),false);
        if v_is_student then
          insert into public.student_profiles(person_id,active,created_by)
          values(v_existing,true,(select auth.uid()))
          on conflict(person_id) do update set active=true;
        end if;
        v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then
        v_skipped:=v_skipped+1;
      else
        update public.people set
          display_name=case when v_job.duplicate_strategy='update' then coalesce(nullif(btrim(v_item->>'display_name'),''),display_name) else display_name end,
          first_name=case when v_job.duplicate_strategy='update' or first_name is null then coalesce(nullif(btrim(v_item->>'first_name'),''),first_name) else first_name end,
          last_name=case when v_job.duplicate_strategy='update' or last_name is null then coalesce(nullif(btrim(v_item->>'last_name'),''),last_name) else last_name end,
          email=case when v_job.duplicate_strategy='update' or email is null then coalesce(private.normalize_person_email(v_item->>'email'),email) else email end,
          phone=case when v_job.duplicate_strategy='update' or phone is null then coalesce(private.normalize_person_phone(v_item->>'phone'),phone) else phone end,
          country_code=case when v_job.duplicate_strategy='update' or country_code is null then coalesce(nullif(upper(btrim(v_item->>'country_code')),''),country_code) else country_code end,
          updated_at=now()
        where id=v_existing;
        if coalesce(private.import_bool(v_item->>'is_student'),false) then
          insert into public.student_profiles(person_id,active,created_by)
          values(v_existing,true,(select auth.uid()))
          on conflict(person_id) do update set active=true;
        end if;
        v_processed:=v_processed+1;
      end if;

    elsif v_job.domain='teaching' then
      select id into v_existing from public.teaching_contents
      where content_type=v_item->>'content_type' and lower(title)=lower(btrim(v_item->>'title')) limit 1;
      v_requires_partner:=coalesce(private.import_bool(v_item->>'requires_partner'),false);
      if v_existing is null then
        insert into public.teaching_contents(
          content_type,title,description,correction_guidance,completion_status,publication_status,
          visibility,measurement_mode,requires_partner,created_by
        ) values(
          v_item->>'content_type',btrim(v_item->>'title'),nullif(v_item->>'description',''),nullif(v_item->>'correction_guidance',''),
          'incomplete','draft','staff',coalesce(nullif(v_item->>'measurement_mode',''),'none'),
          case when v_item->>'content_type'='exercise' then v_requires_partner else false end,(select auth.uid())
        );
        v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then
        v_skipped:=v_skipped+1;
      else
        update public.teaching_contents set
          description=case when v_job.duplicate_strategy='update' or description is null then coalesce(nullif(v_item->>'description',''),description) else description end,
          correction_guidance=case when v_job.duplicate_strategy='update' or correction_guidance is null then coalesce(nullif(v_item->>'correction_guidance',''),correction_guidance) else correction_guidance end,
          measurement_mode=case when v_job.duplicate_strategy='update' then coalesce(nullif(v_item->>'measurement_mode',''),measurement_mode) else measurement_mode end,
          requires_partner=case when content_type='exercise' and v_job.duplicate_strategy='update' and nullif(v_item->>'requires_partner','') is not null then v_requires_partner else requires_partner end,
          updated_at=now()
        where id=v_existing;
        v_processed:=v_processed+1;
      end if;

    elsif v_job.domain='daily_quotes' then
      v_override_date:=case when nullif(btrim(v_item->>'override_date'),'') is null then null else (v_item->>'override_date')::date end;
      v_month_day:=nullif(btrim(v_item->>'month_day'),'');
      select id into v_existing from public.daily_quotes q
      where (v_override_date is not null and q.override_date=v_override_date)
         or (v_month_day is not null and q.month_day=v_month_day)
      order by id limit 1;
      if v_existing is null then
        insert into public.daily_quotes(quote_text,month_day,override_date,active,source,created_by)
        values(btrim(v_item->>'quote_text'),v_month_day,v_override_date,coalesce(private.import_bool(v_item->>'active'),true),'csv',(select auth.uid()));
        v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then
        v_skipped:=v_skipped+1;
      else
        update public.daily_quotes set
          quote_text=case when v_job.duplicate_strategy='update' then btrim(v_item->>'quote_text') else quote_text end,
          active=case when v_job.duplicate_strategy='update' and nullif(v_item->>'active','') is not null then coalesce(private.import_bool(v_item->>'active'),active) else active end,
          updated_at=now()
        where id=v_existing;
        v_processed:=v_processed+1;
      end if;

    elsif v_job.domain='mission_rules' then
      if not exists(select 1 from public.mission_rules where rule_key=v_item->>'rule_key') then
        raise exception 'La regla «%» dejó de existir desde la previsualización.',v_item->>'rule_key' using errcode='P0002';
      end if;
      if v_job.duplicate_strategy='skip' then
        v_skipped:=v_skipped+1;
      else
        update public.mission_rules set
          enabled=coalesce(private.import_bool(v_item->>'enabled'),enabled),
          priority=coalesce(nullif(v_item->>'priority',''),priority),
          priority_score=coalesce(nullif(v_item->>'priority_score','')::integer,priority_score),
          estimated_duration_minutes=coalesce(nullif(v_item->>'estimated_duration_minutes','')::integer,estimated_duration_minutes),
          weight=coalesce(nullif(v_item->>'weight','')::numeric,weight),
          lead_minutes=coalesce(nullif(v_item->>'lead_minutes','')::integer,lead_minutes),
          max_daily=coalesce(nullif(v_item->>'max_daily','')::integer,max_daily),
          duplicate_strategy=coalesce(nullif(v_item->>'duplicate_strategy',''),duplicate_strategy),
          failure_behavior=coalesce(nullif(v_item->>'failure_behavior',''),failure_behavior),
          evidence_requirement=coalesce(nullif(v_item->>'evidence_requirement',''),evidence_requirement),
          auto_complete=coalesce(private.import_bool(v_item->>'auto_complete'),auto_complete),
          calendar_block=coalesce(private.import_bool(v_item->>'calendar_block'),calendar_block),
          valid_days=case when jsonb_typeof(v_item->'valid_days')='array' then array(select jsonb_array_elements_text(v_item->'valid_days')::smallint) else valid_days end,
          notification_events=case when jsonb_typeof(v_item->'notification_events')='array' then array(select jsonb_array_elements_text(v_item->'notification_events')) else notification_events end,
          notification_channels=case when jsonb_typeof(v_item->'notification_channels')='array' then array(select jsonb_array_elements_text(v_item->'notification_channels')) else notification_channels end,
          recipients=case when jsonb_typeof(v_item->'recipients') in ('array','object') then v_item->'recipients' else recipients end,
          criteria=case when jsonb_typeof(v_item->'criteria')='object' then v_item->'criteria' else criteria end,
          escalation=case when jsonb_typeof(v_item->'escalation')='object' then v_item->'escalation' else escalation end,
          updated_by=(select auth.uid()),updated_at=now()
        where rule_key=v_item->>'rule_key';
        v_processed:=v_processed+1;
      end if;

    elsif v_job.domain='marketing_rates' then
      select id into v_existing from public.marketing_rates
      where lower(name)=lower(btrim(v_item->>'name')) and rate_type=v_item->>'rate_type' limit 1;
      if v_existing is null then
        insert into public.marketing_rates(name,rate_type,duration_minutes,price_cents,currency,description,active,created_by)
        values(
          btrim(v_item->>'name'),v_item->>'rate_type',(v_item->>'duration_minutes')::integer,(v_item->>'price_cents')::integer,
          coalesce(nullif(v_item->>'currency',''),'EUR'),nullif(v_item->>'description',''),coalesce(private.import_bool(v_item->>'active'),true),(select auth.uid())
        );
        v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then
        v_skipped:=v_skipped+1;
      else
        update public.marketing_rates set
          duration_minutes=coalesce(nullif(v_item->>'duration_minutes','')::integer,duration_minutes),
          price_cents=coalesce(nullif(v_item->>'price_cents','')::integer,price_cents),
          currency=case when v_job.duplicate_strategy='update' then coalesce(nullif(v_item->>'currency',''),currency) else currency end,
          description=case when v_job.duplicate_strategy='update' or description is null then coalesce(nullif(v_item->>'description',''),description) else description end,
          active=case when v_job.duplicate_strategy='update' and nullif(v_item->>'active','') is not null then coalesce(private.import_bool(v_item->>'active'),active) else active end,
          updated_at=now()
        where id=v_existing;
        v_processed:=v_processed+1;
      end if;
    end if;
  end loop;

  update public.data_transfer_jobs
  set status='completed',result=jsonb_build_object('processed',v_processed,'skipped',v_skipped,'apply_version','p28-v66','atomic',true),payload=null,completed_at=now()
  where id=v_job.id returning * into v_job;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('data_import_completed','data_transfer_job',v_job.id::text,'Importación P28 completada',v_job.result,(select auth.uid()));
  return v_job;
exception when others then
  update public.data_transfer_jobs
  set status='failed',error_message=sqlerrm,payload=null,completed_at=now()
  where id=p_job_id returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.apply_data_import(bigint) from public, anon;
grant execute on function public.apply_data_import(bigint) to authenticated;

-- P28 keeps the public v2 surface as the canonical UI contract.
create or replace function public.preview_data_import_v2(
  p_domain text,
  p_payload jsonb,
  p_strategy text,
  p_file_name text default null,
  p_format text default 'json'
)
returns public.data_transfer_jobs
language plpgsql
security invoker
set search_path=''
as $$
declare v_job public.data_transfer_jobs;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede importar datos.' using errcode='42501'; end if;
  if p_format not in ('json','csv','xlsx') then raise exception 'Formato de archivo no válido.' using errcode='22023'; end if;
  v_job:=public.preview_data_import(p_domain,p_payload,p_strategy,p_file_name);
  update public.data_transfer_jobs set format=p_format where id=v_job.id returning * into v_job;
  return v_job;
end;
$$;
revoke all on function public.preview_data_import_v2(text,jsonb,text,text,text) from public, anon;
grant execute on function public.preview_data_import_v2(text,jsonb,text,text,text) to authenticated;

comment on function private.backup_tables_for_domain(text) is 'P28 canonical backup inventory. Excludes transient transfer/reset jobs and Sentry cache; includes functional daily quote assignments.';
comment on function public.preview_data_import(text,jsonb,text,text) is 'P28 validated import preview. Admin-only, ambiguity-blocking and non-mutating.';
comment on function public.apply_data_import(bigint) is 'P28 atomic import executor using canonical person identity and safe teaching defaults.';
