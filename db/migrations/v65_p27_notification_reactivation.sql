begin;

-- P27 · Reactivación semántica de avisos.
-- Un paso real de una misión no accionable a available/in_progress, o una nueva
-- escalada a urgente, vuelve a abrir su aviso. El cron de reconciliación no
-- reabre avisos que el usuario haya leído manualmente.

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
  v_reactivate boolean:=false;
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
    v_reactivate:=(tg_op='UPDATE');
  end if;

  if not v_should_enqueue
     and (tg_op='INSERT' or old.state is distinct from new.state)
     and new.state in ('available','in_progress') then
    v_event:='activated';
    v_should_enqueue:=v_event=any(v_rule.notification_events);
    v_reactivate:=(tg_op='UPDATE');
  end if;

  if not v_should_enqueue then return new; end if;

  if v_reactivate then
    update public.internal_notifications
    set read_at=null
    where event_key='mission.attention'
      and source_type='mission'
      and source_id=new.id::text;
  end if;

  for v_user_id in
    select distinct r.user_id
    from public.app_member_roles r
    where r.active and r.role in ('admin','teacher_admin','teacher')
  loop
    perform private.enqueue_notification(
      'mission.attention',v_user_id,new.title,new.description,new.action_target,
      'mission',new.id::text,
      jsonb_build_object(
        'mission_rule',new.rule_key,
        'mission_event',v_event,
        'reactivated',v_reactivate
      )
    );
  end loop;

  perform private.process_notification_deliveries(100);
  return new;
end;
$function$;

revoke all on function private.sync_mission_notification()
  from public,anon,authenticated;

commit;
