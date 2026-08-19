create or replace function private.student_exercises_json(p_person_id bigint)
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
    raise exception 'No tienes permiso para consultar estos ejercicios.' using errcode='42501';
  end if;

  with relation_rows as (
    select
      ex.id as exercise_id,
      ex.title as exercise_title,
      ex.summary as exercise_summary,
      ex.description as exercise_description,
      ex.requires_partner,
      r.relation_type,
      parent.id as parent_content_id,
      parent.content_type as parent_type,
      parent.title as parent_title,
      a.id as parent_assignment_id,
      a.assignment_status as parent_status,
      a.updated_at as parent_updated_at,
      a.completed_at as parent_completed_at,
      a.snapshot_style_term_id,
      a.snapshot_role_term_id,
      a.snapshot_level_term_id as parent_level_term_id,
      parent_level.label as parent_level_label,
      parent_level.sort_order as parent_level_order,
      current_level.id as current_level_term_id,
      current_level.label as current_level_label,
      current_level.sort_order as current_level_order,
      case
        when r.relation_type='exercise_correction' and a.assignment_status='in_correction' then 'active'
        when r.relation_type='exercise_correction' and a.assignment_status='corrected' then 'history'
        when r.relation_type='exercise_explanation' and a.assignment_status='explained'
             and coalesce(current_level.sort_order,parent_level.sort_order)=parent_level.sort_order then 'active'
        when r.relation_type='exercise_explanation' and a.assignment_status='explained'
             and current_level.sort_order>parent_level.sort_order then 'history'
        else 'hidden'
      end as lifecycle_state,
      case
        when r.relation_type='exercise_correction' and a.assignment_status='in_correction' then 0
        when r.relation_type='exercise_explanation' and a.assignment_status='explained'
             and coalesce(current_level.sort_order,parent_level.sort_order)=parent_level.sort_order then 1
        when r.relation_type='exercise_correction' and a.assignment_status='corrected' then 2
        when r.relation_type='exercise_explanation' and a.assignment_status='explained'
             and current_level.sort_order>parent_level.sort_order then 3
        else 9
      end as lifecycle_rank
    from public.teaching_content_relations r
    join public.teaching_contents ex on ex.id=r.source_content_id and ex.content_type='exercise'
    join public.teaching_contents parent on parent.id=r.target_content_id
    join public.student_content_assignments a on a.person_id=p_person_id and a.content_id=parent.id
    left join public.catalog_terms parent_level on parent_level.id=a.snapshot_level_term_id and parent_level.taxonomy='dance_level'
    left join public.student_dance_profiles dp on dp.person_id=p_person_id
      and dp.style_term_id=a.snapshot_style_term_id
      and dp.role_term_id=a.snapshot_role_term_id
      and dp.active
    left join public.catalog_terms current_level on current_level.id=coalesce(dp.level_term_id,a.snapshot_level_term_id) and current_level.taxonomy='dance_level'
    where r.relation_type in ('exercise_correction','exercise_explanation')
      and ex.active and ex.completion_status='complete' and ex.publication_status='published' and ex.visibility='student'
      and (
        (r.relation_type='exercise_correction' and parent.content_type='correction')
        or (r.relation_type='exercise_explanation' and parent.content_type='explanation')
      )
  ), chosen as (
    select distinct on (exercise_id)
      *
    from relation_rows
    where lifecycle_state<>'hidden'
    order by exercise_id,lifecycle_rank,parent_updated_at desc nulls last,parent_content_id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'exercise_id',c.exercise_id,
    'title',c.exercise_title,
    'summary',c.exercise_summary,
    'description',c.exercise_description,
    'requires_partner',c.requires_partner,
    'state',c.lifecycle_state,
    'parent_type',c.parent_type,
    'parent_content_id',c.parent_content_id,
    'parent_title',c.parent_title,
    'parent_assignment_id',c.parent_assignment_id,
    'parent_status',c.parent_status,
    'parent_level_term_id',c.parent_level_term_id,
    'parent_level',c.parent_level_label,
    'current_level_term_id',c.current_level_term_id,
    'current_level',c.current_level_label,
    'updated_at',c.parent_updated_at,
    'context_label',case when c.parent_type='explanation' then 'Ejercicio para mejorar · '||c.parent_title else 'Ejercicio propuesto · '||c.parent_title end,
    'media',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'media_type',m.media_type,'provider',m.provider,'external_file_id',m.external_file_id,
      'title',m.title,'mime_type',m.mime_type,'group_label',m.group_label,'is_cover',m.is_cover,'is_preview',m.is_preview,
      'display_in_resources',m.display_in_resources,'thumbnail_external_file_id',m.thumbnail_external_file_id,
      'thumbnail_mime_type',m.thumbnail_mime_type,'preview_start_seconds',m.preview_start_seconds,'preview_end_seconds',m.preview_end_seconds
    ) order by m.sort_order,m.id) from public.teaching_content_media m where m.content_id=c.exercise_id),'[]'::jsonb)
  ) order by
    case when c.lifecycle_state='active' then 0 else 1 end,
    case when c.parent_type='correction' then 0 else 1 end,
    c.parent_updated_at desc nulls last,
    c.exercise_id desc),'[]'::jsonb)
  into v_result
  from chosen c;

  return v_result;
end;
$function$;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_result jsonb;
begin
  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;
  v_result:=private.student_portal_snapshot_for(v_person);
  v_result:=jsonb_set(v_result,'{assignments}',private.student_visible_assignments_json(v_person),true);
  v_result:=jsonb_set(v_result,'{evaluations}',private.student_visible_evaluations_json(v_person),true);
  v_result:=jsonb_set(v_result,'{exercises}',private.student_exercises_json(v_person),true);
  v_result:=jsonb_set(v_result,'{personal_media}',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,
      'person_id',m.person_id,
      'media_type',m.media_type,
      'external_file_id',m.external_file_id,
      'title',m.title,
      'note',m.note,
      'mime_type',m.mime_type,
      'created_at',m.created_at
    ) order by m.created_at desc,m.id desc)
    from public.student_media_resources m
    where m.person_id=v_person
  ),'[]'::jsonb),true);
  return v_result;
end;
$function$;