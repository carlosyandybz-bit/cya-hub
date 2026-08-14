-- Blinda la lectura del formulario teacher_profile al propietario o a administración.

create or replace function public.form_runtime(p_form_key text, p_person_id bigint default null::bigint, p_mode text default 'complete_missing'::text)
returns jsonb
language plpgsql
stable security definer
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

  if v_form.form_key='teacher_profile' then
    if v_target is null then v_target:=v_current_person; end if;
    if v_target is null then raise exception 'No hay una persona vinculada a tu cuenta.' using errcode='42501'; end if;
    if v_target is distinct from v_current_person and not v_admin then
      raise exception 'Solo puedes abrir tu propio perfil profesional.' using errcode='42501';
    end if;
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
