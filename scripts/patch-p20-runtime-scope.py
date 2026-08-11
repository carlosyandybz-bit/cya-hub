from pathlib import Path

p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()

old="""  select ff.* into v_field
  from public.form_fields ff
  where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select fv.status,fd.* into v_status,v_form
  from public.form_versions fv join public.form_definitions fd on fd.id=fv.form_id
  where fv.id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable.' using errcode='55000'; end if;
"""
new="""  select ff.* into v_field
  from public.form_fields ff
  where ff.id=p_field_id for update;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
  select fv.status into v_status
  from public.form_versions fv
  where fv.id=v_field.form_version_id;
  select fd.* into v_form
  from public.form_versions fv
  join public.form_definitions fd on fd.id=fv.form_id
  where fv.id=v_field.form_version_id;
  if v_status<>'draft' then raise exception 'Una versión publicada es inmutable.' using errcode='55000'; end if;
"""
if old not in s:
    if new in s:
        raise SystemExit('safe configure row loading already present')
    raise SystemExit('configure current anchor missing')
s=s.replace(old,new,1)

# Guard against reintroducing composite-row + scalar INTO patterns.
for bad in (
    'select ff,fv.status into v_field,v_status',
    'select ff,fv.status,fd into v_field,v_status,v_form',
    'select fv.status,fd.* into v_status,v_form',
):
    if bad in s:
        raise SystemExit(f'unsafe PLpgSQL row loading remains: {bad}')

p.write_text(s)
