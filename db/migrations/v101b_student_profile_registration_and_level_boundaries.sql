-- V1-020 — Registro canónico + separación nivel autodeclarado/evaluado
-- Aplicado primero en Supabase STAGING.

do $$
declare
  v_form_id bigint;
  v_old_version_id bigint;
  v_new_version_id bigint;
begin
  select id into v_form_id from public.form_definitions where form_key='onboarding';
  if v_form_id is not null then
    select id into v_old_version_id from public.form_versions where form_id=v_form_id and version_number=2 limit 1;
    select id into v_new_version_id from public.form_versions where form_id=v_form_id and version_number=3 limit 1;

    if v_new_version_id is null and v_old_version_id is not null then
      insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by)
      select form_id,3,'draft',
        'V1-020: onboarding pasa a cuestionario complementario posterior al registro obligatorio. La completitud de registro se rige por registration_profile_status/complete_registration_profile.',
        snapshot,null
      from public.form_versions where id=v_old_version_id
      returning id into v_new_version_id;

      insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
      select v_new_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active
      from public.form_fields where form_version_id=v_old_version_id;

      update public.form_versions
      set status='active',published_at=now()
      where id=v_new_version_id;
      update public.form_versions set status='superseded' where id=v_old_version_id and status='active';
    elsif v_new_version_id is not null then
      update public.form_versions set status='active',published_at=coalesce(published_at,now()) where id=v_new_version_id;
      if v_old_version_id is not null then update public.form_versions set status='superseded' where id=v_old_version_id and status='active'; end if;
    end if;

    update public.form_definitions
    set active_version=3,
        context_key='student_followup',
        description='Cuestionario complementario posterior al registro. Amplía la ficha del alumno sin sustituir los datos obligatorios de acceso ni volver a preguntar datos ya conocidos.',
        settings=coalesce(settings,'{}'::jsonb) || jsonb_build_object(
          'runtime_engine','generic_v1',
          'phase','post_registration',
          'registration_authority',false,
          'registration_required_fields',jsonb_build_array('first_name','last_name','phone','country_code')
        ),
        updated_at=now()
    where id=v_form_id;
  end if;
end $$;

create or replace function public.save_student_dance_preference(
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint,
  p_is_primary boolean default true
)
returns public.student_dance_profiles
language plpgsql
set search_path to ''
as $function$
declare v_profile public.student_dance_profiles;
begin
  if not (select private.is_staff()) then
    raise exception 'El nivel pedagógico solo puede modificarlo Profesor o Administración.' using errcode='42501';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'Estilo no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'Rol no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Nivel no válido.' using errcode='22023'; end if;
  if p_is_primary then update public.student_dance_profiles set is_primary=false,updated_at=now() where person_id=p_person_id and style_term_id=p_style_term_id; end if;
  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,is_primary,active)
  values(p_person_id,p_style_term_id,p_role_term_id,p_level_term_id,p_is_primary,true)
  on conflict(person_id,style_term_id,role_term_id) do update
    set level_term_id=excluded.level_term_id,is_primary=excluded.is_primary,active=true,updated_at=now()
  returning * into v_profile;
  return v_profile;
end;
$function$;

create or replace function public.save_student_self_reported_dance_preference(
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint,
  p_is_primary boolean default true
)
returns public.student_dance_profiles
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_person_id bigint := (select private.current_person_id());
  v_profile public.student_dance_profiles;
begin
  if (select auth.uid()) is null or v_person_id is null then
    raise exception 'Debes iniciar sesión con una ficha personal vinculada.' using errcode='42501';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'Estilo no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'Rol no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Nivel autodeclarado no válido.' using errcode='22023'; end if;

  if p_is_primary then
    update public.student_dance_profiles set is_primary=false,updated_at=now()
    where person_id=v_person_id and style_term_id=p_style_term_id;
  end if;

  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,self_reported_level_term_id,is_primary,active)
  values(v_person_id,p_style_term_id,p_role_term_id,null,p_level_term_id,p_is_primary,true)
  on conflict(person_id,style_term_id,role_term_id) do update
    set self_reported_level_term_id=excluded.self_reported_level_term_id,
        is_primary=excluded.is_primary,
        active=true,
        updated_at=now()
  returning * into v_profile;

  return v_profile;
end;
$function$;

revoke all on function public.save_student_self_reported_dance_preference(bigint,bigint,bigint,boolean) from public, anon;
grant execute on function public.save_student_self_reported_dance_preference(bigint,bigint,bigint,boolean) to authenticated;

comment on function public.save_student_dance_preference(bigint,bigint,bigint,bigint,boolean) is 'V1-020: modifica nivel pedagógico/evaluado. Solo staff.';
comment on function public.save_student_self_reported_dance_preference(bigint,bigint,bigint,boolean) is 'V1-020: el alumno modifica únicamente su nivel autodeclarado; nunca level_term_id.';
