-- CYA Hub · v37 · autoridad única de roles
--
-- app_members se conserva como registro de membresía/compatibilidad, pero desde esta
-- migración NO concede permisos. La única fuente de autoridad es app_member_roles.
-- Esto hace que el panel Equipo y roles refleje exactamente lo que aplica el servidor.

-- 1) Preservar cualquier rol legado que todavía no tenga fila multirol.
insert into public.app_member_roles(user_id,role,active,granted_by)
select m.user_id,m.role,m.active,null
from public.app_members m
where m.role in ('admin','teacher_admin','teacher','student')
on conflict(user_id,role) do nothing;

-- 2) Única función de autorización por rol.
create or replace function private.has_app_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.app_member_roles r
    where r.user_id=(select auth.uid())
      and r.active
      and r.role=p_role
  );
$$;

create or replace function private.current_app_role()
returns text
language sql
stable
security definer
set search_path=''
as $$
  select r.role
  from public.app_member_roles r
  where r.user_id=(select auth.uid()) and r.active
  order by case r.role
    when 'admin' then 1
    when 'teacher_admin' then 2
    when 'teacher' then 3
    when 'student' then 4
    else 9
  end
  limit 1;
$$;

-- 3) Las altas nuevas escriben también el modelo multirol desde el primer momento.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  normalized_email text:=lower(btrim(coalesce(new.email,'')));
  bootstrap_admin boolean:=false;
  confirmed boolean:=new.email_confirmed_at is not null;
  initial_role text;
begin
  select confirmed and exists(
    select 1 from private.admin_bootstrap_emails where email=normalized_email
  ) into bootstrap_admin;

  initial_role:=case when bootstrap_admin then 'admin' else 'student' end;

  insert into public.user_profiles(id,display_name)
  values(
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'full_name'),''),
      nullif(split_part(normalized_email,'@',1),''),
      'Usuario'
    )
  )
  on conflict(id) do nothing;

  insert into public.app_members(user_id,role,active)
  values(new.id,initial_role,confirmed)
  on conflict(user_id) do update
    set active=excluded.active,updated_at=now();

  insert into public.app_member_roles(user_id,role,active,granted_by)
  values(new.id,initial_role,confirmed,null)
  on conflict(user_id,role) do update
    set active=excluded.active,updated_at=now();

  if confirmed and not bootstrap_admin then
    perform private.link_confirmed_student(new.id);
  end if;

  return new;
end;
$$;

create or replace function private.handle_confirmed_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  normalized_email text:=lower(btrim(coalesce(new.email,'')));
  bootstrap_admin boolean:=false;
  confirmed_role text;
begin
  if new.email_confirmed_at is null then return new; end if;

  select exists(
    select 1 from private.admin_bootstrap_emails where email=normalized_email
  ) into bootstrap_admin;

  confirmed_role:=case when bootstrap_admin then 'admin' else 'student' end;

  update public.app_members
  set role=case when bootstrap_admin then 'admin' else role end,
      active=true,
      updated_at=now()
  where user_id=new.id;

  insert into public.app_member_roles(user_id,role,active,granted_by)
  values(new.id,confirmed_role,true,null)
  on conflict(user_id,role) do update
    set active=true,updated_at=now();

  if not bootstrap_admin then
    perform private.link_confirmed_student(new.id);
  end if;

  return new;
end;
$$;

-- 4) Vinculación del portal basada en el rol multirol, no en app_members.role.
create or replace function private.link_confirmed_student(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_email text;
  v_confirmed_at timestamptz;
  v_metadata jsonb;
  v_person_id bigint;
  v_matches integer;
  v_name text;
begin
  select lower(btrim(coalesce(u.email,''))),u.email_confirmed_at,u.raw_user_meta_data
  into v_email,v_confirmed_at,v_metadata
  from auth.users u
  where u.id=p_user_id;

  if not found or v_confirmed_at is null or v_email='' then return null; end if;

  if not exists(
    select 1 from public.app_member_roles r
    where r.user_id=p_user_id and r.role='student' and r.active
  ) then
    return null;
  end if;

  select p.id into v_person_id
  from public.people p
  where p.auth_user_id=p_user_id and p.active
  limit 1;

  if v_person_id is not null then
    insert into public.student_profiles(person_id,active,created_by)
    values(v_person_id,true,p_user_id)
    on conflict(person_id) do update set active=true,updated_at=now();
    return v_person_id;
  end if;

  select count(*) into v_matches
  from public.people p
  where p.active
    and p.auth_user_id is null
    and lower(btrim(coalesce(p.email,'')))=v_email;

  if v_matches=1 then
    update public.people p
    set auth_user_id=p_user_id,updated_at=now()
    where p.id=(
      select p2.id
      from public.people p2
      where p2.active
        and p2.auth_user_id is null
        and lower(btrim(coalesce(p2.email,'')))=v_email
      limit 1
    )
    returning p.id into v_person_id;
  elsif v_matches=0 then
    v_name:=coalesce(
      nullif(btrim(v_metadata->>'full_name'),''),
      nullif(split_part(v_email,'@',1),''),
      'Alumno'
    );
    insert into public.people(auth_user_id,display_name,email,crm_stage,active,created_by)
    values(p_user_id,v_name,v_email,'new',true,p_user_id)
    returning id into v_person_id;
  else
    -- Nunca adivinar si dos provisionales comparten email.
    return null;
  end if;

  insert into public.student_profiles(person_id,active,created_by)
  values(v_person_id,true,p_user_id)
  on conflict(person_id) do update set active=true,updated_at=now();

  return v_person_id;
end;
$$;

-- 5) Invariante de seguridad: CYA Hub nunca puede quedarse sin al menos una
-- identidad con capacidad administrativa activa.
create or replace function private.guard_last_admin_role()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  removing_admin boolean:=false;
  other_admin_exists boolean:=false;
begin
  if tg_op='DELETE' then
    removing_admin:=old.active and old.role in ('admin','teacher_admin');
  else
    removing_admin:=old.active
      and old.role in ('admin','teacher_admin')
      and not (new.active and new.role in ('admin','teacher_admin'));
  end if;

  if removing_admin then
    select exists(
      select 1
      from public.app_member_roles r
      where r.active
        and r.role in ('admin','teacher_admin')
        and not (r.user_id=old.user_id and r.role=old.role)
    ) into other_admin_exists;

    if not other_admin_exists then
      raise exception 'CYA Hub debe conservar al menos un administrador activo.' using errcode='23514';
    end if;
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_guard_last_admin_role on public.app_member_roles;
create trigger trg_guard_last_admin_role
before update or delete on public.app_member_roles
for each row execute function private.guard_last_admin_role();
