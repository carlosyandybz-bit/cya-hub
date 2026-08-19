create or replace function private.student_visible_evaluations_json(p_person_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_current bigint;
  v_result jsonb;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff())
     and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para consultar estas evaluaciones.' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'session_id',e.session_id,
        'class_id',e.class_id,
        'score',e.score,
        'aptitude_term_id',e.aptitude_term_id,
        'aptitude',apt.label,
        'style_term_id',e.style_term_id,
        'style',style.label,
        'role_term_id',e.role_term_id,
        'role',role.label,
        'level_term_id',e.level_term_id,
        'level',level.label,
        'evaluation_kind',e.evaluation_kind,
        'created_at',e.created_at
      )
      order by coalesce(s.completed_at,e.updated_at,e.created_at) desc,e.id desc
    ),
    '[]'::jsonb
  ) into v_result
  from public.student_evaluations e
  join public.catalog_terms apt on apt.id=e.aptitude_term_id
  join public.catalog_terms style on style.id=e.style_term_id
  join public.catalog_terms role on role.id=e.role_term_id
  join public.catalog_terms level on level.id=e.level_term_id
  left join public.evaluation_sessions s on s.id=e.session_id
  where e.person_id=p_person_id
    and (e.session_id is null or s.status='completed');

  return v_result;
end;
$function$;

comment on function private.student_visible_evaluations_json(bigint) is 'Student-owned evaluation history. class_id is provenance only and never gates visibility.';
