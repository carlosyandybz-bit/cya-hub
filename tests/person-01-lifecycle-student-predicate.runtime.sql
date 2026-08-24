-- PERSON-01 runtime verification matrix for STAGING after applying
-- supabase/migrations/20260820195300_person_lifecycle_student_predicate.sql.
-- All fixture mutations are transaction-local and MUST roll back.

begin;

do $person01_runtime$
declare
  v_person bigint;
  v_staff uuid;
  v_student_only uuid;
  v_auth uuid;
  v_class_id bigint;
  v_grant_id bigint;
  v_content_id bigint;
  v_style_id bigint;
  v_role_id bigint;
  v_level_id bigint;
  v_class_count bigint;
  v_credit_count bigint;
  v_people_count bigint;
  v_role_count bigint;
  v_multi_count bigint;
  v_product_id bigint;
  v_feedback_id bigint;
  v_assignment_id bigint;
  v_program_id bigint;
  v_enrollment_id bigint;
  v_denied boolean := false;
  v_person_row public.people%rowtype;
begin
  select p.id into v_person
  from public.people p
  where p.active
    and p.auth_user_id is not null
    and nullif(btrim(p.first_name),'') is not null
    and nullif(btrim(p.last_name),'') is not null
    and exists(select 1 from public.student_profiles sp where sp.person_id=p.id and sp.active)
    and not exists(select 1 from public.class_participants cp where cp.person_id=p.id)
    and not exists(select 1 from public.credit_grant_members cgm where cgm.person_id=p.id)
    and not exists(select 1 from public.feedback_requests fr where fr.person_id=p.id)
    and not exists(select 1 from public.student_content_assignments sca where sca.person_id=p.id)
    and not exists(select 1 from public.academy_enrollments ae where ae.person_id=p.id)
    and not exists(
      select 1 from public.student_profiles sp
      where sp.person_id=p.id and sp.active
        and (coalesce(sp.historical_classes,0)>0
          or coalesce(sp.historical_consumed_classes,0)>0
          or coalesce(sp.bought_bonus,false))
    )
  order by p.id
  limit 1;

  select r.user_id into v_staff
  from public.app_member_roles r
  where r.active and r.role in ('admin','teacher')
  order by case r.role when 'admin' then 0 else 1 end, r.user_id
  limit 1;

  select r.user_id into v_student_only
  from public.app_member_roles r
  where r.active and r.role='student'
    and not exists(
      select 1 from public.app_member_roles r2
      where r2.user_id=r.user_id and r2.active and r2.role in ('admin','teacher')
    )
  order by r.user_id
  limit 1;

  select min(id) into v_class_id from public.classes;
  select min(id) into v_grant_id from public.credit_grants;
  select min(id) into v_content_id from public.teaching_contents;
  select min(id) into v_style_id from public.catalog_terms where active and taxonomy='dance_style';
  select min(id) into v_role_id from public.catalog_terms where active and taxonomy='dance_role';
  select min(id) into v_level_id from public.catalog_terms where active and taxonomy='dance_level';

  if v_person is null or v_staff is null or v_student_only is null
     or v_class_id is null or v_grant_id is null or v_content_id is null
     or v_style_id is null or v_role_id is null or v_level_id is null then
    raise exception 'PERSON-01 runtime fixtures are incomplete.';
  end if;

  select * into v_person_row from public.people where id=v_person;
  v_auth := v_person_row.auth_user_id;
  select count(*) into v_class_count from public.class_participants;
  select count(*) into v_credit_count from public.credit_grant_members;
  select count(*) into v_people_count from public.people;
  select count(*) into v_role_count from public.app_member_roles;
  select count(*) into v_multi_count
  from (select user_id from public.app_member_roles where active group by user_id having count(*)>1) x;

  if private.person_is_student_unchecked(v_person) is distinct from false
     or private.person_lifecycle_status_unchecked(v_person) <> 'potential' then
    raise exception 'Bare profile/auth must remain non-student POTENTIAL.';
  end if;

  if private.person_is_student_unchecked(9223372036854775000::bigint) is not null then
    raise exception 'Missing people.id must return NULL internally.';
  end if;

  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.save_person_identity(
    v_person,v_person_row.first_name,v_person_row.last_name,v_person_row.email,
    v_person_row.phone,v_person_row.country_code,null,null,null
  );
  if private.person_is_student_unchecked(v_person) is distinct from false then
    raise exception 'Identity/profile edit converted a person without evidence.';
  end if;

  perform public.save_crm_contact(
    v_person,v_person_row.first_name,v_person_row.last_name,v_person_row.email,
    v_person_row.phone,v_person_row.country_code,v_person_row.crm_stage,v_person_row.source,
    current_date,null,false,null,null,v_person_row.notes,'unknown'
  );
  if private.person_lifecycle_status_unchecked(v_person) <> 'potential' then
    raise exception 'CRM edit converted a person without evidence.';
  end if;

  insert into public.class_participants(class_id,person_id) values(v_class_id,v_person);
  if private.person_is_student_unchecked(v_person) is distinct from true
     or private.person_lifecycle_status_unchecked(v_person) <> 'registered' then
    raise exception 'Class evidence not recognized.';
  end if;
  delete from public.class_participants where class_id=v_class_id and person_id=v_person;

  insert into public.credit_grant_members(grant_id,person_id) values(v_grant_id,v_person);
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Credit/bonus evidence not recognized.';
  end if;
  delete from public.credit_grant_members where grant_id=v_grant_id and person_id=v_person;

  select coalesce(max(id),0)+1000000 into v_product_id from public.feedback_products;
  select coalesce(max(id),0)+1000000 into v_feedback_id from public.feedback_requests;
  insert into public.feedback_products(id,name,active)
  values(v_product_id,'PERSON-01 transient product',false);
  insert into public.feedback_requests(id,person_id,product_id,status)
  values(v_feedback_id,v_person,v_product_id,'draft');
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Feedback evidence not recognized.';
  end if;
  delete from public.feedback_requests where id=v_feedback_id;
  delete from public.feedback_products where id=v_product_id;

  select coalesce(max(id),0)+1000000 into v_assignment_id from public.student_content_assignments;
  insert into public.student_content_assignments(id,person_id,content_id)
  overriding system value values(v_assignment_id,v_person,v_content_id);
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Content assignment evidence not recognized.';
  end if;
  delete from public.student_content_assignments where id=v_assignment_id;

  select coalesce(max(id),0)+1000000 into v_program_id from public.academy_programs;
  select coalesce(max(id),0)+1000000 into v_enrollment_id from public.academy_enrollments;
  insert into public.academy_programs(id,title,style_term_id,role_term_id,level_term_id,active)
  values(v_program_id,'PERSON-01 transient program',v_style_id,v_role_id,v_level_id,false);
  insert into public.academy_enrollments(id,program_id,person_id,status,access_source)
  values(v_enrollment_id,v_program_id,v_person,'active','admin');
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Academy enrollment evidence not recognized.';
  end if;
  delete from public.academy_enrollments where id=v_enrollment_id;
  delete from public.academy_programs where id=v_program_id;

  update public.student_profiles set historical_classes=1 where person_id=v_person;
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Historical class evidence not recognized.';
  end if;
  update public.student_profiles
  set historical_classes=0,historical_consumed_classes=0,bought_bonus=false
  where person_id=v_person;
  update public.student_profiles set bought_bonus=true where person_id=v_person;
  if private.person_is_student_unchecked(v_person) is distinct from true then
    raise exception 'Historical bonus evidence not recognized.';
  end if;
  update public.student_profiles set bought_bonus=false where person_id=v_person;

  insert into public.class_participants(class_id,person_id) values(v_class_id,v_person);
  update public.people set auth_user_id=null where id=v_person;
  if private.person_lifecycle_status_unchecked(v_person) <> 'provisional' then
    raise exception 'Evidence without auth must be PROVISIONAL.';
  end if;
  update public.people set auth_user_id=v_auth where id=v_person;
  if private.person_lifecycle_status_unchecked(v_person) <> 'registered' then
    raise exception 'Evidence plus auth must be REGISTRADO.';
  end if;
  delete from public.class_participants where class_id=v_class_id and person_id=v_person;

  perform set_config('request.jwt.claim.sub',v_staff::text,true);
  perform public.person_is_student(v_person);
  perform set_config('request.jwt.claim.sub',v_student_only::text,true);
  begin
    perform public.person_is_student(v_person);
  exception when sqlstate '42501' then
    v_denied := true;
  end;
  if not v_denied then
    raise exception 'Non-staff direct RPC must not query another identity.';
  end if;

  if (select count(*) from public.people) <> v_people_count then
    raise exception 'people.id population changed.';
  end if;
  if (select count(*) from public.class_participants) <> v_class_count
     or (select count(*) from public.credit_grant_members) <> v_credit_count then
    raise exception 'Classes/Bonuses read-regression count changed.';
  end if;
  if (select count(*) from public.app_member_roles) <> v_role_count
     or (select count(*) from (
       select user_id from public.app_member_roles where active group by user_id having count(*)>1
     ) x) <> v_multi_count then
    raise exception 'Roles or multirole changed.';
  end if;
end;
$person01_runtime$;

rollback;
