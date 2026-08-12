begin;

alter table public.daily_quotes
  drop constraint if exists daily_quotes_schedule_exclusive;
alter table public.daily_quotes
  add constraint daily_quotes_schedule_exclusive
  check (override_date is null or month_day is null);

create table if not exists public.daily_quote_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  quote_id bigint not null references public.daily_quotes(id) on delete restrict,
  quote_text_snapshot text not null,
  selection_kind text not null check (selection_kind in ('date','recurring','rotation')),
  assigned_at timestamptz not null default now(),
  primary key (user_id, local_date)
);

create index if not exists daily_quote_assignments_quote_idx
  on public.daily_quote_assignments(quote_id);
create index if not exists daily_quote_assignments_user_recent_idx
  on public.daily_quote_assignments(user_id, local_date desc);

alter table public.daily_quote_assignments enable row level security;

drop policy if exists daily_quote_assignments_select on public.daily_quote_assignments;
create policy daily_quote_assignments_select on public.daily_quote_assignments
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists daily_quote_assignments_insert on public.daily_quote_assignments;
create policy daily_quote_assignments_insert on public.daily_quote_assignments
  for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.daily_quote_assignments to authenticated;
revoke all on public.daily_quote_assignments from anon;

grant delete on public.daily_quotes to authenticated;
drop policy if exists daily_quotes_admin_delete on public.daily_quotes;
create policy daily_quotes_admin_delete on public.daily_quotes
  for delete to authenticated
  using ((select private.is_admin()));

create or replace function public.home_snapshot()
returns jsonb
language plpgsql
volatile
security invoker
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_timezone text;
  v_boundaries jsonb;
  v_day date;
  v_quote_id bigint;
  v_quote_text text;
  v_selection_kind text;
  v_base_count integer := 0;
  v_recent_limit integer := 0;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión para abrir Inicio.' using errcode='42501';
  end if;

  select coalesce(p.timezone,'Europe/Madrid'),
         coalesce(p.greeting_boundaries,'{"morning_start":"05:00","afternoon_start":"12:00","night_start":"20:00"}'::jsonb)
    into v_timezone, v_boundaries
  from (select 1) x
  left join public.user_preferences p on p.user_id=v_user;

  v_day := (now() at time zone v_timezone)::date;

  select a.quote_id, a.quote_text_snapshot, a.selection_kind
    into v_quote_id, v_quote_text, v_selection_kind
  from public.daily_quote_assignments a
  where a.user_id=v_user and a.local_date=v_day;

  if v_quote_id is null then
    select q.id, q.quote_text, 'date'
      into v_quote_id, v_quote_text, v_selection_kind
    from public.daily_quotes q
    where q.active and q.override_date=v_day
    order by q.id
    limit 1;

    if v_quote_id is null then
      select q.id, q.quote_text, 'recurring'
        into v_quote_id, v_quote_text, v_selection_kind
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day=to_char(v_day,'MM-DD')
      order by q.id
      limit 1;
    end if;

    if v_quote_id is null then
      select count(*)::integer into v_base_count
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day is null;
      v_recent_limit := greatest(v_base_count-1,0);

      select q.id, q.quote_text, 'rotation'
        into v_quote_id, v_quote_text, v_selection_kind
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day is null
      order by
        case when q.id in (
          select a.quote_id
          from public.daily_quote_assignments a
          where a.user_id=v_user and a.local_date<v_day
          order by a.local_date desc
          limit v_recent_limit
        ) then 1 else 0 end,
        md5(v_day::text||':'||q.id::text)
      limit 1;
    end if;

    if v_quote_id is not null then
      insert into public.daily_quote_assignments(user_id,local_date,quote_id,quote_text_snapshot,selection_kind)
      values(v_user,v_day,v_quote_id,v_quote_text,v_selection_kind)
      on conflict (user_id,local_date) do nothing;

      select a.quote_id, a.quote_text_snapshot, a.selection_kind
        into v_quote_id, v_quote_text, v_selection_kind
      from public.daily_quote_assignments a
      where a.user_id=v_user and a.local_date=v_day;
    end if;
  end if;

  return jsonb_build_object(
    'timezone',v_timezone,
    'greeting_boundaries',v_boundaries,
    'quote',case when v_quote_id is null then null else jsonb_build_object(
      'id',v_quote_id,'text',v_quote_text,'date',v_day,'selection_kind',v_selection_kind
    ) end,
    'missions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'rule_key',m.rule_key,'mission_type',m.mission_type,'state',m.state,'priority',m.priority,
      'priority_score',m.priority_score,'title',m.title,'description',m.description,'action_target',m.action_target,
      'due_at',m.due_at,'estimated_duration_minutes',m.estimated_duration_minutes,'calendar_block',m.calendar_block
    ) order by case m.priority when 'urgent' then 1 when 'priority' then 2 else 3 end,
      case when m.state='not_done' then 0 else 1 end,m.due_at nulls last,m.priority_score desc)
      from (select * from public.missions where state in ('available','in_progress','postponed','not_done')
        and (postponed_until is null or postponed_until<=now()) order by
        case priority when 'urgent' then 1 when 'priority' then 2 else 3 end,
        case when state='not_done' then 0 else 1 end,due_at nulls last,priority_score desc limit 6) m),'[]'::jsonb),
    'mission_engine',(select to_jsonb(s)-'singleton'-'updated_by' from public.mission_engine_settings s where singleton)
  );
end;
$function$;

revoke all on function public.home_snapshot() from anon;
grant execute on function public.home_snapshot() to authenticated;

create or replace function public.preview_daily_quote(p_date date)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  v_user uuid := (select auth.uid());
  v_quote_id bigint;
  v_quote_text text;
  v_selection_kind text;
  v_base_count integer := 0;
  v_recent_limit integer := 0;
  v_assigned boolean := false;
begin
  if not (select private.is_admin()) then
    raise exception 'No tienes permiso para previsualizar frases.' using errcode='42501';
  end if;
  if p_date is null then
    raise exception 'Fecha no válida.' using errcode='22023';
  end if;

  select a.quote_id,a.quote_text_snapshot,a.selection_kind,true
    into v_quote_id,v_quote_text,v_selection_kind,v_assigned
  from public.daily_quote_assignments a
  where a.user_id=v_user and a.local_date=p_date;

  if v_quote_id is null then
    select q.id,q.quote_text,'date'
      into v_quote_id,v_quote_text,v_selection_kind
    from public.daily_quotes q
    where q.active and q.override_date=p_date
    order by q.id limit 1;

    if v_quote_id is null then
      select q.id,q.quote_text,'recurring'
        into v_quote_id,v_quote_text,v_selection_kind
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day=to_char(p_date,'MM-DD')
      order by q.id limit 1;
    end if;

    if v_quote_id is null then
      select count(*)::integer into v_base_count
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day is null;
      v_recent_limit := greatest(v_base_count-1,0);

      select q.id,q.quote_text,'rotation'
        into v_quote_id,v_quote_text,v_selection_kind
      from public.daily_quotes q
      where q.active and q.override_date is null and q.month_day is null
      order by
        case when q.id in (
          select a.quote_id from public.daily_quote_assignments a
          where a.user_id=v_user and a.local_date<p_date
          order by a.local_date desc limit v_recent_limit
        ) then 1 else 0 end,
        md5(p_date::text||':'||q.id::text)
      limit 1;
    end if;
  end if;

  return case when v_quote_id is null then null else jsonb_build_object(
    'id',v_quote_id,'text',v_quote_text,'date',p_date,'selection_kind',v_selection_kind,'assigned',v_assigned
  ) end;
end;
$function$;

revoke all on function public.preview_daily_quote(date) from anon;
grant execute on function public.preview_daily_quote(date) to authenticated;

commit;
