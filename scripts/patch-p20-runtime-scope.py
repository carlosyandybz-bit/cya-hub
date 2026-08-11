from pathlib import Path

p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()

anchor="""  select * into v_form from public.form_definitions where form_key=p_form_key and status='active';
  if not found then raise exception 'El formulario no está disponible.' using errcode='P0002'; end if;
"""
replacement=anchor+"""  if coalesce(v_form.settings->>'runtime_engine','')<>'generic_v1' then
    raise exception 'Este formulario pertenece a un flujo de negocio específico y no se ejecuta con el motor genérico.' using errcode='0A000';
  end if;
"""
if replacement not in s:
    if anchor not in s: raise SystemExit('runtime anchor missing')
    s=s.replace(anchor,replacement,2)

status_anchor="""create or replace function public.set_form_definition_status(p_form_id bigint,p_status text)
returns public.form_definitions
language plpgsql
security definer
set search_path=''
as $$
declare v_form public.form_definitions;
begin
  if not (select private.is_admin()) then raise exception 'Solo administración puede cambiar formularios.' using errcode='42501'; end if;
  if p_status not in ('active','inactive','draft','archived') then raise exception 'Estado de formulario no válido.' using errcode='22023'; end if;
  update public.form_definitions set status=p_status,updated_by=(select auth.uid()),updated_at=now() where id=p_form_id returning * into v_form;
"""
status_replacement="""create or replace function public.set_form_definition_status(p_form_id bigint,p_status text)
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
"""
if status_replacement not in s:
    if status_anchor not in s: raise SystemExit('status anchor missing')
    s=s.replace(status_anchor,status_replacement,1)

seed_anchor="""update public.form_definitions set active_version=2,updated_at=now()
where form_key in ('student_personal','student_dance','onboarding');
update public.form_definitions set status='inactive',updated_at=now()
where form_key in ('teacher_profile','onboarding_additional') and status='active';
"""
seed_replacement="""update public.form_definitions set
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
"""
if seed_replacement not in s:
    if seed_anchor not in s: raise SystemExit('seed anchor missing')
    s=s.replace(seed_anchor,seed_replacement,1)

p.write_text(s)
