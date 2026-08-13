-- P31 — Normaliza los roles de la única policy de lectura de Apariencia.
-- Los privilegios de tabla siguen limitando SELECT a anon/authenticated.

alter policy app_appearance_settings_read
on public.app_appearance_settings
to public;
