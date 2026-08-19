create or replace function public.get_student_derived_exercises(p_person_id bigint)
returns table (
  exercise_id bigint,
  title text,
  summary text,
  description text,
  requires_partner boolean,
  state text,
  parent_type text,
  parent_content_id bigint,
  parent_title text,
  parent_status text,
  parent_level text,
  current_level text,
  updated_at timestamptz,
  context_label text
)
language sql
security definer
set search_path = public, pg_temp
as $$
with parent_links as (
  select
    ex.id as exercise_id,
    ex.title,
    ex.summary,
    ex.description,
    coalesce(ex.requires_partner,false) as requires_partner,
    rel.target_content_id as parent_content_id,
    case rel.relation_type when 'exercise_correction' then 'correction' when 'exercise_explanation' then 'explanation' end as parent_type,
    parent.title as parent_title,
    a.assignment_status as parent_status,
    a.updated_at,
    a.snapshot_style_term_id,
    a.snapshot_role_term_id,
    a.snapshot_level_term_id,
    parent_level.label as parent_level,
    parent_level.sort_order as parent_level_order,
    current_level.label as current_level,
    current_level.sort_order as current_level_order,
    case
      when rel.relation_type='exercise_correction' and a.assignment_status='in_correction' then 'active'
      when rel.relation_type='exercise_correction' and a.assignment_status='corrected' then 'history'
      when rel.relation_type='exercise_explanation' and a.assignment_status='explained' and (current_level.sort_order is null or parent_level.sort_order is null or parent_level.sort_order=current_level.sort_order) then 'active'
      when rel.relation_type='exercise_explanation' and a.assignment_status='explained' and current_level.sort_order is not null and parent_level.sort_order is not null and parent_level.sort_order<current_level.sort_order then 'history'
      else null
    end as derived_state
  from teaching_content_relations rel
  join teaching_contents ex on ex.id=rel.source_content_id and ex.content_type='exercise' and ex.active=true
  join teaching_contents parent on parent.id=rel.target_content_id
  join student_content_assignments a on a.person_id=p_person_id and a.content_id=parent.id
  left join catalog_terms parent_level on parent_level.id=a.snapshot_level_term_id
  left join student_dance_profiles dp on dp.person_id=p_person_id
    and dp.active=true
    and (a.snapshot_style_term_id is null or dp.style_term_id=a.snapshot_style_term_id)
    and (a.snapshot_role_term_id is null or dp.role_term_id=a.snapshot_role_term_id)
  left join catalog_terms current_level on current_level.id=dp.level_term_id
  where private.is_staff()
    and rel.relation_type in ('exercise_correction','exercise_explanation')
), ranked as (
  select *,
    row_number() over (
      partition by exercise_id
      order by
        case derived_state when 'active' then 0 when 'history' then 1 else 2 end,
        case parent_type when 'correction' then 0 else 1 end,
        updated_at desc nulls last,
        parent_content_id
    ) as rn,
    bool_or(derived_state='active') over (partition by exercise_id) as any_active,
    bool_or(derived_state='history') over (partition by exercise_id) as any_history
  from parent_links
  where derived_state is not null
)
select
  exercise_id,title,summary,description,requires_partner,
  case when any_active then 'active' else 'history' end as state,
  parent_type,parent_content_id,parent_title,parent_status,parent_level,current_level,updated_at,
  case
    when parent_type='correction' then 'Para corregir · '||parent_title
    else 'Ejercicio para mejorar · '||parent_title
  end as context_label
from ranked
where rn=1 and (any_active or any_history)
order by
  case when any_active then 0 else 1 end,
  case when parent_type='explanation' then 0 else 1 end,
  updated_at desc nulls last,
  title;
$$;

revoke all on function public.get_student_derived_exercises(bigint) from public, anon;
grant execute on function public.get_student_derived_exercises(bigint) to authenticated;

comment on function public.get_student_derived_exercises(bigint) is 'Derives a staff-facing student exercise list from correction/explanation state. Class events remain activity context only.';