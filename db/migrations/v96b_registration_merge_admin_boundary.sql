-- CYA Hub v96b — administrator-only boundary for identity merge operations.

begin;

revoke execute on function public.find_person_merge_candidate(bigint,text,text) from authenticated;
revoke execute on function public.merge_fresh_registered_person(bigint,bigint,text,text) from authenticated;

create or replace function public.admin_find_person_merge_candidate(
  p_source_person_id bigint,
  p_email text default null,
  p_phone text default null
)
returns table(
  person_id bigint,
  display_name text,
  email text,
  phone text,
  lifecycle_status text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;

  return query
  select *
  from public.find_person_merge_candidate(p_source_person_id,p_email,p_phone);
end;
$$;

revoke all on function public.admin_find_person_merge_candidate(bigint,text,text) from public, anon;
grant execute on function public.admin_find_person_merge_candidate(bigint,text,text) to authenticated;

create or replace function public.admin_merge_fresh_registered_person(
  p_source_person_id bigint,
  p_target_person_id bigint,
  p_match_email text default null,
  p_match_phone text default null
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;

  return public.merge_fresh_registered_person(
    p_source_person_id,
    p_target_person_id,
    p_match_email,
    p_match_phone
  );
end;
$$;

revoke all on function public.admin_merge_fresh_registered_person(bigint,bigint,text,text) from public, anon;
grant execute on function public.admin_merge_fresh_registered_person(bigint,bigint,text,text) to authenticated;

commit;
