-- V1-020 — Datos de baile autodeclarados canónicos dentro de student_personal.

create or replace function private.form_canonical_path_allowed(p_path text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select p_path = any(array[
    'people.first_name','people.last_name','people.email','people.phone','people.country_code',
    'student_profiles.birth_date','student_profiles.goals','student_profiles.motivation',
    'student_profiles.health_notes','student_profiles.teacher_notes',
    'student_dance_profiles.primary_style_term_id','student_dance_profiles.primary_role_term_id','student_dance_profiles.primary_self_reported_level_term_id',
    'teacher_profiles.professional_name','teacher_profiles.bio','teacher_profiles.styles','teacher_profiles.specialties'
  ]::text[]);
$function$;

create or replace function private.form_canonical_value(p_path text, p_person_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare v_value jsonb;
begin
  if p_person_id is null or p_path is null then return null; end if;
  if not private.form_canonical_path_allowed(p_path) then return null; end if;
  if p_path like 'teacher_profiles.%' and p_person_id is distinct from (select private.current_person_id()) and not (select private.is_admin()) then return null; end if;
  if p_path='people.first_name' then select to_jsonb(first_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.last_name' then select to_jsonb(last_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.email' then select to_jsonb(email) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.phone' then select to_jsonb(phone) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.country_code' then select to_jsonb(country_code) into v_value from public.people where id=p_person_id and active;
  elsif p_path='student_profiles.birth_date' then select to_jsonb(birth_date::text) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.goals' then select to_jsonb(goals) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.motivation' then select to_jsonb(motivation) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.health_notes' then select to_jsonb(health_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.teacher_notes' then select to_jsonb(teacher_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_dance_profiles.primary_style_term_id' then select to_jsonb(style_term_id) into v_value from public.student_dance_profiles where person_id=p_person_id and active order by is_primary desc,updated_at desc,id desc limit 1;
  elsif p_path='student_dance_profiles.primary_role_term_id' then select to_jsonb(role_term_id) into v_value from public.student_dance_profiles where person_id=p_person_id and active order by is_primary desc,updated_at desc,id desc limit 1;
  elsif p_path='student_dance_profiles.primary_self_reported_level_term_id' then select to_jsonb(self_reported_level_term_id) into v_value from public.student_dance_profiles where person_id=p_person_id and active order by is_primary desc,updated_at desc,id desc limit 1;
  elsif p_path='teacher_profiles.professional_name' then select to_jsonb(professional_name) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.bio' then select to_jsonb(bio) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.specialties' then select to_jsonb(specialties) into v_value from public.teacher_profiles where person_id=p_person_id and active;
  elsif p_path='teacher_profiles.styles' then
    select to_jsonb(coalesce(array_agg(tps.style_term_id order by ct.sort_order,ct.id),'{}'::bigint[])) into v_value
    from public.teacher_profile_styles tps join public.catalog_terms ct on ct.id=tps.style_term_id
    where tps.person_id=p_person_id and ct.taxonomy='dance_style' and ct.active;
  end if;
  return v_value;
end;
$function$;

create or replace function private.apply_form_canonical_updates(p_person_id bigint, p_updates jsonb, p_staff boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_key text; v_person public.people; v_first text; v_last text; v_email text; v_phone text; v_country text; v_match bigint;
  v_profile_needed boolean:=false; v_teacher_needed boolean:=false; v_styles jsonb;
  v_dance_needed boolean:=false; v_dance public.student_dance_profiles; v_dance_style bigint; v_dance_role bigint; v_self_level bigint;
begin
  if p_person_id is null then raise exception 'Falta la persona del formulario.' using errcode='22023'; end if;
  if p_updates is null or p_updates='{}'::jsonb then return '{}'::jsonb; end if;
  for v_key in select jsonb_object_keys(p_updates) loop
    if not private.form_canonical_path_allowed(v_key) then raise exception 'Ruta canónica no permitida: %',v_key using errcode='42501'; end if;
    if v_key='student_profiles.teacher_notes' and not p_staff then raise exception 'Las notas internas solo puede editarlas el equipo.' using errcode='42501'; end if;
    if v_key like 'teacher_profiles.%' and not p_staff then raise exception 'El perfil profesional solo puede editarlo el equipo.' using errcode='42501'; end if;
  end loop;
  select * into v_person from public.people where id=p_person_id and active for update;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  v_first:=case when p_updates ? 'people.first_name' then nullif(btrim(private.form_scalar_text(p_updates->'people.first_name')),'') else v_person.first_name end;
  v_last:=case when p_updates ? 'people.last_name' then nullif(btrim(private.form_scalar_text(p_updates->'people.last_name')),'') else v_person.last_name end;
  v_email:=case when p_updates ? 'people.email' then private.normalize_person_email(private.form_scalar_text(p_updates->'people.email')) else v_person.email end;
  v_phone:=case when p_updates ? 'people.phone' then nullif(btrim(private.form_scalar_text(p_updates->'people.phone')),'') else v_person.phone end;
  v_country:=case when p_updates ? 'people.country_code' then nullif(upper(btrim(private.form_scalar_text(p_updates->'people.country_code'))),'') else v_person.country_code end;
  if p_updates ? 'people.first_name' and v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_country is not null and length(v_country)<>2 then raise exception 'Selecciona un país válido.' using errcode='22023'; end if;
  if p_updates ? 'people.email' or p_updates ? 'people.phone' then
    perform private.lock_person_identity(v_email,v_phone);
    select private.match_person_identity(v_email,v_phone,p_person_id) into v_match;
    if v_match is not null then raise exception 'Ese email o teléfono pertenece a otra ficha.' using errcode='23505'; end if;
  end if;
  if p_updates ? 'people.first_name' or p_updates ? 'people.last_name' or p_updates ? 'people.email' or p_updates ? 'people.phone' or p_updates ? 'people.country_code' then
    update public.people set first_name=v_first,last_name=v_last,email=v_email,phone=v_phone,country_code=v_country,
      display_name=case when v_first is not null then btrim(concat_ws(' ',v_first,v_last)) else display_name end,updated_at=now() where id=p_person_id;
  end if;
  v_profile_needed := p_updates ? 'student_profiles.birth_date' or p_updates ? 'student_profiles.goals' or p_updates ? 'student_profiles.motivation' or p_updates ? 'student_profiles.health_notes' or p_updates ? 'student_profiles.teacher_notes';
  if v_profile_needed then
    insert into public.student_profiles(person_id,active,created_by) values(p_person_id,true,(select auth.uid())) on conflict(person_id) do update set active=true,updated_at=now();
    update public.student_profiles set
      birth_date=case when p_updates ? 'student_profiles.birth_date' then nullif(private.form_scalar_text(p_updates->'student_profiles.birth_date'),'')::date else birth_date end,
      goals=case when p_updates ? 'student_profiles.goals' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.goals')),'') else goals end,
      motivation=case when p_updates ? 'student_profiles.motivation' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.motivation')),'') else motivation end,
      health_notes=case when p_updates ? 'student_profiles.health_notes' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.health_notes')),'') else health_notes end,
      teacher_notes=case when p_updates ? 'student_profiles.teacher_notes' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.teacher_notes')),'') else teacher_notes end,
      updated_at=now() where person_id=p_person_id;
  end if;
  v_dance_needed := p_updates ? 'student_dance_profiles.primary_style_term_id' or p_updates ? 'student_dance_profiles.primary_role_term_id' or p_updates ? 'student_dance_profiles.primary_self_reported_level_term_id';
  if v_dance_needed then
    select * into v_dance from public.student_dance_profiles where person_id=p_person_id and active order by is_primary desc,updated_at desc,id desc limit 1;
    v_dance_style:=case when p_updates ? 'student_dance_profiles.primary_style_term_id' then private.form_scalar_text(p_updates->'student_dance_profiles.primary_style_term_id')::bigint else v_dance.style_term_id end;
    v_dance_role:=case when p_updates ? 'student_dance_profiles.primary_role_term_id' then private.form_scalar_text(p_updates->'student_dance_profiles.primary_role_term_id')::bigint else v_dance.role_term_id end;
    v_self_level:=case when p_updates ? 'student_dance_profiles.primary_self_reported_level_term_id' then private.form_scalar_text(p_updates->'student_dance_profiles.primary_self_reported_level_term_id')::bigint else v_dance.self_reported_level_term_id end;
    if v_dance_style is null or not exists(select 1 from public.catalog_terms where id=v_dance_style and taxonomy='dance_style' and active) then raise exception 'Selecciona un estilo válido.' using errcode='22023'; end if;
    if v_dance_role is null or not exists(select 1 from public.catalog_terms where id=v_dance_role and taxonomy='dance_role' and active) then raise exception 'Selecciona un rol válido.' using errcode='22023'; end if;
    if v_self_level is null or not exists(select 1 from public.catalog_terms where id=v_self_level and taxonomy='dance_level' and active) then raise exception 'Selecciona el nivel que consideras que tienes.' using errcode='22023'; end if;
    update public.student_dance_profiles set is_primary=false,updated_at=now() where person_id=p_person_id and active;
    insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,self_reported_level_term_id,is_primary,active)
    values(p_person_id,v_dance_style,v_dance_role,null,v_self_level,true,true)
    on conflict(person_id,style_term_id,role_term_id) do update set self_reported_level_term_id=excluded.self_reported_level_term_id,is_primary=true,active=true,updated_at=now();
  end if;
  v_teacher_needed := p_updates ? 'teacher_profiles.professional_name' or p_updates ? 'teacher_profiles.bio' or p_updates ? 'teacher_profiles.styles' or p_updates ? 'teacher_profiles.specialties';
  if v_teacher_needed then
    if not p_staff then raise exception 'No tienes permiso para editar el perfil profesional.' using errcode='42501'; end if;
    if p_person_id is distinct from (select private.current_person_id()) and not (select private.is_admin()) then raise exception 'Solo puedes editar tu propio perfil profesional.' using errcode='42501'; end if;
    if p_updates ? 'teacher_profiles.styles' then
      v_styles:=p_updates->'teacher_profiles.styles';
      if v_styles is not null and v_styles<>'null'::jsonb then
        if jsonb_typeof(v_styles)<>'array' then raise exception 'Los estilos seleccionados no son válidos.' using errcode='22023'; end if;
        if exists(select 1 from jsonb_array_elements_text(v_styles) x(value) where x.value !~ '^[0-9]+$') then raise exception 'Los estilos seleccionados no son válidos.' using errcode='22023'; end if;
        if exists(select 1 from (select distinct value::bigint as id from jsonb_array_elements_text(v_styles)) x left join public.catalog_terms ct on ct.id=x.id and ct.taxonomy='dance_style' and ct.active where ct.id is null) then raise exception 'Uno de los estilos ya no está disponible.' using errcode='22023'; end if;
      end if;
    end if;
    insert into public.teacher_profiles(person_id,professional_name,active,created_by,updated_by)
    values(p_person_id,coalesce(nullif(btrim(private.form_scalar_text(p_updates->'teacher_profiles.professional_name')),''),nullif(btrim(v_person.display_name),'')),true,(select auth.uid()),(select auth.uid()))
    on conflict(person_id) do update set active=true,updated_by=(select auth.uid()),updated_at=now();
    update public.teacher_profiles set professional_name=case when p_updates ? 'teacher_profiles.professional_name' then nullif(btrim(private.form_scalar_text(p_updates->'teacher_profiles.professional_name')),'') else professional_name end,
      bio=case when p_updates ? 'teacher_profiles.bio' then nullif(btrim(private.form_scalar_text(p_updates->'teacher_profiles.bio')),'') else bio end,
      specialties=case when p_updates ? 'teacher_profiles.specialties' then nullif(btrim(private.form_scalar_text(p_updates->'teacher_profiles.specialties')),'') else specialties end,
      active=true,updated_by=(select auth.uid()),updated_at=now() where person_id=p_person_id;
    if p_updates ? 'teacher_profiles.styles' then
      delete from public.teacher_profile_styles where person_id=p_person_id;
      if v_styles is not null and v_styles<>'null'::jsonb and jsonb_array_length(v_styles)>0 then insert into public.teacher_profile_styles(person_id,style_term_id) select p_person_id,x.id from (select distinct value::bigint as id from jsonb_array_elements_text(v_styles)) x; end if;
    end if;
  end if;
  return jsonb_build_object(
    'people.first_name',private.form_canonical_value('people.first_name',p_person_id),'people.last_name',private.form_canonical_value('people.last_name',p_person_id),
    'people.email',private.form_canonical_value('people.email',p_person_id),'people.phone',private.form_canonical_value('people.phone',p_person_id),'people.country_code',private.form_canonical_value('people.country_code',p_person_id),
    'student_profiles.birth_date',private.form_canonical_value('student_profiles.birth_date',p_person_id),'student_profiles.goals',private.form_canonical_value('student_profiles.goals',p_person_id),
    'student_profiles.motivation',private.form_canonical_value('student_profiles.motivation',p_person_id),'student_profiles.health_notes',private.form_canonical_value('student_profiles.health_notes',p_person_id),
    'student_profiles.teacher_notes',case when p_staff then private.form_canonical_value('student_profiles.teacher_notes',p_person_id) else null end,
    'student_dance_profiles.primary_style_term_id',private.form_canonical_value('student_dance_profiles.primary_style_term_id',p_person_id),
    'student_dance_profiles.primary_role_term_id',private.form_canonical_value('student_dance_profiles.primary_role_term_id',p_person_id),
    'student_dance_profiles.primary_self_reported_level_term_id',private.form_canonical_value('student_dance_profiles.primary_self_reported_level_term_id',p_person_id),
    'teacher_profiles.professional_name',case when p_staff then private.form_canonical_value('teacher_profiles.professional_name',p_person_id) else null end,
    'teacher_profiles.bio',case when p_staff then private.form_canonical_value('teacher_profiles.bio',p_person_id) else null end,
    'teacher_profiles.styles',case when p_staff then private.form_canonical_value('teacher_profiles.styles',p_person_id) else null end,
    'teacher_profiles.specialties',case when p_staff then private.form_canonical_value('teacher_profiles.specialties',p_person_id) else null end);
end;
$function$;

do $$
declare v_form_id bigint; v_old_version_id bigint; v_new_version_id bigint;
begin
  select id into v_form_id from public.form_definitions where form_key='student_personal';
  select id into v_old_version_id from public.form_versions where form_id=v_form_id and version_number=2 limit 1;
  select id into v_new_version_id from public.form_versions where form_id=v_form_id and version_number=3 limit 1;
  if v_form_id is not null and v_old_version_id is not null and v_new_version_id is null then
    insert into public.form_versions(form_id,version_number,status,change_note,snapshot)
    select form_id,3,'draft','V1-020: incorpora Estilo, Rol y Nivel autodeclarado como datos canónicos del alumno, separados del nivel pedagógico evaluado.',snapshot
    from public.form_versions where id=v_old_version_id returning id into v_new_version_id;
    insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
    select v_new_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active from public.form_fields where form_version_id=v_old_version_id;
    insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active) values
      (v_new_version_id,'dance_context_info','information','Datos de baile autodeclarados','Estos datos describen cómo te identificas ahora. Cambiarlos no modifica tu nivel pedagógico evaluado por el equipo.',false,null,'[]'::jsonb,jsonb_build_object('audiences',jsonb_build_array('student','staff'),'editable_by',jsonb_build_array('student','staff')),'{}'::jsonb,'{}'::jsonb,65,true),
      (v_new_version_id,'primary_dance_style','select','Estilo principal','Puedes cambiarlo después desde tu perfil.',true,'student_dance_profiles.primary_style_term_id',jsonb_build_object('catalog_taxonomy','dance_style'),jsonb_build_object('audiences',jsonb_build_array('student','staff'),'editable_by',jsonb_build_array('student','staff')),'{}'::jsonb,'{}'::jsonb,66,true),
      (v_new_version_id,'primary_dance_role','select','Rol principal','Leader, Follower u otro rol disponible en CYA.',true,'student_dance_profiles.primary_role_term_id',jsonb_build_object('catalog_taxonomy','dance_role'),jsonb_build_object('audiences',jsonb_build_array('student','staff'),'editable_by',jsonb_build_array('student','staff')),'{}'::jsonb,'{}'::jsonb,67,true),
      (v_new_version_id,'self_reported_level','select','¿Qué nivel consideras que tienes?','Es tu nivel autodeclarado. El nivel evaluado por Profesor/Admin se mantiene separado y no cambia al editar este campo.',true,'student_dance_profiles.primary_self_reported_level_term_id',jsonb_build_object('catalog_taxonomy','dance_level'),jsonb_build_object('audiences',jsonb_build_array('student','staff'),'editable_by',jsonb_build_array('student','staff')),'{}'::jsonb,'{}'::jsonb,68,true);
    update public.form_versions set status='active',published_at=now() where id=v_new_version_id;
    update public.form_versions set status='superseded' where id=v_old_version_id and status='active';
    update public.form_definitions set active_version=3,updated_at=now() where id=v_form_id;
  end if;
  update public.form_definitions set status='archived',description='Formulario histórico sustituido por la sección canónica de datos de baile autodeclarados dentro de student_personal. Se conserva para histórico de submissions.',updated_at=now() where form_key='student_dance';
end $$;
