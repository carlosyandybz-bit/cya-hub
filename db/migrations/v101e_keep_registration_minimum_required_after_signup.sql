-- V1-020 — El mínimo obligatorio del registro sigue siendo obligatorio al editar el perfil.
-- Se puede corregir, pero no vaciar Nombre, Apellidos, Teléfono o País.

do $$
declare v_form_id bigint; v_old_version_id bigint; v_new_version_id bigint;
begin
  select id into v_form_id from public.form_definitions where form_key='student_personal';
  select id into v_old_version_id from public.form_versions where form_id=v_form_id and version_number=3 limit 1;
  select id into v_new_version_id from public.form_versions where form_id=v_form_id and version_number=4 limit 1;
  if v_form_id is not null and v_old_version_id is not null and v_new_version_id is null then
    insert into public.form_versions(form_id,version_number,status,change_note,snapshot)
    select form_id,4,'draft','V1-020: mantiene Nombre, Apellidos, Teléfono y País como mínimo obligatorio también después del registro, permitiendo corregirlos pero no vaciarlos.',snapshot
    from public.form_versions where id=v_old_version_id returning id into v_new_version_id;

    insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
    select v_new_version_id,field_key,field_type,label,help_text,
      case when field_key in ('first_name','last_name','phone','country_code') then true else required end,
      canonical_path,options,visibility,condition,validation,sort_order,active
    from public.form_fields where form_version_id=v_old_version_id;

    update public.form_versions set status='active',published_at=now() where id=v_new_version_id;
    update public.form_versions set status='superseded' where id=v_old_version_id and status='active';
    update public.form_definitions set active_version=4,updated_at=now() where id=v_form_id;
  end if;
end $$;
