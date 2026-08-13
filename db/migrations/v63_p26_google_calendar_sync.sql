begin;

-- P26 · Agenda + Google Calendar.
-- CYA remains authoritative for classes, missions and marketing events.
-- External calendars are private to the connection owner and credentials are
-- stored only as server-encrypted envelopes (never plaintext OAuth tokens).

alter table public.calendar_connections
  add column if not exists connected_at timestamptz,
  add column if not exists disconnected_at timestamptz,
  add column if not exists sync_started_at timestamptz,
  add column if not exists sync_completed_at timestamptz,
  add column if not exists sync_lock_token uuid,
  add column if not exists sync_error_count integer not null default 0;

alter table public.calendar_events
  add column if not exists remote_updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

alter table public.calendar_connections
  drop constraint if exists calendar_connections_credential_envelope_chk;
alter table public.calendar_connections
  add constraint calendar_connections_credential_envelope_chk
  check (credential_reference is null or credential_reference like 'enc:v1:%') not valid;
alter table public.calendar_connections
  validate constraint calendar_connections_credential_envelope_chk;

-- v14 used global uniqueness. P26 scopes mappings by connection so Carlos and
-- Andy can connect calendars independently without colliding with each other.
drop index if exists public.calendar_external_event_uq;
drop index if exists public.calendar_source_event_uq;
create unique index if not exists calendar_external_event_connection_uq
  on public.calendar_events(connection_id, provider, external_calendar_id, external_event_id)
  where connection_id is not null and external_event_id is not null;
create unique index if not exists calendar_source_event_connection_uq
  on public.calendar_events(connection_id, source_type, source_id)
  where connection_id is not null and source_id is not null and source_type <> 'external';
create index if not exists calendar_events_connection_range_idx
  on public.calendar_events(connection_id, starts_at, ends_at);
create index if not exists calendar_events_connection_status_idx
  on public.calendar_events(connection_id, sync_status, updated_at desc);

-- A connected personal calendar is not team-wide data. Staff can still access
-- connection-less CYA rows, but connection-bound rows belong to that user only.
drop policy if exists calendar_events_staff_all on public.calendar_events;
drop policy if exists calendar_events_owner_select on public.calendar_events;
drop policy if exists calendar_events_owner_insert on public.calendar_events;
drop policy if exists calendar_events_owner_update on public.calendar_events;

create policy calendar_events_owner_select on public.calendar_events
for select to authenticated
using (
  (select private.is_staff())
  and (
    connection_id is null
    or exists (
      select 1
      from public.calendar_connections cc
      where cc.id = calendar_events.connection_id
        and cc.user_id = (select auth.uid())
    )
  )
);

create policy calendar_events_owner_insert on public.calendar_events
for insert to authenticated
with check (
  (select private.is_staff())
  and (
    connection_id is null
    or exists (
      select 1
      from public.calendar_connections cc
      where cc.id = calendar_events.connection_id
        and cc.user_id = (select auth.uid())
    )
  )
);

create policy calendar_events_owner_update on public.calendar_events
for update to authenticated
using (
  (select private.is_staff())
  and (
    connection_id is null
    or exists (
      select 1
      from public.calendar_connections cc
      where cc.id = calendar_events.connection_id
        and cc.user_id = (select auth.uid())
    )
  )
)
with check (
  (select private.is_staff())
  and (
    connection_id is null
    or exists (
      select 1
      from public.calendar_connections cc
      where cc.id = calendar_events.connection_id
        and cc.user_id = (select auth.uid())
    )
  )
);

-- Concurrency lock: two browser tabs or repeated taps cannot run overlapping
-- syncs for the same connection. A stale lock self-recovers after 15 minutes.
create or replace function public.begin_calendar_sync(p_connection_id bigint)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null or not (select private.is_staff()) then
    raise exception 'No tienes permiso para sincronizar calendarios.' using errcode='42501';
  end if;

  update public.calendar_connections
  set sync_started_at = now(),
      sync_lock_token = v_token,
      last_error = null,
      updated_at = now()
  where id = p_connection_id
    and user_id = (select auth.uid())
    and status = 'connected'
    and sync_enabled = true
    and (sync_lock_token is null or sync_started_at < now() - interval '15 minutes');

  if not found then return null; end if;
  return v_token;
end;
$$;

create or replace function public.finish_calendar_sync(
  p_connection_id bigint,
  p_lock_token uuid,
  p_sync_cursor text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.calendar_connections
  set sync_cursor = p_sync_cursor,
      last_synced_at = now(),
      sync_completed_at = now(),
      sync_started_at = null,
      sync_lock_token = null,
      sync_error_count = 0,
      last_error = null,
      updated_at = now()
  where id = p_connection_id
    and user_id = (select auth.uid())
    and sync_lock_token = p_lock_token;
  return found;
end;
$$;

create or replace function public.fail_calendar_sync(
  p_connection_id bigint,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.calendar_connections
  set sync_completed_at = now(),
      sync_started_at = null,
      sync_lock_token = null,
      sync_error_count = sync_error_count + 1,
      last_error = left(coalesce(nullif(btrim(p_error), ''), 'Error de sincronización'), 1000),
      status = case when sync_error_count + 1 >= 5 then 'error' else status end,
      updated_at = now()
  where id = p_connection_id
    and user_id = (select auth.uid())
    and sync_lock_token = p_lock_token;
  return found;
end;
$$;

-- External personal events are visible in Agenda only to the owner of the
-- connection. Shared CYA classes/missions/events keep their current semantics.
create or replace function public.calendar_snapshot(p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para consultar la agenda de equipo.' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from or p_to-p_from>interval '370 days' then raise exception 'Rango de agenda no válido.' using errcode='22023'; end if;
  return jsonb_build_object(
    'classes',coalesce((
      select jsonb_agg(class_item order by starts_at)
      from (
        select c.scheduled_start_at starts_at,jsonb_build_object(
          'id',c.id,'type','class','title',array_to_string(array_agg(p.display_name order by p.display_name),' y '),
          'starts_at',c.scheduled_start_at,'ends_at',c.scheduled_start_at+make_interval(mins=>c.duration_minutes),'status',c.status
        ) class_item
        from public.classes c
        join public.class_participants cp on cp.class_id=c.id
        join public.people p on p.id=cp.person_id
        where c.status<>'cancelled' and c.scheduled_start_at<p_to
          and c.scheduled_start_at+make_interval(mins=>c.duration_minutes)>p_from
        group by c.id,c.scheduled_start_at,c.duration_minutes,c.status
      ) class_rows
    ),'[]'::jsonb),
    'missions',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'type','mission','title',m.title,'starts_at',m.calendar_starts_at,
      'ends_at',m.calendar_ends_at,'status',m.state) order by m.calendar_starts_at)
      from public.missions m where m.calendar_starts_at is not null and m.calendar_ends_at>p_from and m.calendar_starts_at<p_to
      and m.state not in ('cancelled','completed','completed_automatically','not_applicable','expired')),'[]'::jsonb),
    'marketing_events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'type','event','title',e.title,'starts_at',e.starts_at,
      'ends_at',coalesce(e.ends_at,e.starts_at+interval '1 hour'),'status',e.status) order by e.starts_at)
      from public.marketing_events e where e.status<>'cancelled' and e.starts_at<p_to and coalesce(e.ends_at,e.starts_at+interval '1 hour')>p_from),'[]'::jsonb),
    'external_events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'type','external','title',e.title,'starts_at',e.starts_at,'ends_at',e.ends_at,
      'status',e.sync_status,'external_event_id',e.external_event_id,'metadata',e.metadata
    ) order by e.starts_at)
      from public.calendar_events e
      join public.calendar_connections cc on cc.id=e.connection_id
      where e.source_type='external'
        and cc.user_id=(select auth.uid())
        and cc.status in ('connected','paused','error')
        and e.starts_at<p_to and e.ends_at>p_from and e.sync_status<>'ignored'),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.begin_calendar_sync(bigint) from public, anon;
revoke all on function public.finish_calendar_sync(bigint,uuid,text) from public, anon;
revoke all on function public.fail_calendar_sync(bigint,uuid,text) from public, anon;
grant execute on function public.begin_calendar_sync(bigint) to authenticated;
grant execute on function public.finish_calendar_sync(bigint,uuid,text) to authenticated;
grant execute on function public.fail_calendar_sync(bigint,uuid,text) to authenticated;

update public.integration_settings
set public_config = coalesce(public_config,'{}'::jsonb) || jsonb_build_object(
      'sync','two_way',
      'idempotent',true,
      'authority','cya',
      'external_event_privacy','connection_owner',
      'conflict_policy','explicit_keep_cya'
    ),
    updated_at = now()
where integration_key='google_calendar';

commit;
