begin;

-- P25 · repeat: materializa una única siguiente ocurrencia válida como upcoming.

create or replace function private.next_repeat_mission_date(
  p_rule_key text,
  p_after_date date
) returns date
language plpgsql
stable
security invoker
set search_path=''
as $function$
declare
  v_days smallint[];
  v_candidate date;
  v_i integer;
begin
  select r.valid_days into v_days
  from public.mission_rules r
  where r.rule_key=p_rule_key;

  if not found then return null; end if;

  for v_i in 1..370 loop
    v_candidate:=p_after_date+v_i;
    if cardinality(v_days)=0
       or extract(isodow from v_candidate)::integer=any(v_days) then
      return v_candidate;
    end if;
  end loop;
  return null;
end;
$function$;

create or replace function private.enqueue_repeat_successors(
  p_now timestamptz default now()
) returns integer
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_timezone text:=coalesce(
    (select s.timezone from public.mission_engine_settings s where s.singleton),
    'Europe/Madrid'
  );
  v_row record;
  v_next_date date;
  v_available timestamptz;
  v_due timestamptz;
  v_inserted integer:=0;
  v_rows integer:=0;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para generar repeticiones de misiones.' using errcode='42501';
  end if;

  if p_now is null then p_now:=now(); end if;

  for v_row in
    select m.rule_key,m.source_id,r.*
    from public.missions m
    join public.mission_rules r on r.rule_key=m.rule_key
    where m.state='expired'
      and r.enabled
      and r.failure_behavior='repeat'
      and r.evaluator='daily_template'
      and m.source_domain='daily'
      and m.source_id ~ '^\d{4}-\d{2}-\d{2}$'
  loop
    v_next_date:=private.next_repeat_mission_date(v_row.rule_key,v_row.source_id::date);
    if v_next_date is null then continue; end if;

    v_available:=((v_next_date::text||' 00:00:00')::timestamp at time zone v_timezone);
    v_due:=((v_next_date::text||' 23:59:59')::timestamp at time zone v_timezone);

    insert into public.missions(
      rule_key,mission_type,state,priority,priority_score,title,description,dedupe_key,
      source_domain,source_id,action_target,origin,available_at,due_at,
      estimated_duration_minutes,weight,evidence_requirement,auto_complete,calendar_block
    ) values(
      v_row.rule_key,v_row.mission_type,'upcoming',v_row.priority,v_row.priority_score,
      v_row.name,coalesce(v_row.criteria->>'instructions',v_row.description),
      v_row.rule_key||':'||v_next_date,
      'daily',v_next_date::text,coalesce(v_row.criteria->>'action_target','home'),
      jsonb_build_object('date',v_next_date,'repeat_of',v_row.source_id),
      v_available,v_due,v_row.estimated_duration_minutes,v_row.weight,
      v_row.evidence_requirement,v_row.auto_complete,v_row.calendar_block
    ) on conflict(dedupe_key) where dedupe_key is not null do nothing;
    get diagnostics v_rows = row_count;
    v_inserted:=v_inserted+v_rows;
  end loop;

  return v_inserted;
end;
$function$;

create or replace function private.run_mission_engine_p25(
  p_now timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_result jsonb;
  v_activated integer:=0;
  v_repeat_created integer:=0;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar el motor de misiones.' using errcode='42501';
  end if;
  if p_now is null then p_now:=now(); end if;

  update public.missions
  set state='available',updated_at=p_now
  where state='upcoming' and available_at<=p_now;
  get diagnostics v_activated = row_count;

  v_result:=private.run_mission_engine(p_now);
  v_repeat_created:=private.enqueue_repeat_successors(p_now);

  return v_result || jsonb_build_object(
    'upcoming_activated',v_activated,
    'repeat_created',v_repeat_created
  );
end;
$function$;

revoke all on function private.next_repeat_mission_date(text,date) from public,anon;
revoke all on function private.enqueue_repeat_successors(timestamptz) from public,anon;
revoke all on function private.run_mission_engine_p25(timestamptz) from public,anon;
grant execute on function private.next_repeat_mission_date(text,date) to authenticated;
grant execute on function private.enqueue_repeat_successors(timestamptz) to authenticated;
grant execute on function private.run_mission_engine_p25(timestamptz) to authenticated;

create or replace function public.refresh_missions()
returns integer
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar misiones.' using errcode='42501';
  end if;
  v_result:=private.run_mission_engine_p25(now());
  return coalesce((v_result->>'generated')::integer,0)
       + coalesce((v_result->>'repeat_created')::integer,0);
end;
$function$;

revoke all on function public.refresh_missions() from public,anon;
grant execute on function public.refresh_missions() to authenticated;

-- Crea el sucesor de cualquier repeat que v60 haya archivado durante el backfill.
select private.run_mission_engine_p25(now());

-- Actualiza el job por nombre usando la API de pg_cron, sin escribir cron.job.
select cron.schedule(
  'cya-mission-engine',
  '*/15 * * * *',
  'select private.run_mission_engine_p25();'
);

commit;
