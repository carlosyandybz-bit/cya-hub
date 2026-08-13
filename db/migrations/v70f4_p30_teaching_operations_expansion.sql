-- P30F4 — Estados adicionales de Enseñanza y Operación.
create or replace function private.statistics_teaching_extended_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare
  v_student bigint;
  v_style bigint;
  v_content_type text;
  v_value numeric;
begin
  begin v_student:=nullif(p_filters->>'student','')::bigint; exception when others then raise exception 'Alumno no válido.' using errcode='22023'; end;
  begin v_style:=nullif(p_filters->>'style','')::bigint; exception when others then raise exception 'Estilo no válido.' using errcode='22023'; end;
  v_content_type:=nullif(btrim(p_filters->>'content_type'),'');
  if v_content_type is not null and v_content_type not in ('correction','explanation','exercise','sequence') then raise exception 'Tipo de contenido no válido.' using errcode='22023'; end if;

  if p_key='assignments_created' then
    select count(*) into v_value
    from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
    where a.assigned_at>=p_from and a.assigned_at<p_to
      and (v_student is null or a.person_id=v_student)
      and (v_style is null or a.snapshot_style_term_id=v_style)
      and (v_content_type is null or tc.content_type=v_content_type);
  elsif p_key='assignments_pending' then
    select count(*) into v_value
    from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
    where a.assigned_at>=p_from and a.assigned_at<p_to
      and a.assignment_status in ('pending','in_correction','active')
      and (v_student is null or a.person_id=v_student)
      and (v_style is null or a.snapshot_style_term_id=v_style)
      and (v_content_type is null or tc.content_type=v_content_type);
  else
    raise exception 'Métrica ampliada de enseñanza no soportada.' using errcode='22023';
  end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_teaching_extended_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;

create or replace function private.statistics_operations_extended_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare
  v_type text:=nullif(btrim(p_filters->>'mission_type'),'');
  v_priority text:=nullif(btrim(p_filters->>'priority'),'');
  v_channel text:=nullif(btrim(p_filters->>'channel'),'');
  v_event text:=nullif(btrim(p_filters->>'event_key'),'');
  v_value numeric;
begin
  if v_type is not null and v_type not in ('primary','daily','growth') then raise exception 'Tipo de misión no válido.' using errcode='22023'; end if;
  if v_priority is not null and v_priority not in ('normal','priority','urgent') then raise exception 'Prioridad no válida.' using errcode='22023'; end if;
  if v_channel is not null and v_channel not in ('internal','email','whatsapp','system') then raise exception 'Canal no válido.' using errcode='22023'; end if;

  if p_key='missions_not_done' then
    select count(*) into v_value from public.missions m
    where m.state in ('not_done','expired') and coalesce(m.expired_at,m.updated_at)>=p_from and coalesce(m.expired_at,m.updated_at)<p_to
      and (v_type is null or m.mission_type=v_type) and (v_priority is null or m.priority=v_priority);
  elsif p_key='notification_attempts' then
    select coalesce(sum(nd.attempt_count),0)::numeric into v_value from public.notification_deliveries nd
    where nd.queued_at>=p_from and nd.queued_at<p_to
      and (v_channel is null or nd.channel=v_channel) and (v_event is null or nd.event_key=v_event);
  else
    raise exception 'Métrica ampliada de operación no soportada.' using errcode='22023';
  end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_operations_extended_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
