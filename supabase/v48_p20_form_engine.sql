-- CYA Hub · v48 · P20 Formularios versionados + datos canónicos
-- Reutiliza la base v14. No crea una segunda biblioteca de formularios.
-- Principios: versión publicada inmutable, validación en servidor, canonicalidad allowlisted
-- y respuestas JSON solo para hechos específicos que no tengan una fuente canónica.

begin;

alter table public.student_profiles
  add column if not exists birth_date date,
  add column if not exists motivation text;

alter table public.form_versions
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null;

alter table public.form_submissions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists form_submissions_form_person_idx
  on public.form_submissions(form_id,person_id,submitted_at desc);

create or replace function private.form_json_empty(p_value jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select case
    when p_value is null or p_value='null'::jsonb then true
    when jsonb_typeof(p_value)='string' then btrim(p_value#>>'{}')=''
    when jsonb_typeof(p_value)='array' then jsonb_array_length(p_value)=0
    else false
  end;
$$;

create or replace function private.form_scalar_text(p_value jsonb)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_value is null or p_value='null'::jsonb then null
    when jsonb_typeof(p_value)='string' then p_value#>>'{}'
    else p_value::text
  end;
$$;

create or replace function private.form_canonical_path_allowed(p_path text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select p_path = any(array[
    'people.first_name','people.last_name','people.email','people.phone','people.country_code',
    'student_profiles.birth_date','student_profiles.goals','student_profiles.motivation',
    'student_profiles.health_notes','student_profiles.teacher_notes'
  ]::text[]);
$$;

create or replace function private.form_canonical_value(p_path text,p_person_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_value jsonb;
begin
  if p_person_id is null or p_path is null then return null; end if;
  if not private.form_canonical_path_allowed(p_path) then return null; end if;

  if p_path='people.first_name' then
    select to_jsonb(first_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.last_name' then
    select to_jsonb(last_name) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.email' then
    select to_jsonb(email) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.phone' then
    select to_jsonb(phone) into v_value from public.people where id=p_person_id and active;
  elsif p_path='people.country_code' then
    select to_jsonb(country_code) into v_value from public.people where id=p_person_id and active;
  elsif p_path='student_profiles.birth_date' then
    select to_jsonb(birth_date::text) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.goals' then
    select to_jsonb(goals) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.motivation' then
    select to_jsonb(motivation) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.health_notes' then
    select to_jsonb(health_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  elsif p_path='student_profiles.teacher_notes' then
    select to_jsonb(teacher_notes) into v_value from public.student_profiles where person_id=p_person_id and active;
  end if;
  return v_value;
end;
$$;

create or replace function private.resolve_form_options(p_options jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_taxonomy text;
  v_result jsonb;
begin
  if p_options is null then return '[]'::jsonb; end if;
  if jsonb_typeof(p_options)='array' then return p_options; end if;
  if jsonb_typeof(p_options)<>'object' then return '[]'::jsonb; end if;

  if jsonb_typeof(p_options->'values')='array' then
    return p_options->'values';
  end if;

  v_taxonomy:=nullif(btrim(p_options->>'catalog_taxonomy'),'');
  if v_taxonomy is not null then
    select coalesce(jsonb_agg(jsonb_build_object('value',ct.id,'key',ct.term_key,'label',ct.label) order by ct.sort_order,ct.id),'[]'::jsonb)
      into v_result
    from public.catalog_terms ct
    where ct.taxonomy=v_taxonomy and ct.active;
    return v_result;
  end if;
  return '[]'::jsonb;
end;
$$;

create or replace function private.form_option_allowed(p_options jsonb,p_value jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_options jsonb:=private.resolve_form_options(p_options);
  v_item jsonb;
  v_candidate jsonb;
begin
  if jsonb_array_length(v_options)=0 then return true; end if;
  for v_item in select value from jsonb_array_elements(v_options) loop
    v_candidate:=case when jsonb_typeof(v_item)='object' then v_item->'value' else v_item end;
    if v_candidate=p_value or private.form_scalar_text(v_candidate)=private.form_scalar_text(p_value) then return true; end if;
  end loop;
  return false;
end;
$$;

create or replace function private.form_normalize_value(
  p_field_type text,
  p_value jsonb,
  p_validation jsonb default '{}'::jsonb,
  p_options jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_text text;
  v_number numeric;
  v_item jsonb;
  v_min numeric;
  v_max numeric;
  v_min_len integer;
  v_max_len integer;
begin
  if p_value is null or p_value='null'::jsonb then return null; end if;
  if p_field_type='information' then return null; end if;

  if p_field_type in ('text','textarea','email','phone','date','hidden','search') then
    if jsonb_typeof(p_value) not in ('string','number') then raise exception 'El valor debe ser texto.' using errcode='22023'; end if;
    v_text:=btrim(private.form_scalar_text(p_value));
    if v_text='' then return null; end if;
    v_min_len:=nullif(p_validation->>'min_length','')::integer;
    v_max_len:=nullif(p_validation->>'max_length','')::integer;
    if v_min_len is not null and char_length(v_text)<v_min_len then raise exception 'El texto es demasiado corto.' using errcode='22023'; end if;
    if v_max_len is not null and char_length(v_text)>v_max_len then raise exception 'El texto es demasiado largo.' using errcode='22023'; end if;
    if p_field_type='email' then
      v_text:=lower(v_text);
      if v_text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'El email no es válido.' using errcode='22023'; end if;
    elsif p_field_type='phone' then
      if length(regexp_replace(v_text,'[^0-9]','','g'))<7 then raise exception 'El teléfono no es válido.' using errcode='22023'; end if;
    elsif p_field_type='date' then
      perform cast(v_text as date);
      v_text:=(v_text::date)::text;
    end if;
    return to_jsonb(v_text);
  end if;

  if p_field_type='number' then
    v_text:=replace(private.form_scalar_text(p_value),',','.');
    if v_text is null or btrim(v_text)='' then return null; end if;
    if v_text !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'El número no es válido.' using errcode='22023'; end if;
    v_number:=v_text::numeric;
    v_min:=nullif(p_validation->>'min','')::numeric;
    v_max:=nullif(p_validation->>'max','')::numeric;
    if v_min is not null and v_number<v_min then raise exception 'El número es menor de lo permitido.' using errcode='22023'; end if;
    if v_max is not null and v_number>v_max then raise exception 'El número es mayor de lo permitido.' using errcode='22023'; end if;
    return to_jsonb(v_number);
  end if;

  if p_field_type='checkbox' then
    if jsonb_typeof(p_value)<>'boolean' then raise exception 'La casilla debe ser verdadera o falsa.' using errcode='22023'; end if;
    return p_value;
  end if;

  if p_field_type='select' then
    if jsonb_typeof(p_value) not in ('string','number','boolean') then raise exception 'Selecciona una opción válida.' using errcode='22023'; end if;
    if not private.form_option_allowed(p_options,p_value) then raise exception 'La opción seleccionada no está permitida.' using errcode='22023'; end if;
    return p_value;
  end if;

  if p_field_type='multiselect' then
    if jsonb_typeof(p_value)<>'array' then raise exception 'Selecciona una o varias opciones válidas.' using errcode='22023'; end if;
    for v_item in select value from jsonb_array_elements(p_value) loop
      if not private.form_option_allowed(p_options,v_item) then raise exception 'Una de las opciones seleccionadas no está permitida.' using errcode='22023'; end if;
    end loop;
    return p_value;
  end if;

  raise exception 'Tipo de campo no soportado: %',p_field_type using errcode='22023';
end;
$$;

create or replace function private.form_condition_matches(p_condition jsonb,p_values jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare
  v_field text;
  v_op text;
  v_current jsonb;
  v_expected jsonb;
  v_item jsonb;
begin
  if p_condition is null or p_condition='{}'::jsonb then return true; end if;
  v_field:=nullif(btrim(p_condition->>'field'),'');
  if v_field is null then return true; end if;
  v_op:=coalesce(nullif(p_condition->>'operator',''),'eq');
  v_current:=p_values->v_field;
  v_expected:=p_condition->'value';

  if v_op='eq' then return v_current=v_expected or private.form_scalar_text(v_current)=private.form_scalar_text(v_expected); end if;
  if v_op='neq' then return not (v_current=v_expected or private.form_scalar_text(v_current)=private.form_scalar_text(v_expected)); end if;
  if v_op='truthy' then return not private.form_json_empty(v_current) and coalesce(private.form_scalar_text(v_current),'') not in ('false','0'); end if;
  if v_op='falsy' then return private.form_json_empty(v_current) or coalesce(private.form_scalar_text(v_current),'') in ('false','0'); end if;
  if v_op='in' and jsonb_typeof(v_expected)='array' then
    for v_item in select value from jsonb_array_elements(v_expected) loop
      if v_current=v_item or private.form_scalar_text(v_current)=private.form_scalar_text(v_item) then return true; end if;
    end loop;
    return false;
  end if;
  raise exception 'Condición de formulario no soportada.' using errcode='22023';
end;
$$;

create or replace function private.form_field_visible(p_visibility jsonb,p_staff boolean,p_admin boolean,p_write boolean default false)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare
  v_key text:=case when p_write then 'editable_by' else 'audiences' end;
  v_roles jsonb;
begin
  if p_visibility is null or p_visibility='{}'::jsonb then return true; end if;
  v_roles:=p_visibility->v_key;
  if jsonb_typeof(v_roles)<>'array' then
    if p_write then v_roles:=p_visibility->'audiences'; end if;
  end if;
  if jsonb_typeof(v_roles)<>'array' then return true; end if;
  if p_admin and (v_roles ? 'admin' or v_roles ? 'staff') then return true; end if;
  if p_staff and v_roles ? 'staff' then return true; end if;
  return v_roles ? 'student';
end;
$$;

create or replace function private.apply_form_canonical_updates(p_person_id bigint,p_updates jsonb,p_staff boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_key text;
  v_person public.people;
  v_first text;
  v_last text;
  v_email text;
  v_phone text;
  v_country text;
  v_match bigint;
  v_profile_needed boolean:=false;
begin
  if p_person_id is null then raise exception 'Falta la persona del formulario.' using errcode='22023'; end if;
  if p_updates is null or p_updates='{}'::jsonb then return '{}'::jsonb; end if;

  for v_key in select jsonb_object_keys(p_updates) loop
    if not private.form_canonical_path_allowed(v_key) then
      raise exception 'Ruta canónica no permitida: %',v_key using errcode='42501';
    end if;
    if v_key='student_profiles.teacher_notes' and not p_staff then
      raise exception 'Las notas internas solo puede editarlas el equipo.' using errcode='42501';
    end if;
  end loop;

  select * into v_person from public.people where id=p_person_id and active for update;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;

  v_first:=case when p_updates ? 'people.first_name' then nullif(btrim(private.form_scalar_text(p_updates->'people.first_name')),'') else v_person.first_name end;
  v_last:=case when p_updates ? 'people.last_name' then nullif(btrim(private.form_scalar_text(p_updates->'people.last_name')),'') else v_person.last_name end;
  v_email:=case when p_updates ? 'people.email' then private.normalize_person_email(private.form_scalar_text(p_updates->'people.email')) else v_person.email end;
  v_phone:=case when p_updates ? 'people.phone' then nullif(btrim(private.form_scalar_text(p_updates->'people.phone')),'') else v_person.phone end;
  v_country:=case when p_updates ? 'people.country_code' then nullif(upper(btrim(private.form_scalar_text(p_updates->'people.country_code'))),'') else v_person.country_code end;

  if p_updates ? 'people.first_name' and v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_country is not null and length(v_country)<>2 then raise exception 'Usa el código de país de 2 letras.' using errcode='22023'; end if;

  if p_updates ? 'people.email' or p_updates ? 'people.phone' then
    perform private.lock_person_identity(v_email,v_phone);
    select private.match_person_identity(v_email,v_phone,p_person_id) into v_match;
    if v_match is not null then raise exception 'Ese email o teléfono pertenece a otra ficha.' using errcode='23505'; end if;
  end if;

  if p_updates ? 'people.first_name' or p_updates ? 'people.last_name' or p_updates ? 'people.email' or p_updates ? 'people.phone' or p_updates ? 'people.country_code' then
    update public.people set
      first_name=v_first,last_name=v_last,email=v_email,phone=v_phone,country_code=v_country,
      display_name=case when v_first is not null then btrim(concat_ws(' ',v_first,v_last)) else display_name end,
      updated_at=now()
    where id=p_person_id;
  end if;

  v_profile_needed := p_updates ? 'student_profiles.birth_date'
    or p_updates ? 'student_profiles.goals'
    or p_updates ? 'student_profiles.motivation'
    or p_updates ? 'student_profiles.health_notes'
    or p_updates ? 'student_profiles.teacher_notes';

  if v_profile_needed then
    insert into public.student_profiles(person_id,active,created_by)
    values(p_person_id,true,(select auth.uid()))
    on conflict(person_id) do update set active=true,updated_at=now();

    update public.student_profiles set
      birth_date=case when p_updates ? 'student_profiles.birth_date' then nullif(private.form_scalar_text(p_updates->'student_profiles.birth_date'),'')::date else birth_date end,
      goals=case when p_updates ? 'student_profiles.goals' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.goals')),'') else goals end,
      motivation=case when p_updates ? 'student_profiles.motivation' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.motivation')),'') else motivation end,
      health_notes=case when p_updates ? 'student_profiles.health_notes' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.health_notes')),'') else health_notes end,
      teacher_notes=case when p_updates ? 'student_profiles.teacher_notes' then nullif(btrim(private.form_scalar_text(p_updates->'student_profiles.teacher_notes')),'') else teacher_notes end,
      updated_at=now()
    where person_id=p_person_id;
  end if;

  return jsonb_build_object(
    'people.first_name',private.form_canonical_value('people.first_name',p_person_id),
    'people.last_name',private.form_canonical_value('people.last_name',p_person_id),
    'people.email',private.form_canonical_value('people.email',p_person_id),
    'people.phone',private.form_canonical_value('people.phone',p_person_id),
    'people.country_code',private.form_canonical_value('people.country_code',p_person_id),
    'student_profiles.birth_date',private.form_canonical_value('student_profiles.birth_date',p_person_id),
    'student_profiles.goals',private.form_canonical_value('student_profiles.goals',p_person_id),
    'student_profiles.motivation',private.form_canonical_value('student_profiles.motivation',p_person_id),
    'student_profiles.health_notes',private.form_canonical_value('student_profiles.health_notes',p_person_id),
    'student_profiles.teacher_notes',case when p_staff then private.form_canonical_value('student_profiles.teacher_notes',p_person_id) else null end
  );
end;
$$;

create or replace function public.form_runtime(
  p_form_key text,
  p_person_id bigint default null,
  p_mode text default 'complete_missing'
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_form public.form_definitions;
  v_version public.form_versions;
  v_current_person bigint:=(select private.current_person_id());
  v_target bigint:=p_person_id;
  v_staff boolean:=(select private.is_staff());
  v_admin boolean:=(select private.is_admin());
  v_previous jsonb:='{}'::jsonb;
  v_fields jsonb:='[]'::jsonb;
  v_field public.form_fields;
  v_value jsonb;
  v_known boolean;
  v_visible boolean;
  v_writable boolean;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para usar formularios.' using errcode='42501'; end if;
  if p_mode not in ('complete_missing','edit','review') then raise exception 'Modo de formulario no válido.' using errcode='22023'; end if;

  select * into v_form from public.form_definitions where form_key=p_form_key and status='active';
  if not found then raise exception 'El formulario no está disponible.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un flujo de negocio específico y no se ejecuta con el motor genérico.' using errcode='0A000';
  end if;

  if v_form.form_type='admin' and not v_admin then raise exception 'Este formulario es solo para administración.' using errcode='42501'; end if;
  if v_form.form_type in ('teacher','internal') and not v_staff then raise exception 'Este formulario es interno del equipo.' using errcode='42501'; end if;
  if v_form.form_type='student' then
    if v_target is null then v_target:=v_current_person; end if;
    if v_target is null then raise exception 'No hay una persona vinculada a tu cuenta.' using errcode='42501'; end if;
    if not v_staff and v_target is distinct from v_current_person then raise exception 'Solo puedes abrir tu propio formulario.' using errcode='42501'; end if;
  elsif v_target is not null and not v_staff and v_target is distinct from v_current_person then
    raise exception 'No tienes permiso para usar ese contexto.' using errcode='42501';
  end if;

  select * into v_version from public.form_versions
  where form_id=v_form.id and version_number=v_form.active_version and status='active';
  if not found then raise exception 'La versión activa del formulario no es válida.' using errcode='55000'; end if;

  if v_target is not null then
    select coalesce(fs.answers,'{}'::jsonb) into v_previous
    from public.form_submissions fs
    where fs.form_id=v_form.id and fs.person_id=v_target and fs.status='completed'
    order by fs.submitted_at desc,fs.id desc limit 1;
    v_previous:=coalesce(v_previous,'{}'::jsonb);
  end if;

  for v_field in
    select * from public.form_fields where form_version_id=v_version.id and active order by sort_order,id
  loop
    v_visible:=private.form_field_visible(v_field.visibility,v_staff,v_admin,false);
    if not v_visible then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_writable:=private.form_field_visible(v_field.visibility,v_staff,v_admin,true) and p_mode<>'review';
    v_value:=case when v_field.canonical_path is not null
      then private.form_canonical_value(v_field.canonical_path,v_target)
      else v_previous->v_field.field_key end;
    v_known:=not private.form_json_empty(v_value);

    v_fields:=v_fields || jsonb_build_array(jsonb_build_object(
      'field_key',v_field.field_key,
      'field_type',v_field.field_type,
      'label',v_field.label,
      'help_text',v_field.help_text,
      'required',v_field.required,
      'canonical_path',v_field.canonical_path,
      'options',private.resolve_form_options(v_field.options),
      'visibility',v_field.visibility,
      'condition',v_field.condition,
      'validation',v_field.validation,
      'sort_order',v_field.sort_order,
      'value',v_value,
      'known',v_known,
      'ask',case when p_mode='complete_missing' and v_known and v_field.field_type<>'information' then false else true end,
      'writable',v_writable
    ));
  end loop;

  return jsonb_build_object(
    'form_id',v_form.id,'form_key',v_form.form_key,'version_id',v_version.id,'version_number',v_version.version_number,
    'title',coalesce(v_form.visible_title,v_form.admin_name),'description',v_form.description,'context_key',v_form.context_key,
    'form_type',v_form.form_type,'person_id',v_target,'mode',p_mode,'fields',v_fields
  );
end;
$$;

create or replace function public.submit_form_runtime(
  p_form_key text,
  p_person_id bigint default null,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_form public.form_definitions;
  v_version public.form_versions;
  v_current_person bigint:=(select private.current_person_id());
  v_target bigint:=p_person_id;
  v_staff boolean:=(select private.is_staff());
  v_admin boolean:=(select private.is_admin());
  v_previous jsonb:='{}'::jsonb;
  v_effective jsonb:='{}'::jsonb;
  v_noncanonical jsonb:='{}'::jsonb;
  v_canonical_updates jsonb:='{}'::jsonb;
  v_canonical_snapshot jsonb:='{}'::jsonb;
  v_field public.form_fields;
  v_existing jsonb;
  v_raw jsonb;
  v_normalized jsonb;
  v_condition boolean;
  v_submission_id bigint;
  v_key text;
begin
  if (select auth.uid()) is null then raise exception 'Inicia sesión para guardar formularios.' using errcode='42501'; end if;
  if p_answers is null then p_answers:='{}'::jsonb; end if;
  if jsonb_typeof(p_answers)<>'object' then raise exception 'Las respuestas no tienen un formato válido.' using errcode='22023'; end if;

  select * into v_form from public.form_definitions where form_key=p_form_key and status='active' for share;
  if not found then raise exception 'El formulario no está disponible.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un flujo de negocio específico y no se ejecuta con el motor genérico.' using errcode='0A000';
  end if;
  if v_form.form_type='admin' and not v_admin then raise exception 'Este formulario es solo para administración.' using errcode='42501'; end if;
  if v_form.form_type in ('teacher','internal') and not v_staff then raise exception 'Este formulario es interno del equipo.' using errcode='42501'; end if;
  if v_form.form_type='student' then
    if v_target is null then v_target:=v_current_person; end if;
    if v_target is null then raise exception 'No hay una persona vinculada a tu cuenta.' using errcode='42501'; end if;
    if not v_staff and v_target is distinct from v_current_person then raise exception 'Solo puedes guardar tu propio formulario.' using errcode='42501'; end if;
  end if;

  select * into v_version from public.form_versions
  where form_id=v_form.id and version_number=v_form.active_version and status='active' for share;
  if not found then raise exception 'La versión activa del formulario no es válida.' using errcode='55000'; end if;

  if v_target is not null then
    select coalesce(fs.answers,'{}'::jsonb) into v_previous
    from public.form_submissions fs
    where fs.form_id=v_form.id and fs.person_id=v_target and fs.status='completed'
    order by fs.submitted_at desc,fs.id desc limit 1;
    v_previous:=coalesce(v_previous,'{}'::jsonb);
  end if;

  -- No aceptamos claves inventadas: cada respuesta debe pertenecer a la versión activa.
  for v_key in select jsonb_object_keys(p_answers) loop
    if not exists(select 1 from public.form_fields ff where ff.form_version_id=v_version.id and ff.field_key=v_key and ff.active) then
      raise exception 'El campo % no pertenece a la versión activa.',v_key using errcode='22023';
    end if;
  end loop;

  -- Construimos valores efectivos primero para poder evaluar condiciones entre campos.
  for v_field in select * from public.form_fields where form_version_id=v_version.id and active order by sort_order,id loop
    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_existing:=case when v_field.canonical_path is not null then private.form_canonical_value(v_field.canonical_path,v_target) else v_previous->v_field.field_key end;
    v_raw:=case when p_answers ? v_field.field_key then p_answers->v_field.field_key else v_existing end;
    v_effective:=v_effective || jsonb_build_object(v_field.field_key,v_raw);
  end loop;

  for v_field in select * from public.form_fields where form_version_id=v_version.id and active order by sort_order,id loop
    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_condition:=private.form_condition_matches(v_field.condition,v_effective);
    if not v_condition or v_field.field_type='information' then continue; end if;

    v_existing:=case when v_field.canonical_path is not null then private.form_canonical_value(v_field.canonical_path,v_target) else v_previous->v_field.field_key end;
    v_raw:=case when p_answers ? v_field.field_key then p_answers->v_field.field_key else v_existing end;

    if v_field.required and private.form_json_empty(v_raw) then
      raise exception 'Completa el campo: %',v_field.label using errcode='22023';
    end if;
    if private.form_json_empty(v_raw) then
      v_normalized:=null;
    else
      v_normalized:=private.form_normalize_value(v_field.field_type,v_raw,v_field.validation,v_field.options);
    end if;

    if p_answers ? v_field.field_key then
      if not private.form_field_visible(v_field.visibility,v_staff,v_admin,true) then
        raise exception 'No tienes permiso para editar el campo: %',v_field.label using errcode='42501';
      end if;
      if v_field.canonical_path is not null then
        if not private.form_canonical_path_allowed(v_field.canonical_path) then raise exception 'El campo canónico no está habilitado para escritura.' using errcode='42501'; end if;
        v_canonical_updates:=v_canonical_updates || jsonb_build_object(v_field.canonical_path,v_normalized);
      else
        v_noncanonical:=v_noncanonical || jsonb_build_object(v_field.field_key,v_normalized);
      end if;
    elsif v_field.canonical_path is null and v_previous ? v_field.field_key then
      v_noncanonical:=v_noncanonical || jsonb_build_object(v_field.field_key,v_previous->v_field.field_key);
    end if;
  end loop;

  if v_target is not null and v_canonical_updates<>'{}'::jsonb then
    v_canonical_snapshot:=private.apply_form_canonical_updates(v_target,v_canonical_updates,v_staff);
  elsif v_target is not null then
    for v_field in select * from public.form_fields where form_version_id=v_version.id and active and canonical_path is not null loop
      if private.form_field_visible(v_field.visibility,v_staff,v_admin,false)
         and not (v_field.canonical_path='student_profiles.teacher_notes' and not v_staff) then
        v_canonical_snapshot:=v_canonical_snapshot || jsonb_build_object(v_field.canonical_path,private.form_canonical_value(v_field.canonical_path,v_target));
      end if;
    end loop;
  end if;

  insert into public.form_submissions(form_id,form_version_id,person_id,submitted_by,status,canonical_snapshot,answers,submitted_at,updated_at)
  values(v_form.id,v_version.id,v_target,(select auth.uid()),'completed',v_canonical_snapshot,v_noncanonical,now(),now())
  returning id into v_submission_id;

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('form_submitted','form_submission',v_submission_id::text,'Formulario guardado: '||v_form.admin_name,
    jsonb_build_object('form_key',v_form.form_key,'version',v_version.version_number,'person_id',v_target,'canonical_fields',to_jsonb(array(select jsonb_object_keys(v_canonical_updates)))),
    (select auth.uid()));

  return jsonb_build_object('submission_id',v_submission_id,'form_key',v_form.form_key,'version_number',v_version.version_number,
    'person_id',v_target,'canonical',v_canonical_snapshot,'answers',v_noncanonical);
end;
$$;

create or replace function public.create_generic_form(
  p_form_key text,
  p_admin_name text,
  p_visible_title text default null,
  p_description text default null,
  p_context_key text default 'custom',
  p_form_type text default 'student'
)
returns public.form_definitions
language plpgsql
security definer
set search_path=''
as $$
declare v_form public.form_definitions;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede crear formularios.' using errcode='42501'; end if;
  p_form_key:=lower(btrim(coalesce(p_form_key,'')));
  if p_form_key !~ '^[a-z][a-z0-9_]{2,63}$' then raise exception 'La clave debe usar letras minúsculas, números o guion bajo.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_admin_name,'')),'') is null then raise exception 'Escribe un nombre interno.' using errcode='22023'; end if;
  if p_form_type not in ('student','teacher','internal','admin') then raise exception 'Tipo de formulario no válido.' using errcode='22023'; end if;
  if exists(select 1 from public.form_definitions where form_key=p_form_key) then raise exception 'Ya existe un formulario con esa clave.' using errcode='23505'; end if;
  insert into public.form_definitions(form_key,admin_name,visible_title,description,context_key,form_type,status,active_version,settings,created_by,updated_by)
  values(p_form_key,btrim(p_admin_name),nullif(btrim(coalesce(p_visible_title,'')),''),nullif(btrim(coalesce(p_description,'')),''),
    coalesce(nullif(btrim(coalesce(p_context_key,'')),''),'custom'),p_form_type,'draft',1,jsonb_build_object('runtime_engine','generic_v1'),(select auth.uid()),(select auth.uid()))
  returning * into v_form;
  insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by)
  values(v_form.id,1,'draft','Formulario genérico nuevo',jsonb_build_object('source','P20-v48'),(select auth.uid()));
  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('form_created','form_definition',v_form.id::text,'Formulario genérico creado: '||v_form.admin_name,jsonb_build_object('form_key',v_form.form_key),(select auth.uid()));
  return v_form;
end;
$$;

create or replace function public.add_form_draft_field(
  p_form_id bigint,
  p_field_key text,
  p_field_type text,
  p_label text,
  p_help_text text default null,
  p_required boolean default false,
  p_canonical_path text default null,
  p_options jsonb default '[]'::jsonb,
  p_visibility jsonb default null,
  p_condition jsonb default '{}'::jsonb,
  p_validation jsonb default '{}'::jsonb,
  p_sort_order integer default 100
)
returns public.form_fields
language plpgsql
security definer
set search_path=''
as $$
declare
  v_form public.form_definitions;
  v_version public.form_versions;
  v_field public.form_fields;
  v_visibility jsonb:=p_visibility;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede añadir campos.' using errcode='42501'; end if;
  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then raise exception 'Este formulario pertenece a un servicio de dominio.' using errcode='0A000'; end if;
  select * into v_version from public.form_versions where form_id=p_form_id and status='draft' order by version_number desc limit 1;
  if not found then raise exception 'Crea primero una nueva versión borrador.' using errcode='55000'; end if;
  p_field_key:=lower(btrim(coalesce(p_field_key,'')));
  if p_field_key !~ '^[a-z][a-z0-9_]{1,63}$' then raise exception 'La clave del campo no es válida.' using errcode='22023'; end if;
  if p_field_type not in ('information','text','textarea','select','multiselect','checkbox','number','date','email','phone','hidden','search') then raise exception 'Tipo de campo no soportado.' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_label,'')),'') is null then raise exception 'Escribe una etiqueta para el campo.' using errcode='22023'; end if;
  if p_canonical_path is not null and not private.form_canonical_path_allowed(p_canonical_path) then raise exception 'Ruta canónica no permitida.' using errcode='42501'; end if;
  if exists(select 1 from public.form_fields where form_version_id=v_version.id and field_key=p_field_key) then raise exception 'Ya existe un campo con esa clave en el borrador.' using errcode='23505'; end if;
  if v_visibility is null then
    v_visibility:=case when v_form.form_type='student'
      then '{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb
      else '{"audiences":["staff"],"editable_by":["staff"]}'::jsonb end;
  end if;
  if p_canonical_path='student_profiles.teacher_notes' then
    v_visibility:='{"audiences":["staff"],"editable_by":["staff"]}'::jsonb;
  end if;
  insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
  values(v_version.id,p_field_key,p_field_type,btrim(p_label),nullif(btrim(coalesce(p_help_text,'')),''),coalesce(p_required,false),p_canonical_path,
    coalesce(p_options,'[]'::jsonb),v_visibility,coalesce(p_condition,'{}'::jsonb),coalesce(p_validation,'{}'::jsonb),greatest(coalesce(p_sort_order,100),0),true)
  returning * into v_field;
  return v_field;
end;
$$;

create or replace function public.configure_form_draft_field(
  p_field_id bigint,
  p_field_type text,
  p_canonical_path text default null,
  p_options jsonb default '[]'::jsonb,
  p_visibility jsonb default '{}'::jsonb,
  p_condition jsonb default '{}'::jsonb,
  p_validation jsonb default '{}'::jsonb
)
returns public.form_fields
language plpgsql
security definer
set search_path=''
as $$
declare
  v_field public.form_fields;
  v_form public.form_definitions;
  v_status text;
  v_visibility jsonb:=coalesce(p_visibility,'{}'::jsonb);
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede configurar campos.' using errcode='42501'; end if;
  select ff.* into v_field
  from public.form_fields ff
  where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select fv.status,fd.* into v_status,v_form
  from public.form_versions fv join public.form_definitions fd on fd.id=fv.form_id
  where fv.id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable.' using errcode='55000'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then raise exception 'Este formulario pertenece a un servicio de dominio.' using errcode='0A000'; end if;
  if p_field_type not in ('information','text','textarea','select','multiselect','checkbox','number','date','email','phone','hidden','search') then raise exception 'Tipo de campo no soportado.' using errcode='22023'; end if;
  if p_canonical_path is not null and not private.form_canonical_path_allowed(p_canonical_path) then raise exception 'Ruta canónica no permitida.' using errcode='42501'; end if;
  if v_visibility='{}'::jsonb then v_visibility:=v_field.visibility; end if;
  if p_canonical_path='student_profiles.teacher_notes' then v_visibility:='{"audiences":["staff"],"editable_by":["staff"]}'::jsonb; end if;
  update public.form_fields set field_type=p_field_type,canonical_path=p_canonical_path,options=coalesce(p_options,'[]'::jsonb),visibility=v_visibility,
    condition=coalesce(p_condition,'{}'::jsonb),validation=coalesce(p_validation,'{}'::jsonb)
  where id=p_field_id returning * into v_field;
  return v_field;
end;
$$;

create or replace function public.create_form_draft_version(p_form_id bigint,p_change_note text default null)
returns public.form_versions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_form public.form_definitions;
  v_source public.form_versions;
  v_draft public.form_versions;
  v_next integer;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede crear versiones de formularios.' using errcode='42501'; end if;
  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un servicio de dominio y no se versiona desde el editor genérico.' using errcode='0A000';
  end if;
  select * into v_draft from public.form_versions where form_id=p_form_id and status='draft' order by version_number desc limit 1;
  if found then return v_draft; end if;
  select * into v_source from public.form_versions where form_id=p_form_id and version_number=v_form.active_version;
  if not found then raise exception 'No existe la versión origen.' using errcode='55000'; end if;
  select coalesce(max(version_number),0)+1 into v_next from public.form_versions where form_id=p_form_id;
  insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by)
  values(p_form_id,v_next,'draft',nullif(btrim(coalesce(p_change_note,'')),''),jsonb_build_object('cloned_from',v_source.version_number),(select auth.uid()))
  returning * into v_draft;
  insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
  select v_draft.id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active
  from public.form_fields where form_version_id=v_source.id order by sort_order,id;
  return v_draft;
end;
$$;

create or replace function public.update_form_draft_field(
  p_field_id bigint,
  p_label text default null,
  p_help_text text default null,
  p_required boolean default null,
  p_active boolean default null,
  p_sort_order integer default null,
  p_options jsonb default null,
  p_visibility jsonb default null,
  p_condition jsonb default null,
  p_validation jsonb default null
)
returns public.form_fields
language plpgsql
security definer
set search_path=''
as $$
declare
  v_field public.form_fields;
  v_status text;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede editar formularios.' using errcode='42501'; end if;
  select ff.* into v_field from public.form_fields ff where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select status into v_status from public.form_versions where id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable. Crea primero una nueva versión.' using errcode='55000'; end if;
  update public.form_fields set
    label=coalesce(nullif(btrim(coalesce(p_label,'')),''),label),
    help_text=case when p_help_text is null then help_text else nullif(btrim(p_help_text),'') end,
    required=coalesce(p_required,required),
    active=coalesce(p_active,active),
    sort_order=coalesce(p_sort_order,sort_order),
    options=coalesce(p_options,options),
    visibility=coalesce(p_visibility,visibility),
    condition=coalesce(p_condition,condition),
    validation=coalesce(p_validation,validation)
  where id=p_field_id returning * into v_field;
  return v_field;
end;
$$;

create or replace function public.publish_form_version(p_form_id bigint,p_version_number integer)
returns public.form_versions
language plpgsql
security definer
set search_path=''
as $$
declare
  v_form public.form_definitions;
  v_version public.form_versions;
  v_snapshot jsonb;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede publicar formularios.' using errcode='42501'; end if;
  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un servicio de dominio y no se publica desde el editor genérico.' using errcode='0A000';
  end if;
  select * into v_version from public.form_versions where form_id=p_form_id and version_number=p_version_number for update;
  if not found or v_version.status<>'draft' then raise exception 'Solo se puede publicar una versión en borrador.' using errcode='55000'; end if;
  if not exists(select 1 from public.form_fields where form_version_id=v_version.id and active) then raise exception 'El formulario necesita al menos un campo activo.' using errcode='22023'; end if;
  if exists(select 1 from public.form_fields where form_version_id=v_version.id and active and canonical_path is not null and not private.form_canonical_path_allowed(canonical_path)) then
    raise exception 'El borrador contiene una ruta canónica no permitida.' using errcode='42501';
  end if;
  if exists(
    select 1 from public.form_fields ff
    where ff.form_version_id=v_version.id and ff.active and nullif(ff.condition->>'field','') is not null
      and not exists(select 1 from public.form_fields dep where dep.form_version_id=v_version.id and dep.active and dep.field_key=ff.condition->>'field')
  ) then raise exception 'El borrador contiene una condición que apunta a un campo inexistente.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(ff) order by ff.sort_order,ff.id),'[]'::jsonb) into v_snapshot from public.form_fields ff where ff.form_version_id=v_version.id;
  update public.form_versions set status='superseded' where form_id=p_form_id and status='active';
  update public.form_versions set status='active',snapshot=jsonb_build_object('fields',v_snapshot),published_at=now(),published_by=(select auth.uid()) where id=v_version.id returning * into v_version;
  update public.form_definitions set active_version=p_version_number,status='active',updated_by=(select auth.uid()),updated_at=now() where id=p_form_id;
  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values('form_version_published','form_definition',p_form_id::text,'Nueva versión de formulario publicada',jsonb_build_object('version',p_version_number),(select auth.uid()));
  return v_version;
end;
$$;

create or replace function public.set_form_definition_status(p_form_id bigint,p_status text)
returns public.form_definitions
language plpgsql
security definer
set search_path=''
as $$
declare v_form public.form_definitions;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede cambiar formularios.' using errcode='42501'; end if;
  if p_status not in ('active','inactive','draft','archived') then raise exception 'Estado de formulario no válido.' using errcode='22023'; end if;
  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if p_status='active' and coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un flujo de negocio específico y no puede activarse en el motor genérico.' using errcode='0A000';
  end if;
  update public.form_definitions set status=p_status,updated_by=(select auth.uid()),updated_at=now() where id=p_form_id returning * into v_form;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  return v_form;
end;
$$;

-- Reconciliación de metadata histórica: versiones nuevas, no mutación de v1.
insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by,published_at,published_by)
select f.id,2,'active','P20: canonicalidad y runtime seguro',jsonb_build_object('source','P20-v48','replaces',1),null,now(),null
from public.form_definitions f where f.form_key in ('student_personal','student_dance','onboarding')
on conflict(form_id,version_number) do nothing;

update public.form_versions v set status='superseded'
from public.form_definitions f
where v.form_id=f.id and f.form_key in ('student_personal','student_dance','onboarding') and v.version_number=1 and v.status='active';

with seed(form_key,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order) as (values
('student_personal','first_name','text','Nombre',null,true,'people.first_name','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":120}'::jsonb,10),
('student_personal','last_name','text','Apellidos',null,false,'people.last_name','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":160}'::jsonb,20),
('student_personal','phone','phone','Teléfono',null,false,'people.phone','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":40}'::jsonb,30),
('student_personal','email','email','Email','El email de contacto no cambia por sí solo las credenciales de acceso.',false,'people.email','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff"]}'::jsonb,'{}'::jsonb,'{"max_length":254}'::jsonb,40),
('student_personal','country_code','text','País','Código de país de dos letras, por ejemplo ES.',false,'people.country_code','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"min_length":2,"max_length":2}'::jsonb,50),
('student_personal','birth_date','date','Fecha de nacimiento',null,false,'student_profiles.birth_date','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{}'::jsonb,60),
('student_personal','goals','textarea','Objetivos','Qué quiere conseguir con las clases.',false,'student_profiles.goals','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,70),
('student_personal','motivation','textarea','Motivación','Qué le mueve a bailar o aprender.',false,'student_profiles.motivation','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,80),
('student_personal','health_notes','textarea','Salud / a tener en cuenta','Información que puede afectar a la clase.',false,'student_profiles.health_notes','[]'::jsonb,'{"audiences":["staff","student"],"editable_by":["staff","student"]}'::jsonb,'{}'::jsonb,'{"max_length":3000}'::jsonb,90),
('student_personal','teacher_notes','textarea','Notas internas','Solo visibles para el equipo.',false,'student_profiles.teacher_notes','[]'::jsonb,'{"audiences":["staff"],"editable_by":["staff"]}'::jsonb,'{}'::jsonb,'{"max_length":4000}'::jsonb,100),
('onboarding','welcome','information','Queremos conocerte','CYA solo preguntará lo que todavía no sepa.',false,null,'[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{}'::jsonb,5),
('onboarding','first_name','text','Nombre',null,true,'people.first_name','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":120}'::jsonb,10),
('onboarding','last_name','text','Apellidos',null,false,'people.last_name','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":160}'::jsonb,20),
('onboarding','birth_date','date','Fecha de nacimiento',null,false,'student_profiles.birth_date','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{}'::jsonb,30),
('onboarding','phone','phone','Teléfono',null,false,'people.phone','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":40}'::jsonb,40),
('onboarding','country_code','text','País',null,false,'people.country_code','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"min_length":2,"max_length":2}'::jsonb,50),
('onboarding','goals','textarea','¿Qué quieres conseguir?',null,false,'student_profiles.goals','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,60),
('onboarding','motivation','textarea','¿Qué te motiva a bailar?',null,false,'student_profiles.motivation','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,70),
('student_dance','context_info','information','Estilo, rol y nivel','Estos datos se guardan como contextos de baile reales, no como respuestas duplicadas de formulario.',false,null,'[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{}'::jsonb,10),
('student_dance','goals','textarea','Objetivos',null,false,'student_profiles.goals','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,20),
('student_dance','motivation','textarea','Motivación',null,false,'student_profiles.motivation','[]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}'::jsonb,'{"max_length":2000}'::jsonb,30)
)
insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
select v.id,s.field_key,s.field_type,s.label,s.help_text,s.required,s.canonical_path,s.options,s.visibility,s.condition,s.validation,s.sort_order,true
from seed s join public.form_definitions f on f.form_key=s.form_key
join public.form_versions v on v.form_id=f.id and v.version_number=2
on conflict(form_version_id,field_key) do nothing;

update public.form_definitions set
  active_version=2,
  status='active',
  settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('runtime_engine','generic_v1'),
  updated_at=now()
where form_key in ('student_personal','student_dance','onboarding');

-- Los demás formularios v14 son inventario histórico o contratos de acciones de negocio.
-- Se conservan para trazabilidad, pero no se presentan como formularios genéricos operativos.
update public.form_definitions set
  status='inactive',
  settings=coalesce(settings,'{}'::jsonb)||jsonb_build_object('runtime_engine','domain_service'),
  updated_at=now()
where form_key not in ('student_personal','student_dance','onboarding');

create or replace function private.guard_published_form_fields()
returns trigger
language plpgsql
set search_path=''
as $$
declare v_version_id bigint; v_status text;
begin
  v_version_id:=case when tg_op='DELETE' then old.form_version_id else new.form_version_id end;
  select status into v_status from public.form_versions where id=v_version_id;
  if v_status is distinct from 'draft' then
    raise exception 'Una versión publicada es inmutable. Crea una nueva versión antes de editar campos.' using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_published_form_fields on public.form_fields;
create trigger trg_guard_published_form_fields
before insert or update or delete on public.form_fields
for each row execute function private.guard_published_form_fields();

-- El cliente puede leer lo permitido por RLS, pero todas las escrituras pasan por RPCs validadas.
revoke insert,update,delete on public.form_definitions from authenticated;
revoke insert,update,delete on public.form_versions from authenticated;
revoke insert,update,delete on public.form_fields from authenticated;
revoke insert,update,delete on public.form_submissions from authenticated;

revoke all on function public.form_runtime(text,bigint,text) from public,anon;
grant execute on function public.form_runtime(text,bigint,text) to authenticated;
revoke all on function public.submit_form_runtime(text,bigint,jsonb) from public,anon;
grant execute on function public.submit_form_runtime(text,bigint,jsonb) to authenticated;
revoke all on function public.create_generic_form(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_generic_form(text,text,text,text,text,text) to authenticated;
revoke all on function public.add_form_draft_field(bigint,text,text,text,text,boolean,text,jsonb,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.add_form_draft_field(bigint,text,text,text,text,boolean,text,jsonb,jsonb,jsonb,jsonb,integer) to authenticated;
revoke all on function public.configure_form_draft_field(bigint,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.configure_form_draft_field(bigint,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.create_form_draft_version(bigint,text) from public,anon;
grant execute on function public.create_form_draft_version(bigint,text) to authenticated;
revoke all on function public.update_form_draft_field(bigint,text,text,boolean,boolean,integer,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.update_form_draft_field(bigint,text,text,boolean,boolean,integer,jsonb,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.publish_form_version(bigint,integer) from public,anon;
grant execute on function public.publish_form_version(bigint,integer) to authenticated;
revoke all on function public.set_form_definition_status(bigint,text) from public,anon;
grant execute on function public.set_form_definition_status(bigint,text) to authenticated;

revoke all on function private.form_json_empty(jsonb) from public,anon,authenticated;
revoke all on function private.form_scalar_text(jsonb) from public,anon,authenticated;
revoke all on function private.form_canonical_path_allowed(text) from public,anon,authenticated;
revoke all on function private.form_canonical_value(text,bigint) from public,anon,authenticated;
revoke all on function private.resolve_form_options(jsonb) from public,anon,authenticated;
revoke all on function private.form_option_allowed(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.form_normalize_value(text,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.form_condition_matches(jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.form_field_visible(jsonb,boolean,boolean,boolean) from public,anon,authenticated;
revoke all on function private.apply_form_canonical_updates(bigint,jsonb,boolean) from public,anon,authenticated;
revoke all on function private.guard_published_form_fields() from public,anon,authenticated;

commit;
