-- CYA Hub v96 — mandatory registered-student profile completion + safe duplicate identity merge.
-- Incremental/idempotent. No business records are deleted or reassigned automatically.

begin;

create or replace function public.registration_profile_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person public.people;
  v_missing text[] := '{}'::text[];
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.' using errcode='42501';
  end if;

  select p.* into v_person
  from public.people p
  where p.auth_user_id = auth.uid() and p.active
  limit 1;

  if not found then
    return jsonb_build_object('available', true, 'complete', false, 'person_id', null, 'missing', jsonb_build_array('profile'));
  end if;

  if nullif(btrim(coalesce(v_person.first_name,'')),'') is null then v_missing := array_append(v_missing,'first_name'); end if;
  if nullif(btrim(coalesce(v_person.last_name,'')),'') is null then v_missing := array_append(v_missing,'last_name'); end if;
  if private.normalize_person_phone(v_person.phone) is null or length(private.normalize_person_phone(v_person.phone)) < 7 then v_missing := array_append(v_missing,'phone'); end if;
  if nullif(btrim(coalesce(v_person.country_code,'')),'') is null then v_missing := array_append(v_missing,'country_code'); end if;

  return jsonb_build_object(
    'available', true,
    'complete', cardinality(v_missing)=0,
    'person_id', v_person.id,
    'first_name', v_person.first_name,
    'last_name', v_person.last_name,
    'phone', v_person.phone,
    'country_code', v_person.country_code,
    'missing', to_jsonb(v_missing)
  );
end;
$$;

revoke all on function public.registration_profile_status() from public, anon;
grant execute on function public.registration_profile_status() to authenticated;

create or replace function public.complete_registration_profile(
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_country_code text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person_id bigint;
  v_match bigint;
  v_first text := nullif(btrim(coalesce(p_first_name,'')),'');
  v_last text := nullif(btrim(coalesce(p_last_name,'')),'');
  v_phone text := nullif(btrim(coalesce(p_phone,'')),'');
  v_phone_normalized text := private.normalize_person_phone(p_phone);
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))),'');
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.' using errcode='42501'; end if;
  if v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_last is null then raise exception 'Los apellidos son obligatorios.' using errcode='22023'; end if;
  if v_phone_normalized is null or length(v_phone_normalized) < 7 then raise exception 'Introduce un teléfono válido.' using errcode='22023'; end if;
  if v_country is null then raise exception 'El país es obligatorio.' using errcode='22023'; end if;

  select p.id into v_person_id
  from public.people p
  where p.auth_user_id=auth.uid() and p.active
  for update;

  if v_person_id is null then raise exception 'No se ha encontrado tu ficha personal.' using errcode='P0002'; end if;

  perform private.lock_person_identity(null,v_phone);
  select private.match_person_identity(null,v_phone,v_person_id) into v_match;
  if v_match is not null then
    raise exception 'Este teléfono ya pertenece a una ficha existente. Un administrador debe fusionar ambas fichas antes de continuar.' using errcode='23505';
  end if;

  update public.people
  set first_name=v_first,
      last_name=v_last,
      display_name=concat_ws(' ',v_first,v_last),
      phone=v_phone,
      country_code=v_country,
      updated_at=now()
  where id=v_person_id;

  return public.registration_profile_status();
end;
$$;

revoke all on function public.complete_registration_profile(text,text,text,text) from public, anon;
grant execute on function public.complete_registration_profile(text,text,text,text) to authenticated;

create or replace function public.find_person_merge_candidate(
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
declare
  v_match bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para fusionar fichas.' using errcode='42501'; end if;
  if p_source_person_id is null then raise exception 'Falta la ficha de origen.' using errcode='22023'; end if;

  select private.match_person_identity(p_email,p_phone,p_source_person_id) into v_match;
  if v_match is null then return; end if;

  return query
  select p.id, p.display_name, p.email, p.phone, private.person_lifecycle_status_unchecked(p.id)
  from public.people p
  where p.id=v_match and p.active and p.auth_user_id is null;
end;
$$;

revoke all on function public.find_person_merge_candidate(bigint,text,text) from public, anon;
grant execute on function public.find_person_merge_candidate(bigint,text,text) to authenticated;

create or replace function public.merge_fresh_registered_person(
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
declare
  v_source public.people;
  v_target public.people;
  v_verified_match bigint;
  v_fk record;
  v_has_rows boolean;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para fusionar fichas.' using errcode='42501'; end if;
  if p_source_person_id is null or p_target_person_id is null or p_source_person_id=p_target_person_id then
    raise exception 'Selecciona dos fichas distintas.' using errcode='22023';
  end if;

  perform 1 from public.people where id=least(p_source_person_id,p_target_person_id) for update;
  perform 1 from public.people where id=greatest(p_source_person_id,p_target_person_id) for update;

  select * into v_source from public.people where id=p_source_person_id and active;
  select * into v_target from public.people where id=p_target_person_id and active;
  if v_source.id is null or v_target.id is null then raise exception 'Alguna de las fichas ya no está activa.' using errcode='P0002'; end if;
  if v_source.auth_user_id is null then raise exception 'La ficha de origen no es una cuenta registrada.' using errcode='22023'; end if;
  if v_target.auth_user_id is not null then raise exception 'La ficha de destino ya está vinculada a otra cuenta registrada.' using errcode='23505'; end if;

  select private.match_person_identity(p_match_email,p_match_phone,p_source_person_id) into v_verified_match;
  if v_verified_match is distinct from p_target_person_id then
    raise exception 'La identidad indicada ya no coincide de forma única con la ficha de destino.' using errcode='23505';
  end if;

  for v_fk in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema=tc.constraint_schema and kcu.constraint_name=tc.constraint_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema=tc.constraint_schema and ccu.constraint_name=tc.constraint_name
    where tc.constraint_type='FOREIGN KEY'
      and ccu.table_schema='public' and ccu.table_name='people' and ccu.column_name='id'
      and not (tc.table_schema='public' and tc.table_name='student_profiles')
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.table_schema,v_fk.table_name,v_fk.column_name)
      into v_has_rows using p_source_person_id;
    if v_has_rows then
      raise exception 'Esta ficha registrada ya tiene actividad asociada y no puede fusionarse automáticamente. Requiere una fusión asistida para conservar todo el historial.' using errcode='55000';
    end if;
  end loop;

  update public.people
  set auth_user_id=v_source.auth_user_id,
      first_name=coalesce(nullif(btrim(v_target.first_name),''),v_source.first_name),
      last_name=coalesce(nullif(btrim(v_target.last_name),''),v_source.last_name),
      display_name=case when nullif(btrim(v_target.display_name),'') is null then v_source.display_name else v_target.display_name end,
      email=coalesce(v_target.email,v_source.email),
      phone=coalesce(v_target.phone,v_source.phone),
      country_code=coalesce(v_target.country_code,v_source.country_code),
      updated_at=now()
  where id=p_target_person_id;

  insert into public.student_profiles(person_id,student_since,active,created_by)
  values(p_target_person_id,null,true,auth.uid())
  on conflict(person_id) do update set active=true,updated_at=now();

  update public.student_profiles set active=false,updated_at=now() where person_id=p_source_person_id;

  update public.people
  set auth_user_id=null,
      email=null,
      phone=null,
      active=false,
      updated_at=now()
  where id=p_source_person_id;

  return p_target_person_id;
end;
$$;

revoke all on function public.merge_fresh_registered_person(bigint,bigint,text,text) from public, anon;
grant execute on function public.merge_fresh_registered_person(bigint,bigint,text,text) to authenticated;

commit;
