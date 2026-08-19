begin;

-- Follow-up for the class confirmation window helper introduced in v99.
-- The portal RPC is SECURITY INVOKER, so authenticated users must be able
-- to execute this pure timestamp helper. Keep it inaccessible to anon/public.
create or replace function private.class_confirmation_opens_at(p_start_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_start_at is null then null
    else p_start_at - interval '30 minutes'
  end
$$;

revoke all on function private.class_confirmation_opens_at(timestamptz) from public, anon;
grant execute on function private.class_confirmation_opens_at(timestamptz) to authenticated;

commit;
