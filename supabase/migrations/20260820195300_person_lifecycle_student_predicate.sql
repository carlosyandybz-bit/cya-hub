-- PERSON-01 / FUNC-0040 / FUNC-0041
-- Canonical person identity remains public.people.id.
-- Lifecycle is derived from real student evidence; a profile or auth account alone is not evidence.

create or replace function private.person_is_student_unchecked(p_person_id bigint)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not exists (
      select 1
      from public.people p
      where p.id = p_person_id
    ) then null
    else (
      exists (
        select 1
        from public.class_participants cp
        where cp.person_id = p_person_id
      )
      or exists (
        select 1
        from public.credit_grant_members cgm
        where cgm.person_id = p_person_id
      )
      or exists (
        select 1
        from public.feedback_requests fr
        where fr.person_id = p_person_id
      )
      or exists (
        select 1
        from public.student_content_assignments sca
        where sca.person_id = p_person_id
      )
      or exists (
        select 1
        from public.academy_enrollments ae
        where ae.person_id = p_person_id
      )
      or exists (
        select 1
        from public.student_profiles sp
        where sp.person_id = p_person_id
          and sp.active
          and (
            coalesce(sp.historical_classes, 0) > 0
            or coalesce(sp.historical_consumed_classes, 0) > 0
            or coalesce(sp.bought_bonus, false)
          )
      )
    )
  end;
$function$;

revoke all on function private.person_is_student_unchecked(bigint) from public;
grant execute on function private.person_is_student_unchecked(bigint) to postgres;

create or replace function public.person_is_student(p_person_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_is_student boolean;
begin
  if not (select private.is_staff())
     and p_person_id is distinct from (select private.current_person_id()) then
    raise exception 'No tienes permiso para consultar esta identidad.' using errcode = '42501';
  end if;

  select private.person_is_student_unchecked(p_person_id)
    into v_is_student;

  if v_is_student is null then
    raise exception 'La persona no existe.' using errcode = 'P0002';
  end if;

  return v_is_student;
end;
$function$;

revoke all on function public.person_is_student(bigint) from public;
grant execute on function public.person_is_student(bigint) to authenticated, service_role;

create or replace function private.person_lifecycle_status_unchecked(p_person_id bigint)
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_is_student boolean;
begin
  select private.person_is_student_unchecked(p_person_id)
    into v_is_student;

  if v_is_student is null then
    return null;
  end if;

  if not v_is_student then
    return 'potential';
  end if;

  if exists (
    select 1
    from public.people p
    where p.id = p_person_id
      and p.auth_user_id is not null
  ) then
    return 'registered';
  end if;

  return 'provisional';
end;
$function$;

revoke all on function private.person_lifecycle_status_unchecked(bigint) from public;
grant execute on function private.person_lifecycle_status_unchecked(bigint) to postgres;

comment on function private.person_is_student_unchecked(bigint) is
  'PERSON-01 canonical student predicate. Evidence only; profile/auth alone never qualifies.';
comment on function public.person_is_student(bigint) is
  'Permission-checked canonical student predicate for FUNC-0041.';
comment on function private.person_lifecycle_status_unchecked(bigint) is
  'FUNC-0040 derived lifecycle: potential without student evidence; provisional with evidence/no auth; registered with evidence/auth.';
