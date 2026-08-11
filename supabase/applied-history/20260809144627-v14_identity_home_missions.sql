begin;

-- CYA Hub v14 · multirol, preferencias, frases diarias y motor real de misiones.
-- Toda la ampliación es aditiva y conserva app_members.role como compatibilidad.

create table if not exists public.app_member_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','teacher_admin','teacher','student')),
  active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,role)
);

insert into public.app_member_roles(user_id,role,active)
select user_id,role,active from public.app_members
on conflict(user_id,role) do update set active=excluded.active;

create index if not exists app_member_roles_active_idx
  on public.app_member_roles(user_id,active,role);

drop trigger if exists app_member_roles_touch_updated_at on public.app_member_roles;
create trigger app_member_roles_touch_updated_at before update on public.app_member_roles
for each row execute function private.touch_updated_at();

create or replace function private.has_app_role(p_role text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.app_member_roles r
    where r.user_id=(select auth.uid()) and r.active and r.role=p_role
  ) or exists(
    select 1 from public.app_members m
    where m.user_id=(select auth.uid()) and m.active and m.role=p_role
  );
$$;

create or replace function private.current_app_role()
returns text language sql stable security definer set search_path='' as $$
  select role from (
    select r.role,
      case r.role when 'admin' then 1 when 'teacher_admin' then 2 when 'teacher' then 3 else 4 end priority
    from public.app_member_roles r
    where r.user_id=(select auth.uid()) and r.active
    union all
    select m.role,
      case m.role when 'admin' then 1 when 'teacher_admin' then 2 when 'teacher' then 3 else 4 end
    from public.app_members m
    where m.user_id=(select auth.uid()) and m.active
  ) roles order by priority limit 1;
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path='' as $$
  select (select private.has_app_role('admin'))
      or (select private.has_app_role('teacher_admin'))
      or (select private.has_app_role('teacher'));
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
  select (select private.has_app_role('admin'))
      or (select private.has_app_role('teacher_admin'));
$$;

revoke all on function private.has_app_role(text) from public,anon;
revoke all on function private.current_app_role() from public,anon;
revoke all on function private.is_staff() from public,anon;
revoke all on function private.is_admin() from public,anon;
grant execute on function private.has_app_role(text) to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Madrid' check (length(btrim(timezone)) between 1 and 80),
  greeting_boundaries jsonb not null default '{"morning_start":"05:00","afternoon_start":"12:00","night_start":"20:00"}'::jsonb,
  preferred_context text check (preferred_context is null or preferred_context in ('teacher','student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.user_preferences(user_id)
select user_id from public.app_members on conflict(user_id) do nothing;

drop trigger if exists user_preferences_touch_updated_at on public.user_preferences;
create trigger user_preferences_touch_updated_at before update on public.user_preferences
for each row execute function private.touch_updated_at();

-- Vinculación autorizada de la identidad real de Carlos con su ficha de alumno
-- ya existente. Las claves se resuelven por identificadores naturales y la
-- migración se detiene si la coincidencia deja de ser inequívoca.
do $$
declare
  v_user_id uuid;
  v_person_id bigint;
  v_user_matches integer;
  v_person_matches integer;
begin
  select count(*) into v_user_matches
  from auth.users
  where lower(btrim(email))='carlosyandybz@gmail.com';
  select id into v_user_id
  from auth.users
  where lower(btrim(email))='carlosyandybz@gmail.com'
  limit 1;

  select count(*),min(p.id) into v_person_matches,v_person_id
  from public.people p
  join public.student_profiles sp on sp.person_id=p.id and sp.active
  where p.active
    and lower(btrim(coalesce(p.email,'')))='crodriguezpersonal06@gmail.com'
    and lower(btrim(p.display_name))='carlos rodriguez';

  if v_user_matches<>1 then
    raise exception 'No se encontró una única cuenta autorizada para la vinculación.' using errcode='P0002';
  end if;
  if v_person_matches<>1 then
    raise exception 'No se encontró una única ficha de alumno de Carlos para vincular.' using errcode='P0002';
  end if;
  if exists(select 1 from public.people where auth_user_id=v_user_id and id<>v_person_id) then
    raise exception 'La cuenta ya está vinculada a otra persona.' using errcode='23505';
  end if;
  if exists(select 1 from public.people where id=v_person_id and auth_user_id is not null and auth_user_id<>v_user_id) then
    raise exception 'La ficha de Carlos ya está vinculada a otra cuenta.' using errcode='23505';
  end if;

  update public.people set auth_user_id=v_user_id where id=v_person_id and auth_user_id is distinct from v_user_id;
  insert into public.app_member_roles(user_id,role,active,granted_by)
  values(v_user_id,'student',true,v_user_id)
  on conflict(user_id,role) do update set active=true,updated_at=now();
  insert into public.user_preferences(user_id)
  values(v_user_id)
  on conflict(user_id) do nothing;
end;
$$;

create table if not exists public.daily_quotes (
  id bigint generated always as identity primary key,
  quote_text text not null check (length(btrim(quote_text)) between 3 and 280),
  month_day text check (month_day is null or month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  override_date date,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('historical','manual','csv')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (month_day is not null or override_date is not null)
);

create unique index if not exists daily_quotes_month_day_base_uq
  on public.daily_quotes(month_day) where override_date is null;
create unique index if not exists daily_quotes_override_date_uq
  on public.daily_quotes(override_date) where override_date is not null;
create unique index if not exists daily_quotes_text_uq
  on public.daily_quotes(lower(btrim(quote_text)));

drop trigger if exists daily_quotes_touch_updated_at on public.daily_quotes;
create trigger daily_quotes_touch_updated_at before update on public.daily_quotes
for each row execute function private.touch_updated_at();

insert into public.daily_quotes(quote_text,month_day,source) values
('Cada comienzo merece una oportunidad sincera.','01-01','historical'),
('La constancia convierte las intenciones en resultados.','01-04','historical'),
('La dirección correcta vale más que la velocidad.','01-08','historical'),
('Cada práctica suma, incluso cuando no se nota todavía.','02-05','historical'),
('Mantén el ritmo, no la prisa.','02-08','historical'),
('La confianza se construye cumpliendo pequeñas promesas contigo.','03-08','historical'),
('Bailar mejor empieza por observar mejor.','04-01','historical'),
('Lo que practicas con intención termina formando parte de ti.','05-01','historical'),
('Aprender juntos también es una forma de avanzar.','06-01','historical'),
('Hoy cuenta, aunque el avance parezca pequeño.','07-01','historical'),
('Tu mejor ritmo es el que puedes mantener.','08-01','historical'),
('La práctica de hoy prepara la soltura de mañana.','09-01','historical'),
('Haz espacio para la versión de ti que quieres crear.','10-01','historical'),
('Una pausa consciente no rompe el progreso; lo protege.','11-01','historical'),
('Cierra el año reconociendo cada paso que sí diste.','12-31','historical')
on conflict do nothing;

create table if not exists public.mission_engine_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  max_daily integer not null default 5 check (max_daily between 1 and 50),
  workdays smallint[] not null default array[1,2,3,4,5]::smallint[],
  nightly_time time not null default '02:15',
  daily_review_time time not null default '06:00',
  delivery_interval_minutes integer not null default 15 check (delivery_interval_minutes between 5 and 1440),
  quiet_hours_start time not null default '22:00',
  quiet_hours_end time not null default '08:00',
  allow_urgent_during_quiet boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.mission_engine_settings(singleton) values(true) on conflict(singleton) do nothing;

drop trigger if exists mission_engine_settings_touch_updated_at on public.mission_engine_settings;
create trigger mission_engine_settings_touch_updated_at before update on public.mission_engine_settings
for each row execute function private.touch_updated_at();

create table if not exists public.mission_rules (
  rule_key text primary key check (rule_key ~ '^[a-z0-9][a-z0-9._-]{2,190}$'),
  module_key text not null,
  name text not null check (length(btrim(name)) > 0),
  description text,
  evaluator text not null,
  built_in boolean not null default true,
  enabled boolean not null default true,
  mission_type text not null check (mission_type in ('primary','daily','growth')),
  frequency text not null check (frequency in ('event','periodic','daily','weekdays','weekly','monthly','campaign')),
  trigger_modes text[] not null default '{}'::text[],
  valid_days smallint[] not null default '{}'::smallint[],
  schedule_time time,
  priority text not null check (priority in ('normal','priority','urgent')),
  priority_score integer not null default 0 check (priority_score between 0 and 100),
  estimated_duration_minutes integer not null default 15 check (estimated_duration_minutes between 1 and 1440),
  weight numeric(6,2) not null default 1 check (weight > 0),
  lead_minutes integer not null default 0 check (lead_minutes between 0 and 525600),
  max_daily integer not null default 1 check (max_daily between 1 and 5),
  duplicate_strategy text not null default 'update_existing' check (duplicate_strategy in ('ignore','update_existing','increase_priority','add_items','independent')),
  failure_behavior text not null default 'keep_pending' check (failure_behavior in ('expire','mark_not_done','repeat','convert_primary','increase_priority','keep_pending')),
  evidence_requirement text not null default 'optional' check (evidence_requirement in ('none','optional','required')),
  auto_complete boolean not null default false,
  calendar_block boolean not null default false,
  notification_events text[] not null default '{}'::text[],
  notification_channels text[] not null default array['internal']::text[],
  recipients jsonb not null default '["staff"]'::jsonb,
  criteria jsonb not null default '{}'::jsonb,
  escalation jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists mission_rules_touch_updated_at on public.mission_rules;
create trigger mission_rules_touch_updated_at before update on public.mission_rules
for each row execute function private.touch_updated_at();

insert into public.mission_rules(
  rule_key,module_key,name,description,evaluator,mission_type,frequency,trigger_modes,valid_days,schedule_time,
  priority,priority_score,estimated_duration_minutes,weight,lead_minutes,duplicate_strategy,failure_behavior,
  evidence_requirement,auto_complete,calendar_block,notification_events,criteria
) values
('classes.pending_close','classes','Clase pendiente de cierre','Cierra la parte pedagógica de una clase ya terminada.','classes_pending_close','primary','periodic',array['event','periodic','daily','first_open'],array[]::smallint[],null,'priority',58,12,2.5,0,'update_existing','increase_priority','none',true,false,array['activated','recommended','urgent','pending'],'{}'),
('bonuses.low_or_expiring','bonuses','Bono próximo a agotarse o caducar','Revisa un bono con poco saldo o caducidad cercana.','bonuses_low_or_expiring','primary','periodic',array['event','periodic','daily','first_open'],array[]::smallint[],null,'priority',48,10,2,0,'update_existing','keep_pending','none',true,false,array['activated','urgent'],'{"balance_minutes":60,"expiry_days":14}'),
('students.incomplete_profile','students','Información incompleta de alumno','Completa los datos mínimos de una ficha de alumno.','students_incomplete_profile','primary','daily',array['event','periodic','daily','first_open'],array[]::smallint[],null,'normal',34,8,1.5,0,'update_existing','keep_pending','none',true,false,array['activated','pending'],'{"require_contact":true,"require_dance_profile":true}'),
('corrections.missing_explanation','corrections','Corrección sin explicación válida','Completa una corrección que aún no puede reutilizarse correctamente.','corrections_missing_explanation','primary','daily',array['event','periodic','daily','first_open'],array[]::smallint[],null,'normal',31,18,1.8,0,'update_existing','keep_pending','optional',true,false,array['activated'],'{}'),
('classes.preparation_needed','classes','Preparación necesaria para una clase próxima','Prepara una clase próxima sin contenido u objetivos asociados.','classes_preparation_needed','primary','periodic',array['periodic','daily','nightly','first_open'],array[]::smallint[],null,'priority',52,25,2.2,2160,'update_existing','increase_priority','none',true,true,array['activated','recommended','urgent'],'{"hours_ahead":36,"preparation_minutes":10}'),
('daily.add_correction','corrections','Añadir una corrección nueva','Amplía de forma constante la biblioteca de correcciones.','daily_template','daily','weekdays',array['daily','nightly','first_open'],array[1,2,3,4,5]::smallint[],'10:00','normal',24,20,1.6,0,'ignore','mark_not_done','none',false,false,array['activated','recommended'],'{"action_target":"teaching","instructions":"Crea una corrección útil y completa."}'),
('daily.review_information','students','Revisar información pendiente','Revisa perfiles, avisos o datos internos que necesiten mantenimiento.','daily_template','daily','weekdays',array['daily','nightly','first_open'],array[1,2,3,4,5]::smallint[],'12:00','normal',20,15,1.2,0,'ignore','expire','none',false,false,array['activated'],'{"action_target":"students"}'),
('daily.complete_internal_content','content','Completar contenido interno','Completa una explicación, ejercicio, secuencia u otro contenido pendiente.','daily_template','daily','weekly',array['daily','nightly','first_open'],array[3]::smallint[],'16:00','normal',18,30,1.8,0,'ignore','repeat','none',false,false,array['activated'],'{"action_target":"teaching"}')
on conflict(rule_key) do nothing;

create table if not exists public.missions (
  id bigint generated always as identity primary key,
  rule_key text references public.mission_rules(rule_key) on update cascade on delete set null,
  mission_type text not null check (mission_type in ('primary','daily','growth')),
  state text not null default 'available' check (state in ('upcoming','available','in_progress','blocked','postponed','completed','not_done','not_applicable','cancelled','completed_automatically')),
  priority text not null default 'normal' check (priority in ('normal','priority','urgent')),
  priority_score integer not null default 0 check (priority_score between 0 and 100),
  title text not null check (length(btrim(title)) > 0),
  description text,
  dedupe_key text,
  source_domain text,
  source_id text,
  action_target text,
  origin jsonb not null default '{}'::jsonb,
  available_at timestamptz not null default now(),
  due_at timestamptz,
  postponed_until timestamptz,
  estimated_duration_minutes integer not null default 15 check (estimated_duration_minutes between 1 and 1440),
  weight numeric(6,2) not null default 1,
  evidence_requirement text not null default 'optional' check (evidence_requirement in ('none','optional','required')),
  auto_complete boolean not null default false,
  calendar_block boolean not null default false,
  calendar_starts_at timestamptz,
  calendar_ends_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (calendar_ends_at is null or calendar_starts_at is null or calendar_ends_at > calendar_starts_at)
);

create unique index if not exists missions_dedupe_key_uq on public.missions(dedupe_key) where dedupe_key is not null;
create index if not exists missions_attention_idx on public.missions(state,due_at,priority_score desc);
create index if not exists missions_rule_source_idx on public.missions(rule_key,source_domain,source_id);

drop trigger if exists missions_touch_updated_at on public.missions;
create trigger missions_touch_updated_at before update on public.missions
for each row execute function private.touch_updated_at();

create table if not exists public.mission_comments (
  id bigint generated always as identity primary key,
  mission_id bigint not null references public.missions(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists mission_comments_mission_created_idx on public.mission_comments(mission_id,created_at);

create table if not exists public.mission_evidence (
  id bigint generated always as identity primary key,
  mission_id bigint not null references public.missions(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('note','image','file','link')),
  provider text not null default 'google_drive' check (provider in ('google_drive','external','internal_note')),
  external_file_id text,
  title text,
  note text,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (nullif(btrim(coalesce(external_file_id,'')),'') is not null or nullif(btrim(coalesce(note,'')),'') is not null)
);
create index if not exists mission_evidence_mission_created_idx on public.mission_evidence(mission_id,created_at);

alter table public.app_member_roles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.daily_quotes enable row level security;
alter table public.mission_engine_settings enable row level security;
alter table public.mission_rules enable row level security;
alter table public.missions enable row level security;
alter table public.mission_comments enable row level security;
alter table public.mission_evidence enable row level security;

drop policy if exists app_member_roles_select on public.app_member_roles;
create policy app_member_roles_select on public.app_member_roles for select to authenticated
using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists app_member_roles_admin_insert on public.app_member_roles;
create policy app_member_roles_admin_insert on public.app_member_roles for insert to authenticated
with check((select private.is_admin()));
drop policy if exists app_member_roles_admin_update on public.app_member_roles;
create policy app_member_roles_admin_update on public.app_member_roles for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists user_preferences_select on public.user_preferences;
create policy user_preferences_select on public.user_preferences for select to authenticated
using(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists user_preferences_insert_own on public.user_preferences;
create policy user_preferences_insert_own on public.user_preferences for insert to authenticated
with check(user_id=(select auth.uid()));
drop policy if exists user_preferences_update_own on public.user_preferences;
create policy user_preferences_update_own on public.user_preferences for update to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

drop policy if exists daily_quotes_select on public.daily_quotes;
create policy daily_quotes_select on public.daily_quotes for select to authenticated
using(active or (select private.is_admin()));
drop policy if exists daily_quotes_admin_all on public.daily_quotes;
create policy daily_quotes_admin_all on public.daily_quotes for all to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists mission_engine_settings_staff_select on public.mission_engine_settings;
create policy mission_engine_settings_staff_select on public.mission_engine_settings for select to authenticated
using((select private.is_staff()));
drop policy if exists mission_engine_settings_admin_all on public.mission_engine_settings;
create policy mission_engine_settings_admin_all on public.mission_engine_settings for all to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists mission_rules_staff_select on public.mission_rules;
create policy mission_rules_staff_select on public.mission_rules for select to authenticated
using((select private.is_staff()));
drop policy if exists mission_rules_admin_all on public.mission_rules;
create policy mission_rules_admin_all on public.mission_rules for all to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists missions_staff_select on public.missions;
create policy missions_staff_select on public.missions for select to authenticated
using((select private.is_staff()));
drop policy if exists missions_staff_insert on public.missions;
create policy missions_staff_insert on public.missions for insert to authenticated
with check((select private.is_staff()));
drop policy if exists missions_staff_update on public.missions;
create policy missions_staff_update on public.missions for update to authenticated
using((select private.is_staff())) with check((select private.is_staff()));

drop policy if exists mission_comments_staff_select on public.mission_comments;
create policy mission_comments_staff_select on public.mission_comments for select to authenticated
using((select private.is_staff()));
drop policy if exists mission_comments_staff_insert on public.mission_comments;
create policy mission_comments_staff_insert on public.mission_comments for insert to authenticated
with check((select private.is_staff()) and author_user_id=(select auth.uid()));

drop policy if exists mission_evidence_staff_select on public.mission_evidence;
create policy mission_evidence_staff_select on public.mission_evidence for select to authenticated
using((select private.is_staff()));
drop policy if exists mission_evidence_staff_insert on public.mission_evidence;
create policy mission_evidence_staff_insert on public.mission_evidence for insert to authenticated
with check((select private.is_staff()) and submitted_by=(select auth.uid()));

revoke all on public.app_member_roles,public.user_preferences,public.daily_quotes,public.mission_engine_settings,
  public.mission_rules,public.missions,public.mission_comments,public.mission_evidence from anon,authenticated;
grant select,insert,update on public.app_member_roles,public.user_preferences,public.daily_quotes,
  public.mission_engine_settings,public.mission_rules,public.missions,public.mission_comments,public.mission_evidence to authenticated;
grant usage on sequence public.daily_quotes_id_seq,public.missions_id_seq,public.mission_comments_id_seq,
  public.mission_evidence_id_seq to authenticated;

create or replace function public.identity_context()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'user_id',(select auth.uid()),
    'display_name',coalesce(p.first_name,up.display_name,'CYA'),
    'profile_name',coalesce(up.display_name,p.display_name,'CYA'),
    'person_id',p.id,
    'roles',coalesce((select jsonb_agg(x.role order by x.priority) from (
      select distinct r.role,case r.role when 'admin' then 1 when 'teacher_admin' then 2 when 'teacher' then 3 else 4 end priority
      from public.app_member_roles r where r.user_id=(select auth.uid()) and r.active
    ) x),'[]'::jsonb),
    'timezone',coalesce(pref.timezone,'Europe/Madrid'),
    'greeting_boundaries',coalesce(pref.greeting_boundaries,'{"morning_start":"05:00","afternoon_start":"12:00","night_start":"20:00"}'::jsonb),
    'can_admin',(select private.is_admin()),
    'can_teach',(select private.is_staff()),
    'can_study',(select private.has_app_role('student'))
  )
  from public.user_profiles up
  left join public.people p on p.auth_user_id=up.id and p.active
  left join public.user_preferences pref on pref.user_id=up.id
  where up.id=(select auth.uid());
$$;

create or replace function private.upsert_mission(
  p_rule public.mission_rules,p_dedupe_key text,p_title text,p_description text,
  p_source_domain text,p_source_id text,p_due_at timestamptz,p_action_target text,p_origin jsonb
) returns bigint language plpgsql security invoker set search_path='' as $$
declare v_id bigint;
begin
  insert into public.missions(
    rule_key,mission_type,state,priority,priority_score,title,description,dedupe_key,
    source_domain,source_id,action_target,origin,available_at,due_at,estimated_duration_minutes,
    weight,evidence_requirement,auto_complete,calendar_block
  ) values(
    p_rule.rule_key,p_rule.mission_type,'available',p_rule.priority,p_rule.priority_score,
    p_title,p_description,p_dedupe_key,p_source_domain,p_source_id,p_action_target,
    coalesce(p_origin,'{}'::jsonb),now(),p_due_at,p_rule.estimated_duration_minutes,
    p_rule.weight,p_rule.evidence_requirement,p_rule.auto_complete,p_rule.calendar_block
  ) on conflict(dedupe_key) where dedupe_key is not null do update set
    title=excluded.title,description=excluded.description,priority=case
      when public.missions.state in ('completed','completed_automatically','cancelled','not_applicable') then public.missions.priority
      else excluded.priority end,
    priority_score=greatest(public.missions.priority_score,excluded.priority_score),
    due_at=excluded.due_at,origin=excluded.origin,
    state=case when public.missions.state in ('completed','completed_automatically','cancelled','not_applicable')
      then public.missions.state else public.missions.state end,
    updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.upsert_mission(public.mission_rules,text,text,text,text,text,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function private.upsert_mission(public.mission_rules,text,text,text,text,text,timestamptz,text,jsonb) to authenticated;

create or replace function public.refresh_missions()
returns integer language plpgsql security invoker set search_path='' as $$
declare
  v_rule public.mission_rules;
  v_count integer:=0;
  v_row record;
  v_timezone text:=coalesce((select timezone from public.user_preferences where user_id=(select auth.uid())),'Europe/Madrid');
  v_today date;
  v_dow integer;
  v_due timestamptz;
  v_enabled boolean:=coalesce((select enabled from public.mission_engine_settings where singleton),true);
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para actualizar misiones.' using errcode='42501'; end if;
  if not v_enabled then return 0; end if;
  v_today:=(now() at time zone v_timezone)::date;
  v_dow:=extract(isodow from v_today)::integer;

  select * into v_rule from public.mission_rules where rule_key='classes.pending_close' and enabled;
  if found then
    for v_row in select c.id,c.scheduled_start_at,array_to_string(array_agg(p.display_name order by p.display_name),' y ') names
      from public.classes c join public.class_participants cp on cp.class_id=c.id join public.people p on p.id=cp.person_id
      where c.status='finished' and c.pedagogy_closed_at is null group by c.id,c.scheduled_start_at
    loop
      perform private.upsert_mission(v_rule,'classes.pending_close:'||v_row.id,
        'Cerrar clase · '||v_row.names,'Completa el cierre pedagógico de la clase.',
        'class',v_row.id::text,now()+interval '4 hours','live',jsonb_build_object('class_id',v_row.id));
      v_count:=v_count+1;
    end loop;
    update public.missions m set state='completed_automatically',completed_at=coalesce(completed_at,now()),updated_at=now()
    where m.rule_key=v_rule.rule_key and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
      and not exists(select 1 from public.classes c where c.id=m.source_id::bigint and c.status='finished' and c.pedagogy_closed_at is null);
  end if;

  select * into v_rule from public.mission_rules where rule_key='bonuses.low_or_expiring' and enabled;
  if found then
    for v_row in select g.id,g.label,g.expires_at,coalesce(sum(cm.delta_minutes),0)::integer balance,
      array_to_string(array_agg(distinct p.display_name),' y ') names
      from public.credit_grants g join public.credit_grant_members gm on gm.grant_id=g.id
      join public.people p on p.id=gm.person_id left join public.credit_movements cm on cm.grant_id=g.id
      where g.status='active' group by g.id,g.label,g.expires_at
      having coalesce(sum(cm.delta_minutes),0)<=coalesce((v_rule.criteria->>'balance_minutes')::integer,60)
        or g.expires_at<=now()+make_interval(days=>coalesce((v_rule.criteria->>'expiry_days')::integer,14))
    loop
      perform private.upsert_mission(v_rule,'bonuses.low_or_expiring:'||v_row.id,
        'Revisar bono · '||v_row.names,
        case when v_row.balance<=0 then 'El bono no tiene saldo disponible.' else 'Quedan '||v_row.balance||' minutos.' end,
        'credit_grant',v_row.id::text,coalesce(v_row.expires_at,now()+interval '2 days'),'credits',
        jsonb_build_object('grant_id',v_row.id,'balance_minutes',v_row.balance));
      v_count:=v_count+1;
    end loop;
    update public.missions m set state='completed_automatically',completed_at=coalesce(completed_at,now()),updated_at=now()
    where m.rule_key=v_rule.rule_key and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
      and not exists(
        select 1 from public.credit_grants g
        where g.id=m.source_id::bigint and g.status='active' and (
          coalesce((select sum(cm.delta_minutes) from public.credit_movements cm where cm.grant_id=g.id),0)<=coalesce((v_rule.criteria->>'balance_minutes')::integer,60)
          or g.expires_at<=now()+make_interval(days=>coalesce((v_rule.criteria->>'expiry_days')::integer,14))
        )
      );
  end if;

  select * into v_rule from public.mission_rules where rule_key='students.incomplete_profile' and enabled;
  if found then
    for v_row in select p.id,p.display_name from public.people p join public.student_profiles sp on sp.person_id=p.id
      where p.active and sp.active and (
        nullif(btrim(coalesce(p.first_name,'')),'') is null
        or (nullif(btrim(coalesce(p.phone,'')),'') is null and nullif(btrim(coalesce(p.email,'')),'') is null)
        or not exists(select 1 from public.student_dance_profiles sdp where sdp.person_id=p.id and sdp.active)
      )
    loop
      perform private.upsert_mission(v_rule,'students.incomplete_profile:'||v_row.id,
        'Completar perfil · '||v_row.display_name,'Faltan datos personales o de baile que CYA necesita reutilizar.',
        'person',v_row.id::text,now()+interval '3 days','students',jsonb_build_object('person_id',v_row.id));
      v_count:=v_count+1;
    end loop;
    update public.missions m set state='completed_automatically',completed_at=coalesce(completed_at,now()),updated_at=now()
    where m.rule_key=v_rule.rule_key and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
      and not exists(
        select 1 from public.people p join public.student_profiles sp on sp.person_id=p.id
        where p.id=m.source_id::bigint and p.active and sp.active and (
          nullif(btrim(coalesce(p.first_name,'')),'') is null
          or (nullif(btrim(coalesce(p.phone,'')),'') is null and nullif(btrim(coalesce(p.email,'')),'') is null)
          or not exists(select 1 from public.student_dance_profiles sdp where sdp.person_id=p.id and sdp.active)
        )
      );
  end if;

  select * into v_rule from public.mission_rules where rule_key='corrections.missing_explanation' and enabled;
  if found then
    for v_row in select t.id,t.title from public.teaching_contents t where t.active and t.content_type='correction'
      and (t.completion_status='incomplete' or nullif(btrim(coalesce(t.description,'')),'') is null or nullif(btrim(coalesce(t.correction_guidance,'')),'') is null)
    loop
      perform private.upsert_mission(v_rule,'corrections.missing_explanation:'||v_row.id,
        'Completar corrección · '||v_row.title,'Añade la explicación y la forma de corregirla.',
        'teaching_content',v_row.id::text,now()+interval '5 days','teaching',jsonb_build_object('content_id',v_row.id));
      v_count:=v_count+1;
    end loop;
    update public.missions m set state='completed_automatically',completed_at=coalesce(completed_at,now()),updated_at=now()
    where m.rule_key=v_rule.rule_key and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
      and not exists(select 1 from public.teaching_contents t where t.id=m.source_id::bigint and t.active and t.content_type='correction'
        and (t.completion_status='incomplete' or nullif(btrim(coalesce(t.description,'')),'') is null or nullif(btrim(coalesce(t.correction_guidance,'')),'') is null));
  end if;

  select * into v_rule from public.mission_rules where rule_key='classes.preparation_needed' and enabled;
  if found then
    for v_row in select c.id,c.scheduled_start_at,array_to_string(array_agg(p.display_name order by p.display_name),' y ') names
      from public.classes c join public.class_participants cp on cp.class_id=c.id join public.people p on p.id=cp.person_id
      where c.status='scheduled' and c.scheduled_start_at between now() and now()+make_interval(hours=>coalesce((v_rule.criteria->>'hours_ahead')::integer,36))
        and not exists(select 1 from public.student_content_assignments a where a.source_class_id=c.id)
      group by c.id,c.scheduled_start_at
    loop
      perform private.upsert_mission(v_rule,'classes.preparation_needed:'||v_row.id,
        'Preparar clase · '||v_row.names,'Revisa objetivos, correcciones y contenido antes de la clase.',
        'class',v_row.id::text,v_row.scheduled_start_at-make_interval(mins=>coalesce((v_rule.criteria->>'preparation_minutes')::integer,10)),
        'live',jsonb_build_object('class_id',v_row.id));
      v_count:=v_count+1;
    end loop;
    update public.missions m set state='completed_automatically',completed_at=coalesce(completed_at,now()),updated_at=now()
    where m.rule_key=v_rule.rule_key and m.state not in ('completed','completed_automatically','cancelled','not_applicable')
      and not exists(
        select 1 from public.classes c
        where c.id=m.source_id::bigint and c.status='scheduled'
          and c.scheduled_start_at between now() and now()+make_interval(hours=>coalesce((v_rule.criteria->>'hours_ahead')::integer,36))
          and not exists(select 1 from public.student_content_assignments a where a.source_class_id=c.id)
      );
  end if;

  for v_rule in select * from public.mission_rules where enabled and evaluator='daily_template'
  loop
    if cardinality(v_rule.valid_days)=0 or v_dow=any(v_rule.valid_days) then
      v_due:=((v_today::text||' 23:59:59')::timestamp at time zone v_timezone);
      perform private.upsert_mission(v_rule,v_rule.rule_key||':'||v_today,
        v_rule.name,coalesce(v_rule.criteria->>'instructions',v_rule.description),
        'daily',v_today::text,v_due,coalesce(v_rule.criteria->>'action_target','home'),jsonb_build_object('date',v_today));
      v_count:=v_count+1;
    end if;
  end loop;

  update public.missions set state='available',postponed_until=null,updated_at=now()
  where state='postponed' and postponed_until<=now();
  update public.missions set state='not_done',updated_at=now()
  where mission_type='daily' and state in ('available','in_progress') and due_at<now()
    and coalesce((select failure_behavior from public.mission_rules r where r.rule_key=missions.rule_key),'mark_not_done')='mark_not_done';

  return v_count;
end;
$$;

create or replace function public.act_on_mission(
  p_mission_id bigint,p_action text,p_comment text default null,p_postpone_until timestamptz default null
) returns public.missions language plpgsql security invoker set search_path='' as $$
declare v_mission public.missions; v_next text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar misiones.' using errcode='42501'; end if;
  select * into v_mission from public.missions where id=p_mission_id for update;
  if not found then raise exception 'La misión no existe.' using errcode='P0002'; end if;
  if p_action='open' then return v_mission;
  elsif p_action='comment' then
    if nullif(btrim(coalesce(p_comment,'')),'') is null then raise exception 'Escribe un comentario.' using errcode='22023'; end if;
    insert into public.mission_comments(mission_id,body,author_user_id)
    values(v_mission.id,btrim(p_comment),(select auth.uid()));
    return v_mission;
  elsif p_action='start' then v_next:='in_progress';
  elsif p_action='complete' then
    if v_mission.evidence_requirement='required' and not exists(select 1 from public.mission_evidence e where e.mission_id=v_mission.id) then
      raise exception 'Esta misión requiere una evidencia antes de completarla.' using errcode='22023';
    end if;
    v_next:='completed';
  elsif p_action='postpone' then
    if p_postpone_until is null or p_postpone_until<=now() then raise exception 'Elige una fecha futura para posponer.' using errcode='22023'; end if;
    v_next:='postponed';
  elsif p_action='not_applicable' then v_next:='not_applicable';
  elsif p_action='cancel' then
    if not (select private.is_admin()) then raise exception 'Solo administración puede cancelar una misión.' using errcode='42501'; end if;
    v_next:='cancelled';
  else raise exception 'Acción de misión no válida.' using errcode='22023';
  end if;
  if nullif(btrim(coalesce(p_comment,'')),'') is not null then
    insert into public.mission_comments(mission_id,body,author_user_id)
    values(v_mission.id,btrim(p_comment),(select auth.uid()));
  end if;
  update public.missions set state=v_next,
    postponed_until=case when v_next='postponed' then p_postpone_until else null end,
    completed_at=case when v_next='completed' then now() else completed_at end,
    completed_by=case when v_next='completed' then (select auth.uid()) else completed_by end
  where id=v_mission.id returning * into v_mission;
  return v_mission;
end;
$$;

create or replace function public.home_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
  with prefs as (
    select coalesce(p.timezone,'Europe/Madrid') timezone,
      coalesce(p.greeting_boundaries,'{"morning_start":"05:00","afternoon_start":"12:00","night_start":"20:00"}'::jsonb) boundaries
    from (select 1) x left join public.user_preferences p on p.user_id=(select auth.uid())
  ), local_day as (
    select (now() at time zone timezone)::date as local_date,timezone,boundaries from prefs
  ), chosen_quote as (
    select q.id,q.quote_text from public.daily_quotes q,local_day d
    where q.active and (q.override_date=d.local_date or (q.override_date is null and q.month_day=to_char(d.local_date,'MM-DD')))
    order by (q.override_date is not null) desc,q.id limit 1
  ), fallback_quote as (
    select id,quote_text from (
      select q.id,q.quote_text,row_number() over(order by q.id) position,count(*) over() total
      from public.daily_quotes q where q.active
    ) q,local_day d
    where q.position=mod(abs(d.local_date-date '2000-01-01'),q.total::integer)+1
  )
  select jsonb_build_object(
    'timezone',(select timezone from prefs),
    'greeting_boundaries',(select boundaries from prefs),
    'quote',coalesce((select jsonb_build_object('id',id,'text',quote_text) from chosen_quote),
      (select jsonb_build_object('id',id,'text',quote_text) from fallback_quote)),
    'missions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'rule_key',m.rule_key,'mission_type',m.mission_type,'state',m.state,'priority',m.priority,
      'priority_score',m.priority_score,'title',m.title,'description',m.description,'action_target',m.action_target,
      'due_at',m.due_at,'estimated_duration_minutes',m.estimated_duration_minutes,'calendar_block',m.calendar_block
    ) order by case m.priority when 'urgent' then 1 when 'priority' then 2 else 3 end,m.due_at nulls last,m.priority_score desc)
      from (select * from public.missions where state in ('available','in_progress','postponed','not_done')
        and (postponed_until is null or postponed_until<=now()) order by
        case priority when 'urgent' then 1 when 'priority' then 2 else 3 end,due_at nulls last,priority_score desc limit 6) m),'[]'::jsonb),
    'mission_engine',(select to_jsonb(s)-'singleton'-'updated_by' from public.mission_engine_settings s where singleton)
  );
$$;

revoke all on function public.identity_context() from public,anon;
revoke all on function public.refresh_missions() from public,anon;
revoke all on function public.act_on_mission(bigint,text,text,timestamptz) from public,anon;
revoke all on function public.home_snapshot() from public,anon;
grant execute on function public.identity_context() to authenticated;
grant execute on function public.refresh_missions() to authenticated;
grant execute on function public.act_on_mission(bigint,text,text,timestamptz) to authenticated;
grant execute on function public.home_snapshot() to authenticated;

commit;
