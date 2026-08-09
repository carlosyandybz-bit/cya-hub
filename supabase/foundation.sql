begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table private.admin_bootstrap_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint admin_bootstrap_email_normalized check (email = lower(btrim(email)))
);
insert into private.admin_bootstrap_emails(email) values ('carlosyandybz@gmail.com');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuario' check (length(btrim(display_name)) > 0),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin','teacher_admin','teacher','student')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.people (
  id bigint generated always as identity primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null check (length(btrim(display_name)) > 0),
  first_name text,
  last_name text,
  email text,
  phone text,
  country_code text,
  crm_stage text not null default 'new' check (crm_stage in ('new','contacted','interested','booked','student','lost')),
  source text,
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_profiles (
  person_id bigint primary key references public.people(id) on delete cascade,
  student_since date,
  goals text,
  teacher_notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_terms (
  id bigint generated always as identity primary key,
  taxonomy text not null check (length(btrim(taxonomy)) > 0),
  term_key text not null check (length(btrim(term_key)) > 0),
  label text not null check (length(btrim(label)) > 0),
  parent_id bigint references public.catalog_terms(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(taxonomy,term_key)
);

create table public.student_dance_profiles (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.student_profiles(person_id) on delete cascade,
  style_term_id bigint not null references public.catalog_terms(id),
  role_term_id bigint not null references public.catalog_terms(id),
  level_term_id bigint references public.catalog_terms(id),
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(person_id,style_term_id,role_term_id)
);

create index people_auth_user_id_idx on public.people(auth_user_id) where auth_user_id is not null;
create index people_crm_stage_active_idx on public.people(crm_stage,active);
create index people_email_idx on public.people(lower(email)) where email is not null;
create index people_created_by_idx on public.people(created_by) where created_by is not null;
create index student_profiles_active_idx on public.student_profiles(active,person_id);
create index student_profiles_created_by_idx on public.student_profiles(created_by) where created_by is not null;
create index catalog_terms_taxonomy_active_sort_idx on public.catalog_terms(taxonomy,active,sort_order);
create index catalog_terms_parent_id_idx on public.catalog_terms(parent_id) where parent_id is not null;
create index student_dance_profiles_person_active_idx on public.student_dance_profiles(person_id,active);
create index student_dance_profiles_style_term_id_idx on public.student_dance_profiles(style_term_id);
create index student_dance_profiles_role_term_id_idx on public.student_dance_profiles(role_term_id);
create index student_dance_profiles_level_term_id_idx on public.student_dance_profiles(level_term_id) where level_term_id is not null;

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end;
$$;
revoke execute on function private.touch_updated_at() from public,anon,authenticated;

create trigger user_profiles_touch_updated_at before update on public.user_profiles for each row execute function private.touch_updated_at();
create trigger app_members_touch_updated_at before update on public.app_members for each row execute function private.touch_updated_at();
create trigger people_touch_updated_at before update on public.people for each row execute function private.touch_updated_at();
create trigger student_profiles_touch_updated_at before update on public.student_profiles for each row execute function private.touch_updated_at();
create trigger catalog_terms_touch_updated_at before update on public.catalog_terms for each row execute function private.touch_updated_at();
create trigger student_dance_profiles_touch_updated_at before update on public.student_dance_profiles for each row execute function private.touch_updated_at();

create function private.current_app_role() returns text language sql stable security definer set search_path='' as $$
  select role from public.app_members where user_id=(select auth.uid()) and active limit 1;
$$;
create function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role in ('admin','teacher_admin','teacher'));
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_members where user_id=(select auth.uid()) and active and role in ('admin','teacher_admin'));
$$;
create function private.current_person_id() returns bigint language sql stable security definer set search_path='' as $$
  select id from public.people where auth_user_id=(select auth.uid()) limit 1;
$$;
revoke execute on function private.current_app_role() from public,anon;
revoke execute on function private.is_staff() from public,anon;
revoke execute on function private.is_admin() from public,anon;
revoke execute on function private.current_person_id() from public,anon;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.current_person_id() to authenticated;

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare normalized_email text:=lower(btrim(coalesce(new.email,''))); bootstrap_admin boolean:=false;
begin
  select exists(select 1 from private.admin_bootstrap_emails where email=normalized_email) into bootstrap_admin;
  insert into public.user_profiles(id,display_name)
  values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(normalized_email,'@',1),''),'Usuario'))
  on conflict(id) do nothing;
  insert into public.app_members(user_id,role,active)
  values(new.id,case when bootstrap_admin then 'admin' else 'student' end,true)
  on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public,anon,authenticated;
create trigger cya_on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

insert into public.user_profiles(id,display_name)
select id,'Carlos & Andy' from auth.users where lower(email)='carlosyandybz@gmail.com'
on conflict(id) do update set display_name=excluded.display_name;
insert into public.app_members(user_id,role,active)
select id,'admin',true from auth.users where lower(email)='carlosyandybz@gmail.com'
on conflict(user_id) do update set role='admin',active=true;

create function public.create_student(
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
  insert into public.student_profiles(person_id,student_since,active,created_by) values(new_person.id,null,true,(select auth.uid()));
  return new_person;
end;
$$;
revoke all on function public.create_student(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_student(text,text,text,text,text,text) to authenticated;

insert into public.catalog_terms(taxonomy,term_key,label,sort_order,metadata) values
('dance_style','bachata','Bachata',10,'{}'),('dance_style','salsa','Salsa',20,'{}'),('dance_style','zouk','Zouk',30,'{}'),('dance_style','bachazouk','Bachazouk',40,'{}'),
('dance_role','leader','Leader',10,'{}'),('dance_role','follower','Follower',20,'{}'),
('dance_level','inicio','Inicio',10,'{"score_floor":0}'),('dance_level','intermedio','Intermedio',20,'{"score_floor":50}'),('dance_level','avanzado','Avanzado',30,'{"score_floor":75}'),
('evaluation_scale','no_idea','Aún no lo conoce',10,'{"score":0}'),('evaluation_scale','recognizes','Lo reconoce',20,'{"score":25}'),('evaluation_scale','applies','Lo aplica',30,'{"score":50}'),('evaluation_scale','integrates','Lo integra con soltura',40,'{"score":75}'),('evaluation_scale','masters','Lo domina',50,'{"score":100}'),
('aptitude','musicality','Musicalidad',10,'{"levels":["inicio","intermedio","avanzado"]}'),('aptitude','body_movement','Movimiento corporal',20,'{"levels":["inicio","intermedio","avanzado"]}'),('aptitude','footwork','Footwork',30,'{"levels":["inicio","intermedio","avanzado"]}'),('aptitude','connection','Conexión',40,'{"levels":["inicio","intermedio","avanzado"]}'),('aptitude','style','Estilo',50,'{"levels":["intermedio","avanzado"]}'),('aptitude','expression','Expresión e interpretación',60,'{"levels":["avanzado"]}'),('aptitude','technique','Técnica',70,'{"levels":["inicio","intermedio","avanzado"]}'),('aptitude','resources','Recursos y repertorio',80,'{"levels":["inicio","intermedio","avanzado"]}');

alter table public.user_profiles enable row level security;
alter table public.app_members enable row level security;
alter table public.people enable row level security;
alter table public.student_profiles enable row level security;
alter table public.catalog_terms enable row level security;
alter table public.student_dance_profiles enable row level security;

create policy user_profiles_select on public.user_profiles for select to authenticated using(id=(select auth.uid()) or (select private.is_staff()));
create policy user_profiles_update_own on public.user_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy app_members_select on public.app_members for select to authenticated using(user_id=(select auth.uid()) or (select private.is_admin()));
create policy app_members_admin_insert on public.app_members for insert to authenticated with check((select private.is_admin()));
create policy app_members_admin_update on public.app_members for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy people_select on public.people for select to authenticated using(auth_user_id=(select auth.uid()) or (select private.is_staff()));
create policy people_staff_insert on public.people for insert to authenticated with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy people_staff_update on public.people for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy student_profiles_select on public.student_profiles for select to authenticated using(person_id=(select private.current_person_id()) or (select private.is_staff()));
create policy student_profiles_staff_insert on public.student_profiles for insert to authenticated with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy student_profiles_staff_update on public.student_profiles for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));
create policy catalog_terms_select on public.catalog_terms for select to authenticated using(active or (select private.is_admin()));
create policy catalog_terms_admin_insert on public.catalog_terms for insert to authenticated with check((select private.is_admin()));
create policy catalog_terms_admin_update on public.catalog_terms for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy dance_profiles_select on public.student_dance_profiles for select to authenticated using(person_id=(select private.current_person_id()) or (select private.is_staff()));
create policy dance_profiles_staff_insert on public.student_dance_profiles for insert to authenticated with check((select private.is_staff()));
create policy dance_profiles_staff_update on public.student_dance_profiles for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant usage on schema public to authenticated;
grant select on public.user_profiles,public.app_members,public.people,public.student_profiles,public.catalog_terms,public.student_dance_profiles to authenticated;
grant update(display_name,avatar_url) on public.user_profiles to authenticated;
grant insert,update on public.app_members,public.people,public.student_profiles,public.catalog_terms,public.student_dance_profiles to authenticated;
grant usage on sequence public.people_id_seq,public.catalog_terms_id_seq,public.student_dance_profiles_id_seq to authenticated;

commit;
