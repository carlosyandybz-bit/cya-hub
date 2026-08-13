-- P31 — Default operativo de ubicación sobre el catálogo canónico.

create table if not exists public.app_operational_defaults (
  singleton boolean primary key default true check (singleton),
  default_location_term_id bigint null references public.catalog_terms(id),
  updated_by uuid null references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.app_operational_defaults enable row level security;

revoke all on table public.app_operational_defaults from public, anon, authenticated;
grant select, update on table public.app_operational_defaults to authenticated;

drop policy if exists app_operational_defaults_staff_read on public.app_operational_defaults;
create policy app_operational_defaults_staff_read on public.app_operational_defaults
for select to authenticated using ((select private.is_staff()));

drop policy if exists app_operational_defaults_admin_update on public.app_operational_defaults;
create policy app_operational_defaults_admin_update on public.app_operational_defaults
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

insert into public.app_operational_defaults(singleton, default_location_term_id)
values (true, null)
on conflict (singleton) do nothing;
