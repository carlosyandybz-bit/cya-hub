begin;

-- CYA Hub v14 · calendario, formularios versionados, notificaciones,
-- administración, contexto canónico de clase y portal multirrol.

create table if not exists public.calendar_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider='google'),
  external_calendar_id text,
  display_name text,
  status text not null default 'disconnected' check (status in ('disconnected','connecting','connected','error','paused')),
  sync_enabled boolean not null default false,
  sync_direction text not null default 'two_way' check (sync_direction in ('two_way','cya_to_external','external_to_cya')),
  credential_reference text,
  last_synced_at timestamptz,
  last_error text,
  sync_cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,provider,external_calendar_id)
);

create table if not exists public.calendar_events (
  id bigint generated always as identity primary key,
  connection_id bigint references public.calendar_connections(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google','cya')),
  external_calendar_id text,
  external_event_id text,
  source_type text not null check (source_type in ('external','class','mission','marketing_event','manual')),
  source_id text,
  title text not null check (length(btrim(title)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Europe/Madrid',
  sync_status text not null default 'local' check (sync_status in ('local','pending','synced','conflict','error','ignored')),
  external_etag text,
  payload_hash text,
  last_synced_at timestamptz,
  conflict_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index if not exists calendar_external_event_uq
  on public.calendar_events(provider,external_calendar_id,external_event_id)
  where external_event_id is not null;
create unique index if not exists calendar_source_event_uq
  on public.calendar_events(source_type,source_id)
  where source_id is not null and source_type<>'external';
create index if not exists calendar_events_range_idx on public.calendar_events(starts_at,ends_at);

drop trigger if exists calendar_connections_touch_updated_at on public.calendar_connections;
create trigger calendar_connections_touch_updated_at before update on public.calendar_connections
for each row execute function private.touch_updated_at();
drop trigger if exists calendar_events_touch_updated_at on public.calendar_events;
create trigger calendar_events_touch_updated_at before update on public.calendar_events
for each row execute function private.touch_updated_at();

create table if not exists public.form_definitions (
  id bigint generated always as identity primary key,
  form_key text not null unique check (form_key ~ '^[a-z][a-z0-9_]{2,100}$'),
  admin_name text not null,
  visible_title text,
  description text,
  context_key text not null,
  form_type text not null check (form_type in ('student','teacher','admin','internal')),
  status text not null default 'active' check (status in ('active','inactive','draft','archived')),
  active_version integer not null default 1 check (active_version > 0),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_versions (
  id bigint generated always as identity primary key,
  form_id bigint not null references public.form_definitions(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'active' check (status in ('active','superseded','draft','archived')),
  change_note text,
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(form_id,version_number)
);

create table if not exists public.form_fields (
  id bigint generated always as identity primary key,
  form_version_id bigint not null references public.form_versions(id) on delete cascade,
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,100}$'),
  field_type text not null check (field_type in ('information','text','textarea','select','multiselect','checkbox','number','date','email','phone','hidden','search')),
  label text not null,
  help_text text,
  required boolean not null default false,
  canonical_path text,
  options jsonb not null default '[]'::jsonb,
  visibility jsonb not null default '{}'::jsonb,
  condition jsonb not null default '{}'::jsonb,
  validation jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique(form_version_id,field_key)
);
create index if not exists form_fields_version_order_idx on public.form_fields(form_version_id,sort_order,id);

create table if not exists public.form_submissions (
  id bigint generated always as identity primary key,
  form_id bigint not null references public.form_definitions(id) on delete restrict,
  form_version_id bigint not null references public.form_versions(id) on delete restrict,
  person_id bigint references public.people(id) on delete set null,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'completed' check (status in ('draft','completed','superseded')),
  canonical_snapshot jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now()
);
create index if not exists form_submissions_person_form_idx on public.form_submissions(person_id,form_id,submitted_at desc);

drop trigger if exists form_definitions_touch_updated_at on public.form_definitions;
create trigger form_definitions_touch_updated_at before update on public.form_definitions
for each row execute function private.touch_updated_at();

insert into public.form_definitions(form_key,admin_name,visible_title,description,context_key,form_type) values
('onboarding','Formulario de bienvenida','Queremos conocerte','Incorporación inicial del alumno, experiencia, contacto y consentimientos.','registration','student'),
('onboarding_additional','Formulario adicional de bienvenida','Un poco más sobre ti','Campos adicionales configurables del proceso de incorporación.','registration','student'),
('student_personal','Datos personales del alumno','Datos personales','Datos personales canónicos del alumno.','student','student'),
('student_dance','Datos de baile del alumno','Datos de baile','Perfil de baile por estilo.','student','student'),
('teacher_profile','Datos del profesor','Perfil profesional','Perfil profesional del profesor.','teacher','teacher'),
('provisional_create','Creación de alumno provisional','Crear alumno provisional','Alta provisional sin cuenta duplicada.','teacher','internal'),
('provisional_link','Vinculación de alumno provisional','Vincular con cuenta registrada','Vinculación segura de una sola identidad.','teacher','internal'),
('bonus_assign','Asignación de bono','Crear bono','Nuevo bono.','bonuses','teacher'),
('bonus_consume','Consumo de bono','Registrar consumo','Nuevo consumo.','bonuses','teacher'),
('bonus_transfer','Transferencia de saldo','Transferir minutos','Transferencia de saldo.','bonuses','teacher'),
('bonus_conversion','Conversión de saldo individual a pareja','Convertir saldo','Conversión de saldo.','bonuses','teacher'),
('bonus_cross_consumption','Uso de saldo de otra pareja','Registrar consumo cruzado','Consumo compartido explícito.','bonuses','teacher'),
('bonus_pause','Pausa de bono','Pausar bono','Pausa temporal.','bonuses','teacher'),
('bonus_reactivate','Reactivación de bono','Reactivar bono','Reactivación.','bonuses','teacher'),
('bonus_refund','Reembolso o corrección de bono','Corregir movimiento','Movimiento compensatorio sin borrar historial.','bonuses','teacher'),
('bonus_expiry_confirm','Confirmación de caducidad','Revisar caducidad','Revisión explícita de caducidad.','bonuses','teacher'),
('bonus_alert_settings','Configuración de avisos','Reglas de avisos','Reglas de aviso.','communications','admin'),
('renewal_request','Solicitud de renovación','Solicitar renovación','Solicitud de renovación.','bonuses','student')
on conflict(form_key) do nothing;

insert into public.form_versions(form_id,version_number,status,change_note,snapshot)
select id,1,'active','Versión inicial recuperada de la biblioteca histórica.',jsonb_build_object('source','CYA-Hub-20.13.24.5')
from public.form_definitions
on conflict(form_id,version_number) do nothing;

with field_seed(form_key,field_key,field_type,label,required,canonical_path,sort_order) as (values
('student_personal','first_name','text','Nombre',true,'people.first_name',10),
('student_personal','last_name','text','Apellidos',true,'people.last_name',20),
('student_personal','phone','phone','Teléfono',false,'people.phone',30),
('student_personal','email','email','Email',false,'people.email',40),
('student_personal','country_code','text','País',false,'people.country_code',50),
('student_personal','birth_date','date','Fecha de nacimiento',true,'student_profiles.birth_date',60),
('student_dance','experience_status','select','Estado de experiencia',true,'student_profiles.experience_status',10),
('student_dance','dance_roles','multiselect','Roles practicados',false,'student_dance_profiles.role_term_id',20),
('student_dance','primary_dance_role','select','Rol principal',false,'student_dance_profiles.is_primary',30),
('student_dance','styles','multiselect','Estilos practicados',false,'student_dance_profiles.style_term_id',40),
('student_dance','goals','textarea','Objetivos',false,'student_profiles.goals',50),
('student_dance','motivation','textarea','Motivo para bailar',false,'student_profiles.motivation',60),
('teacher_profile','professional_name','text','Nombre profesional',true,'user_profiles.display_name',10),
('teacher_profile','phone','phone','Teléfono',false,'people.phone',20),
('teacher_profile','bio','textarea','Biografía',false,'teacher_profiles.bio',30),
('teacher_profile','styles','multiselect','Estilos impartidos',false,'teacher_profiles.styles',40),
('teacher_profile','specialties','textarea','Especialidades',false,'teacher_profiles.specialties',50),
('provisional_create','first_name','text','Nombre',true,'people.first_name',10),
('provisional_create','last_name','text','Apellidos',false,'people.last_name',20),
('provisional_create','phone','phone','Teléfono',false,'people.phone',30),
('provisional_create','internal_note','textarea','Nota interna breve',false,'student_profiles.teacher_notes',40),
('provisional_link','provisional_student_id','hidden','Perfil provisional',true,null,10),
('provisional_link','registered_user_id','search','Cuenta registrada',true,null,20),
('bonus_assign','members','search','Alumno o pareja',true,null,10),
('bonus_assign','modality','select','Modalidad',true,'credit_grants.modality',20),
('bonus_assign','hours','number','Horas',true,null,30),
('bonus_assign','minutes','number','Minutos',true,'credit_grants.total_minutes',40),
('bonus_assign','agreed_price','number','Precio acordado',false,'credit_grants.price_cents',50),
('bonus_assign','payment_status','select','Estado del pago',true,'credit_grants.payment_status',60),
('bonus_assign','expiry','date','Caducidad',false,'credit_grants.expires_at',70),
('bonus_assign','notes','textarea','Notas internas',false,'credit_grants.label',80),
('bonus_consume','bonus_id','select','Saldo que se utilizará',true,null,10),
('bonus_consume','effective_at','date','Fecha',true,'credit_movements.created_at',20),
('bonus_consume','hours','number','Horas',true,null,30),
('bonus_consume','minutes','number','Minutos',true,'credit_movements.delta_minutes',40),
('bonus_consume','concept','text','Concepto',true,'credit_movements.note',50),
('bonus_transfer','source_bonus_id','select','Saldo de origen',true,null,10),
('bonus_transfer','destination_bonus_id','select','Saldo de destino',true,null,20),
('bonus_transfer','hours','number','Horas',true,null,30),
('bonus_transfer','minutes','number','Minutos',true,null,40),
('bonus_transfer','reason','textarea','Motivo',true,null,50),
('bonus_conversion','source_bonus_id','select','Saldo individual de origen',true,null,10),
('bonus_conversion','destination_bonus_id','select','Saldo de pareja',true,null,20),
('bonus_conversion','source_minutes','number','Minutos retirados',true,null,30),
('bonus_conversion','destination_minutes','number','Minutos añadidos',true,null,40),
('bonus_conversion','reason','textarea','Motivo',true,null,50),
('bonus_cross_consumption','source_bonus_id','select','Pareja de origen',true,null,10),
('bonus_cross_consumption','actual_participants','search','Participantes reales',true,null,20),
('bonus_cross_consumption','hours','number','Horas',true,null,30),
('bonus_cross_consumption','minutes','number','Minutos',true,null,40),
('bonus_cross_consumption','reason','textarea','Motivo',true,null,50),
('bonus_pause','bonus_id','hidden','Bono',true,null,10),
('bonus_pause','reason','textarea','Motivo',true,null,20),
('bonus_reactivate','bonus_id','hidden','Bono',true,null,10),
('bonus_reactivate','reason','textarea','Motivo',true,null,20),
('bonus_refund','movement_id','select','Movimiento original',true,null,10),
('bonus_refund','minutes','number','Minutos correctos',false,null,20),
('bonus_refund','reason','textarea','Motivo',true,null,30),
('bonus_expiry_confirm','bonus_id','hidden','Bono',true,null,10),
('bonus_expiry_confirm','decision','select','Decisión',true,null,20),
('bonus_expiry_confirm','new_expiry_date','date','Nueva fecha',false,'credit_grants.expires_at',30),
('bonus_alert_settings','name','text','Nombre',true,null,10),
('bonus_alert_settings','event_key','select','Evento',true,null,20),
('bonus_alert_settings','threshold_minutes','number','Umbral',false,null,30),
('bonus_alert_settings','recipients','multiselect','Destinatarios',true,null,40),
('bonus_alert_settings','channels','multiselect','Canales',true,null,50),
('renewal_request','bonus_context','hidden','Contexto del saldo',false,null,10),
('renewal_request','message','textarea','Mensaje de renovación',true,null,20)
)
insert into public.form_fields(form_version_id,field_key,field_type,label,required,canonical_path,sort_order)
select v.id,s.field_key,s.field_type,s.label,s.required,s.canonical_path,s.sort_order
from field_seed s join public.form_definitions f on f.form_key=s.form_key
join public.form_versions v on v.form_id=f.id and v.version_number=1
on conflict(form_version_id,field_key) do nothing;

create table if not exists public.notification_rules (
  event_key text primary key,
  label text not null,
  enabled boolean not null default true,
  channels text[] not null default array['internal']::text[],
  recipients jsonb not null default '["staff"]'::jsonb,
  anticipation_minutes integer not null default 0 check (anticipation_minutes between 0 and 525600),
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  template text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.notification_rules(event_key,label,channels,anticipation_minutes,template) values
('class.upcoming','Clase próxima',array['internal'],30,'Próxima clase: {{student}} · {{time}}'),
('class.pending_close','Clase pendiente de cierre',array['internal'],0,'Queda cerrar la clase de {{student}}.'),
('class.changed','Cambio o cancelación de clase',array['internal'],0,'La clase de {{student}} ha cambiado.'),
('credit.low','Saldo bajo',array['internal'],0,'A {{student}} le queda poco saldo.'),
('credit.exhausted','Bono agotado',array['internal'],0,'El bono de {{student}} se ha agotado.'),
('credit.expiring','Vencimiento de bono',array['internal'],20160,'El bono de {{student}} vence pronto.'),
('payment.pending','Pago pendiente',array['internal'],0,'Hay un pago pendiente de {{student}}.'),
('renewal.requested','Renovación',array['internal'],0,'{{student}} ha solicitado renovar.'),
('student.incomplete','Perfil incompleto',array['internal'],0,'Falta información de {{student}}.'),
('mission.attention','Misión',array['internal'],0,'Nueva misión: {{title}}'),
('feedback.published','Feedback',array['internal'],0,'Hay nuevo feedback disponible.'),
('communication.failed','Error de comunicación',array['internal'],0,'No se pudo entregar una comunicación.'),
('crm.action','Acción comercial',array['internal'],0,'Hay una acción comercial relevante.')
on conflict(event_key) do nothing;

drop trigger if exists notification_rules_touch_updated_at on public.notification_rules;
create trigger notification_rules_touch_updated_at before update on public.notification_rules
for each row execute function private.touch_updated_at();

create table if not exists public.internal_notifications (
  id bigint generated always as identity primary key,
  event_key text not null references public.notification_rules(event_key) on update cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  action_target text,
  source_type text,
  source_id text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(event_key,target_user_id,source_type,source_id)
);
create index if not exists internal_notifications_target_unread_idx on public.internal_notifications(target_user_id,read_at,created_at desc);

create table if not exists public.notification_deliveries (
  id bigint generated always as identity primary key,
  event_key text not null references public.notification_rules(event_key),
  channel text not null check (channel in ('internal','email','whatsapp','system')),
  recipient text,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  source_type text,
  source_id text,
  attempt_count integer not null default 0,
  last_error text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists notification_deliveries_queue_idx on public.notification_deliveries(status,queued_at);

create table if not exists public.integration_settings (
  integration_key text primary key,
  label text not null,
  status text not null default 'disconnected' check (status in ('disconnected','configured','connected','error','paused')),
  public_config jsonb not null default '{}'::jsonb,
  secret_reference text,
  last_checked_at timestamptz,
  last_error text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.integration_settings(integration_key,label,status,public_config) values
('google_calendar','Google Calendar','disconnected','{"sync":"two_way","idempotent":true}'),
('google_drive','Google Drive','configured','{"binary_storage":false,"metadata_only":true}'),
('whatsapp','WhatsApp','disconnected','{}'),
('email','Email','disconnected','{}')
on conflict(integration_key) do nothing;
drop trigger if exists integration_settings_touch_updated_at on public.integration_settings;
create trigger integration_settings_touch_updated_at before update on public.integration_settings
for each row execute function private.touch_updated_at();

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  entity_type text,
  entity_id text,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_created_idx on public.audit_events(created_at desc,event_type);

create table if not exists public.data_transfer_jobs (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('import','export')),
  domain text not null,
  file_name text,
  format text not null check (format in ('json','csv','xlsx','bundle')),
  duplicate_strategy text check (duplicate_strategy is null or duplicate_strategy in ('fill_empty','update','skip')),
  status text not null default 'preview' check (status in ('uploaded','preview','validated','running','completed','failed','cancelled')),
  payload jsonb,
  preview jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists data_transfer_jobs_created_idx on public.data_transfer_jobs(created_at desc,direction,status);

alter table public.calendar_connections enable row level security;
alter table public.calendar_events enable row level security;
alter table public.form_definitions enable row level security;
alter table public.form_versions enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_submissions enable row level security;
alter table public.notification_rules enable row level security;
alter table public.internal_notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.integration_settings enable row level security;
alter table public.audit_events enable row level security;
alter table public.data_transfer_jobs enable row level security;

drop policy if exists calendar_connections_select on public.calendar_connections;
create policy calendar_connections_select on public.calendar_connections for select to authenticated
using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists calendar_connections_own_all on public.calendar_connections;
create policy calendar_connections_own_all on public.calendar_connections for all to authenticated
using(user_id=(select auth.uid()) or (select private.is_admin()))
with check(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists calendar_events_staff_all on public.calendar_events;
create policy calendar_events_staff_all on public.calendar_events for all to authenticated
using((select private.is_staff())) with check((select private.is_staff()));

drop policy if exists forms_staff_select on public.form_definitions;
create policy forms_staff_select on public.form_definitions for select to authenticated using((select private.is_staff()));
drop policy if exists forms_admin_all on public.form_definitions;
create policy forms_admin_all on public.form_definitions for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
drop policy if exists form_versions_staff_select on public.form_versions;
create policy form_versions_staff_select on public.form_versions for select to authenticated using((select private.is_staff()));
drop policy if exists form_versions_admin_all on public.form_versions;
create policy form_versions_admin_all on public.form_versions for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
drop policy if exists form_fields_staff_select on public.form_fields;
create policy form_fields_staff_select on public.form_fields for select to authenticated using((select private.is_staff()));
drop policy if exists form_fields_admin_all on public.form_fields;
create policy form_fields_admin_all on public.form_fields for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
drop policy if exists form_submissions_select on public.form_submissions;
create policy form_submissions_select on public.form_submissions for select to authenticated
using((select private.is_staff()) or person_id=(select private.current_person_id()));
drop policy if exists form_submissions_insert on public.form_submissions;
create policy form_submissions_insert on public.form_submissions for insert to authenticated
with check((select private.is_staff()) or (person_id=(select private.current_person_id()) and submitted_by=(select auth.uid())));

drop policy if exists notification_rules_staff_select on public.notification_rules;
create policy notification_rules_staff_select on public.notification_rules for select to authenticated using((select private.is_staff()));
drop policy if exists notification_rules_admin_all on public.notification_rules;
create policy notification_rules_admin_all on public.notification_rules for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
drop policy if exists internal_notifications_own_select on public.internal_notifications;
create policy internal_notifications_own_select on public.internal_notifications for select to authenticated
using(target_user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists internal_notifications_own_update on public.internal_notifications;
create policy internal_notifications_own_update on public.internal_notifications for update to authenticated
using(target_user_id=(select auth.uid())) with check(target_user_id=(select auth.uid()));
drop policy if exists notification_deliveries_admin_select on public.notification_deliveries;
create policy notification_deliveries_admin_select on public.notification_deliveries for select to authenticated using((select private.is_admin()));
drop policy if exists notification_deliveries_staff_insert on public.notification_deliveries;
create policy notification_deliveries_staff_insert on public.notification_deliveries for insert to authenticated
with check((select private.is_staff()) and (created_by is null or created_by=(select auth.uid())));
drop policy if exists integration_settings_staff_select on public.integration_settings;
create policy integration_settings_staff_select on public.integration_settings for select to authenticated using((select private.is_staff()));
drop policy if exists integration_settings_admin_all on public.integration_settings;
create policy integration_settings_admin_all on public.integration_settings for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
drop policy if exists audit_events_admin_select on public.audit_events;
create policy audit_events_admin_select on public.audit_events for select to authenticated using((select private.is_admin()));
drop policy if exists audit_events_staff_insert on public.audit_events;
create policy audit_events_staff_insert on public.audit_events for insert to authenticated
with check((select private.is_staff()) and actor_user_id=(select auth.uid()));
drop policy if exists data_transfer_jobs_owner_select on public.data_transfer_jobs;
create policy data_transfer_jobs_owner_select on public.data_transfer_jobs for select to authenticated
using(created_by=(select auth.uid()) or (select private.is_admin()));
drop policy if exists data_transfer_jobs_staff_insert on public.data_transfer_jobs;
create policy data_transfer_jobs_staff_insert on public.data_transfer_jobs for insert to authenticated
with check((select private.is_staff()) and created_by=(select auth.uid()));
drop policy if exists data_transfer_jobs_owner_update on public.data_transfer_jobs;
create policy data_transfer_jobs_owner_update on public.data_transfer_jobs for update to authenticated
using(created_by=(select auth.uid()) or (select private.is_admin()))
with check(created_by=(select auth.uid()) or (select private.is_admin()));

revoke all on public.calendar_connections,public.calendar_events,public.form_definitions,public.form_versions,
  public.form_fields,public.form_submissions,public.notification_rules,public.internal_notifications,
  public.notification_deliveries,public.integration_settings,public.audit_events,public.data_transfer_jobs
  from anon,authenticated;
grant select,insert,update on public.calendar_connections,public.calendar_events,public.form_definitions,
  public.form_versions,public.form_fields,public.form_submissions,public.notification_rules,
  public.internal_notifications,public.notification_deliveries,public.integration_settings,
  public.audit_events,public.data_transfer_jobs to authenticated;
grant usage on sequence public.calendar_connections_id_seq,public.calendar_events_id_seq,
  public.form_definitions_id_seq,public.form_versions_id_seq,public.form_fields_id_seq,
  public.form_submissions_id_seq,public.internal_notifications_id_seq,
  public.notification_deliveries_id_seq,public.audit_events_id_seq,public.data_transfer_jobs_id_seq
  to authenticated;

create or replace function private.notify_mission_created()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce((select enabled from public.notification_rules where event_key='mission.attention'),false) then
    insert into public.internal_notifications(event_key,target_user_id,title,body,action_target,source_type,source_id)
    select 'mission.attention',r.user_id,new.title,new.description,new.action_target,'mission',new.id::text
    from public.app_member_roles r
    where r.active and r.role in ('admin','teacher_admin','teacher')
    on conflict(event_key,target_user_id,source_type,source_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.notify_mission_created() from public,anon,authenticated;
drop trigger if exists missions_notify_created on public.missions;
create trigger missions_notify_created after insert on public.missions
for each row execute function private.notify_mission_created();

create or replace function private.resolve_class_participant_context()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_style_id bigint;
begin
  if new.role_term_id is not null and new.level_term_id is not null then return new; end if;
  select style_term_id into v_style_id from public.classes where id=new.class_id;
  if v_style_id is null then return new; end if;
  select coalesce(new.role_term_id,sdp.role_term_id),coalesce(new.level_term_id,sdp.level_term_id)
  into new.role_term_id,new.level_term_id
  from public.student_dance_profiles sdp
  where sdp.person_id=new.person_id and sdp.style_term_id=v_style_id and sdp.active
  order by sdp.is_primary desc,sdp.updated_at desc limit 1;
  return new;
end;
$$;
revoke all on function private.resolve_class_participant_context() from public,anon,authenticated;
drop trigger if exists class_participants_resolve_context on public.class_participants;
create trigger class_participants_resolve_context before insert on public.class_participants
for each row execute function private.resolve_class_participant_context();

with resolved as (
  select cp.class_id,cp.person_id,d.role_term_id,d.level_term_id
  from public.class_participants cp
  join public.classes c on c.id=cp.class_id
  join lateral (
    select profile.role_term_id,profile.level_term_id
    from public.student_dance_profiles profile
    where profile.person_id=cp.person_id and profile.style_term_id=c.style_term_id and profile.active
    order by profile.is_primary desc,profile.updated_at desc
    limit 1
  ) d on true
  where cp.role_term_id is null or cp.level_term_id is null
)
update public.class_participants cp set
  role_term_id=coalesce(cp.role_term_id,resolved.role_term_id),
  level_term_id=coalesce(cp.level_term_id,resolved.level_term_id)
from resolved
where cp.class_id=resolved.class_id and cp.person_id=resolved.person_id;

create or replace function public.set_class_participant_context(
  p_class_id bigint,p_person_id bigint,p_role_term_id bigint,p_level_term_id bigint
) returns public.class_participants language plpgsql security invoker set search_path='' as $$
declare v_participant public.class_participants;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para editar el contexto de clase.' using errcode='42501'; end if;
  if not exists(select 1 from public.classes c where c.id=p_class_id and c.status in ('active','finished') and c.pedagogy_closed_at is null) then
    raise exception 'La clase no está abierta para trabajo pedagógico.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'Rol no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Nivel no válido.' using errcode='22023'; end if;
  update public.class_participants set role_term_id=p_role_term_id,level_term_id=p_level_term_id
  where class_id=p_class_id and person_id=p_person_id returning * into v_participant;
  if not found then raise exception 'El alumno no pertenece a esta clase.' using errcode='22023'; end if;
  return v_participant;
end;
$$;

create or replace function public.save_student_dance_preference(
  p_person_id bigint,p_style_term_id bigint,p_role_term_id bigint,p_level_term_id bigint,p_is_primary boolean default true
) returns public.student_dance_profiles language plpgsql security invoker set search_path='' as $$
declare v_profile public.student_dance_profiles;
begin
  if not (select private.is_staff()) and p_person_id<>(select private.current_person_id()) then raise exception 'No tienes permiso para cambiar este perfil.' using errcode='42501'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'Estilo no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'Rol no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Nivel no válido.' using errcode='22023'; end if;
  if p_is_primary then update public.student_dance_profiles set is_primary=false where person_id=p_person_id and style_term_id=p_style_term_id; end if;
  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,is_primary,active)
  values(p_person_id,p_style_term_id,p_role_term_id,p_level_term_id,p_is_primary,true)
  on conflict(person_id,style_term_id,role_term_id) do update set level_term_id=excluded.level_term_id,is_primary=excluded.is_primary,active=true
  returning * into v_profile;
  return v_profile;
end;
$$;

create or replace function public.create_class_content(
  p_class_id bigint,p_person_id bigint,p_content_type text,p_title text
) returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare v_style_id bigint; v_role_id bigint; v_level_id bigint; v_category_id bigint;
  v_content public.teaching_contents; v_assignment public.student_content_assignments; v_status text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para crear contenido.' using errcode='42501'; end if;
  if p_content_type not in ('correction','explanation','exercise','sequence') then raise exception 'Tipo de contenido no válido.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_title,'')))=0 then raise exception 'Escribe un título breve.' using errcode='22023'; end if;
  select c.style_term_id,cp.role_term_id,cp.level_term_id into v_style_id,v_role_id,v_level_id
  from public.classes c join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=p_person_id and c.status in ('active','finished') and c.pedagogy_closed_at is null;
  if not found or v_style_id is null or v_role_id is null or v_level_id is null then raise exception 'Falta el contexto de estilo, rol o nivel.' using errcode='22023'; end if;
  select id into v_category_id from public.catalog_terms
  where taxonomy=case when p_content_type='correction' then 'correction_category' else p_content_type||'_category' end and active
  order by sort_order,id limit 1;
  insert into public.teaching_contents(content_type,title,completion_status,publication_status,visibility,measurement_mode,category_term_id,created_by)
  values(p_content_type,btrim(p_title),'incomplete','draft','staff',case when p_content_type='correction' then 'both' else 'none' end,v_category_id,(select auth.uid()))
  returning * into v_content;
  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style_id);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role_id);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level_id);
  v_status:=case when p_content_type='correction' then 'in_correction' else 'pending' end;
  insert into public.student_content_assignments(person_id,content_id,assignment_status,snapshot_style_term_id,
    snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,source_class_id,assigned_by)
  values(p_person_id,v_content.id,v_status,v_style_id,v_role_id,v_level_id,v_content.measurement_mode,p_class_id,(select auth.uid()))
  returning * into v_assignment;
  insert into public.student_content_measurements(assignment_id,class_id,assignment_status,measured_by)
  values(v_assignment.id,p_class_id,v_status,(select auth.uid()));
  return v_assignment;
end;
$$;

create or replace function private.student_portal_snapshot_for(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb; v_current bigint;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff()) and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para ver esta experiencia de alumno.' using errcode='42501';
  end if;
  if not exists(select 1 from public.student_profiles where person_id=p_person_id and active) then raise exception 'La ficha de alumno no está activa.' using errcode='P0002'; end if;
  select jsonb_build_object(
    'profile',(select jsonb_build_object('id',p.id,'display_name',p.display_name,'first_name',p.first_name,'last_name',p.last_name,
      'email',p.email,'phone',p.phone,'country_code',p.country_code,'student_since',sp.student_since,'goals',sp.goals)
      from public.people p join public.student_profiles sp on sp.person_id=p.id where p.id=p_person_id),
    'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'class_type',c.class_type,'status',c.status,
      'scheduled_start_at',c.scheduled_start_at,'duration_minutes',c.duration_minutes,'style',style.label,
      'attendance_status',cp.attendance_status,'role',role_term.label,'level',level_term.label) order by c.scheduled_start_at desc)
      from public.class_participants cp join public.classes c on c.id=cp.class_id
      left join public.catalog_terms style on style.id=c.style_term_id left join public.catalog_terms role_term on role_term.id=cp.role_term_id
      left join public.catalog_terms level_term on level_term.id=cp.level_term_id where cp.person_id=p_person_id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'modality',g.modality,
      'total_minutes',g.total_minutes,'balance_minutes',coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0),
      'status',g.status,'purchased_at',g.purchased_at,'expires_at',g.expires_at) order by g.purchased_at desc)
      from public.credit_grant_members gm join public.credit_grants g on g.id=gm.grant_id where gm.person_id=p_person_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'content_id',a.content_id,'title',tc.title,
      'content_type',tc.content_type,'description',tc.description,'correction_guidance',tc.correction_guidance,
      'assignment_status',a.assignment_status,'current_frequency',a.current_frequency,'current_importance',a.current_importance,
      'updated_at',a.updated_at,'media',coalesce((select jsonb_agg(jsonb_build_object('media_type',media.media_type,
        'provider',media.provider,'external_file_id',media.external_file_id,'title',media.title) order by media.sort_order,media.id)
        from public.teaching_content_media media where media.content_id=tc.id),'[]'::jsonb)) order by a.updated_at desc)
      from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
      where a.person_id=p_person_id and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'),'[]'::jsonb),
    'evaluations',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'class_id',e.class_id,'score',e.score,
      'aptitude',apt.label,'created_at',e.created_at) order by e.created_at desc)
      from public.student_evaluations e join public.catalog_terms apt on apt.id=e.aptitude_term_id where e.person_id=p_person_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function private.student_portal_snapshot_for(bigint) from public,anon,authenticated;
grant execute on function private.student_portal_snapshot_for(bigint) to authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
begin
  if v_person is null then raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023'; end if;
  return private.student_portal_snapshot_for(v_person);
end;
$$;

create or replace function public.student_portal_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
  select public.student_portal_snapshot_for(null);
$$;

create or replace function public.calendar_snapshot(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para consultar la agenda de equipo.' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '370 days' then raise exception 'Rango de agenda no válido.' using errcode='22023'; end if;
  return jsonb_build_object(
    'classes',coalesce((
      select jsonb_agg(class_item order by starts_at)
      from (
        select c.scheduled_start_at starts_at,jsonb_build_object(
          'id',c.id,'type','class','title',array_to_string(array_agg(p.display_name order by p.display_name),' y '),
          'starts_at',c.scheduled_start_at,'ends_at',c.scheduled_start_at+make_interval(mins=>c.duration_minutes),'status',c.status
        ) class_item
        from public.classes c
        join public.class_participants cp on cp.class_id=c.id
        join public.people p on p.id=cp.person_id
        where c.status<>'cancelled' and c.scheduled_start_at<p_to
          and c.scheduled_start_at+make_interval(mins=>c.duration_minutes)>p_from
        group by c.id,c.scheduled_start_at,c.duration_minutes,c.status
      ) class_rows
    ),'[]'::jsonb),
    'missions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'type','mission','title',m.title,'starts_at',m.calendar_starts_at,
      'ends_at',m.calendar_ends_at,'status',m.state) order by m.calendar_starts_at)
      from public.missions m where m.calendar_starts_at is not null and m.calendar_ends_at>p_from and m.calendar_starts_at<p_to
      and m.state not in ('cancelled','completed','completed_automatically','not_applicable')),'[]'::jsonb),
    'marketing_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type','event','title',e.title,'starts_at',e.starts_at,
      'ends_at',coalesce(e.ends_at,e.starts_at+interval '1 hour'),'status',e.status) order by e.starts_at)
      from public.marketing_events e where e.status<>'cancelled' and e.starts_at<p_to and coalesce(e.ends_at,e.starts_at+interval '1 hour')>p_from),'[]'::jsonb),
    'external_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type','external','title',e.title,'starts_at',e.starts_at,
      'ends_at',e.ends_at,'status',e.sync_status) order by e.starts_at)
      from public.calendar_events e where e.source_type='external' and e.starts_at<p_to and e.ends_at>p_from and e.sync_status<>'ignored'),'[]'::jsonb)
  );
end;
$$;

create or replace function public.reserve_mission_calendar(p_mission_id bigint,p_starts_at timestamptz,p_ends_at timestamptz)
returns public.missions language plpgsql security invoker set search_path='' as $$
declare v_mission public.missions; v_conflicts jsonb;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para reservar agenda.' using errcode='42501'; end if;
  if p_starts_at is null or p_ends_at<=p_starts_at then raise exception 'Bloque de calendario no válido.' using errcode='22023'; end if;
  select * into v_mission from public.missions where id=p_mission_id for update;
  if not found or v_mission.state in ('completed','completed_automatically','cancelled','not_applicable') then raise exception 'La misión no admite una reserva.' using errcode='22023'; end if;
  select jsonb_agg(conflict) into v_conflicts from (
    select jsonb_build_object('type','class','id',c.id,'title',array_to_string(array_agg(p.display_name),' y ')) conflict
      from public.classes c join public.class_participants cp on cp.class_id=c.id join public.people p on p.id=cp.person_id
      where c.status<>'cancelled' and c.scheduled_start_at<p_ends_at and c.scheduled_start_at+make_interval(mins=>c.duration_minutes)>p_starts_at group by c.id
    union all
    select jsonb_build_object('type','mission','id',m.id,'title',m.title) from public.missions m
      where m.id<>p_mission_id and m.calendar_starts_at<p_ends_at and m.calendar_ends_at>p_starts_at
      and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
    union all
    select jsonb_build_object('type','external','id',e.id,'title',e.title) from public.calendar_events e
      where e.source_type='external' and e.starts_at<p_ends_at and e.ends_at>p_starts_at and e.sync_status<>'ignored'
  ) conflicts;
  if v_conflicts is not null then raise exception 'Ese bloque coincide con otro elemento de agenda: %',v_conflicts::text using errcode='23P01'; end if;
  update public.missions set calendar_block=true,calendar_starts_at=p_starts_at,calendar_ends_at=p_ends_at
  where id=p_mission_id returning * into v_mission;
  return v_mission;
end;
$$;

create or replace function public.export_data_bundle(p_domain text default 'all')
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para exportar datos.' using errcode='42501'; end if;
  if p_domain not in ('all','people','classes','credits','teaching','forms','missions','marketing','settings') then raise exception 'Dominio de exportación no válido.' using errcode='22023'; end if;
  v_result:=jsonb_build_object('format','cya-hub-bundle','version',1,'exported_at',now(),'domain',p_domain);
  if p_domain in ('all','people') then v_result:=v_result||jsonb_build_object('people',coalesce((select jsonb_agg(to_jsonb(p)-'created_by') from public.people p),'[]'::jsonb),'student_profiles',coalesce((select jsonb_agg(to_jsonb(s)-'created_by') from public.student_profiles s),'[]'::jsonb),'student_dance_profiles',coalesce((select jsonb_agg(to_jsonb(d)) from public.student_dance_profiles d),'[]'::jsonb)); end if;
  if p_domain in ('all','classes') then v_result:=v_result||jsonb_build_object('classes',coalesce((select jsonb_agg(to_jsonb(c)-'created_by') from public.classes c),'[]'::jsonb),'class_participants',coalesce((select jsonb_agg(to_jsonb(cp)) from public.class_participants cp),'[]'::jsonb),'class_notes',coalesce((select jsonb_agg(to_jsonb(n)-'created_by') from public.class_notes n),'[]'::jsonb)); end if;
  if p_domain in ('all','credits') then v_result:=v_result||jsonb_build_object('credit_grants',coalesce((select jsonb_agg(to_jsonb(g)-'created_by') from public.credit_grants g),'[]'::jsonb),'credit_grant_members',coalesce((select jsonb_agg(to_jsonb(gm)) from public.credit_grant_members gm),'[]'::jsonb),'credit_movements',coalesce((select jsonb_agg(to_jsonb(cm)-'created_by') from public.credit_movements cm),'[]'::jsonb)); end if;
  if p_domain in ('all','teaching') then v_result:=v_result||jsonb_build_object('catalog_terms',coalesce((select jsonb_agg(to_jsonb(t)) from public.catalog_terms t),'[]'::jsonb),'teaching_contents',coalesce((select jsonb_agg(to_jsonb(t)-'created_by') from public.teaching_contents t),'[]'::jsonb),'teaching_relations',coalesce((select jsonb_agg(to_jsonb(r)-'created_by') from public.teaching_content_relations r),'[]'::jsonb),'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'assigned_by') from public.student_content_assignments a),'[]'::jsonb),'evaluations',coalesce((select jsonb_agg(to_jsonb(e)-'evaluated_by') from public.student_evaluations e),'[]'::jsonb)); end if;
  if p_domain in ('all','forms') then v_result:=v_result||jsonb_build_object('forms',coalesce((select jsonb_agg(to_jsonb(f)-'created_by'-'updated_by') from public.form_definitions f),'[]'::jsonb),'form_versions',coalesce((select jsonb_agg(to_jsonb(v)-'created_by') from public.form_versions v),'[]'::jsonb),'form_fields',coalesce((select jsonb_agg(to_jsonb(ff)) from public.form_fields ff),'[]'::jsonb)); end if;
  if p_domain in ('all','missions') then v_result:=v_result||jsonb_build_object('mission_rules',coalesce((select jsonb_agg(to_jsonb(r)-'updated_by') from public.mission_rules r),'[]'::jsonb),'missions',coalesce((select jsonb_agg(to_jsonb(m)-'created_by'-'completed_by') from public.missions m),'[]'::jsonb)); end if;
  if p_domain in ('all','marketing') then v_result:=v_result||jsonb_build_object('crm_profiles',coalesce((select jsonb_agg(to_jsonb(c)-'created_by') from public.crm_profiles c),'[]'::jsonb),'rates',coalesce((select jsonb_agg(to_jsonb(r)-'created_by') from public.marketing_rates r),'[]'::jsonb),'content',coalesce((select jsonb_agg(to_jsonb(c)-'created_by') from public.marketing_content c),'[]'::jsonb),'campaigns',coalesce((select jsonb_agg(to_jsonb(c)-'created_by') from public.marketing_campaigns c),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(e)-'created_by') from public.marketing_events e),'[]'::jsonb)); end if;
  if p_domain in ('all','settings') then v_result:=v_result||jsonb_build_object('mission_engine',(select to_jsonb(s)-'updated_by' from public.mission_engine_settings s where singleton),'notification_rules',coalesce((select jsonb_agg(to_jsonb(n)-'updated_by') from public.notification_rules n),'[]'::jsonb),'integrations',coalesce((select jsonb_agg(to_jsonb(i)-'secret_reference'-'updated_by') from public.integration_settings i),'[]'::jsonb)); end if;
  return v_result;
end;
$$;

create or replace function public.preview_data_import(p_domain text,p_payload jsonb,p_strategy text,p_file_name text default null)
returns public.data_transfer_jobs language plpgsql security invoker set search_path='' as $$
declare v_job public.data_transfer_jobs; v_items jsonb; v_total integer; v_duplicates integer:=0;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para importar datos.' using errcode='42501'; end if;
  if p_domain not in ('people','teaching','daily_quotes','mission_rules','marketing_rates') then raise exception 'Este tipo requiere un paquete CYA compatible.' using errcode='22023'; end if;
  if p_strategy not in ('fill_empty','update','skip') then raise exception 'Estrategia de duplicados no válida.' using errcode='22023'; end if;
  if jsonb_typeof(p_payload)<>'array' then raise exception 'El archivo debe contener una lista JSON.' using errcode='22023'; end if;
  v_items:=p_payload; v_total:=jsonb_array_length(v_items);
  if v_total>5000 then raise exception 'El archivo supera el máximo de 5.000 registros.' using errcode='22023'; end if;
  if p_domain='people' then select count(*) into v_duplicates from jsonb_array_elements(v_items) x where exists(select 1 from public.people p where (x->>'email' is not null and lower(p.email)=lower(x->>'email')) or (x->>'phone' is not null and p.phone=x->>'phone'));
  elsif p_domain='teaching' then select count(*) into v_duplicates from jsonb_array_elements(v_items) x where exists(select 1 from public.teaching_contents t where t.content_type=x->>'content_type' and lower(t.title)=lower(x->>'title'));
  elsif p_domain='daily_quotes' then select count(*) into v_duplicates from jsonb_array_elements(v_items) x where exists(select 1 from public.daily_quotes q where q.override_date=case when x->>'override_date' is null then null else (x->>'override_date')::date end or q.month_day=x->>'month_day' or lower(q.quote_text)=lower(x->>'quote_text'));
  elsif p_domain='mission_rules' then select count(*) into v_duplicates from jsonb_array_elements(v_items) x where exists(select 1 from public.mission_rules r where r.rule_key=x->>'rule_key');
  elsif p_domain='marketing_rates' then select count(*) into v_duplicates from jsonb_array_elements(v_items) x where exists(select 1 from public.marketing_rates r where lower(r.name)=lower(x->>'name') and r.rate_type=x->>'rate_type');
  end if;
  insert into public.data_transfer_jobs(direction,domain,file_name,format,duplicate_strategy,status,payload,preview,created_by)
  values('import',p_domain,p_file_name,'json',p_strategy,'validated',v_items,jsonb_build_object('total',v_total,'duplicates',v_duplicates,'new',v_total-v_duplicates,'strategy',p_strategy),(select auth.uid()))
  returning * into v_job;
  return v_job;
end;
$$;

create or replace function public.apply_data_import(p_job_id bigint)
returns public.data_transfer_jobs language plpgsql security invoker set search_path='' as $$
declare v_job public.data_transfer_jobs; v_item jsonb; v_processed integer:=0; v_skipped integer:=0; v_existing bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para importar datos.' using errcode='42501'; end if;
  select * into v_job from public.data_transfer_jobs where id=p_job_id and direction='import' and status='validated' for update;
  if not found then raise exception 'La previsualización ya no está disponible.' using errcode='P0002'; end if;
  update public.data_transfer_jobs set status='running' where id=v_job.id;
  for v_item in select value from jsonb_array_elements(v_job.payload)
  loop
    if v_job.domain='people' then
      select id into v_existing from public.people where
        (nullif(v_item->>'email','') is not null and lower(email)=lower(v_item->>'email'))
        or (nullif(v_item->>'phone','') is not null and phone=v_item->>'phone') limit 1;
      if v_existing is null then
        insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,active,created_by)
        values(coalesce(nullif(btrim(v_item->>'display_name'),''),concat_ws(' ',v_item->>'first_name',v_item->>'last_name')),
          nullif(btrim(v_item->>'first_name'),''),nullif(btrim(v_item->>'last_name'),''),nullif(lower(btrim(v_item->>'email')),''),
          nullif(btrim(v_item->>'phone'),''),nullif(upper(btrim(v_item->>'country_code')),''),coalesce(nullif(v_item->>'crm_stage',''),'new'),
          nullif(v_item->>'source',''),nullif(v_item->>'notes',''),true,(select auth.uid())) returning id into v_existing;
        if coalesce((v_item->>'is_student')::boolean,false) then insert into public.student_profiles(person_id,active,created_by) values(v_existing,true,(select auth.uid())) on conflict(person_id) do update set active=true; end if;
        v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then v_skipped:=v_skipped+1;
      else
        update public.people set
          display_name=case when v_job.duplicate_strategy='update' then coalesce(nullif(btrim(v_item->>'display_name'),''),display_name) else display_name end,
          first_name=case when v_job.duplicate_strategy='update' or first_name is null then coalesce(nullif(btrim(v_item->>'first_name'),''),first_name) else first_name end,
          last_name=case when v_job.duplicate_strategy='update' or last_name is null then coalesce(nullif(btrim(v_item->>'last_name'),''),last_name) else last_name end,
          email=case when v_job.duplicate_strategy='update' or email is null then coalesce(nullif(lower(btrim(v_item->>'email')),''),email) else email end,
          phone=case when v_job.duplicate_strategy='update' or phone is null then coalesce(nullif(btrim(v_item->>'phone'),''),phone) else phone end,
          country_code=case when v_job.duplicate_strategy='update' or country_code is null then coalesce(nullif(upper(btrim(v_item->>'country_code')),''),country_code) else country_code end
        where id=v_existing;
        v_processed:=v_processed+1;
      end if;
    elsif v_job.domain='teaching' then
      select id into v_existing from public.teaching_contents where content_type=v_item->>'content_type' and lower(title)=lower(v_item->>'title') limit 1;
      if v_existing is null then
        insert into public.teaching_contents(content_type,title,description,correction_guidance,completion_status,publication_status,visibility,measurement_mode,created_by)
        values(v_item->>'content_type',btrim(v_item->>'title'),nullif(v_item->>'description',''),nullif(v_item->>'correction_guidance',''),
          coalesce(nullif(v_item->>'completion_status',''),'incomplete'),coalesce(nullif(v_item->>'publication_status',''),'draft'),
          coalesce(nullif(v_item->>'visibility',''),'staff'),coalesce(nullif(v_item->>'measurement_mode',''),'none'),(select auth.uid())); v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then v_skipped:=v_skipped+1;
      else update public.teaching_contents set
        description=case when v_job.duplicate_strategy='update' or description is null then coalesce(nullif(v_item->>'description',''),description) else description end,
        correction_guidance=case when v_job.duplicate_strategy='update' or correction_guidance is null then coalesce(nullif(v_item->>'correction_guidance',''),correction_guidance) else correction_guidance end
        where id=v_existing; v_processed:=v_processed+1;
      end if;
    elsif v_job.domain='daily_quotes' then
      insert into public.daily_quotes(quote_text,month_day,override_date,active,source,created_by)
      values(btrim(v_item->>'quote_text'),nullif(v_item->>'month_day',''),case when nullif(v_item->>'override_date','') is null then null else (v_item->>'override_date')::date end,
        coalesce((v_item->>'active')::boolean,true),'csv',(select auth.uid())) on conflict do nothing; v_processed:=v_processed+1;
    elsif v_job.domain='mission_rules' then
      if exists(select 1 from public.mission_rules where rule_key=v_item->>'rule_key') and v_job.duplicate_strategy='skip' then v_skipped:=v_skipped+1;
      else update public.mission_rules set enabled=coalesce((v_item->>'enabled')::boolean,enabled),priority=coalesce(nullif(v_item->>'priority',''),priority),
        estimated_duration_minutes=coalesce((v_item->>'estimated_duration_minutes')::integer,estimated_duration_minutes),criteria=coalesce(v_item->'criteria',criteria),updated_by=(select auth.uid())
        where rule_key=v_item->>'rule_key'; v_processed:=v_processed+1; end if;
    elsif v_job.domain='marketing_rates' then
      select id into v_existing from public.marketing_rates where lower(name)=lower(v_item->>'name') and rate_type=v_item->>'rate_type' limit 1;
      if v_existing is null then insert into public.marketing_rates(name,rate_type,duration_minutes,price_cents,currency,description,active,created_by)
        values(btrim(v_item->>'name'),v_item->>'rate_type',(v_item->>'duration_minutes')::integer,(v_item->>'price_cents')::integer,
          coalesce(nullif(v_item->>'currency',''),'EUR'),nullif(v_item->>'description',''),coalesce((v_item->>'active')::boolean,true),(select auth.uid())); v_processed:=v_processed+1;
      elsif v_job.duplicate_strategy='skip' then v_skipped:=v_skipped+1;
      else update public.marketing_rates set duration_minutes=coalesce((v_item->>'duration_minutes')::integer,duration_minutes),price_cents=coalesce((v_item->>'price_cents')::integer,price_cents),
        description=case when v_job.duplicate_strategy='update' or description is null then coalesce(nullif(v_item->>'description',''),description) else description end where id=v_existing; v_processed:=v_processed+1; end if;
    end if;
    v_existing:=null;
  end loop;
  update public.data_transfer_jobs set status='completed',result=jsonb_build_object('processed',v_processed,'skipped',v_skipped),payload=null,completed_at=now()
  where id=v_job.id returning * into v_job;
  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('data_import_completed','data_transfer_job',v_job.id::text,'Importación completada',v_job.result,(select auth.uid()));
  return v_job;
exception when others then
  update public.data_transfer_jobs set status='failed',error_message=sqlerrm,payload=null,completed_at=now()
  where id=p_job_id returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.set_class_participant_context(bigint,bigint,bigint,bigint) from public,anon;
revoke all on function public.save_student_dance_preference(bigint,bigint,bigint,bigint,boolean) from public,anon;
revoke all on function public.create_class_content(bigint,bigint,text,text) from public,anon;
revoke all on function public.student_portal_snapshot_for(bigint) from public,anon;
revoke all on function public.student_portal_snapshot() from public,anon;
revoke all on function public.calendar_snapshot(timestamptz,timestamptz) from public,anon;
revoke all on function public.reserve_mission_calendar(bigint,timestamptz,timestamptz) from public,anon;
revoke all on function public.export_data_bundle(text) from public,anon;
revoke all on function public.preview_data_import(text,jsonb,text,text) from public,anon;
revoke all on function public.apply_data_import(bigint) from public,anon;
grant execute on function public.set_class_participant_context(bigint,bigint,bigint,bigint) to authenticated;
grant execute on function public.save_student_dance_preference(bigint,bigint,bigint,bigint,boolean) to authenticated;
grant execute on function public.create_class_content(bigint,bigint,text,text) to authenticated;
grant execute on function public.student_portal_snapshot_for(bigint) to authenticated;
grant execute on function public.student_portal_snapshot() to authenticated;
grant execute on function public.calendar_snapshot(timestamptz,timestamptz) to authenticated;
grant execute on function public.reserve_mission_calendar(bigint,timestamptz,timestamptz) to authenticated;
grant execute on function public.export_data_bundle(text) to authenticated;
grant execute on function public.preview_data_import(text,jsonb,text,text) to authenticated;
grant execute on function public.apply_data_import(bigint) to authenticated;

commit;
