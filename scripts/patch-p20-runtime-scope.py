from pathlib import Path

p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()

submit_anchor="""  select * into v_form from public.form_definitions where form_key=p_form_key and status='active' for share;
  if not found then raise exception 'El formulario no está disponible.' using errcode='P0002'; end if;
"""
submit_replacement=submit_anchor+"""  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un flujo de negocio específico y no se ejecuta con el motor genérico.' using errcode='0A000';
  end if;
"""
if submit_replacement not in s:
    if submit_anchor not in s: raise SystemExit('submit anchor missing')
    s=s.replace(submit_anchor,submit_replacement,1)

create_anchor="""  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  select * into v_draft from public.form_versions where form_id=p_form_id and status='draft' order by version_number desc limit 1;
"""
create_replacement="""  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un servicio de dominio y no se versiona desde el editor genérico.' using errcode='0A000';
  end if;
  select * into v_draft from public.form_versions where form_id=p_form_id and status='draft' order by version_number desc limit 1;
"""
if create_replacement not in s:
    if create_anchor not in s: raise SystemExit('create draft anchor missing')
    s=s.replace(create_anchor,create_replacement,1)

publish_anchor="""  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  select * into v_version from public.form_versions where form_id=p_form_id and version_number=p_version_number for update;
"""
publish_replacement="""  select * into v_form from public.form_definitions where id=p_form_id for update;
  if not found then raise exception 'El formulario no existe.' using errcode='P0002'; end if;
  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un servicio de dominio y no se publica desde el editor genérico.' using errcode='0A000';
  end if;
  select * into v_version from public.form_versions where form_id=p_form_id and version_number=p_version_number for update;
"""
if publish_replacement not in s:
    if publish_anchor not in s: raise SystemExit('publish anchor missing')
    s=s.replace(publish_anchor,publish_replacement,1)

p.write_text(s)
