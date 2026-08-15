begin;

-- AUD-017 · Separación real de audiencias sobre P27.
-- Una misma cuenta puede ser profesor y alumno. La audiencia pertenece a la
-- entrega, no al usuario, para que cambiar de experiencia no mezcle bandejas.

alter table public.notification_deliveries
  add column if not exists audience text not null default 'staff';
alter table public.internal_notifications
  add column if not exists audience text not null default 'staff';

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_audience_check;
alter table public.notification_deliveries
  add constraint notification_deliveries_audience_check
  check (audience in ('staff','student'));

alter table public.internal_notifications
  drop constraint if exists internal_notifications_audience_check;
alter table public.internal_notifications
  add constraint internal_notifications_audience_check
  check (audience in ('staff','student'));

-- Canoniza histórico usando la intención ya declarada en notification_rules.
update public.notification_deliveries d
set audience = case
  when exists (
    select 1 from public.notification_rules r
    where r.event_key=d.event_key
      and r.recipients ? 'student'
      and not (r.recipients ? 'staff')
  ) then 'student'
  else 'staff'
end;

update public.internal_notifications n
set audience = case
  when exists (
    select 1 from public.notification_rules r
    where r.event_key=n.event_key
      and r.recipients ? 'student'
      and not (r.recipients ? 'staff')
  ) then 'student'
  else 'staff'
end;

-- La deduplicación debe incluir audiencia: la misma cuenta puede recibir un
-- evento como miembro del equipo y otro evento equivalente como alumno.
alter table public.internal_notifications
  drop constraint if exists internal_notifications_event_key_target_user_id_source_type_key;
alter table public.internal_notifications
  add constraint internal_notifications_event_target_audience_source_key
  unique (event_key,target_user_id,audience,source_type,source_id);

create index if not exists internal_notifications_target_audience_unread_idx
  on public.internal_notifications(target_user_id,audience,read_at,created_at desc);
create index if not exists notification_deliveries_target_audience_idx
  on public.notification_deliveries(target_user_id,audience,queued_at desc)
  where target_user_id is not null;

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
  v_audience text;
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

  v_audience:=case
    when lower(coalesce(p_metadata->>'audience','')) in ('staff','student')
      then lower(p_metadata->>'audience')
    when v_rule.recipients ? 'student' and not (v_rule.recipients ? 'staff')
      then 'student'
    else 'staff'
  end;

  foreach v_channel in array v_rule.channels loop
    if v_channel not in ('internal','email','whatsapp','system') then
      continue;
    end if;

    v_idempotency_key:=concat_ws('|',
      p_event_key,v_channel,p_target_user_id::text,v_audience,
      coalesce(p_source_type,''),coalesce(p_source_id,'')
    );
    v_status:='queued';
    v_error:=null;

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
        v_status:='skipped';
        v_error:='Canal conectado, pero no existe un adaptador de entrega P27 verificado.';
      end if;
    elsif v_channel='system' then
      v_status:='skipped';
      v_error:='Canal de sistema reservado; sin dispatcher P27.';
    end if;

    insert into public.notification_deliveries(
      event_key,channel,recipient,status,source_type,source_id,
      target_user_id,audience,title,body,action_target,idempotency_key,
      scheduled_at,last_error,metadata,created_by
    ) values(
      p_event_key,v_channel,
      case when v_channel='internal' then p_target_user_id::text else null end,
      v_status,p_source_type,p_source_id,
      p_target_user_id,v_audience,btrim(p_title),p_body,p_action_target,v_idempotency_key,
      now(),v_error,coalesce(p_metadata,'{}'::jsonb),null
    )
    on conflict(idempotency_key) where idempotency_key is not null
    do update set
      audience=excluded.audience,
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
          event_key,target_user_id,audience,title,body,action_target,source_type,source_id,created_at
        ) values(
          v_row.event_key,v_row.target_user_id,v_row.audience,coalesce(v_row.title,'Aviso'),
          v_row.body,v_row.action_target,v_row.source_type,v_row.source_id,now()
        )
        on conflict(event_key,target_user_id,audience,source_type,source_id)
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

-- Migra las claves idempotentes existentes para que el nuevo esquema no
-- reprocesa histórico y las nuevas entregas incluyan audiencia.
update public.notification_deliveries
set idempotency_key=concat_ws('|',
  event_key,channel,target_user_id::text,audience,
  coalesce(source_type,''),coalesce(source_id,'')
)
where idempotency_key is not null;

commit;
