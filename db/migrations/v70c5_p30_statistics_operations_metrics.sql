-- P30C5 — Métricas de misiones y notificaciones.
create or replace function private.statistics_operations_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare v_teacher uuid; v_priority text; v_mission_type text; v_channel text; v_event_key text; v_value numeric;
begin
  begin v_teacher:=nullif(p_filters->>'teacher','')::uuid; exception when others then raise exception 'Profesor no válido.' using errcode='22023'; end;
  v_priority:=nullif(p_filters->>'priority',''); v_mission_type:=nullif(p_filters->>'mission_type','');
  v_channel:=nullif(p_filters->>'channel',''); v_event_key:=nullif(p_filters->>'event_key','');
  if p_key='missions_open' then
    select count(*) into v_value from public.missions m where m.state in ('available','upcoming','in_progress')
      and (v_priority is null or m.priority=v_priority) and (v_mission_type is null or m.mission_type=v_mission_type);
  elsif p_key='missions_completed' then
    select count(*) into v_value from public.missions m where m.completed_at>=p_from and m.completed_at<p_to and m.state in ('completed','completed_automatically')
      and (v_teacher is null or m.completed_by=v_teacher) and (v_priority is null or m.priority=v_priority) and (v_mission_type is null or m.mission_type=v_mission_type);
  elsif p_key in ('notifications_sent','notifications_failed') then
    select count(*) into v_value from public.notification_deliveries nd
    where coalesce(nd.sent_at,nd.last_attempt_at,nd.queued_at)>=p_from and coalesce(nd.sent_at,nd.last_attempt_at,nd.queued_at)<p_to
      and nd.status=case when p_key='notifications_sent' then 'sent' else 'failed' end
      and (v_channel is null or nd.channel=v_channel) and (v_event_key is null or nd.event_key=v_event_key);
  else raise exception 'Métrica de operación no soportada.' using errcode='22023'; end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_operations_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
