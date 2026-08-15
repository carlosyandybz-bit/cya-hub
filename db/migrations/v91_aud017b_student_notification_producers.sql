begin;

-- AUD-017B · Productores reales para la experiencia alumno.
-- Reutiliza P27, pero todos estos eventos declaran recipients=['student'].

insert into public.notification_rules(
  event_key,label,enabled,channels,recipients,anticipation_minutes,template,settings
) values
  ('student.class.upcoming','Próxima clase',true,array['internal']::text[],'["student"]'::jsonb,30,'Tu clase empieza pronto.','{"groupable":true}'::jsonb),
  ('student.class.changed','Cambio en una clase',true,array['internal']::text[],'["student"]'::jsonb,0,'Hay una novedad en una de tus clases.','{"groupable":true}'::jsonb),
  ('student.training.available','Nuevo contenido en tu formación',true,array['internal']::text[],'["student"]'::jsonb,0,'Tienes nuevo contenido disponible.','{"groupable":true}'::jsonb),
  ('student.credit.low','Bono con poco saldo',true,array['internal']::text[],'["student"]'::jsonb,0,'Tu bono tiene poco saldo disponible.','{"groupable":true}'::jsonb),
  ('student.credit.exhausted','Bono agotado',true,array['internal']::text[],'["student"]'::jsonb,0,'Tu bono se ha agotado.','{"groupable":true}'::jsonb),
  ('student.credit.expiring','Bono próximo a caducar',true,array['internal']::text[],'["student"]'::jsonb,20160,'Tu bono caduca pronto.','{"groupable":true}'::jsonb)
on conflict(event_key) do update set
  label=excluded.label,
  enabled=excluded.enabled,
  channels=excluded.channels,
  recipients=excluded.recipients,
  anticipation_minutes=excluded.anticipation_minutes,
  template=excluded.template,
  settings=public.notification_rules.settings || excluded.settings,
  updated_at=now();

create or replace function private.aud017_notify_student_class_participant()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_class public.classes%rowtype;
  v_user uuid;
  v_body text;
begin
  select * into v_class from public.classes where id=new.class_id;
  select auth_user_id into v_user from public.people where id=new.person_id and active;
  if v_user is null or not found then return new; end if;
  if v_class.status <> 'scheduled' or v_class.scheduled_start_at <= now() then return new; end if;

  v_body:='Tienes una clase programada para ' || to_char(v_class.scheduled_start_at at time zone 'Europe/Madrid','DD/MM/YYYY HH24:MI') || '.';
  perform private.enqueue_notification(
    'student.class.changed',v_user,'Nueva clase programada',v_body,
    'student:home','class',v_class.id::text || ':scheduled',
    jsonb_build_object('audience','student','class_id',v_class.id,'person_id',new.person_id)
  );
  return new;
end;
$function$;
revoke all on function private.aud017_notify_student_class_participant() from public,anon,authenticated;

drop trigger if exists aud017_notify_student_class_participant on public.class_participants;
create trigger aud017_notify_student_class_participant
after insert on public.class_participants
for each row execute function private.aud017_notify_student_class_participant();

create or replace function private.aud017_notify_student_class_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_title text;
  v_body text;
  v_change_id text;
begin
  if not (
    old.scheduled_start_at is distinct from new.scheduled_start_at
    or old.status is distinct from new.status
    or old.location_text is distinct from new.location_text
    or old.cancelled_at is distinct from new.cancelled_at
  ) then return new; end if;

  if new.status='cancelled' then
    v_title:='Clase cancelada';
    v_body:='Una de tus clases ha sido cancelada.';
  elsif old.scheduled_start_at is distinct from new.scheduled_start_at then
    v_title:='Cambio de horario';
    v_body:='Tu clase ahora está programada para ' || to_char(new.scheduled_start_at at time zone 'Europe/Madrid','DD/MM/YYYY HH24:MI') || '.';
  elsif old.location_text is distinct from new.location_text then
    v_title:='Cambio de ubicación';
    v_body:='Ha cambiado la ubicación de una de tus clases.';
  else
    v_title:='Novedad en tu clase';
    v_body:='Hay un cambio en una de tus clases.';
  end if;

  v_change_id:=new.id::text || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text;
  for v_row in
    select p.id as person_id,p.auth_user_id
    from public.class_participants cp
    join public.people p on p.id=cp.person_id
    where cp.class_id=new.id and p.active and p.auth_user_id is not null
  loop
    perform private.enqueue_notification(
      'student.class.changed',v_row.auth_user_id,v_title,v_body,
      'student:home','class',v_change_id,
      jsonb_build_object('audience','student','class_id',new.id,'person_id',v_row.person_id)
    );
  end loop;
  return new;
end;
$function$;
revoke all on function private.aud017_notify_student_class_change() from public,anon,authenticated;

drop trigger if exists aud017_notify_student_class_change on public.classes;
create trigger aud017_notify_student_class_change
after update of scheduled_start_at,status,location_text,cancelled_at on public.classes
for each row execute function private.aud017_notify_student_class_change();

create or replace function private.aud017_notify_student_training()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user uuid;
  v_title text;
begin
  if new.student_visible_at is null then return new; end if;
  if tg_op='UPDATE' and old.student_visible_at is not null then return new; end if;

  select p.auth_user_id into v_user
  from public.people p
  where p.id=new.person_id and p.active;
  if v_user is null then return new; end if;

  select coalesce(nullif(btrim(tc.title),''),'Nuevo contenido') into v_title
  from public.teaching_contents tc
  where tc.id=new.content_id;

  perform private.enqueue_notification(
    'student.training.available',v_user,'Nuevo contenido en tu formación',
    coalesce(v_title,'Nuevo contenido') || ' ya está disponible para ti.',
    'student:formation','assignment',new.id::text,
    jsonb_build_object('audience','student','person_id',new.person_id,'content_id',new.content_id,'assignment_id',new.id)
  );
  return new;
end;
$function$;
revoke all on function private.aud017_notify_student_training() from public,anon,authenticated;

drop trigger if exists aud017_notify_student_training on public.student_content_assignments;
create trigger aud017_notify_student_training
after insert or update of student_visible_at on public.student_content_assignments
for each row execute function private.aud017_notify_student_training();

create or replace function private.aud017_notify_student_credit_balance()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_balance integer;
  v_row record;
  v_event text;
  v_title text;
  v_body text;
begin
  select coalesce(sum(delta_minutes),0)::integer into v_balance
  from public.credit_movements where grant_id=new.grant_id;

  if v_balance <= 0 then
    v_event:='student.credit.exhausted';
    v_title:='Tu bono se ha agotado';
    v_body:='Ya no quedan minutos disponibles en este bono.';
  elsif v_balance <= 60 then
    v_event:='student.credit.low';
    v_title:='Te queda poco saldo';
    v_body:='Te quedan ' || v_balance::text || ' minutos disponibles en este bono.';
  else
    return new;
  end if;

  for v_row in
    select distinct p.id as person_id,p.auth_user_id
    from public.credit_grant_members gm
    join public.people p on p.id=gm.person_id
    where gm.grant_id=new.grant_id and p.active and p.auth_user_id is not null
  loop
    perform private.enqueue_notification(
      v_event,v_row.auth_user_id,v_title,v_body,
      'student:formation','credit_grant',new.grant_id::text,
      jsonb_build_object('audience','student','person_id',v_row.person_id,'grant_id',new.grant_id,'balance_minutes',v_balance)
    );
  end loop;
  return new;
end;
$function$;
revoke all on function private.aud017_notify_student_credit_balance() from public,anon,authenticated;

drop trigger if exists aud017_notify_student_credit_balance on public.credit_movements;
create trigger aud017_notify_student_credit_balance
after insert on public.credit_movements
for each row execute function private.aud017_notify_student_credit_balance();

create or replace function private.run_student_notification_engine(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_queued integer:=0;
  v_balance integer;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar avisos de alumno.' using errcode='42501';
  end if;
  p_now:=coalesce(p_now,now());

  for v_row in
    select c.id as class_id,c.scheduled_start_at,p.id as person_id,p.auth_user_id
    from public.classes c
    join public.class_participants cp on cp.class_id=c.id
    join public.people p on p.id=cp.person_id
    where c.status='scheduled'
      and c.scheduled_start_at > p_now
      and c.scheduled_start_at <= p_now + interval '30 minutes'
      and p.active and p.auth_user_id is not null
  loop
    v_queued:=v_queued + private.enqueue_notification(
      'student.class.upcoming',v_row.auth_user_id,'Tu clase empieza pronto',
      'Tu próxima clase comienza a las ' || to_char(v_row.scheduled_start_at at time zone 'Europe/Madrid','HH24:MI') || '.',
      'student:home','class',v_row.class_id::text,
      jsonb_build_object('audience','student','class_id',v_row.class_id,'person_id',v_row.person_id)
    );
  end loop;

  for v_row in
    select g.id as grant_id,g.expires_at,p.id as person_id,p.auth_user_id
    from public.credit_grants g
    join public.credit_grant_members gm on gm.grant_id=g.id
    join public.people p on p.id=gm.person_id
    where g.status='active'
      and g.expires_at is not null
      and g.expires_at > p_now
      and g.expires_at <= p_now + interval '14 days'
      and p.active and p.auth_user_id is not null
  loop
    select coalesce(sum(delta_minutes),0)::integer into v_balance
    from public.credit_movements where grant_id=v_row.grant_id;
    if v_balance > 0 then
      v_queued:=v_queued + private.enqueue_notification(
        'student.credit.expiring',v_row.auth_user_id,'Tu bono caduca pronto',
        'Tu bono caduca el ' || to_char(v_row.expires_at at time zone 'Europe/Madrid','DD/MM/YYYY') || '.',
        'student:formation','credit_grant',v_row.grant_id::text,
        jsonb_build_object('audience','student','person_id',v_row.person_id,'grant_id',v_row.grant_id,'balance_minutes',v_balance)
      );
    end if;
  end loop;
  return v_queued;
end;
$function$;
revoke all on function private.run_student_notification_engine(timestamptz) from public,anon,authenticated;

-- Extiende el cron P27 existente: un único motor y un único procesador de entregas.
create or replace function private.run_notification_engine(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mission public.missions%rowtype;
  v_user_id uuid;
  v_reconciled integer:=0;
  v_queued integer:=0;
  v_student_queued integer:=0;
  v_process jsonb;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para ejecutar el motor de notificaciones.' using errcode='42501';
  end if;
  if p_now is null then p_now:=now(); end if;

  update public.internal_notifications n
  set read_at=coalesce(n.read_at,p_now)
  from public.missions m
  where n.event_key='mission.attention'
    and n.audience='staff'
    and n.source_type='mission'
    and n.source_id=m.id::text
    and n.read_at is null
    and (
      private.notification_mission_terminal(m.state)
      or m.state in ('upcoming','postponed','blocked')
    );
  get diagnostics v_reconciled = row_count;

  for v_mission in
    select m.*
    from public.missions m
    join public.mission_rules r on r.rule_key=m.rule_key
    where r.enabled
      and 'activated'=any(r.notification_events)
      and m.state in ('available','in_progress')
  loop
    for v_user_id in
      select distinct ar.user_id
      from public.app_member_roles ar
      where ar.active and ar.role in ('admin','teacher_admin','teacher')
    loop
      v_queued:=v_queued+private.enqueue_notification(
        'mission.attention',v_user_id,v_mission.title,v_mission.description,
        v_mission.action_target,'mission',v_mission.id::text,
        jsonb_build_object('mission_rule',v_mission.rule_key,'reconciled',true,'audience','staff')
      );
    end loop;
  end loop;

  v_student_queued:=private.run_student_notification_engine(p_now);
  v_process:=private.process_notification_deliveries(500);
  return jsonb_build_object(
    'reconciled',v_reconciled,
    'queued_or_existing',v_queued,
    'student_queued_or_existing',v_student_queued,
    'delivery',v_process
  );
end;
$function$;
revoke all on function private.run_notification_engine(timestamptz) from public,anon,authenticated;

commit;
