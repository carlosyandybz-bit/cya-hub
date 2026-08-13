-- P30D — Preferencias globales y panel personal por profesor.
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

alter table public.statistics_settings enable row level security;
alter table public.statistics_metric_settings enable row level security;
create policy statistics_settings_staff_read on public.statistics_settings for select to authenticated using(private.is_staff());
create policy statistics_settings_admin_write on public.statistics_settings for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy statistics_metric_settings_staff_read on public.statistics_metric_settings for select to authenticated using(private.is_staff());
create policy statistics_metric_settings_admin_write on public.statistics_metric_settings for all to authenticated using(private.is_admin()) with check(private.is_admin());

-- Los profesores pueden crear/editar únicamente su panel personal.
create policy statistics_dashboards_personal_insert on public.statistics_dashboards for insert to authenticated
with check(private.is_staff() and scope='personal' and target_user_id=auth.uid() and created_by=auth.uid());
create policy statistics_dashboards_personal_update on public.statistics_dashboards for update to authenticated
using(private.is_staff() and scope='personal' and target_user_id=auth.uid())
with check(scope='personal' and target_user_id=auth.uid());
create policy statistics_dashboards_personal_delete on public.statistics_dashboards for delete to authenticated
using(private.is_staff() and scope='personal' and target_user_id=auth.uid());
create policy statistics_cards_personal_insert on public.statistics_dashboard_cards for insert to authenticated
with check(private.is_staff() and exists(select 1 from public.statistics_dashboards d where d.id=dashboard_id and d.scope='personal' and d.target_user_id=auth.uid()));
create policy statistics_cards_personal_update on public.statistics_dashboard_cards for update to authenticated
using(private.is_staff() and exists(select 1 from public.statistics_dashboards d where d.id=dashboard_id and d.scope='personal' and d.target_user_id=auth.uid()));
create policy statistics_cards_personal_delete on public.statistics_dashboard_cards for delete to authenticated
using(private.is_staff() and exists(select 1 from public.statistics_dashboards d where d.id=dashboard_id and d.scope='personal' and d.target_user_id=auth.uid()));

comment on table public.statistics_settings is 'P30 global Statistics UI preferences managed by administrators.';
comment on table public.statistics_metric_settings is 'P30 metric availability and featured ordering.';
