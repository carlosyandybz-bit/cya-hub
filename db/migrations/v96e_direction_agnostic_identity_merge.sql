-- CYA Hub v96e — direction-agnostic identity merge.
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
  v_a public.people;
  v_b public.people;
  v_registered_id bigint;
  v_canonical_id bigint;
  v_canonical public.people;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede fusionar fichas.' using errcode='42501';
  end if;
  if p_source_person_id is null or p_target_person_id is null or p_source_person_id=p_target_person_id then
    raise exception 'Selecciona dos fichas distintas.' using errcode='22023';
  end if;

  select * into v_a from public.people where id=p_source_person_id and active;
  select * into v_b from public.people where id=p_target_person_id and active;
  if v_a.id is null or v_b.id is null then
    raise exception 'Alguna de las fichas ya no está activa.' using errcode='P0002';
  end if;

  if v_a.auth_user_id is not null and v_b.auth_user_id is null then
    v_registered_id := v_a.id;
    v_canonical_id := v_b.id;
  elsif v_b.auth_user_id is not null and v_a.auth_user_id is null then
    v_registered_id := v_b.id;
    v_canonical_id := v_a.id;
  elsif v_a.auth_user_id is not null and v_b.auth_user_id is not null then
    raise exception 'No se pueden fusionar automáticamente dos cuentas registradas.' using errcode='23505';
  else
    raise exception 'Una de las dos fichas debe corresponder a una cuenta registrada.' using errcode='22023';
  end if;

  select * into v_canonical from public.people where id=v_canonical_id;

  return public.merge_fresh_registered_person(
    v_registered_id,
    v_canonical_id,
    v_canonical.email,
    v_canonical.phone
  );
end;
$$;

revoke all on function public.admin_search_person_merge_candidates(bigint,text) from public, anon;
grant execute on function public.admin_search_person_merge_candidates(bigint,text) to authenticated;
revoke all on function public.admin_merge_selected_person(bigint,bigint) from public, anon;
grant execute on function public.admin_merge_selected_person(bigint,bigint) to authenticated;

commit;
