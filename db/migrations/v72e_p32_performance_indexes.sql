-- P32 — Rendimiento verificado: cubrir las FKs introducidas por P31.

create index if not exists app_appearance_settings_updated_by_idx
  on public.app_appearance_settings(updated_by)
  where updated_by is not null;

create index if not exists app_operational_defaults_location_idx
  on public.app_operational_defaults(default_location_term_id)
  where default_location_term_id is not null;

create index if not exists app_operational_defaults_updated_by_idx
  on public.app_operational_defaults(updated_by)
  where updated_by is not null;
