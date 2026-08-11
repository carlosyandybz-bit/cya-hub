from pathlib import Path

p=Path('supabase/v48_p20_form_engine.sql')
s=p.read_text()

# Hard security floor: internal teacher notes never become student-visible through metadata.
for needle in [
"""    v_visible:=private.form_field_visible(v_field.visibility,v_staff,v_admin,false);
    if not v_visible then continue; end if;
    v_writable:=private.form_field_visible(v_field.visibility,v_staff,v_admin,true) and p_mode<>'review';
""",
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    v_existing:=case when v_field.canonical_path is not null then private.form_canonical_value(v_field.canonical_path,v_target) else v_previous->v_field.field_key end;
""",
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    v_condition:=private.form_condition_matches(v_field.condition,v_effective);
""",
"""      if private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then
        v_canonical_snapshot:=v_canonical_snapshot || jsonb_build_object(v_field.canonical_path,private.form_canonical_value(v_field.canonical_path,v_target));
""",
]:
    if needle not in s:
        raise SystemExit('visibility anchor missing')

s=s.replace(
"""    v_visible:=private.form_field_visible(v_field.visibility,v_staff,v_admin,false);
    if not v_visible then continue; end if;
    v_writable:=private.form_field_visible(v_field.visibility,v_staff,v_admin,true) and p_mode<>'review';
""",
"""    v_visible:=private.form_field_visible(v_field.visibility,v_staff,v_admin,false);
    if not v_visible then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_writable:=private.form_field_visible(v_field.visibility,v_staff,v_admin,true) and p_mode<>'review';
""",1)
s=s.replace(
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    v_existing:=case when v_field.canonical_path is not null then private.form_canonical_value(v_field.canonical_path,v_target) else v_previous->v_field.field_key end;
""",
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_existing:=case when v_field.canonical_path is not null then private.form_canonical_value(v_field.canonical_path,v_target) else v_previous->v_field.field_key end;
""",1)
s=s.replace(
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    v_condition:=private.form_condition_matches(v_field.condition,v_effective);
""",
"""    if not private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then continue; end if;
    if v_field.canonical_path='student_profiles.teacher_notes' and not v_staff then continue; end if;
    v_condition:=private.form_condition_matches(v_field.condition,v_effective);
""",1)
s=s.replace(
"""      if private.form_field_visible(v_field.visibility,v_staff,v_admin,false) then
        v_canonical_snapshot:=v_canonical_snapshot || jsonb_build_object(v_field.canonical_path,private.form_canonical_value(v_field.canonical_path,v_target));
""",
"""      if private.form_field_visible(v_field.visibility,v_staff,v_admin,false)
         and not (v_field.canonical_path='student_profiles.teacher_notes' and not v_staff) then
        v_canonical_snapshot:=v_canonical_snapshot || jsonb_build_object(v_field.canonical_path,private.form_canonical_value(v_field.canonical_path,v_target));
""",1)

builder_anchor="""create or replace function public.create_form_draft_version(p_form_id bigint,p_change_note text default null)
"""
if builder_anchor not in s: raise SystemExit('builder insertion anchor missing')

builder_sql=r'''create or replace function public.create_generic_form(
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
  select ff,fv.status,fd into v_field,v_status,v_form
  from public.form_fields ff join public.form_versions fv on fv.id=ff.form_version_id join public.form_definitions fd on fd.id=fv.form_id
  where ff.id=p_field_id for update of ff;
  if not found then raise exception 'El campo no existe.' using errcode='P0002'; end if;
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

'''
if 'create or replace function public.create_generic_form(' not in s:
    s=s.replace(builder_anchor,builder_sql+builder_anchor,1)

# Validate draft structure before publication.
publish_check="""  if not exists(select 1 from public.form_fields where form_version_id=v_version.id and active) then raise exception 'El formulario necesita al menos un campo activo.' using errcode='22023'; end if;
"""
publish_more=publish_check+"""  if exists(select 1 from public.form_fields where form_version_id=v_version.id and active and canonical_path is not null and not private.form_canonical_path_allowed(canonical_path)) then
    raise exception 'El borrador contiene una ruta canónica no permitida.' using errcode='42501';
  end if;
  if exists(
    select 1 from public.form_fields ff
    where ff.form_version_id=v_version.id and ff.active and nullif(ff.condition->>'field','') is not null
      and not exists(select 1 from public.form_fields dep where dep.form_version_id=v_version.id and dep.active and dep.field_key=ff.condition->>'field')
  ) then raise exception 'El borrador contiene una condición que apunta a un campo inexistente.' using errcode='22023'; end if;
"""
if publish_more not in s:
    if publish_check not in s: raise SystemExit('publish validation anchor missing')
    s=s.replace(publish_check,publish_more,1)

# Public grants for builder RPCs; no direct private exposure.
grant_anchor="""revoke all on function public.create_form_draft_version(bigint,text) from public,anon;
grant execute on function public.create_form_draft_version(bigint,text) to authenticated;
"""
grant_more=r'''revoke all on function public.create_generic_form(text,text,text,text,text,text) from public,anon;
grant execute on function public.create_generic_form(text,text,text,text,text,text) to authenticated;
revoke all on function public.add_form_draft_field(bigint,text,text,text,text,boolean,text,jsonb,jsonb,jsonb,jsonb,integer) from public,anon;
grant execute on function public.add_form_draft_field(bigint,text,text,text,text,boolean,text,jsonb,jsonb,jsonb,jsonb,integer) to authenticated;
revoke all on function public.configure_form_draft_field(bigint,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.configure_form_draft_field(bigint,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
'''+grant_anchor
if 'revoke all on function public.create_generic_form' not in s:
    if grant_anchor not in s: raise SystemExit('grant anchor missing')
    s=s.replace(grant_anchor,grant_more,1)

p.write_text(s)
