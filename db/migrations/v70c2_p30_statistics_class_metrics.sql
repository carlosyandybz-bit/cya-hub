-- P30C2 — Métricas de clases.
create or replace function private.statistics_class_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare
  v_teacher uuid; v_student bigint; v_style bigint; v_location text; v_scope text; v_status text;
  v_value numeric; v_total numeric;
begin
  begin v_teacher:=nullif(p_filters->>'teacher','')::uuid; exception when others then raise exception 'Profesor no válido.' using errcode='22023'; end;
  begin v_student:=nullif(p_filters->>'student','')::bigint; exception when others then raise exception 'Alumno no válido.' using errcode='22023'; end;
  begin v_style:=nullif(p_filters->>'style','')::bigint; exception when others then raise exception 'Estilo no válido.' using errcode='22023'; end;
  v_location:=nullif(btrim(p_filters->>'class_location'),'');
  v_scope:=coalesce(nullif(p_filters->>'location_scope',''),'inside');
  v_status:=nullif(p_filters->>'class_status','');
  if v_scope not in ('inside','outside') then raise exception 'Ámbito de ubicación no válido.' using errcode='22023'; end if;

  if p_key in ('classes_count','class_minutes') then
    select case when p_key='classes_count' then count(*)::numeric else coalesce(sum(coalesce(c.actual_duration_minutes,c.duration_minutes)),0)::numeric end
    into v_value from public.classes c
    where c.scheduled_start_at>=p_from and c.scheduled_start_at<p_to
      and (v_teacher is null or c.teacher_user_id=v_teacher)
      and (v_style is null or c.style_term_id=v_style)
      and (v_status is null or c.status=v_status)
      and (v_student is null or exists(select 1 from public.class_participants cp where cp.class_id=c.id and cp.person_id=v_student))
      and (v_location is null or (v_scope='inside' and coalesce(c.location_text,'') ilike '%'||v_location||'%') or (v_scope='outside' and coalesce(c.location_text,'') not ilike '%'||v_location||'%'));
    return v_value;
  elsif p_key='attendance_rate' then
    select count(*) filter(where cp.attendance_status='present')::numeric,
           count(*) filter(where cp.attendance_status in ('present','absent'))::numeric
    into v_value,v_total
    from public.class_participants cp join public.classes c on c.id=cp.class_id
    where c.scheduled_start_at>=p_from and c.scheduled_start_at<p_to
      and (v_teacher is null or c.teacher_user_id=v_teacher)
      and (v_student is null or cp.person_id=v_student)
      and (v_style is null or c.style_term_id=v_style)
      and (v_location is null or (v_scope='inside' and coalesce(c.location_text,'') ilike '%'||v_location||'%') or (v_scope='outside' and coalesce(c.location_text,'') not ilike '%'||v_location||'%'));
    return case when v_total>0 then round(v_value*100/v_total,1) else null end;
  end if;
  raise exception 'Métrica de clases no soportada.' using errcode='22023';
end;
$$;
revoke all on function private.statistics_class_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
