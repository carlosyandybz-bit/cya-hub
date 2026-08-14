-- Post-release — alta segura e idempotente de profesores.
-- Auth se resuelve en Edge Function; estas RPCs conservan P19 como fuente única de identidad.

create or replace function public.admin_teacher_invite_preflight(
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_first text:=nullif(btrim(coalesce(p_first_name,'')),'');
  v_last text:=nullif(btrim(coalesce(p_last_name,'')),'');
  v_email text:=private.normalize_person_email(p_email);
  v_phone text:=nullif(btrim(coalesce(p_phone,'')),'');
  v_country text:=nullif(upper(btrim(coalesce(p_country_code,''))),'');
  v_person_id bigint;
  v_person public.people;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede añadir profesores.' using errcode='42501';
  end if;
  if v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_email is null then raise exception 'El email es obligatorio para enviar la invitación.' using errcode='22023'; end if;
  if v_country is not null and length(v_country)<>2 then raise exception 'Selecciona un país válido.' using errcode='22023'; end if;
  if v_phone is not null and coalesce(length(private.normalize_person_phone(v_phone)),0)<7 then raise exception 'El teléfono no es válido.' using errcode='22023'; end if;

  select private.match_person_identity(v_email,v_phone,null) into v_person_id;
  if v_person_id is not null then
    select * into v_person from public.people where id=v_person_id and active;
  end if;

  return jsonb_build_object(
    'first_name',coalesce(v_person.first_name,v_first),
    'last_name',coalesce(v_person.last_name,v_last),
    'display_name',coalesce(nullif(btrim(v_person.display_name),''),btrim(concat_ws(' ',v_first,v_last))),
    'email',v_email,
    'phone',coalesce(v_person.phone,v_phone),
    'country_code',coalesce(v_person.country_code,v_country),
    'person_id',v_person_id,
    'auth_user_id',v_person.auth_user_id,
    'reused_person',v_person_id is not null
  );
end;
$$;

revoke all on function public.admin_teacher_invite_preflight(text,text,text,text,text) from public, anon;
grant execute on function public.admin_teacher_invite_preflight(text,text,text,text,text) to authenticated;

create or replace function public.admin_finalize_teacher_invite(
  p_auth_user_id uuid,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_first text:=nullif(btrim(coalesce(p_first_name,'')),'');
  v_last text:=nullif(btrim(coalesce(p_last_name,'')),'');
  v_email text:=private.normalize_person_email(p_email);
  v_phone text:=nullif(btrim(coalesce(p_phone,'')),'');
  v_country text:=nullif(upper(btrim(coalesce(p_country_code,''))),'');
  v_auth_email text;
  v_person_id bigint;
  v_person public.people;
  v_display text;
  v_reused boolean:=false;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo administración puede añadir profesores.' using errcode='42501';
  end if;
  if p_auth_user_id is null then raise exception 'Falta la cuenta de acceso.' using errcode='22023'; end if;
  if v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_email is null then raise exception 'El email es obligatorio.' using errcode='22023'; end if;
  if v_country is not null and length(v_country)<>2 then raise exception 'Selecciona un país válido.' using errcode='22023'; end if;
  if v_phone is not null and coalesce(length(private.normalize_person_phone(v_phone)),0)<7 then raise exception 'El teléfono no es válido.' using errcode='22023'; end if;

  select private.normalize_person_email(u.email) into v_auth_email
  from auth.users u where u.id=p_auth_user_id;
  if v_auth_email is null then raise exception 'La cuenta de acceso no existe.' using errcode='P0002'; end if;
  if v_auth_email is distinct from v_email then
    raise exception 'La cuenta de acceso no corresponde con el email indicado.' using errcode='23514';
  end if;

  perform private.lock_person_identity(v_email,v_phone);
  select private.match_person_identity(v_email,v_phone,null) into v_person_id;

  if v_person_id is not null then
    select * into v_person from public.people where id=v_person_id and active for update;
    v_reused:=true;
    if v_person.auth_user_id is not null and v_person.auth_user_id is distinct from p_auth_user_id then
      raise exception 'La ficha encontrada ya está vinculada a otra cuenta. Revísala antes de continuar.' using errcode='23505';
    end if;
    v_display:=coalesce(nullif(btrim(v_person.display_name),''),btrim(concat_ws(' ',v_first,v_last)));
    update public.people
    set auth_user_id=p_auth_user_id,
        first_name=coalesce(first_name,v_first),
        last_name=coalesce(last_name,v_last),
        email=coalesce(email,v_email),
        phone=coalesce(phone,v_phone),
        country_code=coalesce(country_code,v_country),
        display_name=v_display,
        active=true,
        updated_at=now()
    where id=v_person_id
    returning * into v_person;
  else
    v_display:=btrim(concat_ws(' ',v_first,v_last));
    insert into public.people(
      auth_user_id,display_name,first_name,last_name,email,phone,country_code,
      crm_stage,source,active,created_by
    ) values (
      p_auth_user_id,v_display,v_first,v_last,v_email,v_phone,v_country,
      'new','teacher_invite',true,v_actor
    ) returning * into v_person;
    v_person_id:=v_person.id;
  end if;

  insert into public.app_members(user_id,role,active)
  values(p_auth_user_id,'teacher',true)
  on conflict(user_id) do update set
    role=case when public.app_members.role in ('admin','teacher_admin') then public.app_members.role else 'teacher' end,
    active=true,
    updated_at=now();

  insert into public.app_member_roles(user_id,role,active,granted_by)
  values(p_auth_user_id,'student',true,v_actor)
  on conflict(user_id,role) do update set active=true,granted_by=coalesce(public.app_member_roles.granted_by,excluded.granted_by),updated_at=now();

  insert into public.app_member_roles(user_id,role,active,granted_by)
  values(p_auth_user_id,'teacher',true,v_actor)
  on conflict(user_id,role) do update set active=true,granted_by=coalesce(public.app_member_roles.granted_by,excluded.granted_by),updated_at=now();

  insert into public.student_profiles(person_id,active,created_by)
  values(v_person_id,true,v_actor)
  on conflict(person_id) do update set active=true,updated_at=now();

  insert into public.teacher_profiles(person_id,professional_name,active,created_by,updated_by)
  values(v_person_id,coalesce(nullif(btrim(v_person.display_name),''),v_display),true,v_actor,v_actor)
  on conflict(person_id) do update set
    professional_name=coalesce(public.teacher_profiles.professional_name,excluded.professional_name),
    active=true,
    updated_by=v_actor,
    updated_at=now();

  insert into public.audit_events(event_type,entity_type,entity_id,summary,detail,actor_user_id)
  values(
    'teacher_onboarded','person',v_person_id::text,'Profesor añadido al equipo',
    jsonb_build_object('user_id',p_auth_user_id,'email',v_email,'reused_person',v_reused,'roles',jsonb_build_array('teacher','student')),
    v_actor
  );

  return jsonb_build_object(
    'person_id',v_person_id,
    'user_id',p_auth_user_id,
    'display_name',v_person.display_name,
    'email',v_email,
    'reused_person',v_reused,
    'roles',jsonb_build_array('teacher','student')
  );
end;
$$;

revoke all on function public.admin_finalize_teacher_invite(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.admin_finalize_teacher_invite(uuid,text,text,text,text,text) to authenticated;
