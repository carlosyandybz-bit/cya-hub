-- P30F6 — Índices que cubren las FKs y rutas de selección principales.
create index if not exists statistics_dashboard_cards_dashboard_fk_idx on public.statistics_dashboard_cards(dashboard_id);
create index if not exists statistics_dashboards_target_user_fk_idx on public.statistics_dashboards(target_user_id) where target_user_id is not null;
create index if not exists statistics_dashboards_created_by_fk_idx on public.statistics_dashboards(created_by);
create index if not exists statistics_dashboard_assignments_user_idx on public.statistics_dashboard_assignments(user_id);
