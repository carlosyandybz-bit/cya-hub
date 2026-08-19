begin;

-- Follow-up for the class confirmation window helper introduced in v99.
-- Keep the original 08:00 (Europe/Madrid) day-before rule and restore the
-- EXECUTE privilege required by the SECURITY INVOKER student portal RPC.
create or replace function private.class_confirmation_opens_at(p_scheduled_start_at timestamptz)
returns timestamptz
language sql
stable
set search_path=''
as $function$
  select (
    (((p_scheduled_start_at at time zone 'Europe/Madrid')::date - 1) + time '08:00')
    at time zone 'Europe/Madrid'
  );
$function$;

revoke all on function private.class_confirmation_opens_at(timestamptz) from public, anon;
grant execute on function private.class_confirmation_opens_at(timestamptz) to authenticated;

commit;
