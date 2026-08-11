-- v47 — P19: persona única, estados derivados e identidad editable.

create or replace function private.normalize_person_email(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select nullif(lower(btrim(coalesce(p_value,''))),'');
$$;

create or replace function private.normalize_person_phone(p_value text)
returns text
language sql
immutable
set search_path=''
as $$
  select nullif(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'');
$$;

create or replace function private.lock_person_identity(p_email text, p_phone text)
returns void
language plpgsql
set search_path=''
as $$
declare
  v_email text := private.normalize_person_email(p_email);
  v_phone text := private.normalize_person_phone(p_phone);
begin
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cya-person-email:'||v_email,0));
  end if;
  if v_phone is not null and length(v_phone)>=7 then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cya-person-phone:'||v_phone,0));
  end if;
end;
$$;

create or replace function private.match_person_identity(p_email text, p_phone text, p_exclude_person_id bigint default null)
returns bigint
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_email text := private.normalize_person_email(p_email);
  v_phone text := private.normalize_person_phone(p_phone);
  v_ids bigint[];
begin
  select coalesce(array_agg(distinct p.id order by p.id),'{}'::bigint[])
  into v_ids
  from public.people p
  where p.active
    and (p_exclude_person_id is null or p.id<>p_exclude_person_id)
    and (
      (v_email is not null and private.normalize_person_email(p.email)=v_email)
      or
      (v_phone is not null and length(v_phone)>=7 and private.normalize_person_phone(p.phone)=v_phone)
    );

  if cardinality(v_ids)>1 then
    raise exception 'Hay varias fichas que coinciden con ese email o teléfono. Revísalas antes de continuar.' using errcode='23505';
  end if;
  return case when cardinality(v_ids)=1 then v_ids[1] else null end;
end;
$$;

create or replace function private.person_lifecycle_status_unchecked(p_person_id bigint)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select case
    when p.id is null then null
    when sp.person_id is null then 'potential'
    when p.auth_user_id is null then 'provisional'
    else 'registered'
  end
  from (select 1) seed
  left join public.people p on p.id=p_person_id and p.active
  left join public.student_profiles sp on sp.person_id=p.id and sp.active;
$$;

create or replace function public.person_lifecycle_status(p_person_id bigint)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_status text;
begin
  if not (select private.is_staff()) and p_person_id is distinct from (select private.current_person_id()) then
    raise exception 'No tienes permiso para consultar esta identidad.' using errcode='42501';
  end if;
  select private.person_lifecycle_status_unchecked(p_person_id) into v_status;
  if v_status is null then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  return v_status;
end;
$$;

revoke all on function public.person_lifecycle_status(bigint) from public, anon;
grant execute on function public.person_lifecycle_status(bigint) to authenticated;

create or replace function public.create_student(
  p_display_name text,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null
)
returns public.people
language plpgsql
set search_path=''
as $$
declare
  v_person public.people;
  v_match bigint;
  v_email text := private.normalize_person_email(p_email);
  v_phone text := nullif(btrim(coalesce(p_phone,'')),'');
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))),'');
  v_was_student boolean := false;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para crear alumnos.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_display_name,'')))=0 then raise exception 'El nombre del alumno es obligatorio.' using errcode='22023'; end if;

  perform private.lock_person_identity(v_email,v_phone);
  select private.match_person_identity(v_email,v_phone,null) into v_match;

  if v_match is not null then
    select exists(select 1 from public.student_profiles sp where sp.person_id=v_match and sp.active) into v_was_student;
    update public.people p set
      display_name=btrim(p_display_name),
      first_name=coalesce(nullif(btrim(coalesce(p_first_name,'')),''),p.first_name),
      last_name=coalesce(nullif(btrim(coalesce(p_last_name,'')),''),p.last_name),
      email=coalesce(v_email,p.email),
      phone=coalesce(v_phone,p.phone),
      country_code=coalesce(v_country,p.country_code),
      updated_at=now()
    where p.id=v_match and p.active
    returning p.* into v_person;

    insert into public.student_profiles(person_id,student_since,active,created_by)
    values(v_match,null,true,(select auth.uid()))
    on conflict(person_id) do update set active=true,updated_at=now();

    if not v_was_student then
      insert into public.crm_activities(person_id,activity_type,summary,created_by)
      values(v_match,'conversion','Ficha provisional habilitada reutilizando la persona existente',(select auth.uid()));
    end if;
    return v_person;
  end if;

  insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,active,created_by)
  values(
    btrim(p_display_name),
    nullif(btrim(coalesce(p_first_name,'')),''),
    nullif(btrim(coalesce(p_last_name,'')),''),
    v_email,v_phone,v_country,'new',true,(select auth.uid())
  ) returning * into v_person;

  insert into public.student_profiles(person_id,student_since,active,created_by)
  values(v_person.id,null,true,(select auth.uid()));
  return v_person;
end;
$$;

create or replace function public.enable_provisional_student(p_person_id bigint)
returns public.people
language plpgsql
set search_path=''
as $$
declare
  v_person public.people;
  v_was_active boolean;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para habilitar alumnos.' using errcode='42501'; end if;
  select * into v_person from public.people where id=p_person_id and active for update;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  select exists(select 1 from public.student_profiles where person_id=p_person_id and active) into v_was_active;
  insert into public.student_profiles(person_id,student_since,active,created_by)
  values(p_person_id,null,true,(select auth.uid()))
  on conflict(person_id) do update set active=true,updated_at=now();
  if not v_was_active then
    insert into public.crm_activities(person_id,activity_type,summary,created_by)
    values(p_person_id,'conversion','Ficha provisional habilitada sin perder los datos del CRM',(select auth.uid()));
  end if;
  return v_person;
end;
$$;

create or replace function public.save_person_identity(
  p_person_id bigint,
  p_first_name text,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null,
  p_goals text default null,
  p_teacher_notes text default null,
  p_health_notes text default null
)
returns public.people
language plpgsql
set search_path=''
as $$
declare
  v_person public.people;
  v_first text := nullif(btrim(coalesce(p_first_name,'')),'');
  v_last text := nullif(btrim(coalesce(p_last_name,'')),'');
  v_email text := private.normalize_person_email(p_email);
  v_phone text := nullif(btrim(coalesce(p_phone,'')),'');
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))),'');
  v_match bigint;
  v_name text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para editar alumnos.' using errcode='42501'; end if;
  if v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  v_name:=btrim(concat_ws(' ',v_first,v_last));

  select * into v_person from public.people where id=p_person_id and active for update;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;

  perform private.lock_person_identity(v_email,v_phone);
  select private.match_person_identity(v_email,v_phone,p_person_id) into v_match;
  if v_match is not null then
    raise exception 'Ese email o teléfono pertenece a otra ficha. Revísala antes de guardar.' using errcode='23505';
  end if;

  update public.people set
    display_name=v_name,
    first_name=v_first,
    last_name=v_last,
    email=v_email,
    phone=v_phone,
    country_code=v_country,
    updated_at=now()
  where id=p_person_id
  returning * into v_person;

  insert into public.student_profiles(person_id,student_since,goals,teacher_notes,health_notes,active,created_by)
  values(p_person_id,null,nullif(btrim(coalesce(p_goals,'')),''),nullif(btrim(coalesce(p_teacher_notes,'')),''),nullif(btrim(coalesce(p_health_notes,'')),''),true,(select auth.uid()))
  on conflict(person_id) do update set
    goals=excluded.goals,
    teacher_notes=excluded.teacher_notes,
    health_notes=excluded.health_notes,
    active=true,
    updated_at=now();

  insert into public.crm_activities(person_id,activity_type,summary,created_by)
  values(p_person_id,'note','Datos principales de la persona actualizados desde Alumnado',(select auth.uid()));
  return v_person;
end;
$$;

revoke all on function public.save_person_identity(bigint,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.save_person_identity(bigint,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.save_crm_contact(
  p_person_id bigint default null,
  p_first_name text default null,
  p_last_name text default null,
  p_email text default null,
  p_phone text default null,
  p_country_code text default null,
  p_crm_stage text default 'new',
  p_source text default null,
  p_contact_date date default current_date,
  p_inquiry text default null,
  p_reserved boolean default false,
  p_rate_id bigint default null,
  p_quoted_amount_cents integer default null,
  p_notes text default null,
  p_contact_permission text default 'unknown'
)
returns public.people
language plpgsql
set search_path=''
as $$
declare
  v_person public.people;
  v_name text;
  v_previous_stage text;
  v_effective_stage text;
  v_email text := private.normalize_person_email(p_email);
  v_phone text := nullif(btrim(coalesce(p_phone,'')),'');
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))),'');
  v_match bigint;
  v_reused boolean := false;
  v_explicit boolean := p_person_id is not null;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar CRM.' using errcode='42501'; end if;
  if p_crm_stage not in ('new','contacted','interested','booked','student','lost') then raise exception 'Estado de CRM no válido.' using errcode='22023'; end if;
  if p_contact_permission not in ('unknown','allowed','blocked') then raise exception 'Permiso de contacto no válido.' using errcode='22023'; end if;
  if p_quoted_amount_cents is not null and p_quoted_amount_cents<0 then raise exception 'El importe no puede ser negativo.' using errcode='22023'; end if;
  v_name:=btrim(concat_ws(' ',nullif(btrim(coalesce(p_first_name,'')),''),nullif(btrim(coalesce(p_last_name,'')),'')));
  if length(v_name)=0 then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;

  perform private.lock_person_identity(v_email,v_phone);

  if p_person_id is null then
    select private.match_person_identity(v_email,v_phone,null) into v_match;
    if v_match is not null then p_person_id:=v_match; v_reused:=true; end if;
  else
    select private.match_person_identity(v_email,v_phone,p_person_id) into v_match;
    if v_match is not null then
      raise exception 'Ese email o teléfono pertenece a otra ficha. Revísala antes de guardar.' using errcode='23505';
    end if;
  end if;

  if p_person_id is null then
    insert into public.people(display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,active,created_by)
    values(v_name,nullif(btrim(coalesce(p_first_name,'')),''),nullif(btrim(coalesce(p_last_name,'')),''),v_email,v_phone,v_country,p_crm_stage,nullif(btrim(coalesce(p_source,'')),''),nullif(btrim(coalesce(p_notes,'')),''),true,(select auth.uid()))
    returning * into v_person;
    insert into public.crm_activities(person_id,activity_type,summary,to_stage,created_by)
    values(v_person.id,'created','Contacto creado',p_crm_stage,(select auth.uid()));
  else
    select crm_stage into v_previous_stage from public.people where id=p_person_id and active for update;
    if not found then raise exception 'El contacto ya no existe.' using errcode='P0002'; end if;
    v_effective_stage:=case when v_reused and p_crm_stage='new' and v_previous_stage<>'new' then v_previous_stage else p_crm_stage end;

    if v_reused then
      update public.people p set
        display_name=v_name,
        first_name=coalesce(nullif(btrim(coalesce(p_first_name,'')),''),p.first_name),
        last_name=coalesce(nullif(btrim(coalesce(p_last_name,'')),''),p.last_name),
        email=coalesce(v_email,p.email),
        phone=coalesce(v_phone,p.phone),
        country_code=coalesce(v_country,p.country_code),
        crm_stage=v_effective_stage,
        source=coalesce(nullif(btrim(coalesce(p_source,'')),''),p.source),
        notes=coalesce(nullif(btrim(coalesce(p_notes,'')),''),p.notes),
        updated_at=now()
      where p.id=p_person_id returning p.* into v_person;
      insert into public.crm_activities(person_id,activity_type,summary,created_by)
      values(p_person_id,'conversion','Contacto vinculado con una persona existente; no se creó una ficha duplicada',(select auth.uid()));
    else
      update public.people set
        display_name=v_name,
        first_name=nullif(btrim(coalesce(p_first_name,'')),''),
        last_name=nullif(btrim(coalesce(p_last_name,'')),''),
        email=v_email,
        phone=v_phone,
        country_code=v_country,
        crm_stage=v_effective_stage,
        source=nullif(btrim(coalesce(p_source,'')),''),
        notes=nullif(btrim(coalesce(p_notes,'')),''),
        updated_at=now()
      where id=p_person_id returning * into v_person;
    end if;

    if v_previous_stage is distinct from v_effective_stage then
      insert into public.crm_activities(person_id,activity_type,summary,from_stage,to_stage,created_by)
      values(v_person.id,'stage_change','Estado comercial actualizado',v_previous_stage,v_effective_stage,(select auth.uid()));
    end if;
  end if;

  insert into public.crm_profiles(person_id,contact_date,inquiry,reserved,rate_id,quoted_amount_cents,contact_permission,created_by)
  values(v_person.id,coalesce(p_contact_date,current_date),nullif(btrim(coalesce(p_inquiry,'')),''),coalesce(p_reserved,false),p_rate_id,p_quoted_amount_cents,p_contact_permission,(select auth.uid()))
  on conflict(person_id) do update set
    contact_date=excluded.contact_date,
    inquiry=excluded.inquiry,
    reserved=excluded.reserved,
    rate_id=excluded.rate_id,
    quoted_amount_cents=excluded.quoted_amount_cents,
    contact_permission=excluded.contact_permission,
    updated_at=now();
  return v_person;
end;
$$;

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
  select private.normalize_person_email(u.email),u.email_confirmed_at,u.raw_user_meta_data
  into v_email,v_confirmed_at,v_metadata
  from auth.users u where u.id=p_user_id;
  if not found or v_confirmed_at is null or v_email is null then return null; end if;
  if not exists(select 1 from public.app_member_roles r where r.user_id=p_user_id and r.role='student' and r.active) then return null; end if;

  select p.id into v_person_id from public.people p where p.auth_user_id=p_user_id and p.active limit 1;
  if v_person_id is not null then
    insert into public.student_profiles(person_id,active,created_by)
    values(v_person_id,true,p_user_id)
    on conflict(person_id) do update set active=true,updated_at=now();
    return v_person_id;
  end if;

  perform private.lock_person_identity(v_email,null);
  select count(*) into v_matches
  from public.people p
  where p.active and p.auth_user_id is null and private.normalize_person_email(p.email)=v_email;

  if v_matches=1 then
    update public.people p set auth_user_id=p_user_id,email=coalesce(p.email,v_email),updated_at=now()
    where p.id=(select p2.id from public.people p2 where p2.active and p2.auth_user_id is null and private.normalize_person_email(p2.email)=v_email limit 1)
    returning p.id into v_person_id;
  elsif v_matches=0 then
    v_name:=coalesce(nullif(btrim(v_metadata->>'full_name'),''),nullif(split_part(v_email,'@',1),''));
    if v_name is null then return null; end if;
    insert into public.people(auth_user_id,display_name,email,crm_stage,active,created_by)
    values(p_user_id,v_name,v_email,'new',true,p_user_id)
    returning id into v_person_id;
  else
    return null;
  end if;

  insert into public.student_profiles(person_id,active,created_by)
  values(v_person_id,true,p_user_id)
  on conflict(person_id) do update set active=true,updated_at=now();
  return v_person_id;
end;
$$;
