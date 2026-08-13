-- P30E2 — Acceso final de asignaciones para Administración y lectura propia del profesor.
alter table public.statistics_dashboard_assignments enable row level security;
drop policy if exists statistics_dashboard_assignments_staff_read on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_admin_write on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_admin_read on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_self_read on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_admin_insert on public.statistics_dashboard_assignments;
create policy statistics_dashboard_assignments_admin_read on public.statistics_dashboard_assignments for select to authenticated using(private.is_admin());
create policy statistics_dashboard_assignments_self_read on public.statistics_dashboard_assignments for select to authenticated using(private.is_staff() and user_id=auth.uid());
create policy statistics_dashboard_assignments_admin_insert on public.statistics_dashboard_assignments for insert to authenticated with check(private.is_admin());
grant select,insert on table public.statistics_dashboard_assignments to authenticated;
