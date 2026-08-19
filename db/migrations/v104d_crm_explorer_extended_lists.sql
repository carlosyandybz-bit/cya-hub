create or replace view public.crm_person_explorer_v with (security_invoker=true) as
with class_facts as (
  select cp.person_id,
    count(*) filter (where c.status <> 'cancelled')::int as reservation_count,
    min(c.scheduled_start_at) filter (where c.status <> 'cancelled' and c.scheduled_start_at >= now()) as next_class_at,
    max(c.scheduled_start_at) filter (where c.status in ('active','finished') or (c.status='scheduled' and c.scheduled_start_at < now())) as last_class_at,
    count(*) filter (where c.status='cancelled')::int as cancelled_count
  from public.class_participants cp join public.classes c on c.id=cp.class_id group by cp.person_id
), interests as (
  select person_id,
    jsonb_object_agg(interest_type,status) as interest_states,
    bool_or(status='interested') as has_any_interest,
    bool_or(interest_type='in_person_classes' and status='interested') as interested_in_person_classes,
    bool_or(interest_type='online_content' and status='interested') as interested_in_online_content,
    bool_or(interest_type='teacher_training' and status='interested') as interested_in_teacher_training,
    bool_or(interest_type='wedding' and status='interested') as interested_in_wedding,
    bool_or(interest_type='online_feedback' and status='interested') as interested_in_online_feedback
  from public.crm_interest_states group by person_id
), reasons as (
  select person_id,
    jsonb_agg(jsonb_build_object('reason_key',reason_key,'is_primary',is_primary,'note',note,'source_type',source_type,'source_class_id',source_class_id,'last_confirmed_at',last_confirmed_at) order by is_primary desc,last_confirmed_at desc) filter (where active) as no_booking_reasons,
    max(reason_key) filter (where active and is_primary) as primary_no_booking_reason
  from public.crm_no_booking_reasons group by person_id
), questionnaire as (
  select fs.person_id, true as questionnaire_finalized, max(fs.submitted_at) as questionnaire_last_finalized_at
  from public.form_submissions fs
  join public.form_versions fv on fv.id=fs.form_version_id
  join public.form_definitions fd on fd.id=fv.form_id
  where fd.form_key='onboarding'
  group by fs.person_id
)
select p.id as person_id,p.display_name,p.first_name,p.last_name,p.internal_alias,p.email,p.phone,p.country_code,p.instagram_handle,p.crm_stage,p.source,p.auth_user_id is not null as is_registered,p.created_at as person_created_at,
  sp.city,sp.birth_date,
  case when sp.birth_date is null then null else extract(year from age(current_date,sp.birth_date))::int end as age,
  coalesce(cf.reservation_count,0) as reservation_count,coalesce(cf.reservation_count,0)>0 as has_reserved,cf.next_class_at,cf.last_class_at,coalesce(cf.cancelled_count,0) as cancelled_count,
  coalesce(i.interest_states,'{}'::jsonb) as interest_states,coalesce(i.has_any_interest,false) as has_any_interest,coalesce(i.interested_in_person_classes,false) as interested_in_person_classes,
  coalesce(r.no_booking_reasons,'[]'::jsonb) as no_booking_reasons,r.primary_no_booking_reason,
  (coalesce(i.interested_in_person_classes,false) and coalesce(cf.reservation_count,0)=0) as interested_without_booking,
  (coalesce(i.interested_in_person_classes,false) and coalesce(cf.reservation_count,0)=0 and r.primary_no_booking_reason is null) as no_booking_reason_missing,
  (cf.next_class_at is not null) as has_next_class,
  coalesce(i.interested_in_online_content,false) as interested_in_online_content,
  coalesce(i.interested_in_teacher_training,false) as interested_in_teacher_training,
  coalesce(i.interested_in_wedding,false) as interested_in_wedding,
  coalesce(i.interested_in_online_feedback,false) as interested_in_online_feedback,
  coalesce(q.questionnaire_finalized,false) as questionnaire_finalized,
  q.questionnaire_last_finalized_at,
  ((cf.next_class_at is not null) and not coalesce(q.questionnaire_finalized,false)) as questionnaire_pending_with_next_class
from public.people p
left join public.student_profiles sp on sp.person_id=p.id
left join class_facts cf on cf.person_id=p.id
left join interests i on i.person_id=p.id
left join reasons r on r.person_id=p.id
left join questionnaire q on q.person_id=p.id
where p.active;

insert into public.crm_saved_views(view_key,name,filters,columns,sort,is_system)
values
('next_class','Alumnos con próxima clase','{"has_next_class":true}'::jsonb,'["display_name","next_class_at","phone"]'::jsonb,'[{"field":"next_class_at","direction":"asc"}]'::jsonb,true),
('no_next_class','Alumnos sin próxima clase','{"has_next_class":false,"has_reserved":true}'::jsonb,'["display_name","last_class_at","phone"]'::jsonb,'[{"field":"last_class_at","direction":"asc"}]'::jsonb,true),
('questionnaire_pending_next_class','Cuestionario pendiente · próxima clase','{"questionnaire_pending_with_next_class":true}'::jsonb,'["display_name","next_class_at","phone"]'::jsonb,'[{"field":"next_class_at","direction":"asc"}]'::jsonb,true),
('online_content_interest','Interesados en contenido online','{"interested_in_online_content":true}'::jsonb,'["display_name","phone","email"]'::jsonb,'[{"field":"display_name","direction":"asc"}]'::jsonb,true),
('teacher_training_interest','Profesores interesados en formación','{"interested_in_teacher_training":true}'::jsonb,'["display_name","phone","email"]'::jsonb,'[{"field":"display_name","direction":"asc"}]'::jsonb,true)
on conflict do nothing;
