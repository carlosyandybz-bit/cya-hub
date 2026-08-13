begin;

-- P25 · Misiones: vencimiento canónico, ejecución server-side y cron real.

alter table public.mission_engine_settings
  add column if not exists timezone text not null default 'Europe/Madrid';

create or replace function private.validate_mission_engine_timezone()
returns trigger
language plpgsql
security invoker
set search_path=''
as $function$
begin
  if new.timezone is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names tz
       where tz.name = new.timezone
     ) then
    raise exception 'Zona horaria no válida: %', coalesce(new.timezone,'')
      using errcode='22023';
  end if;
  return new;
end;
$function$;

drop trigger if exists mission_engine_settings_timezone_guard on public.mission_engine_settings;
create trigger mission_engine_settings_timezone_guard
before insert or update of timezone on public.mission_engine_settings
for each row execute function private.validate_mission_engine_timezone();

update public.mission_engine_settings
set timezone='Europe/Madrid'
where singleton and (timezone is null or btrim(timezone)='');

alter table public.missions
  drop constraint if exists missions_state_check;
alter table public.missions
  add constraint missions_state_check
  check (state in (
    'upcoming','available','in_progress','blocked','postponed',
    'completed','not_done','not_applicable','cancelled',
    'completed_automatically','expired'
  ));

alter table public.missions
  add column if not exists expired_at timestamptz;

alter table public.missions
  drop constraint if exists missions_expired_at_check;
alter table public.missions
  add constraint missions_expired_at_check
  check (state <> 'expired' or expired_at is not null);

create index if not exists missions_expired_history_idx
  on public.missions(expired_at desc)
  where state='expired';

create or replace function private.run_mission_engine(p_now timestamptz default now())
returns jsonb
language plpgsql
security invoker
set search_path=''
as $function$
declare
  v_rule public.mission_rules;
  v_generated integer:=0;
  v_awakened integer:=0;
  v_not_done integer:=0;
  v_expired integer:=0;
  v_repeat_expired integer:=0;
  v_row record;
  v_timezone text:=coalesce(
    (select s.timezone from public.mission_engine_settings s where s.singleton),
    'Europe/Madrid'
  );
  v_today date;
  v_dow integer;
  v_due timestamptz;
  v_enabled boolean:=coalesce(
    (select s.enabled from public.mission_engine_settings s where s.singleton),
    true
  );
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar el motor de misiones.' using errcode='42501';
  end if;

  if p_now is null then p_now:=now(); end if;
  if not v_enabled then
    return jsonb_build_object(
      'enabled',false,'generated',0,'awakened',0,'not_done',0,
      'expired',0,'repeat_expired',0,'timezone',v_timezone
    );
  end if;

  v_today:=(p_now at time zone v_timezone)::date;
  v_dow:=extract(isodow from v_today)::integer;

  select * into v_rule
  from public.mission_rules
  where rule_key='classes.pending_close' and enabled;
  if found then
    for v_row in
      select c.id,c.scheduled_start_at,
             array_to_string(array_agg(p.display_name order by p.display_name),' y ') names
      from public.classes c
      join public.class_participants cp on cp.class_id=c.id
      join public.people p on p.id=cp.person_id
      where c.status='finished' and c.pedagogy_closed_at is null
      group by c.id,c.scheduled_start_at
    loop
      perform private.upsert_mission(
        v_rule,'classes.pending_close:'||v_row.id,
        'Cerrar clase · '||v_row.names,'Completa el cierre pedagógico de la clase.',
        'class',v_row.id::text,p_now+interval '4 hours','live',
        jsonb_build_object('class_id',v_row.id)
      );
      v_generated:=v_generated+1;
    end loop;

    update public.missions m
    set state='completed_automatically',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where m.rule_key=v_rule.rule_key
      and m.state not in (
        'completed','completed_automatically','cancelled','not_applicable',
        'not_done','expired'
      )
      and not exists(
        select 1 from public.classes c
        where c.id=m.source_id::bigint
          and c.status='finished'
          and c.pedagogy_closed_at is null
      );
  end if;

  select * into v_rule
  from public.mission_rules
  where rule_key='bonuses.low_or_expiring' and enabled;
  if found then
    for v_row in
      select g.id,g.label,g.expires_at,
             coalesce(sum(cm.delta_minutes),0)::integer balance,
             array_to_string(array_agg(distinct p.display_name),' y ') names
      from public.credit_grants g
      join public.credit_grant_members gm on gm.grant_id=g.id
      join public.people p on p.id=gm.person_id
      left join public.credit_movements cm on cm.grant_id=g.id
      where g.status='active'
      group by g.id,g.label,g.expires_at
      having coalesce(sum(cm.delta_minutes),0)
               <=coalesce((v_rule.criteria->>'balance_minutes')::integer,60)
          or g.expires_at
               <=p_now+make_interval(days=>coalesce((v_rule.criteria->>'expiry_days')::integer,14))
    loop
      perform private.upsert_mission(
        v_rule,'bonuses.low_or_expiring:'||v_row.id,
        'Revisar bono · '||v_row.names,
        case when v_row.balance<=0
          then 'El bono no tiene saldo disponible.'
          else 'Quedan '||v_row.balance||' minutos.'
        end,
        'credit_grant',v_row.id::text,
        coalesce(v_row.expires_at,p_now+interval '2 days'),
        'credits',jsonb_build_object('grant_id',v_row.id,'balance_minutes',v_row.balance)
      );
      v_generated:=v_generated+1;
    end loop;

    update public.missions m
    set state='completed_automatically',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where m.rule_key=v_rule.rule_key
      and m.state not in (
        'completed','completed_automatically','cancelled','not_applicable',
        'not_done','expired'
      )
      and not exists(
        select 1
        from public.credit_grants g
        where g.id=m.source_id::bigint
          and g.status='active'
          and (
            coalesce(
              (select sum(cm.delta_minutes)
               from public.credit_movements cm
               where cm.grant_id=g.id),0
            )<=coalesce((v_rule.criteria->>'balance_minutes')::integer,60)
            or g.expires_at<=p_now+make_interval(
              days=>coalesce((v_rule.criteria->>'expiry_days')::integer,14)
            )
          )
      );
  end if;

  select * into v_rule
  from public.mission_rules
  where rule_key='students.incomplete_profile' and enabled;
  if found then
    for v_row in
      select p.id,p.display_name
      from public.people p
      join public.student_profiles sp on sp.person_id=p.id
      where p.active and sp.active and (
        nullif(btrim(coalesce(p.first_name,'')),'') is null
        or (
          nullif(btrim(coalesce(p.phone,'')),'') is null
          and nullif(btrim(coalesce(p.email,'')),'') is null
        )
        or not exists(
          select 1
          from public.student_dance_profiles sdp
          where sdp.person_id=p.id and sdp.active
        )
      )
    loop
      perform private.upsert_mission(
        v_rule,'students.incomplete_profile:'||v_row.id,
        'Completar perfil · '||v_row.display_name,
        'Faltan datos personales o de baile que CYA necesita reutilizar.',
        'person',v_row.id::text,p_now+interval '3 days',
        'students',jsonb_build_object('person_id',v_row.id)
      );
      v_generated:=v_generated+1;
    end loop;

    update public.missions m
    set state='completed_automatically',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where m.rule_key=v_rule.rule_key
      and m.state not in (
        'completed','completed_automatically','cancelled','not_applicable',
        'not_done','expired'
      )
      and not exists(
        select 1
        from public.people p
        join public.student_profiles sp on sp.person_id=p.id
        where p.id=m.source_id::bigint
          and p.active and sp.active and (
            nullif(btrim(coalesce(p.first_name,'')),'') is null
            or (
              nullif(btrim(coalesce(p.phone,'')),'') is null
              and nullif(btrim(coalesce(p.email,'')),'') is null
            )
            or not exists(
              select 1
              from public.student_dance_profiles sdp
              where sdp.person_id=p.id and sdp.active
            )
          )
      );
  end if;

  select * into v_rule
  from public.mission_rules
  where rule_key='corrections.missing_explanation' and enabled;
  if found then
    for v_row in
      select t.id,t.title
      from public.teaching_contents t
      where t.active
        and t.content_type='correction'
        and (
          t.completion_status='incomplete'
          or nullif(btrim(coalesce(t.description,'')),'') is null
          or nullif(btrim(coalesce(t.correction_guidance,'')),'') is null
        )
    loop
      perform private.upsert_mission(
        v_rule,'corrections.missing_explanation:'||v_row.id,
        'Completar corrección · '||v_row.title,
        'Añade la explicación y la forma de corregirla.',
        'teaching_content',v_row.id::text,p_now+interval '5 days',
        'teaching',jsonb_build_object('content_id',v_row.id)
      );
      v_generated:=v_generated+1;
    end loop;

    update public.missions m
    set state='completed_automatically',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where m.rule_key=v_rule.rule_key
      and m.state not in (
        'completed','completed_automatically','cancelled','not_applicable',
        'not_done','expired'
      )
      and not exists(
        select 1
        from public.teaching_contents t
        where t.id=m.source_id::bigint
          and t.active
          and t.content_type='correction'
          and (
            t.completion_status='incomplete'
            or nullif(btrim(coalesce(t.description,'')),'') is null
            or nullif(btrim(coalesce(t.correction_guidance,'')),'') is null
          )
      );
  end if;

  select * into v_rule
  from public.mission_rules
  where rule_key='classes.preparation_needed' and enabled;
  if found then
    for v_row in
      select c.id,c.scheduled_start_at,
             array_to_string(array_agg(p.display_name order by p.display_name),' y ') names
      from public.classes c
      join public.class_participants cp on cp.class_id=c.id
      join public.people p on p.id=cp.person_id
      where c.status='scheduled'
        and c.scheduled_start_at between p_now
          and p_now+make_interval(
            hours=>coalesce((v_rule.criteria->>'hours_ahead')::integer,36)
          )
        and not exists(
          select 1
          from public.student_content_assignments a
          where a.source_class_id=c.id
        )
      group by c.id,c.scheduled_start_at
    loop
      perform private.upsert_mission(
        v_rule,'classes.preparation_needed:'||v_row.id,
        'Preparar clase · '||v_row.names,
        'Revisa objetivos, correcciones y contenido antes de la clase.',
        'class',v_row.id::text,
        v_row.scheduled_start_at-make_interval(
          mins=>coalesce((v_rule.criteria->>'preparation_minutes')::integer,10)
        ),
        'live',jsonb_build_object('class_id',v_row.id)
      );
      v_generated:=v_generated+1;
    end loop;

    update public.missions m
    set state='completed_automatically',
        completed_at=coalesce(completed_at,p_now),
        updated_at=p_now
    where m.rule_key=v_rule.rule_key
      and m.state not in (
        'completed','completed_automatically','cancelled','not_applicable',
        'not_done','expired'
      )
      and not exists(
        select 1
        from public.classes c
        where c.id=m.source_id::bigint
          and c.status='scheduled'
          and c.scheduled_start_at between p_now
            and p_now+make_interval(
              hours=>coalesce((v_rule.criteria->>'hours_ahead')::integer,36)
            )
          and not exists(
            select 1
            from public.student_content_assignments a
            where a.source_class_id=c.id
          )
      );
  end if;

  for v_rule in
    select *
    from public.mission_rules
    where enabled and evaluator='daily_template'
  loop
    if cardinality(v_rule.valid_days)=0 or v_dow=any(v_rule.valid_days) then
      v_due:=((v_today::text||' 23:59:59')::timestamp at time zone v_timezone);
      perform private.upsert_mission(
        v_rule,v_rule.rule_key||':'||v_today,
        v_rule.name,coalesce(v_rule.criteria->>'instructions',v_rule.description),
        'daily',v_today::text,v_due,
        coalesce(v_rule.criteria->>'action_target','home'),
        jsonb_build_object('date',v_today)
      );
      v_generated:=v_generated+1;
    end if;
  end loop;

  update public.missions
  set state='available',postponed_until=null,updated_at=p_now
  where state='postponed'
    and postponed_until is not null
    and postponed_until<=p_now;
  get diagnostics v_awakened = row_count;

  update public.missions m
  set state='not_done',updated_at=p_now
  from public.mission_rules r
  where r.rule_key=m.rule_key
    and r.failure_behavior='mark_not_done'
    and m.state in ('available','in_progress')
    and m.due_at is not null
    and m.due_at<p_now;
  get diagnostics v_not_done = row_count;

  update public.missions m
  set state='expired',
      expired_at=coalesce(m.expired_at,p_now),
      postponed_until=null,
      updated_at=p_now
  from public.mission_rules r
  where r.rule_key=m.rule_key
    and r.failure_behavior='expire'
    and m.state in ('available','in_progress')
    and m.due_at is not null
    and m.due_at<p_now;
  get diagnostics v_expired = row_count;

  update public.missions m
  set state='expired',
      expired_at=coalesce(m.expired_at,p_now),
      postponed_until=null,
      updated_at=p_now
  from public.mission_rules r
  where r.rule_key=m.rule_key
    and r.failure_behavior='repeat'
    and m.state in ('available','in_progress')
    and m.due_at is not null
    and m.due_at<p_now;
  get diagnostics v_repeat_expired = row_count;

  return jsonb_build_object(
    'enabled',true,
    'generated',v_generated,
    'awakened',v_awakened,
    'not_done',v_not_done,
    'expired',v_expired,
    'repeat_expired',v_repeat_expired,
    'timezone',v_timezone,
    'local_date',v_today
  );
end;
$function$;

revoke all on function private.run_mission_engine(timestamptz)
  from public,anon;
grant execute on function private.run_mission_engine(timestamptz)
  to authenticated;

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
  v_result:=private.run_mission_engine(now());
  return coalesce((v_result->>'generated')::integer,0);
end;
$function$;

revoke all on function public.refresh_missions() from public,anon;
grant execute on function public.refresh_missions() to authenticated;

-- Backfill semántico: no usa IDs generados ni borra historial.
update public.missions m
set state='expired',
    expired_at=coalesce(m.expired_at,now()),
    postponed_until=null,
    updated_at=now()
from public.mission_rules r
where r.rule_key=m.rule_key
  and r.failure_behavior in ('expire','repeat')
  and m.state in ('available','in_progress')
  and m.due_at is not null
  and m.due_at<now();

-- Ejecuta una primera pasada server-side para generar la ocurrencia vigente
-- y aplicar reglas restantes sin necesidad de abrir la aplicación.
select private.run_mission_engine(now());

-- Programación idempotente por nombre. No se escribe directamente en cron.job.
select cron.schedule(
  'cya-mission-engine',
  '*/15 * * * *',
  'select private.run_mission_engine();'
);

commit;
