-- P32 — Rendimiento verificado: cubrir FKs P31 y retirar un índice realmente duplicado.

create index if not exists app_appearance_settings_updated_by_idx
  on public.app_appearance_settings(updated_by)
  where updated_by is not null;

create index if not exists app_operational_defaults_location_idx
  on public.app_operational_defaults(default_location_term_id)
  where default_location_term_id is not null;

create index if not exists app_operational_defaults_updated_by_idx
  on public.app_operational_defaults(updated_by)
  where updated_by is not null;

-- Ambos índices de sequence_item son UNIQUE, mismas columnas y mismo predicado.
-- Conservamos el original `_idx` y retiramos el duplicado posterior `_uidx`.
drop index if exists public.teaching_content_relations_sequence_position_uidx;
