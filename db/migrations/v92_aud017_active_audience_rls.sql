begin;

-- AUD-017 · La separación no depende únicamente del frontend.
-- RLS limita la bandeja propia a la audiencia de la experiencia activa,
-- de modo que contadores y cualquier consulta futura heredan el mismo contrato.

create or replace function private.current_notification_audience()
returns text
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when exists (
      select 1
      from public.user_preferences up
      where up.user_id=(select auth.uid())
        and up.preferred_context='student'
    ) then 'student'
    when not exists (
      select 1
      from public.app_member_roles ar
      where ar.user_id=(select auth.uid())
        and ar.active
        and ar.role in ('admin','teacher_admin','teacher')
    ) and exists (
      select 1
      from public.app_member_roles ar
      where ar.user_id=(select auth.uid())
        and ar.active
        and ar.role='student'
    ) then 'student'
    else 'staff'
  end
$function$;
revoke all on function private.current_notification_audience() from public,anon,authenticated;

drop policy if exists internal_notifications_own_select on public.internal_notifications;
create policy internal_notifications_own_select
on public.internal_notifications
for select
to authenticated
using (
  target_user_id=(select auth.uid())
  and audience=(select private.current_notification_audience())
);

drop policy if exists internal_notifications_own_update on public.internal_notifications;
create policy internal_notifications_own_update
on public.internal_notifications
for update
to authenticated
using (
  target_user_id=(select auth.uid())
  and audience=(select private.current_notification_audience())
)
with check (
  target_user_id=(select auth.uid())
  and audience=(select private.current_notification_audience())
);

commit;
