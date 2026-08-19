-- CYA Hub · durable structured people/student import support
-- Applied to CYA Hub Staging on 2026-08-16.
-- This file is the repository source for the staging migration so future updates/resets
-- do not fall back to storing historical spreadsheet fields as opaque notes.

alter table public.student_profiles add column if not exists city text;
alter table public.student_profiles add column if not exists has_partner boolean;
alter table public.student_profiles add column if not exists continues_dancing boolean;
alter table public.student_profiles add column if not exists bought_bonus boolean;
alter table public.student_profiles add column if not exists wedding boolean;
alter table public.student_profiles add column if not exists tourist boolean;
alter table public.student_profiles add column if not exists referred_by text;
alter table public.student_profiles add column if not exists dance_start_label text;
alter table public.student_profiles add column if not exists dance_end_label text;
alter table public.student_profiles add column if not exists historical_classes integer;
alter table public.student_profiles add column if not exists historical_consumed_classes integer;
alter table public.student_profiles add column if not exists historical_total_paid_cents integer;

create or replace function public.apply_people_import_v3(p_job_id bigint)
returns public.data_transfer_jobs
language plpgsql
set search_path to ''
as $$
declare
  v_job public.data_transfer_jobs;
  v_item jsonb;
  v_processed integer:=0;
  v_skipped integer:=0;
  v_existing bigint;
  v_display_name text;
  v_email text;
  v_phone text;
  v_is_student boolean;
  v_contact_date date;
  v_reserved boolean;
  v_amount integer;
  v_rate_id bigint;
  v_rate_name text;
  v_has_partner boolean;
  v_continues_dancing boolean;
  v_bought_bonus boolean;
  v_wedding boolean;
  v_tourist boolean;
  v_historical_classes integer;
  v_historical_consumed integer;
  v_historical_paid integer;
begin
  if not (select private.is_admin()) then raise exception 'Solo un administrador puede aplicar importaciones.' using errcode='42501'; end if;
  select * into v_job from public.data_transfer_jobs
  where id=p_job_id and direction='import' and domain='people' and status='validated'
  for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;

  update public.data_transfer_jobs set status='running' where id=v_job.id;

  for v_item in select value from jsonb_array_elements(v_job.payload) loop
    v_display_name:=coalesce(nullif(btrim(v_item->>'display_name'),''),nullif(btrim(concat_ws(' ',v_item->>'first_name',v_item->>'last_name')),''));
    v_email:=private.normalize_person_email(v_item->>'email');
    v_phone:=private.normalize_person_phone(v_item->>'phone');

    if v_email is null and v_phone is null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cya-person-import-name:'||private.normalize_person_import_name(v_display_name),0));
    else
      perform private.lock_person_identity(v_email,v_phone);
    end if;

    v_existing:=private.match_person_import_identity(v_email,v_phone,v_display_name);
    v_is_student:=coalesce(private.import_bool(v_item->>'is_student'),false);

    if v_existing is null then
      insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,active,created_by)
      values(
        v_display_name,
        nullif(btrim(v_item->>'first_name'),''),nullif(btrim(v_item->>'last_name'),''),
        v_email,v_phone,nullif(upper(btrim(v_item->>'country_code')),''),
        coalesce(nullif(btrim(v_item->>'crm_stage'),''),'new'),
        nullif(btrim(v_item->>'source'),''),nullif(btrim(v_item->>'notes'),''),true,(select auth.uid())
      ) returning id into v_existing;
      v_processed:=v_processed+1;
    elsif v_job.duplicate_strategy='skip' then
      v_skipped:=v_skipped+1;
      continue;
    else
      update public.people p set
        display_name=case when v_job.duplicate_strategy='update' then coalesce(v_display_name,p.display_name) else p.display_name end,
        first_name=case when v_job.duplicate_strategy='update' or p.first_name is null then coalesce(nullif(btrim(v_item->>'first_name'),''),p.first_name) else p.first_name end,
        last_name=case when v_job.duplicate_strategy='update' or p.last_name is null then coalesce(nullif(btrim(v_item->>'last_name'),''),p.last_name) else p.last_name end,
        email=case when v_job.duplicate_strategy='update' or p.email is null then coalesce(v_email,p.email) else p.email end,
        phone=case when v_job.duplicate_strategy='update' or p.phone is null then coalesce(v_phone,p.phone) else p.phone end,
        country_code=case when v_job.duplicate_strategy='update' or p.country_code is null then coalesce(nullif(upper(btrim(v_item->>'country_code')),''),p.country_code) else p.country_code end,
        crm_stage=case when v_job.duplicate_strategy='update' then coalesce(nullif(btrim(v_item->>'crm_stage'),''),p.crm_stage) else p.crm_stage end,
        source=case when v_job.duplicate_strategy='update' or p.source is null then coalesce(nullif(btrim(v_item->>'source'),''),p.source) else p.source end,
        notes=case when v_job.duplicate_strategy='update' or p.notes is null then coalesce(nullif(btrim(v_item->>'notes'),''),p.notes) else p.notes end,
        updated_at=now()
      where p.id=v_existing;
      v_processed:=v_processed+1;
    end if;

    if v_is_student then
      v_has_partner:=private.import_bool(v_item->>'has_partner');
      v_continues_dancing:=private.import_bool(v_item->>'continues_dancing');
      v_bought_bonus:=private.import_bool(v_item->>'bought_bonus');
      v_wedding:=private.import_bool(v_item->>'wedding');
      v_tourist:=private.import_bool(v_item->>'tourist');
      begin v_historical_classes:=nullif(v_item->>'historical_classes','')::integer; exception when others then v_historical_classes:=null; end;
      begin v_historical_consumed:=nullif(v_item->>'historical_consumed_classes','')::integer; exception when others then v_historical_consumed:=null; end;
      begin v_historical_paid:=nullif(v_item->>'historical_total_paid_cents','')::integer; exception when others then v_historical_paid:=null; end;

      insert into public.student_profiles(
        person_id,active,city,has_partner,continues_dancing,bought_bonus,wedding,tourist,referred_by,
        dance_start_label,dance_end_label,historical_classes,historical_consumed_classes,historical_total_paid_cents,created_by
      ) values (
        v_existing,true,nullif(btrim(v_item->>'city'),''),v_has_partner,v_continues_dancing,v_bought_bonus,v_wedding,v_tourist,
        nullif(btrim(v_item->>'referred_by'),''),nullif(btrim(v_item->>'dance_start_label'),''),nullif(btrim(v_item->>'dance_end_label'),''),
        v_historical_classes,v_historical_consumed,v_historical_paid,(select auth.uid())
      )
      on conflict(person_id) do update set
        active=true,
        city=case when v_job.duplicate_strategy='update' or public.student_profiles.city is null then coalesce(excluded.city,public.student_profiles.city) else public.student_profiles.city end,
        has_partner=case when v_job.duplicate_strategy='update' or public.student_profiles.has_partner is null then coalesce(excluded.has_partner,public.student_profiles.has_partner) else public.student_profiles.has_partner end,
        continues_dancing=case when v_job.duplicate_strategy='update' or public.student_profiles.continues_dancing is null then coalesce(excluded.continues_dancing,public.student_profiles.continues_dancing) else public.student_profiles.continues_dancing end,
        bought_bonus=case when v_job.duplicate_strategy='update' or public.student_profiles.bought_bonus is null then coalesce(excluded.bought_bonus,public.student_profiles.bought_bonus) else public.student_profiles.bought_bonus end,
        wedding=case when v_job.duplicate_strategy='update' or public.student_profiles.wedding is null then coalesce(excluded.wedding,public.student_profiles.wedding) else public.student_profiles.wedding end,
        tourist=case when v_job.duplicate_strategy='update' or public.student_profiles.tourist is null then coalesce(excluded.tourist,public.student_profiles.tourist) else public.student_profiles.tourist end,
        referred_by=case when v_job.duplicate_strategy='update' or public.student_profiles.referred_by is null then coalesce(excluded.referred_by,public.student_profiles.referred_by) else public.student_profiles.referred_by end,
        dance_start_label=case when v_job.duplicate_strategy='update' or public.student_profiles.dance_start_label is null then coalesce(excluded.dance_start_label,public.student_profiles.dance_start_label) else public.student_profiles.dance_start_label end,
        dance_end_label=case when v_job.duplicate_strategy='update' or public.student_profiles.dance_end_label is null then coalesce(excluded.dance_end_label,public.student_profiles.dance_end_label) else public.student_profiles.dance_end_label end,
        historical_classes=case when v_job.duplicate_strategy='update' or public.student_profiles.historical_classes is null then coalesce(excluded.historical_classes,public.student_profiles.historical_classes) else public.student_profiles.historical_classes end,
        historical_consumed_classes=case when v_job.duplicate_strategy='update' or public.student_profiles.historical_consumed_classes is null then coalesce(excluded.historical_consumed_classes,public.student_profiles.historical_consumed_classes) else public.student_profiles.historical_consumed_classes end,
        historical_total_paid_cents=case when v_job.duplicate_strategy='update' or public.student_profiles.historical_total_paid_cents is null then coalesce(excluded.historical_total_paid_cents,public.student_profiles.historical_total_paid_cents) else public.student_profiles.historical_total_paid_cents end,
        updated_at=now();
    end if;

    v_contact_date:=null;
    if nullif(btrim(v_item->>'contact_date'),'') is not null then
      begin
        if (v_item->>'contact_date')~'^\d{4}-\d{2}-\d{2}' then v_contact_date:=left(v_item->>'contact_date',10)::date;
        elsif (v_item->>'contact_date')~'^\d{1,2}/\d{1,2}/\d{4}$' then v_contact_date:=to_date(v_item->>'contact_date','DD/MM/YYYY');
        elsif (v_item->>'contact_date')~'^\d{1,2}-\d{1,2}-\d{4}$' then v_contact_date:=to_date(v_item->>'contact_date','DD-MM-YYYY'); end if;
      exception when others then v_contact_date:=null; end;
    end if;
    v_reserved:=private.import_bool(v_item->>'reserved');
    v_amount:=null;
    begin v_amount:=nullif(v_item->>'quoted_amount_cents','')::integer; exception when others then v_amount:=null; end;
    v_rate_name:=coalesce(nullif(btrim(v_item->>'rate_name'),''),nullif(btrim(v_item->>'Bono'),''),nullif(btrim(v_item->>'bono'),''));
    v_rate_id:=null;
    if v_rate_name is not null then
      select r.id into v_rate_id from public.marketing_rates r where lower(r.name)=lower(v_rate_name) order by r.active desc,r.sort_order,r.id limit 1;
    end if;

    if v_contact_date is not null or nullif(btrim(v_item->>'inquiry'),'') is not null or v_reserved is not null or v_rate_id is not null or v_amount is not null then
      insert into public.crm_profiles(person_id,contact_date,inquiry,reserved,rate_id,quoted_amount_cents,contact_permission,created_by)
      values(v_existing,coalesce(v_contact_date,current_date),nullif(btrim(v_item->>'inquiry'),''),coalesce(v_reserved,false),v_rate_id,v_amount,'unknown',(select auth.uid()))
      on conflict(person_id) do update set
        contact_date=case when v_job.duplicate_strategy='update' then coalesce(v_contact_date,public.crm_profiles.contact_date) else public.crm_profiles.contact_date end,
        inquiry=case when v_job.duplicate_strategy='update' or public.crm_profiles.inquiry is null then coalesce(nullif(btrim(v_item->>'inquiry'),''),public.crm_profiles.inquiry) else public.crm_profiles.inquiry end,
        reserved=case when v_job.duplicate_strategy='update' and v_reserved is not null then v_reserved else public.crm_profiles.reserved end,
        rate_id=case when v_job.duplicate_strategy='update' or public.crm_profiles.rate_id is null then coalesce(v_rate_id,public.crm_profiles.rate_id) else public.crm_profiles.rate_id end,
        quoted_amount_cents=case when v_job.duplicate_strategy='update' or public.crm_profiles.quoted_amount_cents is null then coalesce(v_amount,public.crm_profiles.quoted_amount_cents) else public.crm_profiles.quoted_amount_cents end,
        updated_at=now();
    end if;
  end loop;

  update public.data_transfer_jobs
  set status='completed',result=jsonb_build_object('processed',v_processed,'skipped',v_skipped,'apply_version','people-v96-structured','atomic',true),payload=null,completed_at=now()
  where id=v_job.id returning * into v_job;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('data_import_completed','data_transfer_job',v_job.id::text,'Importación de Personas/CRM completada',v_job.result,(select auth.uid()));
  return v_job;
exception when others then
  update public.data_transfer_jobs
  set status='failed',error_message=sqlerrm,payload=null,completed_at=now()
  where id=p_job_id returning * into v_job;
  return v_job;
end;
$$;
