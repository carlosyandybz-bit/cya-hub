-- CYA Hub v96c — simple administrator merge search.
begin;

create or replace function public.admin_search_person_merge_candidates(
  p_source_person_id bigint,
  p_query text
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
declare
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
  v_phone text := private.normalize_person_phone(p_query);
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;
  if v_query is null then return; end if;

  return query
  select
    p.id,
    p.display_name,
    p.email,
    p.phone,
    private.person_lifecycle_status_unchecked(p.id)
  from public.people p
  where p.active
    and p.id <> p_source_person_id
    and p.auth_user_id is null
    and (
      p.display_name ilike '%' || v_query || '%'
      or coalesce(p.email,'') ilike '%' || v_query || '%'
      or coalesce(p.phone,'') ilike '%' || v_query || '%'
      or (v_phone is not null and private.normalize_person_phone(p.phone) like '%' || v_phone || '%')
    )
  order by
    case when lower(coalesce(p.display_name,'')) = lower(v_query) then 0 else 1 end,
    p.display_name
  limit 20;
end;
$$;

revoke all on function public.admin_search_person_merge_candidates(bigint,text) from public, anon;
grant execute on function public.admin_search_person_merge_candidates(bigint,text) to authenticated;

create or replace function public.admin_merge_selected_person(
  p_source_person_id bigint,
  p_target_person_id bigint
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_target public.people;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;

  select * into v_target
  from public.people
  where id=p_target_person_id and active and auth_user_id is null;

  if not found then
    raise exception 'La ficha seleccionada ya no está disponible para fusionar.' using errcode='P0002';
  end if;

  return public.merge_fresh_registered_person(
    p_source_person_id,
    p_target_person_id,
    v_target.email,
    v_target.phone
  );
end;
$$;

revoke all on function public.admin_merge_selected_person(bigint,bigint) from public, anon;
grant execute on function public.admin_merge_selected_person(bigint,bigint) to authenticated;

commit;
