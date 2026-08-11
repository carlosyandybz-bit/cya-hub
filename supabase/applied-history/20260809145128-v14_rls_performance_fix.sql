begin;

-- Evita políticas SELECT duplicadas: las políticas de lectura ya incluyen a
-- administración y las capacidades de escritura se expresan por operación.
drop policy if exists calendar_connections_own_all on public.calendar_connections;
drop policy if exists calendar_connections_own_insert on public.calendar_connections;
create policy calendar_connections_own_insert on public.calendar_connections for insert to authenticated
with check(user_id=(select auth.uid()) or (select private.is_admin()));
drop policy if exists calendar_connections_own_update on public.calendar_connections;
create policy calendar_connections_own_update on public.calendar_connections for update to authenticated
using(user_id=(select auth.uid()) or (select private.is_admin()))
with check(user_id=(select auth.uid()) or (select private.is_admin()));

drop policy if exists daily_quotes_admin_all on public.daily_quotes;
drop policy if exists daily_quotes_admin_insert on public.daily_quotes;
create policy daily_quotes_admin_insert on public.daily_quotes for insert to authenticated with check((select private.is_admin()));
drop policy if exists daily_quotes_admin_update on public.daily_quotes;
create policy daily_quotes_admin_update on public.daily_quotes for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists mission_engine_settings_admin_all on public.mission_engine_settings;
drop policy if exists mission_engine_settings_admin_insert on public.mission_engine_settings;
create policy mission_engine_settings_admin_insert on public.mission_engine_settings for insert to authenticated with check((select private.is_admin()));
drop policy if exists mission_engine_settings_admin_update on public.mission_engine_settings;
create policy mission_engine_settings_admin_update on public.mission_engine_settings for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists mission_rules_admin_all on public.mission_rules;
drop policy if exists mission_rules_admin_insert on public.mission_rules;
create policy mission_rules_admin_insert on public.mission_rules for insert to authenticated with check((select private.is_admin()));
drop policy if exists mission_rules_admin_update on public.mission_rules;
create policy mission_rules_admin_update on public.mission_rules for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists forms_admin_all on public.form_definitions;
drop policy if exists forms_admin_insert on public.form_definitions;
create policy forms_admin_insert on public.form_definitions for insert to authenticated with check((select private.is_admin()));
drop policy if exists forms_admin_update on public.form_definitions;
create policy forms_admin_update on public.form_definitions for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists form_versions_admin_all on public.form_versions;
drop policy if exists form_versions_admin_insert on public.form_versions;
create policy form_versions_admin_insert on public.form_versions for insert to authenticated with check((select private.is_admin()));
drop policy if exists form_versions_admin_update on public.form_versions;
create policy form_versions_admin_update on public.form_versions for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists form_fields_admin_all on public.form_fields;
drop policy if exists form_fields_admin_insert on public.form_fields;
create policy form_fields_admin_insert on public.form_fields for insert to authenticated with check((select private.is_admin()));
drop policy if exists form_fields_admin_update on public.form_fields;
create policy form_fields_admin_update on public.form_fields for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists notification_rules_admin_all on public.notification_rules;
drop policy if exists notification_rules_admin_insert on public.notification_rules;
create policy notification_rules_admin_insert on public.notification_rules for insert to authenticated with check((select private.is_admin()));
drop policy if exists notification_rules_admin_update on public.notification_rules;
create policy notification_rules_admin_update on public.notification_rules for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

drop policy if exists integration_settings_admin_all on public.integration_settings;
drop policy if exists integration_settings_admin_insert on public.integration_settings;
create policy integration_settings_admin_insert on public.integration_settings for insert to authenticated with check((select private.is_admin()));
drop policy if exists integration_settings_admin_update on public.integration_settings;
create policy integration_settings_admin_update on public.integration_settings for update to authenticated
using((select private.is_admin())) with check((select private.is_admin()));

-- Índices de soporte para todas las claves externas nuevas consultadas durante
-- borrados, auditoría, formularios, sincronización y trabajo del motor.
create index if not exists app_member_roles_granted_by_idx on public.app_member_roles(granted_by) where granted_by is not null;
create index if not exists audit_events_actor_user_id_idx on public.audit_events(actor_user_id) where actor_user_id is not null;
create index if not exists calendar_events_connection_id_idx on public.calendar_events(connection_id) where connection_id is not null;
create index if not exists calendar_events_created_by_idx on public.calendar_events(created_by) where created_by is not null;
create index if not exists daily_quotes_created_by_idx on public.daily_quotes(created_by) where created_by is not null;
create index if not exists data_transfer_jobs_created_by_idx on public.data_transfer_jobs(created_by);
create index if not exists form_definitions_created_by_idx on public.form_definitions(created_by) where created_by is not null;
create index if not exists form_definitions_updated_by_idx on public.form_definitions(updated_by) where updated_by is not null;
create index if not exists form_submissions_form_id_idx on public.form_submissions(form_id);
create index if not exists form_submissions_form_version_id_idx on public.form_submissions(form_version_id);
create index if not exists form_submissions_submitted_by_idx on public.form_submissions(submitted_by);
create index if not exists form_versions_created_by_idx on public.form_versions(created_by) where created_by is not null;
create index if not exists integration_settings_updated_by_idx on public.integration_settings(updated_by) where updated_by is not null;
create index if not exists mission_comments_author_user_id_idx on public.mission_comments(author_user_id);
create index if not exists mission_engine_settings_updated_by_idx on public.mission_engine_settings(updated_by) where updated_by is not null;
create index if not exists mission_evidence_submitted_by_idx on public.mission_evidence(submitted_by);
create index if not exists mission_rules_updated_by_idx on public.mission_rules(updated_by) where updated_by is not null;
create index if not exists missions_completed_by_idx on public.missions(completed_by) where completed_by is not null;
create index if not exists missions_created_by_idx on public.missions(created_by) where created_by is not null;
create index if not exists notification_deliveries_created_by_idx on public.notification_deliveries(created_by) where created_by is not null;
create index if not exists notification_deliveries_event_key_idx on public.notification_deliveries(event_key);
create index if not exists notification_rules_updated_by_idx on public.notification_rules(updated_by) where updated_by is not null;

commit;
