-- Reactiva el formulario histórico de profesor sin modificar su versión publicada.
-- P20 exige que los campos publicados sean inmutables, por lo que se crea una versión 2.

do $$
declare
  v_form_id bigint;
  v_source_version_id bigint;
  v_target_version_id bigint;
  v_target_status text;
begin
  select id into v_form_id
  from public.form_definitions
  where form_key='teacher_profile'
  for update;

  if v_form_id is null then
    raise exception 'No existe el formulario teacher_profile.' using errcode='P0002';
  end if;

  select id into v_source_version_id
  from public.form_versions
  where form_id=v_form_id and version_number=1;

  if v_source_version_id is null then
    raise exception 'No existe la versión histórica de teacher_profile.' using errcode='P0002';
  end if;

  select id,status into v_target_version_id,v_target_status
  from public.form_versions
  where form_id=v_form_id and version_number=2;

  if v_target_version_id is null then
    insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_at)
    select v_form_id,2,'draft',
      'Perfil profesional normalizado y compatible con el motor genérico P20.',
      coalesce(snapshot,'{}'::jsonb) || jsonb_build_object('postrelease','teacher_profile_v2'),
      now()
    from public.form_versions
    where id=v_source_version_id
    returning id,status into v_target_version_id,v_target_status;
  end if;

  if v_target_status='draft' then
    delete from public.form_fields where form_version_id=v_target_version_id;

    insert into public.form_fields(
      form_version_id,field_key,field_type,label,help_text,required,canonical_path,
      options,visibility,condition,validation,sort_order,active
    )
    select
      v_target_version_id,
      field_key,
      field_type,
      label,
      case field_key
        when 'professional_name' then 'El nombre profesional que utilizas dentro del equipo.'
        when 'styles' then 'Selecciona los estilos que impartes.'
        else help_text
      end,
      required,
      case when field_key='professional_name' then 'teacher_profiles.professional_name' else canonical_path end,
      case when field_key='styles' then jsonb_build_object('catalog_taxonomy','dance_style') else options end,
      visibility,condition,validation,sort_order,active
    from public.form_fields
    where form_version_id=v_source_version_id
    order by sort_order,id;

    update public.form_versions
    set status='active',published_at=now()
    where id=v_target_version_id;
  elsif v_target_status<>'active' then
    raise exception 'La versión 2 de teacher_profile está en un estado no publicable: %',v_target_status using errcode='55000';
  end if;

  update public.form_definitions
  set status='active',
      active_version=2,
      settings=(coalesce(settings,'{}'::jsonb) - 'runtime_engine') || jsonb_build_object('runtime_engine','generic_v1'),
      description='Completa tu ficha profesional para que CYA tenga tus datos docentes organizados.',
      updated_at=now()
  where id=v_form_id;
end;
$$;
