-- P31 — Identidad visual global configurable.

create table if not exists public.app_appearance_settings (
  singleton boolean primary key default true check (singleton),
  app_name text not null default 'CYA Hub' check (length(btrim(app_name)) between 1 and 80),
  short_mark text not null default 'CYA' check (length(btrim(short_mark)) between 1 and 12),
  logo_url text null check (logo_url is null or (length(logo_url) <= 2048 and (logo_url like '/%' or logo_url ~ '^https://'))),
  primary_color text not null default '#6d4aff' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#5637e8' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  typography text not null default 'geist' check (typography in ('geist','system','rounded')),
  header_style text not null default 'standard' check (header_style in ('standard','compact')),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_appearance_settings enable row level security;

grant select on public.app_appearance_settings to anon, authenticated;
grant insert, update on public.app_appearance_settings to authenticated;

drop policy if exists app_appearance_settings_read on public.app_appearance_settings;
create policy app_appearance_settings_read on public.app_appearance_settings
for select to anon, authenticated using (true);

drop policy if exists app_appearance_settings_admin_insert on public.app_appearance_settings;
create policy app_appearance_settings_admin_insert on public.app_appearance_settings
for insert to authenticated with check ((select private.is_admin()));

drop policy if exists app_appearance_settings_admin_update on public.app_appearance_settings;
create policy app_appearance_settings_admin_update on public.app_appearance_settings
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

insert into public.app_appearance_settings(singleton, app_name, short_mark, logo_url, primary_color, secondary_color, typography, header_style)
values (true, 'CYA Hub', 'CYA', null, '#6d4aff', '#5637e8', 'geist', 'standard')
on conflict (singleton) do nothing;
