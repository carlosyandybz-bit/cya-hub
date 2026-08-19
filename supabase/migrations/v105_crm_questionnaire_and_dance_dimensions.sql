create or replace view public.crm_person_explorer_v as
with class_facts as (
  select cp.person_id,
    count(*) filter (where c.status <> 'cancelled')::integer as reservation_count,
    min(c.scheduled_start_at) filter (where c.status <> 'cancelled' and c.scheduled_start_at >= now()) as next_class_at,
    max(c.scheduled_start_at) filter (where c.status in ('active','finished') or (c.status='scheduled' and c.scheduled_start_at < now())) as last_class_at,
    count(*) filter (where c.status='cancelled')::integer as cancelled_count
  from public.class_participants cp join public.classes c on c.id=cp.class_id group by cp.person_id
),
manual_interests as (
  select person_id,jsonb_object_agg(interest_type,status) as interest_states
  from public.crm_interest_states group by person_id
),
reasons as (
  select person_id,
    jsonb_agg(jsonb_build_object('reason_key',reason_key,'is_primary',is_primary,'note',note,'source_type',source_type,'source_class_id',source_class_id,'last_confirmed_at',last_confirmed_at) order by is_primary desc,last_confirmed_at desc) filter (where active) as no_booking_reasons,
    max(reason_key) filter (where active and is_primary) as primary_no_booking_reason
  from public.crm_no_booking_reasons group by person_id
),
latest_onboarding as (
  select distinct on (fs.person_id) fs.person_id,fs.answers,fs.submitted_at
  from public.form_submissions fs join public.form_definitions fd on fd.id=fs.form_id
  where fd.form_key='onboarding'
  order by fs.person_id,fs.submitted_at desc,fs.id desc
),
questionnaire as (
  select person_id,true as questionnaire_finalized,submitted_at as questionnaire_last_finalized_at from latest_onboarding
),
onboarding_interest as (
  select person_id,jsonb_strip_nulls(jsonb_build_object(
    'in_person_classes',case when coalesce(answers->'reasons','[]'::jsonb) ? 'classes_cya' then 'interested' end,
    'online_content',case when coalesce(answers->'reasons','[]'::jsonb) ? 'online_content' then 'interested' end,
    'teacher_training',case when coalesce(answers->'reasons','[]'::jsonb) ? 'teacher_training' then 'interested' end,
    'wedding',case when coalesce(answers->'reasons','[]'::jsonb) ? 'wedding' then 'interested' end
  )) as interest_states from latest_onboarding
),
effective_interests as (
  select p.id as person_id,coalesce(oi.interest_states,'{}'::jsonb) || coalesce(mi.interest_states,'{}'::jsonb) as interest_states
  from public.people p left join onboarding_interest oi on oi.person_id=p.id left join manual_interests mi on mi.person_id=p.id
),
declared_dance as (
  select s.person_id,
    jsonb_agg(jsonb_build_object('style_term_id',s.style_term_id,'style',st.label,'style_key',st.term_key,'role_mode',s.role_mode,'self_reported_level_term_id',s.self_reported_level_term_id,'self_reported_level',lv.label,'is_primary',s.is_primary) order by s.is_primary desc,st.sort_order,st.id) filter (where s.active) as profiles,
    max(st.label) filter (where s.active and s.is_primary) as primary_declared_style,
    max(st.term_key) filter (where s.active and s.is_primary) as primary_declared_style_key,
    max(s.role_mode) filter (where s.active and s.is_primary) as primary_declared_role_mode,
    max(lv.label) filter (where s.active and s.is_primary) as primary_self_reported_level
  from public.student_declared_dance_styles s join public.catalog_terms st on st.id=s.style_term_id left join public.catalog_terms lv on lv.id=s.self_reported_level_term_id
  group by s.person_id
),
evaluated_dance as (
  select d.person_id,
    jsonb_agg(jsonb_build_object('style_term_id',d.style_term_id,'style',st.label,'style_key',st.term_key,'role_term_id',d.role_term_id,'role',rt.label,'role_key',rt.term_key,'level_term_id',d.level_term_id,'level',lv.label,'level_key',lv.term_key,'is_primary',d.is_primary) order by d.is_primary desc,st.sort_order,rt.sort_order,d.id) filter (where d.active) as profiles,
    max(st.label) filter (where d.active and d.is_primary) as primary_evaluated_style,
    max(st.term_key) filter (where d.active and d.is_primary) as primary_evaluated_style_key,
    max(rt.label) filter (where d.active and d.is_primary) as primary_evaluated_role,
    max(rt.term_key) filter (where d.active and d.is_primary) as primary_evaluated_role_key,
    max(lv.label) filter (where d.active and d.is_primary) as primary_evaluated_level,
    max(lv.term_key) filter (where d.active and d.is_primary) as primary_evaluated_level_key
  from public.student_dance_profiles d join public.catalog_terms st on st.id=d.style_term_id join public.catalog_terms rt on rt.id=d.role_term_id left join public.catalog_terms lv on lv.id=d.level_term_id
  group by d.person_id
)
select p.id as person_id,p.display_name,p.first_name,p.last_name,p.internal_alias,p.email,p.phone,p.country_code,p.instagram_handle,p.crm_stage,p.source,
  p.auth_user_id is not null as is_registered,p.created_at as person_created_at,
  sp.city,sp.birth_date,case when sp.birth_date is null then null::integer else extract(year from age(current_date,sp.birth_date))::integer end as age,
  coalesce(cf.reservation_count,0) as reservation_count,coalesce(cf.reservation_count,0)>0 as has_reserved,cf.next_class_at,cf.last_class_at,coalesce(cf.cancelled_count,0) as cancelled_count,
  ei.interest_states,exists(select 1 from jsonb_each_text(coalesce(ei.interest_states,'{}'::jsonb)) x where x.value='interested') as has_any_interest,
  coalesce(ei.interest_states->>'in_person_classes','unknown')='interested' as interested_in_person_classes,
  coalesce(r.no_booking_reasons,'[]'::jsonb) as no_booking_reasons,r.primary_no_booking_reason,
  (coalesce(ei.interest_states->>'in_person_classes','unknown')='interested' and coalesce(cf.reservation_count,0)=0) as interested_without_booking,
  (coalesce(ei.interest_states->>'in_person_classes','unknown')='interested' and coalesce(cf.reservation_count,0)=0 and r.primary_no_booking_reason is null) as no_booking_reason_missing,
  cf.next_class_at is not null as has_next_class,
  coalesce(ei.interest_states->>'online_content','unknown')='interested' as interested_in_online_content,
  coalesce(ei.interest_states->>'teacher_training','unknown')='interested' as interested_in_teacher_training,
  coalesce(ei.interest_states->>'wedding','unknown')='interested' as interested_in_wedding,
  coalesce(ei.interest_states->>'online_feedback','unknown')='interested' as interested_in_online_feedback,
  coalesce(q.questionnaire_finalized,false) as questionnaire_finalized,q.questionnaire_last_finalized_at,
  (cf.next_class_at is not null and not coalesce(q.questionnaire_finalized,false)) as questionnaire_pending_with_next_class,
  lo.answers->>'dance_experience' as dance_experience,coalesce(lo.answers->'desired_styles','[]'::jsonb) as desired_styles,coalesce(lo.answers->'starting_styles','[]'::jsonb) as starting_styles,
  lo.answers->>'has_practice_partner' as has_practice_partner,coalesce(lo.answers->'reasons','[]'::jsonb) as onboarding_reasons,lo.answers->>'class_location_interest' as class_location_interest,
  lo.answers->>'temporary_until' as temporary_until,lo.answers->>'plans_return' as plans_return,lo.answers->>'how_found_us' as how_found_us,lo.answers->>'referred_by' as referred_by,
  lo.answers->>'goals_detail' as goals_detail,lo.answers->>'health_notes_optional' as health_notes_optional,
  coalesce(dd.profiles,'[]'::jsonb) as declared_dance_profiles,dd.primary_declared_style,dd.primary_declared_style_key,dd.primary_declared_role_mode,dd.primary_self_reported_level,
  coalesce(ed.profiles,'[]'::jsonb) as evaluated_dance_profiles,ed.primary_evaluated_style,ed.primary_evaluated_style_key,ed.primary_evaluated_role,ed.primary_evaluated_role_key,ed.primary_evaluated_level,ed.primary_evaluated_level_key
from public.people p
left join public.student_profiles sp on sp.person_id=p.id
left join class_facts cf on cf.person_id=p.id
left join effective_interests ei on ei.person_id=p.id
left join reasons r on r.person_id=p.id
left join questionnaire q on q.person_id=p.id
left join latest_onboarding lo on lo.person_id=p.id
left join declared_dance dd on dd.person_id=p.id
left join evaluated_dance ed on ed.person_id=p.id
where p.active;
