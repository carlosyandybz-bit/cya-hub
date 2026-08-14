-- Amplía el contrato canónico P20 con la ficha profesional del profesor.

create or replace function private.form_canonical_path_allowed(p_path text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select p_path = any(array[
    'people.first_name','people.last_name','people.email','people.phone','people.country_code',
    'student_profiles.birth_date','student_profiles.goals','student_profiles.motivation',
    'student_profiles.health_notes','student_profiles.teacher_notes',
    'teacher_profiles.professional_name','teacher_profiles.bio','teacher_profiles.styles','teacher_profiles.specialties'
  ]::text[]);
$$;

create or replace function private.form_canonical_value(p_path text, p_person_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_value jsonb;
begin
  if p_person_id is null or p_path is null then return null; end if;
  if not private.form_canonical_path_allowed(p_path) then return null; end if;

  if p_path='people.first_name' then
    select to_jsonb(first_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.last_name' then
    select to_jsonb(last_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.email' then
    select to_jsonb(email) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.phone' then
    select to_jsonb(phone) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.country_code' then
    select to_jsonb(country_code) into v_value from public.people where id=p_person_id and active;
  elsif p_path='student_profiles.birth_date' then
    select to_jsonb(birth_date::text) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.goals' then
    select to_jsonb(goals) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.motivation' then
    select to_jsonb(motivation) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.health_notes' then
    select to_jsonb(health_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.teacher_notes' then
    select to_jsonb(teacher_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.professional_name' then
    select to_jsonb(professional_name) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.bio' then
    select to_jsonb(bio) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.specialties' then
    select to_jsonb(specialties) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.styles' then
    select to_jsonb(coalesce(array_agg(tps.style_term_id order by ct.sort_order,ct.id),'{}'::bigint[]))
      into v_value
    from public.teacher_profile_styles tps
    join public.catalog_terms ct on ct.id=tps.style_term_id
    where tps.person_id=p_person_id and ct.taxonomy='dance_style' and ct.active;
  end if;
  return v_value;
end;
$$;

revoke all on function private.form_canonical_path_allowed(text) from public, anon, authenticated;
revoke all on function private.form_canonical_value(text,bigint) from public, anon, authenticated;
