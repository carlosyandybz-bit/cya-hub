-- P32 — Retirar un índice realmente duplicado, no un índice meramente marcado como unused.
-- Producción confirma que `_idx` y `_uidx` son UNIQUE, mismas columnas y mismo predicado.
-- `_idx` es el original y ya registra uso; se conserva.

drop index if exists public.teaching_content_relations_sequence_position_uidx;
