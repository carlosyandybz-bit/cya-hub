-- CYA Hub v97 — registered identity precedence, Instagram, and explicit self-reported dance level.
-- The registered person's own non-empty personal data wins during a merge.
-- Internal/history data on the pre-existing profile remains authoritative.

begin;

alter table public.people
  add column if not exists instagram_handle text;

alter table public.student_dance_profiles
  add column if not exists self_reported_level_term_id bigint references public.catalog_terms(id);

update public.student_dance_profiles
set self_reported_level_term_id = level_term_id
where self_reported_level_term_id is null and level_term_id is not null;

comment on column public.student_dance_profiles.self_reported_level_term_id is
  'Nivel declarado por el alumno. Nunca representa el nivel evaluado por CYA.';
comment on column public.student_dance_profiles.level_term_id is
  'Compatibilidad histórica. Para nuevas lecturas/escrituras de nivel declarado usar self_reported_level_term_id; el nivel evaluado vive en el sistema de evaluaciones/progreso.';
comment on column public.people.instagram_handle is
  'Usuario o URL de Instagram declarado por la persona.';

create or replace function public.save_person_instagram(p_person_id bigint, p_instagram text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_value text := nullif(btrim(coalesce(p_instagram,'')),'');
  v_current bigint := (select private.current_person_id());
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.' using errcode='42501'; end if;
  if p_person_id is null then raise exception 'Falta la persona.' using errcode='22023'; end if;
  if not (select private.is_staff()) and p_person_id is distinct from v_current then
    raise exception 'No tienes permiso para editar ese perfil.' using errcode='42501';
  end if;

  if v_value is not null then
    v_value := regexp_replace(v_value, '^https?://(www\.)?instagram\.com/', '', 'i');
    v_value := regexp_replace(v_value, '^@', '');
    v_value := regexp_replace(v_value, '[/?#].*$', '');
    if v_value !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'Introduce un usuario de Instagram válido.' using errcode='22023';
    end if;
  end if;

  update public.people
  set instagram_handle=v_value, updated_at=now()
  where id=p_person_id and active;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  return v_value;
end;
$$;
revoke all on function public.save_person_instagram(bigint,text) from public, anon;
grant execute on function public.save_person_instagram(bigint,text) to authenticated;

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
  v_source_profile public.student_profiles;
  v_verified_match bigint;
  v_fk record;
  v_has_rows boolean;
  v_display text;
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
  if v_target.auth_user_id is not null then raise exception 'La ficha histórica ya está vinculada a otra cuenta.' using errcode='23505'; end if;

  if nullif(btrim(coalesce(p_match_email,'')),'') is not null or nullif(btrim(coalesce(p_match_phone,'')),'') is not null then
    select private.match_person_identity(p_match_email,p_match_phone,p_source_person_id) into v_verified_match;
    if v_verified_match is distinct from p_target_person_id then
      raise exception 'La identidad indicada ya no coincide de forma única con la ficha seleccionada.' using errcode='23505';
    end if;
  end if;

  for v_fk in
    select tc.table_schema, tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_schema=tc.constraint_schema and kcu.constraint_name=tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_schema=tc.constraint_schema and ccu.constraint_name=tc.constraint_name
    where tc.constraint_type='FOREIGN KEY'
      and ccu.table_schema='public' and ccu.table_name='people' and ccu.column_name='id'
      and not (tc.table_schema='public' and tc.table_name in ('student_profiles','bz_point_ledger','form_submissions'))
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.table_schema,v_fk.table_name,v_fk.column_name)
      into v_has_rows using p_source_person_id;
    if v_has_rows then
      raise exception 'La ficha registrada ya tiene actividad asociada y requiere una fusión asistida para conservar todo el historial.' using errcode='55000';
    end if;
  end loop;

  select * into v_source_profile from public.student_profiles where person_id=p_source_person_id;

  update public.people
  set auth_user_id=null,email=null,phone=null,updated_at=now()
  where id=p_source_person_id;

  v_display := nullif(btrim(v_source.display_name),'');
  if v_display is not null and (v_display=lower(v_display) or v_display=upper(v_display)) then
    v_display := initcap(lower(v_display));
  end if;

  update public.people
  set auth_user_id=v_source.auth_user_id,
      first_name=coalesce(nullif(btrim(v_source.first_name),''),v_target.first_name),
      last_name=coalesce(nullif(btrim(v_source.last_name),''),v_target.last_name),
      display_name=coalesce(
        v_display,
        nullif(btrim(concat_ws(' ',v_source.first_name,v_source.last_name)),''),
        v_target.display_name
      ),
      email=coalesce(nullif(btrim(v_source.email),''),v_target.email),
      phone=coalesce(nullif(btrim(v_source.phone),''),v_target.phone),
      country_code=coalesce(nullif(btrim(v_source.country_code),''),v_target.country_code),
      instagram_handle=coalesce(nullif(btrim(v_source.instagram_handle),''),v_target.instagram_handle),
      updated_at=now()
  where id=p_target_person_id;

  insert into public.student_profiles(person_id,active,created_by)
  values(p_target_person_id,true,auth.uid())
  on conflict(person_id) do update set active=true,updated_at=now();

  if v_source_profile.person_id is not null then
    update public.student_profiles t
    set birth_date=coalesce(v_source_profile.birth_date,t.birth_date),
        goals=coalesce(nullif(btrim(v_source_profile.goals),''),t.goals),
        motivation=coalesce(nullif(btrim(v_source_profile.motivation),''),t.motivation),
        health_notes=coalesce(nullif(btrim(v_source_profile.health_notes),''),t.health_notes),
        city=coalesce(nullif(btrim(v_source_profile.city),''),t.city),
        has_partner=coalesce(v_source_profile.has_partner,t.has_partner),
        continues_dancing=coalesce(v_source_profile.continues_dancing,t.continues_dancing),
        bought_bonus=coalesce(v_source_profile.bought_bonus,t.bought_bonus),
        wedding=coalesce(v_source_profile.wedding,t.wedding),
        tourist=coalesce(v_source_profile.tourist,t.tourist),
        referred_by=coalesce(nullif(btrim(v_source_profile.referred_by),''),t.referred_by),
        dance_start_label=coalesce(nullif(btrim(v_source_profile.dance_start_label),''),t.dance_start_label),
        dance_end_label=coalesce(nullif(btrim(v_source_profile.dance_end_label),''),t.dance_end_label),
        updated_at=now()
    where t.person_id=p_target_person_id;
  end if;

  update public.form_submissions
  set person_id=p_target_person_id,updated_at=now()
  where person_id=p_source_person_id;

  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,self_reported_level_term_id,is_primary,active)
  select p_target_person_id,d.style_term_id,d.role_term_id,d.level_term_id,
         coalesce(d.self_reported_level_term_id,d.level_term_id),d.is_primary,d.active
  from public.student_dance_profiles d
  where d.person_id=p_source_person_id
  on conflict(person_id,style_term_id,role_term_id) do update
  set level_term_id=excluded.level_term_id,
      self_reported_level_term_id=excluded.self_reported_level_term_id,
      is_primary=excluded.is_primary,
      active=excluded.active,
      updated_at=now();

  delete from public.student_dance_profiles where person_id=p_source_person_id;
  update public.bz_point_ledger set person_id=p_target_person_id where person_id=p_source_person_id;
  update public.student_profiles set active=false,updated_at=now() where person_id=p_source_person_id;
  update public.people set active=false,updated_at=now() where id=p_source_person_id;
  return p_target_person_id;
end;
$$;

revoke all on function public.merge_fresh_registered_person(bigint,bigint,text,text) from public, anon, authenticated;

commit;
