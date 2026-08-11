from pathlib import Path

p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()

old_config="""  select ff,fv.status,fd into v_field,v_status,v_form
  from public.form_fields ff join public.form_versions fv on fv.id=ff.form_version_id join public.form_definitions fd on fd.id=fv.form_id
  where ff.id=p_field_id for update of ff;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable.' using errcode='55000'; end if;
"""
new_config="""  select ff.* into v_field
  from public.form_fields ff
  where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select fv.status,fd.* into v_status,v_form
  from public.form_versions fv join public.form_definitions fd on fd.id=fv.form_id
  where fv.id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable.' using errcode='55000'; end if;
"""
if old_config not in s: raise SystemExit('configure select anchor missing')
s=s.replace(old_config,new_config,1)

old_update="""  select ff,fv.status into v_field,v_status from public.form_fields ff join public.form_versions fv on fv.id=ff.form_version_id where ff.id=p_field_id for update of ff;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable. Crea primero una nueva versión.' using errcode='55000'; end if;
"""
new_update="""  select ff.* into v_field from public.form_fields ff where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select status into v_status from public.form_versions where id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable. Crea primero una nueva versión.' using errcode='55000'; end if;
"""
if old_update not in s: raise SystemExit('update select anchor missing')
s=s.replace(old_update,new_update,1)

p.write_text(s)
