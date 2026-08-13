begin;

-- P27 · Notificaciones automáticas.
-- La bandeja interna es la única entrega automática operativa en este paquete.
-- Email y WhatsApp nunca se consideran entregados sin una integración/dispatcher
-- verificados. notification_deliveries es el ledger idempotente de toda entrega.

alter table public.notification_deliveries
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists action_target text,
  add column if not exists idempotency_key text,
  add column if not exists scheduled_at timestamptz not null default now(),
  add column if not exists last_attempt_at timestamptz,
  add column if not exists provider_message_id text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists notification_deliveries_idempotency_uq
  on public.notification_deliveries(idempotency_key)
  where idempotency_key is not null;
create index if not exists notification_deliveries_due_idx
  on public.notification_deliveries(status,scheduled_at,id)
  where status='queued';
create index if not exists notification_deliveries_target_idx
  on public.notification_deliveries(target_user_id,queued_at desc)
  where target_user_id is not null;

-- Una bandeja personal no debe exponer los avisos del resto del equipo a un
-- administrador. La observabilidad global vive en notification_deliveries.
drop policy if exists internal_notifications_own_select on public.internal_notifications;
create policy internal_notifications_own_select
  on public.internal_notifications
  for select to authenticated
  using(target_user_id=(select auth.uid()));

create or replace function private.notification_mission_terminal(p_state text)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $function$
  select coalesce(p_state,'') = any(array[
    'completed','completed_automatically','not_done','not_applicable',
    'cancelled','expired'
  ]::text[]);
$function$;
revoke all on function private.notification_mission_terminal(text)
  from public,anon,authenticated;

create or replace function private.enqueue_notification(
  p_event_key text,
  p_target_user_id uuid,
  p_title text,
  p_body text default null,
  p_action_target text default null,
  p_source_type text default null,
  p_source_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rule public.notification_rules%rowtype;
  v_channel text;
  v_delivery_id bigint;
  v_idempotency_key text;
  v_status text;
  v_error text;
  v_count integer:=0;
  v_integration_status text;
  v_dispatch_ready boolean;
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para encolar notificaciones.' using errcode='42501';
  end if;
  if p_target_user_id is null then return 0; end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then
    raise exception 'La notificación necesita un título.' using errcode='22023';
  end if;

  select * into v_rule
  from public.notification_rules
  where event_key=p_event_key and enabled;
  if not found then return 0; end if;

  foreach v_channel in array v_rule.channels loop
    if v_channel not in ('internal','email','whatsapp','system') then
      continue;
    end if;

    v_idempotency_key:=concat_ws('|',
      p_event_key,v_channel,p_target_user_id::text,
      coalesce(p_source_type,''),coalesce(p_source_id,'')
    );
    v_status:='queued';
    v_error:=null;

    -- P27 no inventa una entrega externa. Un proveedor solo puede empezar a
    -- generar cola cuando su integración declare conexión y dispatcher real.
    if v_channel in ('email','whatsapp') then
      select i.status,
             coalesce((i.public_config->>'dispatch_ready')::boolean,false)
      into v_integration_status,v_dispatch_ready
      from public.integration_settings i
      where i.integration_key=v_channel;

      if coalesce(v_integration_status,'disconnected') <> 'connected'
         or not coalesce(v_dispatch_ready,false) then
        v_status:='skipped';
        v_error:='Canal externo no conectado o sin dispatcher verificado.';
      else
        -- No hay adaptador externo instalado en P27. Mantenerlo explícitamente
        -- fuera de cola evita falsos positivos si alguien cambia solo el estado.
        v_status:='skipped';
        v_error:='Canal conectado, pero no existe un adaptador de entrega P27 verificado.';
      end if;
    elsif v_channel='system' then
      v_status:='skipped';
      v_error:='Canal de sistema reservado; sin dispatcher P27.';
    end if;

    insert into public.notification_deliveries(
      event_key,channel,recipient,status,source_type,source_id,
      target_user_id,title,body,action_target,idempotency_key,
      scheduled_at,last_error,metadata,created_by
    ) values(
      p_event_key,v_channel,
      case when v_channel='internal' then p_target_user_id::text else null end,
      v_status,p_source_type,p_source_id,
      p_target_user_id,btrim(p_title),p_body,p_action_target,v_idempotency_key,
      now(),v_error,coalesce(p_metadata,'{}'::jsonb),null
    )
    on conflict(idempotency_key) where idempotency_key is not null
    do update set
      title=excluded.title,
      body=excluded.body,
      action_target=excluded.action_target,
      metadata=public.notification_deliveries.metadata || excluded.metadata,
      last_error=case
        when public.notification_deliveries.status='sent' then public.notification_deliveries.last_error
        else excluded.last_error
      end,
      status=case
        when public.notification_deliveries.status='sent' then 'sent'
        when public.notification_deliveries.channel='internal' then 'queued'
        else excluded.status
      end,
      scheduled_at=case
        when public.notification_deliveries.status='sent' then public.notification_deliveries.scheduled_at
        else excluded.scheduled_at
      end
    returning id into v_delivery_id;

    if v_delivery_id is not null then v_count:=v_count+1; end if;
  end loop;

  return v_count;
end;
$function$;
revoke all on function private.enqueue_notification(text,uuid,text,text,text,text,text,jsonb)
  from public,anon,authenticated;

create or replace function private.process_notification_deliveries(
  p_limit integer default 100
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.notification_deliveries%rowtype;
  v_sent integer:=0;
  v_failed integer:=0;
  v_skipped integer:=0;
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
begin
  if current_user <> 'postgres' and not coalesce((select private.is_staff()),false) then
    raise exception 'No tienes permiso para procesar notificaciones.' using errcode='42501';
  end if;

  for v_row in
    select d.*
    from public.notification_deliveries d
    where d.status='queued' and d.scheduled_at<=now()
    order by d.scheduled_at,d.id
    for update skip locked
    limit v_limit
  loop
    begin
      update public.notification_deliveries
      set status='sending',attempt_count=attempt_count+1,last_attempt_at=now(),last_error=null
      where id=v_row.id;

      if v_row.channel='internal' then
        if v_row.target_user_id is null then
          raise exception 'Entrega interna sin usuario de destino.';
        end if;

        insert into public.internal_notifications(
          event_key,target_user_id,title,body,action_target,source_type,source_id,created_at
        ) values(
          v_row.event_key,v_row.target_user_id,coalesce(v_row.title,'Aviso'),
          v_row.body,v_row.action_target,v_row.source_type,v_row.source_id,now()
        )
        on conflict(event_key,target_user_id,source_type,source_id)
        do update set
          title=excluded.title,
          body=excluded.body,
          action_target=excluded.action_target;

        update public.notification_deliveries
        set status='sent',sent_at=coalesce(sent_at,now()),last_error=null
        where id=v_row.id;
        v_sent:=v_sent+1;
      else
        update public.notification_deliveries
        set status='skipped',
            last_error='No existe un dispatcher externo P27 verificado para este canal.'
        where id=v_row.id;
        v_skipped:=v_skipped+1;
      end if;
    exception when others then
      update public.notification_deliveries
      set status='failed',last_error=left(sqlerrm,1000)
      where id=v_row.id;
      v_failed:=v_failed+1;
    end;
  end loop;

  return jsonb_build_object(
    'sent',v_sent,'failed',v_failed,'skipped',v_skipped
  );
end;
$function$;
revoke all on function private.process_notification_deliveries(integer)
  from public,anon,authenticated;

create or replace function private.sync_mission_notification()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rule public.mission_rules%rowtype;
  v_user_id uuid;
  v_event text;
  v_should_enqueue boolean:=false;
begin
  if private.notification_mission_terminal(new.state) then
    update public.internal_notifications
    set read_at=coalesce(read_at,now())
    where event_key='mission.attention'
      and source_type='mission'
      and source_id=new.id::text
      and read_at is null;

    update public.notification_deliveries
    set status='skipped',
        last_error='La misión ya está resuelta o es histórica.'
    where event_key='mission.attention'
      and source_type='mission'
      and source_id=new.id::text
      and status in ('queued','sending');
    return new;
  end if;

  if new.state not in ('available','in_progress') then
    -- Una misión upcoming/postponed/blocked no debe llenar la bandeja antes
    -- de ser accionable. Si existía un aviso antiguo, se conserva como leído.
    if new.state in ('upcoming','postponed','blocked') then
      update public.internal_notifications
      set read_at=coalesce(read_at,now())
      where event_key='mission.attention'
        and source_type='mission'
        and source_id=new.id::text
        and read_at is null;
    end if;
    return new;
  end if;

  select * into v_rule
  from public.mission_rules
  where rule_key=new.rule_key and enabled;
  if not found then return new; end if;

  if new.priority='urgent'
     and (tg_op='INSERT' or old.priority is distinct from 'urgent') then
    v_event:='urgent';
    v_should_enqueue:=v_event=any(v_rule.notification_events);
  end if;

  if not v_should_enqueue
     and (tg_op='INSERT' or old.state is distinct from new.state)
     and new.state in ('available','in_progress') then
    v_event:='activated';
    v_should_enqueue:=v_event=any(v_rule.notification_events);
  end if;

  if not v_should_enqueue then return new; end if;

  for v_user_id in
    select distinct r.user_id
    from public.app_member_roles r
    where r.active and r.role in ('admin','teacher_admin','teacher')
  loop
    perform private.enqueue_notification(
      'mission.attention',v_user_id,new.title,new.description,new.action_target,
      'mission',new.id::text,
      jsonb_build_object('mission_rule',new.rule_key,'mission_event',v_event)
    );
  end loop;

  perform private.process_notification_deliveries(100);
  return new;
end;
$function$;
revoke all on function private.sync_mission_notification()
  from public,anon,authenticated;

drop trigger if exists missions_notify_created on public.missions;
drop trigger if exists missions_notification_sync on public.missions;
create trigger missions_notification_sync
after insert or update of state,priority,priority_score,title,description,action_target
on public.missions
for each row execute function private.sync_mission_notification();

create or replace function private.run_notification_engine(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_mission public.missions%rowtype;
  v_rule public.mission_rules%rowtype;
  v_user_id uuid;
  v_reconciled integer:=0;
  v_queued integer:=0;
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
        jsonb_build_object('mission_rule',v_mission.rule_key,'reconciled',true)
      );
    end loop;
  end loop;

  v_process:=private.process_notification_deliveries(500);
  return jsonb_build_object(
    'reconciled',v_reconciled,
    'queued_or_existing',v_queued,
    'delivery',v_process
  );
end;
$function$;
revoke all on function private.run_notification_engine(timestamptz)
  from public,anon,authenticated;

-- Canoniza el histórico sin borrar evidencia. P25 tiene más estados terminales
-- que la vista antigua y las misiones no accionables no deben quedar pendientes.
update public.internal_notifications n
set read_at=coalesce(n.read_at,now())
from public.missions m
where n.event_key='mission.attention'
  and n.source_type='mission'
  and n.source_id=m.id::text
  and n.read_at is null
  and (
    private.notification_mission_terminal(m.state)
    or m.state in ('upcoming','postponed','blocked')
  );

-- Registra el histórico interno existente como entregado en el nuevo ledger.
insert into public.notification_deliveries(
  event_key,channel,recipient,status,source_type,source_id,
  target_user_id,title,body,action_target,idempotency_key,
  queued_at,scheduled_at,sent_at,metadata
)
select
  n.event_key,'internal',n.target_user_id::text,'sent',n.source_type,n.source_id,
  n.target_user_id,n.title,n.body,n.action_target,
  concat_ws('|',n.event_key,'internal',n.target_user_id::text,coalesce(n.source_type,''),coalesce(n.source_id,'')),
  n.created_at,n.created_at,n.created_at,jsonb_build_object('backfill','p27')
from public.internal_notifications n
on conflict(idempotency_key) where idempotency_key is not null do nothing;

select private.run_notification_engine(now());

-- Idempotente por nombre, siguiendo el mismo patrón de P25.
select cron.schedule(
  'cya-notification-engine',
  '*/5 * * * *',
  'select private.run_notification_engine();'
);

commit;
