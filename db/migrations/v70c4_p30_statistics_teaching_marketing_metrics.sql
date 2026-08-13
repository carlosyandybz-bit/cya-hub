-- P30C4 — Métricas de enseñanza y Marketing.
create or replace function private.statistics_teaching_marketing_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare v_teacher uuid; v_student bigint; v_style bigint; v_campaign bigint; v_content_type text; v_value numeric;
begin
  begin v_teacher:=nullif(p_filters->>'teacher','')::uuid; exception when others then raise exception 'Profesor no válido.' using errcode='22023'; end;
  begin v_student:=nullif(p_filters->>'student','')::bigint; exception when others then raise exception 'Alumno no válido.' using errcode='22023'; end;
  begin v_style:=nullif(p_filters->>'style','')::bigint; exception when others then raise exception 'Estilo no válido.' using errcode='22023'; end;
  begin v_campaign:=nullif(p_filters->>'campaign','')::bigint; exception when others then raise exception 'Campaña no válida.' using errcode='22023'; end;
  v_content_type:=nullif(p_filters->>'content_type','');
  if p_key='assignments_completed' then
    select count(*) into v_value from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
    where a.completed_at>=p_from and a.completed_at<p_to and (v_student is null or a.person_id=v_student)
      and (v_content_type is null or tc.content_type=v_content_type)
      and (v_style is null or exists(select 1 from public.teaching_content_styles ts where ts.content_id=tc.id and ts.style_term_id=v_style));
  elsif p_key in ('evaluations_count','evaluation_average') then
    select case when p_key='evaluations_count' then count(*)::numeric else round(avg(e.score)::numeric,1) end into v_value
    from public.student_evaluations e where e.created_at>=p_from and e.created_at<p_to
      and (v_teacher is null or e.evaluated_by=v_teacher) and (v_student is null or e.person_id=v_student) and (v_style is null or e.style_term_id=v_style);
  elsif p_key in ('marketing_spend','marketing_revenue','marketing_bookings') then
    select case p_key when 'marketing_spend' then coalesce(sum(mm.spend_cents),0)::numeric when 'marketing_revenue' then coalesce(sum(mm.revenue_cents),0)::numeric else coalesce(sum(mm.bookings),0)::numeric end into v_value
    from public.marketing_campaign_metrics mm where mm.metric_date>=p_from::date and mm.metric_date<=p_to::date and (v_campaign is null or mm.campaign_id=v_campaign);
  else raise exception 'Métrica de enseñanza/Marketing no soportada.' using errcode='22023'; end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_teaching_marketing_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
