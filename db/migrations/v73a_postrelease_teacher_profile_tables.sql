-- Post-release core: modelo profesional normalizado del profesor.

create table if not exists public.teacher_profiles (
  person_id bigint primary key references public.people(id) on delete cascade,
  professional_name text,
  bio text,
  specialties text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_profile_styles (
  person_id bigint not null references public.teacher_profiles(person_id) on delete cascade,
  style_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (person_id, style_term_id)
);

alter table public.teacher_profiles enable row level security;
alter table public.teacher_profile_styles enable row level security;

revoke all on table public.teacher_profiles from anon, authenticated;
revoke all on table public.teacher_profile_styles from anon, authenticated;
grant select on table public.teacher_profiles to authenticated;
grant select on table public.teacher_profile_styles to authenticated;

drop policy if exists teacher_profiles_staff_select on public.teacher_profiles;
create policy teacher_profiles_staff_select
on public.teacher_profiles for select
to authenticated
using ((select private.is_staff()));

drop policy if exists teacher_profile_styles_staff_select on public.teacher_profile_styles;
create policy teacher_profile_styles_staff_select
on public.teacher_profile_styles for select
to authenticated
using ((select private.is_staff()));

insert into public.teacher_profiles(person_id, professional_name, active)
select distinct p.id, coalesce(nullif(btrim(up.display_name),''), nullif(btrim(p.display_name),'')), true
from public.people p
join public.app_member_roles r on r.user_id=p.auth_user_id and r.active and r.role in ('teacher','teacher_admin','admin')
left join public.user_profiles up on up.id=p.auth_user_id
where p.active
on conflict (person_id) do nothing;
