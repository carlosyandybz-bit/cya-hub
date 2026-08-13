-- P30E6 — Una sola policy SELECT evita reevaluaciones y solapamientos permisivos.
drop policy if exists statistics_dashboard_assignments_admin_read on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_self_read on public.statistics_dashboard_assignments;
drop policy if exists statistics_dashboard_assignments_admin_update on public.statistics_dashboard_assignments;

create policy statistics_dashboard_assignments_read
on public.statistics_dashboard_assignments
for select to authenticated
using (
  private.is_admin()
  or (private.is_staff() and user_id=(select auth.uid()))
);

create policy statistics_dashboard_assignments_admin_update
on public.statistics_dashboard_assignments
for update to authenticated
using (private.is_admin())
with check (private.is_admin());

grant update on table public.statistics_dashboard_assignments to authenticated;
