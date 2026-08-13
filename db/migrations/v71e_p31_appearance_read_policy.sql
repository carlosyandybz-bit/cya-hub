-- P31 — Una sola policy de lectura de Apariencia.
-- Los privilegios de tabla siguen limitando SELECT a anon/authenticated.

drop policy if exists app_appearance_settings_read on public.app_appearance_settings;
create policy app_appearance_settings_read
on public.app_appearance_settings
for select
to public
using (true);
