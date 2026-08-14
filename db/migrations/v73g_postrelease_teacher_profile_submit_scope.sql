-- Blinda el guardado del formulario teacher_profile al propietario o a administración.

create or replace function public.submit_form_runtime(p_form_key text, p_person_id bigint default null::bigint, p_answers jsonb default '{}'::jsonb)
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

  if v_form.form_key='teacher_profile' then
    if v_target is null then v_target:=v_current_person; end if;
    if v_target is null then raise exception 'No hay una persona vinculada a tu cuenta.' using errcode='42501'; end if;
    if v_target is distinct from v_current_person and not v_admin then
      raise exception 'Solo puedes guardar tu propio perfil profesional.' using errcode='42501';
    end if;
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

  for v_key in select jsonb_object_keys(p_answers) loop
    if not exists(select 1 from public.form_fields ff where ff.form_version_id=v_version.id and ff.field_key=v_key and ff.active) then
      raise exception 'El campo % no pertenece a la versión activa.',v_key using errcode='22023';
    end if;
  end loop;

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
