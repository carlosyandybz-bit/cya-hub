begin;

-- CYA Hub · Marketing + CRM
-- Una sola persona alimenta CRM y Alumnado. Los adjuntos viven en Google Drive;
-- aquí solo se guardan identificadores y metadatos.

create table public.marketing_rates (
  id bigint generated always as identity primary key,
  name text not null check (length(btrim(name)) > 0),
  rate_type text not null default 'individual' check (rate_type in ('individual','pair','event','other')),
  duration_minutes integer check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 100000)),
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_rates_active_sort_idx on public.marketing_rates(active,sort_order,id);
create index marketing_rates_created_by_idx on public.marketing_rates(created_by) where created_by is not null;

create table public.crm_profiles (
  person_id bigint primary key references public.people(id) on delete cascade,
  contact_date date not null default current_date,
  inquiry text,
  reserved boolean not null default false,
  rate_id bigint references public.marketing_rates(id) on delete set null,
  quoted_amount_cents integer check (quoted_amount_cents is null or quoted_amount_cents >= 0),
  contact_permission text not null default 'unknown' check (contact_permission in ('unknown','allowed','blocked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crm_profiles_rate_id_idx on public.crm_profiles(rate_id) where rate_id is not null;
create index crm_profiles_contact_date_idx on public.crm_profiles(contact_date desc,person_id);
create index crm_profiles_created_by_idx on public.crm_profiles(created_by) where created_by is not null;

create table public.crm_activities (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people(id) on delete cascade,
  activity_type text not null check (activity_type in ('created','note','call','message','stage_change','reservation','conversion')),
  summary text not null check (length(btrim(summary)) > 0),
  from_stage text,
  to_stage text,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index crm_activities_person_occurred_idx on public.crm_activities(person_id,occurred_at desc,id desc);
create index crm_activities_created_by_idx on public.crm_activities(created_by) where created_by is not null;

create table public.marketing_content (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  channel text not null default 'instagram' check (channel in ('instagram','facebook','whatsapp','email','website','other')),
  content_type text not null default 'post' check (content_type in ('post','story','reel','ad','email','message','other')),
  status text not null default 'idea' check (status in ('idea','planned','ready','published','archived')),
  body text,
  planned_for timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_content_status_planned_idx on public.marketing_content(status,planned_for,id);
create index marketing_content_channel_status_idx on public.marketing_content(channel,status,id);
create index marketing_content_created_by_idx on public.marketing_content(created_by) where created_by is not null;

create table public.marketing_content_media (
  id bigint generated always as identity primary key,
  content_id bigint not null references public.marketing_content(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  external_file_id text not null check (length(btrim(external_file_id)) > 0),
  title text,
  mime_type text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(content_id,provider,external_file_id)
);

create index marketing_content_media_content_order_idx on public.marketing_content_media(content_id,sort_order,id);
create index marketing_content_media_created_by_idx on public.marketing_content_media(created_by) where created_by is not null;

create table public.marketing_events (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  status text not null default 'planned' check (status in ('planned','open','completed','cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  description text,
  capacity integer check (capacity is null or capacity > 0),
  price_cents integer check (price_cents is null or price_cents >= 0),
  registration_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_events_ends_after_start check (ends_at is null or ends_at >= starts_at)
);

create index marketing_events_status_starts_idx on public.marketing_events(status,starts_at,id);
create index marketing_events_created_by_idx on public.marketing_events(created_by) where created_by is not null;

create table public.marketing_campaigns (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  channel text not null default 'whatsapp' check (channel in ('instagram','facebook','whatsapp','email','website','other')),
  objective text,
  audience_scope text not null default 'potential' check (audience_scope in ('potential','students','all','custom')),
  status text not null default 'draft' check (status in ('draft','scheduled','active','completed','cancelled')),
  message text,
  event_id bigint references public.marketing_events(id) on delete set null,
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  scheduled_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_ends_after_start check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index marketing_campaigns_status_schedule_idx on public.marketing_campaigns(status,scheduled_at,id);
create index marketing_campaigns_event_id_idx on public.marketing_campaigns(event_id) where event_id is not null;
create index marketing_campaigns_created_by_idx on public.marketing_campaigns(created_by) where created_by is not null;

create table public.marketing_campaign_media (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.marketing_campaigns(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  external_file_id text not null check (length(btrim(external_file_id)) > 0),
  title text,
  mime_type text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(campaign_id,provider,external_file_id)
);

create index marketing_campaign_media_campaign_order_idx on public.marketing_campaign_media(campaign_id,sort_order,id);
create index marketing_campaign_media_created_by_idx on public.marketing_campaign_media(created_by) where created_by is not null;

create table public.marketing_campaign_metrics (
  id bigint generated always as identity primary key,
  campaign_id bigint not null references public.marketing_campaigns(id) on delete cascade,
  metric_date date not null default current_date,
  spend_cents integer not null default 0 check (spend_cents >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  reach integer not null default 0 check (reach >= 0),
  clicks integer not null default 0 check (clicks >= 0),
  inquiries integer not null default 0 check (inquiries >= 0),
  bookings integer not null default 0 check (bookings >= 0),
  revenue_cents integer not null default 0 check (revenue_cents >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id,metric_date)
);

create index marketing_campaign_metrics_campaign_date_idx on public.marketing_campaign_metrics(campaign_id,metric_date desc);
create index marketing_campaign_metrics_created_by_idx on public.marketing_campaign_metrics(created_by) where created_by is not null;

create trigger marketing_rates_touch_updated_at before update on public.marketing_rates for each row execute function private.touch_updated_at();
create trigger crm_profiles_touch_updated_at before update on public.crm_profiles for each row execute function private.touch_updated_at();
create trigger marketing_content_touch_updated_at before update on public.marketing_content for each row execute function private.touch_updated_at();
create trigger marketing_events_touch_updated_at before update on public.marketing_events for each row execute function private.touch_updated_at();
create trigger marketing_campaigns_touch_updated_at before update on public.marketing_campaigns for each row execute function private.touch_updated_at();
create trigger marketing_campaign_metrics_touch_updated_at before update on public.marketing_campaign_metrics for each row execute function private.touch_updated_at();

create function public.save_crm_contact(
  p_person_id bigint default null,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null,
  p_crm_stage text default 'new',
  p_source text default null,
  p_contact_date date default current_date,
  p_inquiry text default null,
  p_reserved boolean default false,
  p_rate_id bigint default null,
  p_quoted_amount_cents integer default null,
  p_notes text default null,
  p_contact_permission text default 'unknown'
) returns public.people language plpgsql security invoker set search_path='' as $$
declare
  v_person public.people;
  v_name text;
  v_previous_stage text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar CRM.' using errcode='42501'; end if;
  if p_crm_stage not in ('new','contacted','interested','booked','student','lost') then raise exception 'Estado de CRM no válido.' using errcode='22023'; end if;
  if p_contact_permission not in ('unknown','allowed','blocked') then raise exception 'Permiso de contacto no válido.' using errcode='22023'; end if;
  if p_quoted_amount_cents is not null and p_quoted_amount_cents < 0 then raise exception 'El importe no puede ser negativo.' using errcode='22023'; end if;
  v_name := btrim(concat_ws(' ',nullif(btrim(coalesce(p_first_name,'')),''),nullif(btrim(coalesce(p_last_name,'')),'')));
  if length(v_name)=0 then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;

  if p_person_id is null then
    insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,active,created_by)
    values(v_name,nullif(btrim(p_first_name),''),nullif(btrim(p_last_name),''),nullif(lower(btrim(p_email)),''),nullif(btrim(p_phone),''),nullif(upper(btrim(p_country_code)),''),p_crm_stage,nullif(btrim(p_source),''),nullif(btrim(p_notes),''),true,(select auth.uid()))
    returning * into v_person;
    insert into public.crm_activities(person_id,activity_type,summary,to_stage,created_by)
    values(v_person.id,'created','Contacto creado',p_crm_stage,(select auth.uid()));
  else
    select crm_stage into v_previous_stage from public.people where id=p_person_id and active for update;
    if not found then raise exception 'El contacto ya no existe.' using errcode='P0002'; end if;
    update public.people set
      display_name=v_name,
      first_name=nullif(btrim(p_first_name),''),
      last_name=nullif(btrim(p_last_name),''),
      email=nullif(lower(btrim(p_email)),''),
      phone=nullif(btrim(p_phone),''),
      country_code=nullif(upper(btrim(p_country_code)),''),
      crm_stage=p_crm_stage,
      source=nullif(btrim(p_source),''),
      notes=nullif(btrim(p_notes),''),
      updated_at=now()
    where id=p_person_id returning * into v_person;
    if v_previous_stage is distinct from p_crm_stage then
      insert into public.crm_activities(person_id,activity_type,summary,from_stage,to_stage,created_by)
      values(v_person.id,'stage_change','Estado comercial actualizado',v_previous_stage,p_crm_stage,(select auth.uid()));
    end if;
  end if;

  insert into public.crm_profiles(person_id,contact_date,inquiry,reserved,rate_id,quoted_amount_cents,contact_permission,created_by)
  values(v_person.id,coalesce(p_contact_date,current_date),nullif(btrim(p_inquiry),''),coalesce(p_reserved,false),p_rate_id,p_quoted_amount_cents,p_contact_permission,(select auth.uid()))
  on conflict(person_id) do update set
    contact_date=excluded.contact_date,
    inquiry=excluded.inquiry,
    reserved=excluded.reserved,
    rate_id=excluded.rate_id,
    quoted_amount_cents=excluded.quoted_amount_cents,
    contact_permission=excluded.contact_permission,
    updated_at=now();
  return v_person;
end;
$$;

create function public.enable_provisional_student(p_person_id bigint)
returns public.people language plpgsql security invoker set search_path='' as $$
declare v_person public.people;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para habilitar alumnos.' using errcode='42501'; end if;
  select * into v_person from public.people where id=p_person_id and active for update;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  insert into public.student_profiles(person_id,student_since,active,created_by)
  values(p_person_id,null,true,(select auth.uid()))
  on conflict(person_id) do update set active=true,updated_at=now();
  insert into public.crm_activities(person_id,activity_type,summary,created_by)
  values(p_person_id,'conversion','Ficha provisional habilitada sin perder los datos del CRM',(select auth.uid()));
  return v_person;
end;
$$;

create function public.save_marketing_rate(
  p_rate_id bigint default null,p_name text default null,p_rate_type text default 'individual',
  p_duration_minutes integer default null,p_price_cents integer default 0,p_description text default null,p_active boolean default true
) returns public.marketing_rates language plpgsql security invoker set search_path='' as $$
declare v_rate public.marketing_rates;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar tarifas.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_name,'')))=0 then raise exception 'El nombre de la tarifa es obligatorio.' using errcode='22023'; end if;
  if p_rate_type not in ('individual','pair','event','other') or p_price_cents<0 or (p_duration_minutes is not null and p_duration_minutes<=0) then raise exception 'Revisa los datos de la tarifa.' using errcode='22023'; end if;
  if p_rate_id is null then
    insert into public.marketing_rates(name,rate_type,duration_minutes,price_cents,description,active,created_by)
    values(btrim(p_name),p_rate_type,p_duration_minutes,p_price_cents,nullif(btrim(p_description),''),p_active,(select auth.uid())) returning * into v_rate;
  else
    update public.marketing_rates set name=btrim(p_name),rate_type=p_rate_type,duration_minutes=p_duration_minutes,price_cents=p_price_cents,description=nullif(btrim(p_description),''),active=p_active,updated_at=now()
    where id=p_rate_id returning * into v_rate;
    if not found then raise exception 'La tarifa no existe.' using errcode='P0002'; end if;
  end if;
  return v_rate;
end;
$$;

create function public.save_marketing_content(
  p_content_id bigint default null,p_title text default null,p_channel text default 'instagram',p_content_type text default 'post',
  p_status text default 'idea',p_body text default null,p_planned_for timestamptz default null
) returns public.marketing_content language plpgsql security invoker set search_path='' as $$
declare v_content public.marketing_content;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar contenido.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,'')))=0 then raise exception 'El título es obligatorio.' using errcode='22023'; end if;
  if p_channel not in ('instagram','facebook','whatsapp','email','website','other') or p_content_type not in ('post','story','reel','ad','email','message','other') or p_status not in ('idea','planned','ready','published','archived') then raise exception 'Revisa el tipo, canal o estado.' using errcode='22023'; end if;
  if p_content_id is null then
    insert into public.marketing_content(title,channel,content_type,status,body,planned_for,published_at,created_by)
    values(btrim(p_title),p_channel,p_content_type,p_status,nullif(btrim(p_body),''),p_planned_for,case when p_status='published' then now() else null end,(select auth.uid())) returning * into v_content;
  else
    update public.marketing_content set title=btrim(p_title),channel=p_channel,content_type=p_content_type,status=p_status,body=nullif(btrim(p_body),''),planned_for=p_planned_for,published_at=case when p_status='published' then coalesce(published_at,now()) else published_at end,updated_at=now()
    where id=p_content_id returning * into v_content;
    if not found then raise exception 'El contenido no existe.' using errcode='P0002'; end if;
  end if;
  return v_content;
end;
$$;

create function public.add_marketing_content_media(p_content_id bigint,p_media_type text,p_external_file_id text,p_title text default null)
returns public.marketing_content_media language plpgsql security invoker set search_path='' as $$
declare v_media public.marketing_content_media;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para añadir archivos.' using errcode='42501'; end if;
  if p_media_type not in ('image','video') or length(btrim(coalesce(p_external_file_id,'')))=0 then raise exception 'Archivo no válido.' using errcode='22023'; end if;
  insert into public.marketing_content_media(content_id,media_type,provider,external_file_id,title,created_by)
  values(p_content_id,p_media_type,'google_drive',btrim(p_external_file_id),nullif(btrim(p_title),''),(select auth.uid()))
  on conflict(content_id,provider,external_file_id) do update set media_type=excluded.media_type,title=excluded.title
  returning * into v_media;
  return v_media;
end;
$$;

create function public.save_marketing_event(
  p_event_id bigint default null,p_title text default null,p_status text default 'planned',p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,p_location text default null,p_description text default null,p_capacity integer default null,
  p_price_cents integer default null,p_registration_url text default null
) returns public.marketing_events language plpgsql security invoker set search_path='' as $$
declare v_event public.marketing_events;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar eventos.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,'')))=0 or p_starts_at is null then raise exception 'Título y fecha son obligatorios.' using errcode='22023'; end if;
  if p_status not in ('planned','open','completed','cancelled') or (p_capacity is not null and p_capacity<=0) or (p_price_cents is not null and p_price_cents<0) or (p_ends_at is not null and p_ends_at<p_starts_at) then raise exception 'Revisa los datos del evento.' using errcode='22023'; end if;
  if p_event_id is null then
    insert into public.marketing_events(title,status,starts_at,ends_at,location,description,capacity,price_cents,registration_url,created_by)
    values(btrim(p_title),p_status,p_starts_at,p_ends_at,nullif(btrim(p_location),''),nullif(btrim(p_description),''),p_capacity,p_price_cents,nullif(btrim(p_registration_url),''),(select auth.uid())) returning * into v_event;
  else
    update public.marketing_events set title=btrim(p_title),status=p_status,starts_at=p_starts_at,ends_at=p_ends_at,location=nullif(btrim(p_location),''),description=nullif(btrim(p_description),''),capacity=p_capacity,price_cents=p_price_cents,registration_url=nullif(btrim(p_registration_url),''),updated_at=now()
    where id=p_event_id returning * into v_event;
    if not found then raise exception 'El evento no existe.' using errcode='P0002'; end if;
  end if;
  return v_event;
end;
$$;

create function public.save_marketing_campaign(
  p_campaign_id bigint default null,p_title text default null,p_channel text default 'whatsapp',p_objective text default null,
  p_audience_scope text default 'potential',p_status text default 'draft',p_message text default null,p_event_id bigint default null,
  p_budget_cents integer default null,p_scheduled_at timestamptz default null,p_starts_at timestamptz default null,p_ends_at timestamptz default null
) returns public.marketing_campaigns language plpgsql security invoker set search_path='' as $$
declare v_campaign public.marketing_campaigns;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar campañas.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,'')))=0 then raise exception 'El nombre de la campaña es obligatorio.' using errcode='22023'; end if;
  if p_channel not in ('instagram','facebook','whatsapp','email','website','other') or p_audience_scope not in ('potential','students','all','custom') or p_status not in ('draft','scheduled','active','completed','cancelled') or (p_budget_cents is not null and p_budget_cents<0) or (p_ends_at is not null and p_starts_at is not null and p_ends_at<p_starts_at) then raise exception 'Revisa los datos de la campaña.' using errcode='22023'; end if;
  if p_campaign_id is null then
    insert into public.marketing_campaigns(title,channel,objective,audience_scope,status,message,event_id,budget_cents,scheduled_at,starts_at,ends_at,created_by)
    values(btrim(p_title),p_channel,nullif(btrim(p_objective),''),p_audience_scope,p_status,nullif(btrim(p_message),''),p_event_id,p_budget_cents,p_scheduled_at,p_starts_at,p_ends_at,(select auth.uid())) returning * into v_campaign;
  else
    update public.marketing_campaigns set title=btrim(p_title),channel=p_channel,objective=nullif(btrim(p_objective),''),audience_scope=p_audience_scope,status=p_status,message=nullif(btrim(p_message),''),event_id=p_event_id,budget_cents=p_budget_cents,scheduled_at=p_scheduled_at,starts_at=p_starts_at,ends_at=p_ends_at,updated_at=now()
    where id=p_campaign_id returning * into v_campaign;
    if not found then raise exception 'La campaña no existe.' using errcode='P0002'; end if;
  end if;
  return v_campaign;
end;
$$;

create function public.add_marketing_campaign_media(p_campaign_id bigint,p_media_type text,p_external_file_id text,p_title text default null)
returns public.marketing_campaign_media language plpgsql security invoker set search_path='' as $$
declare v_media public.marketing_campaign_media;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para añadir archivos.' using errcode='42501'; end if;
  if p_media_type not in ('image','video') or length(btrim(coalesce(p_external_file_id,'')))=0 then raise exception 'Archivo no válido.' using errcode='22023'; end if;
  insert into public.marketing_campaign_media(campaign_id,media_type,provider,external_file_id,title,created_by)
  values(p_campaign_id,p_media_type,'google_drive',btrim(p_external_file_id),nullif(btrim(p_title),''),(select auth.uid()))
  on conflict(campaign_id,provider,external_file_id) do update set media_type=excluded.media_type,title=excluded.title
  returning * into v_media;
  return v_media;
end;
$$;

create function public.save_marketing_campaign_metrics(
  p_campaign_id bigint,p_metric_date date default current_date,p_spend_cents integer default 0,p_impressions integer default 0,
  p_reach integer default 0,p_clicks integer default 0,p_inquiries integer default 0,p_bookings integer default 0,p_revenue_cents integer default 0
) returns public.marketing_campaign_metrics language plpgsql security invoker set search_path='' as $$
declare v_metric public.marketing_campaign_metrics;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para registrar métricas.' using errcode='42501'; end if;
  if least(p_spend_cents,p_impressions,p_reach,p_clicks,p_inquiries,p_bookings,p_revenue_cents)<0 then raise exception 'Las métricas no pueden ser negativas.' using errcode='22023'; end if;
  insert into public.marketing_campaign_metrics(campaign_id,metric_date,spend_cents,impressions,reach,clicks,inquiries,bookings,revenue_cents,created_by)
  values(p_campaign_id,coalesce(p_metric_date,current_date),p_spend_cents,p_impressions,p_reach,p_clicks,p_inquiries,p_bookings,p_revenue_cents,(select auth.uid()))
  on conflict(campaign_id,metric_date) do update set spend_cents=excluded.spend_cents,impressions=excluded.impressions,reach=excluded.reach,clicks=excluded.clicks,inquiries=excluded.inquiries,bookings=excluded.bookings,revenue_cents=excluded.revenue_cents,updated_at=now()
  returning * into v_metric;
  return v_metric;
end;
$$;

alter table public.marketing_rates enable row level security;
alter table public.crm_profiles enable row level security;
alter table public.crm_activities enable row level security;
alter table public.marketing_content enable row level security;
alter table public.marketing_content_media enable row level security;
alter table public.marketing_events enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_media enable row level security;
alter table public.marketing_campaign_metrics enable row level security;

create policy marketing_rates_staff_select on public.marketing_rates for select to authenticated using((select private.is_staff()));
create policy marketing_rates_staff_insert on public.marketing_rates for insert to authenticated with check((select private.is_staff()));
create policy marketing_rates_staff_update on public.marketing_rates for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy crm_profiles_staff_select on public.crm_profiles for select to authenticated using((select private.is_staff()));
create policy crm_profiles_staff_insert on public.crm_profiles for insert to authenticated with check((select private.is_staff()));
create policy crm_profiles_staff_update on public.crm_profiles for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy crm_activities_staff_select on public.crm_activities for select to authenticated using((select private.is_staff()));
create policy crm_activities_staff_insert on public.crm_activities for insert to authenticated with check((select private.is_staff()));
create policy marketing_content_staff_select on public.marketing_content for select to authenticated using((select private.is_staff()));
create policy marketing_content_staff_insert on public.marketing_content for insert to authenticated with check((select private.is_staff()));
create policy marketing_content_staff_update on public.marketing_content for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy marketing_content_media_staff_select on public.marketing_content_media for select to authenticated using((select private.is_staff()));
create policy marketing_content_media_staff_insert on public.marketing_content_media for insert to authenticated with check((select private.is_staff()));
create policy marketing_content_media_staff_update on public.marketing_content_media for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy marketing_events_staff_select on public.marketing_events for select to authenticated using((select private.is_staff()));
create policy marketing_events_staff_insert on public.marketing_events for insert to authenticated with check((select private.is_staff()));
create policy marketing_events_staff_update on public.marketing_events for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy marketing_campaigns_staff_select on public.marketing_campaigns for select to authenticated using((select private.is_staff()));
create policy marketing_campaigns_staff_insert on public.marketing_campaigns for insert to authenticated with check((select private.is_staff()));
create policy marketing_campaigns_staff_update on public.marketing_campaigns for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy marketing_campaign_media_staff_select on public.marketing_campaign_media for select to authenticated using((select private.is_staff()));
create policy marketing_campaign_media_staff_insert on public.marketing_campaign_media for insert to authenticated with check((select private.is_staff()));
create policy marketing_campaign_media_staff_update on public.marketing_campaign_media for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy marketing_campaign_metrics_staff_select on public.marketing_campaign_metrics for select to authenticated using((select private.is_staff()));
create policy marketing_campaign_metrics_staff_insert on public.marketing_campaign_metrics for insert to authenticated with check((select private.is_staff()));
create policy marketing_campaign_metrics_staff_update on public.marketing_campaign_metrics for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));

revoke all on public.marketing_rates,public.crm_profiles,public.crm_activities,public.marketing_content,public.marketing_content_media,public.marketing_events,public.marketing_campaigns,public.marketing_campaign_media,public.marketing_campaign_metrics from anon;
revoke all on public.marketing_rates,public.crm_profiles,public.crm_activities,public.marketing_content,public.marketing_content_media,public.marketing_events,public.marketing_campaigns,public.marketing_campaign_media,public.marketing_campaign_metrics from authenticated;
grant select,insert,update on public.marketing_rates,public.crm_profiles,public.marketing_content,public.marketing_events,public.marketing_campaigns,public.marketing_campaign_metrics to authenticated;
grant select,insert on public.crm_activities to authenticated;
grant select,insert,update on public.marketing_content_media,public.marketing_campaign_media to authenticated;
grant usage on sequence public.marketing_rates_id_seq,public.crm_activities_id_seq,public.marketing_content_id_seq,public.marketing_content_media_id_seq,public.marketing_events_id_seq,public.marketing_campaigns_id_seq,public.marketing_campaign_media_id_seq,public.marketing_campaign_metrics_id_seq to authenticated;

revoke all on function public.save_crm_contact(bigint,text,text,text,text,text,text,text,date,text,boolean,bigint,integer,text,text) from public,anon;
revoke all on function public.enable_provisional_student(bigint) from public,anon;
revoke all on function public.save_marketing_rate(bigint,text,text,integer,integer,text,boolean) from public,anon;
revoke all on function public.save_marketing_content(bigint,text,text,text,text,text,timestamptz) from public,anon;
revoke all on function public.add_marketing_content_media(bigint,text,text,text) from public,anon;
revoke all on function public.save_marketing_event(bigint,text,text,timestamptz,timestamptz,text,text,integer,integer,text) from public,anon;
revoke all on function public.save_marketing_campaign(bigint,text,text,text,text,text,text,bigint,integer,timestamptz,timestamptz,timestamptz) from public,anon;
revoke all on function public.add_marketing_campaign_media(bigint,text,text,text) from public,anon;
revoke all on function public.save_marketing_campaign_metrics(bigint,date,integer,integer,integer,integer,integer,integer,integer) from public,anon;
grant execute on function public.save_crm_contact(bigint,text,text,text,text,text,text,text,date,text,boolean,bigint,integer,text,text) to authenticated;
grant execute on function public.enable_provisional_student(bigint) to authenticated;
grant execute on function public.save_marketing_rate(bigint,text,text,integer,integer,text,boolean) to authenticated;
grant execute on function public.save_marketing_content(bigint,text,text,text,text,text,timestamptz) to authenticated;
grant execute on function public.add_marketing_content_media(bigint,text,text,text) to authenticated;
grant execute on function public.save_marketing_event(bigint,text,text,timestamptz,timestamptz,text,text,integer,integer,text) to authenticated;
grant execute on function public.save_marketing_campaign(bigint,text,text,text,text,text,text,bigint,integer,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.add_marketing_campaign_media(bigint,text,text,text) to authenticated;
grant execute on function public.save_marketing_campaign_metrics(bigint,date,integer,integer,integer,integer,integer,integer,integer) to authenticated;

-- Un provisional puede operar como alumno, pero solo se convierte en alumno
-- comercial cuando tiene una clase valida o un bono. La fecha de alta real
-- se fija en ese mismo momento y no al crear la ficha provisional.
create or replace function public.create_student(
  p_display_name text,p_first_name text default null,p_last_name text default null,
  p_email text default null,p_phone text default null,p_country_code text default null
) returns public.people language plpgsql security invoker set search_path='' as $$
declare new_person public.people;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para crear alumnos.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_display_name,'')))=0 then raise exception 'El nombre del alumno es obligatorio.' using errcode='22023'; end if;
  insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,active,created_by)
  values(btrim(p_display_name),nullif(btrim(p_first_name),''),nullif(btrim(p_last_name),''),nullif(lower(btrim(p_email)),''),nullif(btrim(p_phone),''),nullif(upper(btrim(p_country_code)),''),'new',true,(select auth.uid()))
  returning * into new_person;
  insert into public.student_profiles(person_id,student_since,active,created_by)
  values(new_person.id,null,true,(select auth.uid()));
  return new_person;
end;
$$;
revoke all on function public.create_student(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_student(text,text,text,text,text,text) to authenticated;

create function private.promote_crm_student_from_operation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  update public.people
  set crm_stage='student'
  where id=new.person_id and active and crm_stage<>'student';

  update public.student_profiles
  set student_since=coalesce(student_since,current_date)
  where person_id=new.person_id and active;

  return new;
end;
$$;
revoke execute on function private.promote_crm_student_from_operation() from public,anon,authenticated;

create trigger class_participants_promote_crm_student
after insert on public.class_participants
for each row execute function private.promote_crm_student_from_operation();

create trigger credit_members_promote_crm_student
after insert on public.credit_grant_members
for each row execute function private.promote_crm_student_from_operation();

commit;
