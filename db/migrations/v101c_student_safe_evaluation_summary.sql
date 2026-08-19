-- Student evaluation payload: stars + trend only. Raw score and milestone text stay staff-only.
create or replace function private.student_visible_evaluations_json(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_current bigint; v_result jsonb;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff()) and not ((select private.has_app_role('student')) and v_current=p_person_id) then raise exception 'No tienes permiso para consultar estas evaluaciones.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'session_id',e.session_id,'class_id',e.class_id,'aptitude_term_id',e.aptitude_term_id,'aptitude',apt.label,'style_term_id',e.style_term_id,'style',style.label,'role_term_id',e.role_term_id,'role',role.label,'level_term_id',e.level_term_id,'level',level.label,'evaluation_kind',e.evaluation_kind,'created_at',e.created_at) order by coalesce(s.completed_at,e.updated_at,e.created_at) desc,e.id desc),'[]'::jsonb) into v_result
  from public.student_evaluations e join public.catalog_terms apt on apt.id=e.aptitude_term_id join public.catalog_terms style on style.id=e.style_term_id join public.catalog_terms role on role.id=e.role_term_id join public.catalog_terms level on level.id=e.level_term_id left join public.evaluation_sessions s on s.id=e.session_id
  where e.person_id=p_person_id and (e.session_id is null or s.status='completed');
  return v_result;
end;$$;

create or replace function private.student_evaluation_public_summary_json(p_person_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_current bigint; v_profile record; v_session public.evaluation_sessions; v_reference public.evaluation_sessions;
  v_mode text; v_count integer; v_period_value integer; v_period_unit text; v_interval interval; v_items jsonb; v_contexts jsonb:='[]'::jsonb;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff()) and not ((select private.has_app_role('student')) and v_current=p_person_id) then raise exception 'No tienes permiso para consultar este progreso.' using errcode='42501'; end if;
  select coalesce(s.mode,g.mode),coalesce(s.reference_count,g.reference_count),coalesce(s.period_value,g.period_value),coalesce(s.period_unit,g.period_unit) into v_mode,v_count,v_period_value,v_period_unit from public.evaluation_trend_settings g left join public.student_evaluation_trend_settings s on s.person_id=p_person_id where g.singleton=true;

  for v_profile in select dp.style_term_id,dp.role_term_id,dp.level_term_id,dp.is_primary,st.label style_label,rt.label role_label,lt.label level_label from public.student_dance_profiles dp join public.catalog_terms st on st.id=dp.style_term_id join public.catalog_terms rt on rt.id=dp.role_term_id left join public.catalog_terms lt on lt.id=dp.level_term_id where dp.person_id=p_person_id and dp.active and dp.level_term_id is not null order by dp.is_primary desc,dp.id loop
    v_session:=null; v_reference:=null;
    select * into v_session from public.evaluation_sessions where person_id=p_person_id and style_term_id=v_profile.style_term_id and role_term_id=v_profile.role_term_id and level_term_id=v_profile.level_term_id and status='completed' order by completed_at desc nulls last,started_at desc limit 1;
    if v_session.id is not null then
      if v_mode='evaluations' then
        select * into v_reference from public.evaluation_sessions where person_id=p_person_id and style_term_id=v_profile.style_term_id and role_term_id=v_profile.role_term_id and level_term_id=v_profile.level_term_id and status='completed' and coalesce(completed_at,started_at,created_at)<coalesce(v_session.completed_at,v_session.started_at,v_session.created_at) order by coalesce(completed_at,started_at,created_at) desc offset greatest(v_count-1,0) limit 1;
      else
        v_interval:=case v_period_unit when 'day' then make_interval(days=>v_period_value) when 'week' then make_interval(days=>v_period_value*7) else make_interval(months=>v_period_value) end;
        select * into v_reference from public.evaluation_sessions where person_id=p_person_id and style_term_id=v_profile.style_term_id and role_term_id=v_profile.role_term_id and level_term_id=v_profile.level_term_id and status='completed' and coalesce(completed_at,started_at,created_at)<=coalesce(v_session.completed_at,v_session.started_at,v_session.created_at)-v_interval order by coalesce(completed_at,started_at,created_at) desc limit 1;
        if v_reference.id is null then select * into v_reference from public.evaluation_sessions where person_id=p_person_id and style_term_id=v_profile.style_term_id and role_term_id=v_profile.role_term_id and level_term_id=v_profile.level_term_id and status='completed' and coalesce(completed_at,started_at,created_at)<coalesce(v_session.completed_at,v_session.started_at,v_session.created_at) order by coalesce(completed_at,started_at,created_at) asc limit 1; end if;
      end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('aptitude_term_id',a.id,'aptitude',a.label,
      'stars',case when cm.id is null then 0 else (select count(*) from public.evaluation_milestones mx where mx.active and mx.style_term_id=v_profile.style_term_id and mx.role_term_id=v_profile.role_term_id and mx.level_term_id=v_profile.level_term_id and mx.aptitude_term_id=a.id and (mx.sort_order,mx.threshold_score,mx.id)<=(cm.sort_order,cm.threshold_score,cm.id)) end,
      'total_stars',(select count(*) from public.evaluation_milestones mt where mt.active and mt.style_term_id=v_profile.style_term_id and mt.role_term_id=v_profile.role_term_id and mt.level_term_id=v_profile.level_term_id and mt.aptitude_term_id=a.id),
      'trend',case when ce.score is null or re.score is null then null when ce.score>re.score then 1 when ce.score<re.score then -1 else 0 end) order by a.sort_order),'[]'::jsonb) into v_items
    from public.catalog_terms a left join public.student_evaluations ce on ce.session_id=v_session.id and ce.aptitude_term_id=a.id left join public.student_evaluations re on re.session_id=v_reference.id and re.aptitude_term_id=a.id left join public.student_aptitude_progress sp on sp.person_id=p_person_id and sp.style_term_id=v_profile.style_term_id and sp.role_term_id=v_profile.role_term_id and sp.level_term_id=v_profile.level_term_id and sp.aptitude_term_id=a.id left join public.evaluation_milestones cm on cm.id=coalesce(ce.milestone_id,sp.current_milestone_id) where a.taxonomy='aptitude' and a.active;

    v_contexts:=v_contexts||jsonb_build_array(jsonb_build_object('style_term_id',v_profile.style_term_id,'style',v_profile.style_label,'role_term_id',v_profile.role_term_id,'role',v_profile.role_label,'level_term_id',v_profile.level_term_id,'level',v_profile.level_label,'is_primary',v_profile.is_primary,'evaluated_at',v_session.completed_at,'has_evaluation',v_session.id is not null,'items',v_items));
  end loop;
  return jsonb_build_object('mode',v_mode,'reference_count',v_count,'period_value',v_period_value,'period_unit',v_period_unit,'contexts',v_contexts);
end;$$;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_person bigint:=coalesce(p_person_id,(select private.current_person_id())); v_result jsonb;
begin
  if v_person is null then raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023'; end if;
  v_result:=private.student_portal_snapshot_for(v_person);
  v_result:=jsonb_set(v_result,'{assignments}',private.student_visible_assignments_json(v_person),true);
  v_result:=jsonb_set(v_result,'{evaluations}',private.student_visible_evaluations_json(v_person),true);
  v_result:=jsonb_set(v_result,'{evaluation_summary}',private.student_evaluation_public_summary_json(v_person),true);
  v_result:=jsonb_set(v_result,'{exercises}',private.student_exercises_json(v_person),true);
  v_result:=jsonb_set(v_result,'{personal_media}',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'person_id',m.person_id,'media_type',m.media_type,'external_file_id',m.external_file_id,'title',m.title,'note',m.note,'mime_type',m.mime_type,'created_at',m.created_at) order by m.created_at desc,m.id desc) from public.student_media_resources m where m.person_id=v_person),'[]'::jsonb),true);
  return v_result;
end;$$;
