-- P30E1 — Estructura final de asignaciones usada por el motor directo.
create table if not exists public.statistics_dashboard_assignments (
  dashboard_id bigint not null references public.statistics_dashboards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_default boolean not null default true,
  active boolean not null default true,
  assigned_by uuid not null default auth.uid() references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key(dashboard_id,user_id)
);
create index if not exists statistics_dashboard_assignments_user_idx on public.statistics_dashboard_assignments(user_id);
create index if not exists statistics_dashboard_assignments_assigned_by_idx on public.statistics_dashboard_assignments(assigned_by);
