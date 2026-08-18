-- CYA Hub v96e — preserve automatic BZ point ledger rows during identity merge.
begin;

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

  if nullif(btrim(coalesce(p_match_email,'')),'') is not null or nullif(btrim(coalesce(p_match_phone,'')),'') is not null then
    select private.match_person_identity(p_match_email,p_match_phone,p_source_person_id) into v_verified_match;
    if v_verified_match is distinct from p_target_person_id then
      raise exception 'La identidad indicada ya no coincide de forma única con la ficha de destino.' using errcode='23505';
    end if;
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
      and not (tc.table_schema='public' and tc.table_name='bz_point_ledger')
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.table_schema,v_fk.table_name,v_fk.column_name)
      into v_has_rows using p_source_person_id;
    if v_has_rows then
      raise exception 'Esta ficha registrada ya tiene actividad asociada y no puede fusionarse automáticamente sin revisar su historial.' using errcode='55000';
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

  update public.bz_point_ledger
  set person_id=p_target_person_id
  where person_id=p_source_person_id;

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

revoke all on function public.merge_fresh_registered_person(bigint,bigint,text,text) from public, anon, authenticated;

commit;
