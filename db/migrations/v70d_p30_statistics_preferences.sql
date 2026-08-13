-- P30D — Preferencias globales y disponibilidad de métricas gobernadas por Administración.
create table if not exists public.statistics_settings (
  singleton boolean primary key default true check(singleton),
  quick_periods integer[] not null default array[7,30,90,365]::integer[],
  default_period_kind text not null default 'this_month' check(default_period_kind in ('today','this_week','this_month','this_year','rolling_days')),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
insert into public.statistics_settings(singleton) values(true) on conflict(singleton) do nothing;

create table if not exists public.statistics_metric_settings (
  metric_key text primary key,
  active boolean not null default true,
  featured boolean not null default false,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create index if not exists statistics_settings_updated_by_idx on public.statistics_settings(updated_by) where updated_by is not null;
create index if not exists statistics_metric_settings_updated_by_idx on public.statistics_metric_settings(updated_by) where updated_by is not null;

alter table public.statistics_settings enable row level security;
alter table public.statistics_metric_settings enable row level security;

drop policy if exists statistics_settings_staff_read on public.statistics_settings;
drop policy if exists statistics_settings_admin_write on public.statistics_settings;
drop policy if exists statistics_settings_admin_insert on public.statistics_settings;
drop policy if exists statistics_settings_admin_update on public.statistics_settings;
create policy statistics_settings_staff_read on public.statistics_settings for select to authenticated using(private.is_staff());
create policy statistics_settings_admin_insert on public.statistics_settings for insert to authenticated with check(private.is_admin());
create policy statistics_settings_admin_update on public.statistics_settings for update to authenticated using(private.is_admin()) with check(private.is_admin());

drop policy if exists statistics_metric_settings_staff_read on public.statistics_metric_settings;
drop policy if exists statistics_metric_settings_admin_write on public.statistics_metric_settings;
drop policy if exists statistics_metric_settings_admin_insert on public.statistics_metric_settings;
drop policy if exists statistics_metric_settings_admin_update on public.statistics_metric_settings;
create policy statistics_metric_settings_staff_read on public.statistics_metric_settings for select to authenticated using(private.is_staff());
create policy statistics_metric_settings_admin_insert on public.statistics_metric_settings for insert to authenticated with check(private.is_admin());
create policy statistics_metric_settings_admin_update on public.statistics_metric_settings for update to authenticated using(private.is_admin()) with check(private.is_admin());

grant select,insert,update on table public.statistics_settings to authenticated;
grant select,insert,update on table public.statistics_metric_settings to authenticated;

comment on table public.statistics_settings is 'P30 Statistics UI preferences managed by administrators.';
comment on table public.statistics_metric_settings is 'P30 metric availability and featured ordering.';
