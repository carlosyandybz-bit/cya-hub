-- P30F7 — Evita políticas SELECT permisivas duplicadas.
drop policy if exists statistics_dashboards_admin_write on public.statistics_dashboards;
create policy statistics_dashboards_admin_insert on public.statistics_dashboards for insert to authenticated with check (private.is_admin());
create policy statistics_dashboards_admin_update on public.statistics_dashboards for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy statistics_dashboards_admin_delete on public.statistics_dashboards for delete to authenticated using (private.is_admin());

drop policy if exists statistics_dashboard_cards_admin_write on public.statistics_dashboard_cards;
create policy statistics_dashboard_cards_admin_insert on public.statistics_dashboard_cards for insert to authenticated with check (private.is_admin());
create policy statistics_dashboard_cards_admin_update on public.statistics_dashboard_cards for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy statistics_dashboard_cards_admin_delete on public.statistics_dashboard_cards for delete to authenticated using (private.is_admin());
