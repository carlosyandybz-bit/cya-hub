-- CYA Hub v96d — allow identity merge from either profile editor.
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
    and (
      p.display_name ilike '%' || v_query || '%'
      or coalesce(p.email,'') ilike '%' || v_query || '%'
      or coalesce(p.phone,'') ilike '%' || v_query || '%'
      or (v_phone is not null and private.normalize_person_phone(p.phone) like '%' || v_phone || '%')
    )
  order by
    case when lower(coalesce(p.display_name,'')) = lower(v_query) then 0 else 1 end,
    case when p.auth_user_id is not null then 0 else 1 end,
    p.display_name
  limit 20;
end;
$$;

create or replace function public.admin_merge_people_auto(
  p_person_a_id bigint,
  p_person_b_id bigint
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_a public.people;
  v_b public.people;
  v_registered_id bigint;
  v_existing_id bigint;
  v_existing public.people;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;
  if p_person_a_id is null or p_person_b_id is null or p_person_a_id=p_person_b_id then
    raise exception 'Selecciona dos fichas distintas.' using errcode='22023';
  end if;

  select * into v_a from public.people where id=p_person_a_id and active;
  select * into v_b from public.people where id=p_person_b_id and active;
  if v_a.id is null or v_b.id is null then
    raise exception 'Alguna de las fichas ya no está disponible.' using errcode='P0002';
  end if;

  if (v_a.auth_user_id is not null) = (v_b.auth_user_id is not null) then
    raise exception 'Para esta fusión debe haber una ficha registrada y otra ficha previa sin cuenta.' using errcode='22023';
  end if;

  if v_a.auth_user_id is not null then
    v_registered_id := v_a.id;
    v_existing_id := v_b.id;
    v_existing := v_b;
  else
    v_registered_id := v_b.id;
    v_existing_id := v_a.id;
    v_existing := v_a;
  end if;

  return public.merge_fresh_registered_person(
    v_registered_id,
    v_existing_id,
    v_existing.email,
    v_existing.phone
  );
end;
$$;

revoke all on function public.admin_search_person_merge_candidates(bigint,text) from public, anon;
grant execute on function public.admin_search_person_merge_candidates(bigint,text) to authenticated;
revoke all on function public.admin_merge_people_auto(bigint,bigint) from public, anon;
grant execute on function public.admin_merge_people_auto(bigint,bigint) to authenticated;

commit;
