
-- v7 closes the student-data isolation findings, links confirmed student accounts
-- without losing provisional history, makes Drive-backed saves atomic, and
-- revalidates communication consent at dispatch time.

-- The original communications migration inherited broad default privileges
-- (including TRUNCATE) for authenticated users. RLS does not protect TRUNCATE,
-- so reduce the tables and their sequences to the exact operations used by CYA.
revoke all on table public.communication_recipients, public.communication_events from public,anon,authenticated;
grant select,insert,update on table public.communication_recipients to authenticated;
grant select,insert on table public.communication_events to authenticated;
revoke all on sequence public.communication_recipients_id_seq, public.communication_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.communication_recipients_id_seq, public.communication_events_id_seq to authenticated;

create or replace function private.current_person_id()
returns bigint
language sql
stable
security definer
set search_path=''
as $$
  select p.id
  from public.people p
  join public.app_members m on m.user_id=p.auth_user_id
  where p.auth_user_id=(select auth.uid())
    and p.active
    and m.active
    and m.role='student'
  limit 1;
$$;
revoke execute on function private.current_person_id() from public,anon;
grant execute on function private.current_person_id() to authenticated;

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
  v_role text;
  v_person_id bigint;
  v_matches integer;
  v_name text;
begin
  select lower(btrim(coalesce(u.email,''))),u.email_confirmed_at,u.raw_user_meta_data
  into v_email,v_confirmed_at,v_metadata
  from auth.users u where u.id=p_user_id;

  if not found or v_confirmed_at is null or v_email='' then return null; end if;
  select m.role into v_role from public.app_members m where m.user_id=p_user_id and m.active;
  if v_role is distinct from 'student' then return null; end if;

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
  where p.active and p.auth_user_id is null and lower(btrim(coalesce(p.email,'')))=v_email;

  if v_matches=1 then
    update public.people p set auth_user_id=p_user_id,updated_at=now()
    where p.id=(
      select p2.id from public.people p2
      where p2.active and p2.auth_user_id is null and lower(btrim(coalesce(p2.email,'')))=v_email
      limit 1
    ) returning p.id into v_person_id;
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
    -- Never guess when two provisional records share the same email.
    return null;
  end if;

  insert into public.student_profiles(person_id,active,created_by)
  values(v_person_id,true,p_user_id)
  on conflict(person_id) do update set active=true,updated_at=now();
  return v_person_id;
end;
$$;
revoke execute on function private.link_confirmed_student(uuid) from public,anon,authenticated;

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
begin
  select confirmed and exists(
    select 1 from private.admin_bootstrap_emails where email=normalized_email
  ) into bootstrap_admin;

  insert into public.user_profiles(id,display_name)
  values(new.id,coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'),''),nullif(split_part(normalized_email,'@',1),''),'Usuario'))
  on conflict(id) do nothing;

  insert into public.app_members(user_id,role,active)
  values(new.id,case when bootstrap_admin then 'admin' else 'student' end,confirmed)
  on conflict(user_id) do nothing;

  if confirmed and not bootstrap_admin then perform private.link_confirmed_student(new.id); end if;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public,anon,authenticated;

create or replace function private.handle_confirmed_user()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  normalized_email text:=lower(btrim(coalesce(new.email,'')));
  bootstrap_admin boolean:=false;
begin
  if new.email_confirmed_at is null then return new; end if;
  select exists(select 1 from private.admin_bootstrap_emails where email=normalized_email) into bootstrap_admin;
  update public.app_members
  set role=case when bootstrap_admin then 'admin' else role end,active=true,updated_at=now()
  where user_id=new.id;
  if not bootstrap_admin then perform private.link_confirmed_student(new.id); end if;
  return new;
end;
$$;
revoke execute on function private.handle_confirmed_user() from public,anon,authenticated;

drop trigger if exists cya_on_auth_user_confirmed on auth.users;
create trigger cya_on_auth_user_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is distinct from new.email_confirmed_at and new.email_confirmed_at is not null)
execute function private.handle_confirmed_user();

-- A student consumes one deliberately safe portal projection; mixed-sensitivity
-- base rows stay staff-only.
drop policy if exists people_select on public.people;
create policy people_select on public.people for select to authenticated using((select private.is_staff()));
drop policy if exists student_profiles_select on public.student_profiles;
create policy student_profiles_select on public.student_profiles for select to authenticated using((select private.is_staff()));
drop policy if exists dance_profiles_select on public.student_dance_profiles;
create policy dance_profiles_select on public.student_dance_profiles for select to authenticated using((select private.is_staff()));

drop policy if exists classes_select on public.classes;
create policy classes_select on public.classes for select to authenticated using((select private.is_staff()));
drop policy if exists class_participants_select on public.class_participants;
create policy class_participants_select on public.class_participants for select to authenticated using((select private.is_staff()));
drop policy if exists credit_grants_select on public.credit_grants;
create policy credit_grants_select on public.credit_grants for select to authenticated using((select private.is_staff()));
drop policy if exists credit_members_select on public.credit_grant_members;
create policy credit_members_select on public.credit_grant_members for select to authenticated using((select private.is_staff()));
drop policy if exists credit_movements_select on public.credit_movements;
create policy credit_movements_select on public.credit_movements for select to authenticated using((select private.is_staff()));

create or replace function public.student_portal_snapshot()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person_id bigint;
  v_result jsonb;
begin
  if not exists(
    select 1 from public.app_members m
    where m.user_id=(select auth.uid()) and m.active and m.role='student'
  ) then
    raise exception 'Tu cuenta no tiene acceso activo al portal.' using errcode='42501';
  end if;

  select private.current_person_id() into v_person_id;
  if v_person_id is null then
    raise exception 'No hemos podido vincular esta cuenta con una única ficha de alumno.' using errcode='22023';
  end if;

  select jsonb_build_object(
    'profile',(
      select jsonb_build_object(
        'id',p.id,'display_name',p.display_name,'first_name',p.first_name,'last_name',p.last_name,
        'email',p.email,'phone',p.phone,'country_code',p.country_code,
        'student_since',sp.student_since,'goals',sp.goals
      )
      from public.people p join public.student_profiles sp on sp.person_id=p.id
      where p.id=v_person_id
    ),
    'classes',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'class_type',c.class_type,'status',c.status,'scheduled_start_at',c.scheduled_start_at,
        'duration_minutes',c.duration_minutes,'style',style.label,'attendance_status',cp.attendance_status,
        'role',role_term.label,'level',level_term.label
      ) order by c.scheduled_start_at desc)
      from public.class_participants cp
      join public.classes c on c.id=cp.class_id
      left join public.catalog_terms style on style.id=c.style_term_id
      left join public.catalog_terms role_term on role_term.id=cp.role_term_id
      left join public.catalog_terms level_term on level_term.id=cp.level_term_id
      where cp.person_id=v_person_id
    ),'[]'::jsonb),
    'credits',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',g.id,'label',g.label,'modality',g.modality,'total_minutes',g.total_minutes,
        'balance_minutes',coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0),
        'status',g.status,'purchased_at',g.purchased_at,'expires_at',g.expires_at
      ) order by g.purchased_at desc)
      from public.credit_grant_members gm
      join public.credit_grants g on g.id=gm.grant_id
      where gm.person_id=v_person_id
    ),'[]'::jsonb),
    'assignments',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'content_id',a.content_id,'title',tc.title,'content_type',tc.content_type,
        'description',tc.description,'correction_guidance',tc.correction_guidance,
        'assignment_status',a.assignment_status,'current_frequency',a.current_frequency,
        'current_importance',a.current_importance,'updated_at',a.updated_at
      ) order by a.updated_at desc)
      from public.student_content_assignments a
      join public.teaching_contents tc on tc.id=a.content_id
      where a.person_id=v_person_id and tc.active and tc.completion_status='complete'
        and tc.publication_status='published' and tc.visibility='student'
    ),'[]'::jsonb),
    'evaluations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'class_id',e.class_id,'score',e.score,'aptitude',apt.label,'created_at',e.created_at
      ) order by e.created_at desc)
      from public.student_evaluations e
      join public.catalog_terms apt on apt.id=e.aptitude_term_id
      where e.person_id=v_person_id
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.student_portal_snapshot() from public,anon;
grant execute on function public.student_portal_snapshot() to authenticated;

-- Link any already-confirmed student Auth rows deterministically. Existing
-- provisional data is updated in place; ambiguous duplicate emails are untouched.
do $$
declare v_user record;
begin
  for v_user in
    select u.id
    from auth.users u join public.app_members m on m.user_id=u.id
    where u.email_confirmed_at is not null and m.active and m.role='student'
  loop
    perform private.link_confirmed_student(v_user.id);
  end loop;
end;
$$;

create or replace function public.save_teaching_content_with_media(
  p_content_id bigint,
  p_content_type text,
  p_title text,
  p_description text,
  p_correction_guidance text,
  p_completion_status text,
  p_publication_status text,
  p_visibility text,
  p_measurement_mode text,
  p_category_term_id bigint,
  p_style_term_ids bigint[],
  p_role_term_ids bigint[],
  p_level_term_ids bigint[],
  p_tags text[],
  p_media jsonb default '[]'::jsonb
)
returns public.teaching_contents
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_content public.teaching_contents;
  v_media record;
  v_file_id text;
  v_media_type text;
  v_title text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para editar enseñanza.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_media,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media,'[]'::jsonb))>20 then
    raise exception 'Revisa los archivos de Drive.' using errcode='22023';
  end if;

  select * into v_content from public.save_teaching_content(
    p_content_id,p_content_type,p_title,p_description,p_correction_guidance,p_completion_status,
    p_publication_status,p_visibility,p_measurement_mode,p_category_term_id,p_style_term_ids,
    p_role_term_ids,p_level_term_ids,p_tags
  );

  for v_media in select value,ordinality from jsonb_array_elements(coalesce(p_media,'[]'::jsonb)) with ordinality
  loop
    v_file_id:=btrim(coalesce(v_media.value->>'external_file_id',''));
    v_media_type:=coalesce(v_media.value->>'media_type','');
    v_title:=nullif(btrim(coalesce(v_media.value->>'title','')),'');
    if v_media_type not in ('image','video') or v_file_id !~ '^[A-Za-z0-9_-]{10,200}$' or length(coalesce(v_title,''))>160 then
      raise exception 'Hay un archivo de Drive no válido.' using errcode='22023';
    end if;
    insert into public.teaching_content_media(content_id,media_type,provider,external_file_id,title,sort_order,created_by)
    values(v_content.id,v_media_type,'google_drive',v_file_id,v_title,v_media.ordinality::integer,(select auth.uid()))
    on conflict(content_id,provider,external_file_id) do update set
      media_type=excluded.media_type,title=excluded.title,sort_order=excluded.sort_order,updated_at=now();
  end loop;
  return v_content;
end;
$$;
revoke all on function public.save_teaching_content_with_media(bigint,text,text,text,text,text,text,text,text,bigint,bigint[],bigint[],bigint[],text[],jsonb) from public,anon;
grant execute on function public.save_teaching_content_with_media(bigint,text,text,text,text,text,text,text,text,bigint,bigint[],bigint[],bigint[],text[],jsonb) to authenticated;

create or replace function public.save_marketing_content_with_media(
  p_content_id bigint default null,p_title text default null,p_channel text default 'instagram',p_content_type text default 'post',
  p_status text default 'idea',p_body text default null,p_planned_for timestamptz default null,p_media jsonb default '[]'::jsonb
)
returns public.marketing_content
language plpgsql
security invoker
set search_path=''
as $$
declare v_content public.marketing_content; v_media record; v_file_id text; v_media_type text; v_title text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar contenido.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_media,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media,'[]'::jsonb))>20 then raise exception 'Revisa los archivos de Drive.' using errcode='22023'; end if;
  select * into v_content from public.save_marketing_content(p_content_id,p_title,p_channel,p_content_type,p_status,p_body,p_planned_for);
  for v_media in select value from jsonb_array_elements(coalesce(p_media,'[]'::jsonb))
  loop
    v_file_id:=btrim(coalesce(v_media.value->>'external_file_id','')); v_media_type:=coalesce(v_media.value->>'media_type',''); v_title:=nullif(btrim(coalesce(v_media.value->>'title','')),'');
    if v_media_type not in ('image','video') or v_file_id !~ '^[A-Za-z0-9_-]{10,200}$' or length(coalesce(v_title,''))>160 then raise exception 'Hay un archivo de Drive no válido.' using errcode='22023'; end if;
    perform public.add_marketing_content_media(v_content.id,v_media_type,v_file_id,v_title);
  end loop;
  return v_content;
end;
$$;
revoke all on function public.save_marketing_content_with_media(bigint,text,text,text,text,text,timestamptz,jsonb) from public,anon;
grant execute on function public.save_marketing_content_with_media(bigint,text,text,text,text,text,timestamptz,jsonb) to authenticated;

create or replace function public.save_marketing_campaign_with_media(
  p_campaign_id bigint default null,p_title text default null,p_channel text default 'whatsapp',p_objective text default null,
  p_audience_scope text default 'potential',p_status text default 'draft',p_message text default null,p_event_id bigint default null,
  p_budget_cents integer default null,p_scheduled_at timestamptz default null,p_starts_at timestamptz default null,p_ends_at timestamptz default null,
  p_media jsonb default '[]'::jsonb
)
returns public.marketing_campaigns
language plpgsql
security invoker
set search_path=''
as $$
declare v_campaign public.marketing_campaigns; v_media record; v_file_id text; v_media_type text; v_title text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para gestionar campañas.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_media,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media,'[]'::jsonb))>20 then raise exception 'Revisa los archivos de Drive.' using errcode='22023'; end if;
  select * into v_campaign from public.save_marketing_campaign(p_campaign_id,p_title,p_channel,p_objective,p_audience_scope,p_status,p_message,p_event_id,p_budget_cents,p_scheduled_at,p_starts_at,p_ends_at);
  for v_media in select value from jsonb_array_elements(coalesce(p_media,'[]'::jsonb))
  loop
    v_file_id:=btrim(coalesce(v_media.value->>'external_file_id','')); v_media_type:=coalesce(v_media.value->>'media_type',''); v_title:=nullif(btrim(coalesce(v_media.value->>'title','')),'');
    if v_media_type not in ('image','video') or v_file_id !~ '^[A-Za-z0-9_-]{10,200}$' or length(coalesce(v_title,''))>160 then raise exception 'Hay un archivo de Drive no válido.' using errcode='22023'; end if;
    perform public.add_marketing_campaign_media(v_campaign.id,v_media_type,v_file_id,v_title);
  end loop;
  return v_campaign;
end;
$$;
revoke all on function public.save_marketing_campaign_with_media(bigint,text,text,text,text,text,text,bigint,integer,timestamptz,timestamptz,timestamptz,jsonb) from public,anon;
grant execute on function public.save_marketing_campaign_with_media(bigint,text,text,text,text,text,text,bigint,integer,timestamptz,timestamptz,timestamptz,jsonb) to authenticated;

create or replace function private.invalidate_ready_communications()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_recipient_id bigint; v_person_id bigint;
begin
  v_person_id:=case when tg_table_name='people' then new.id else new.person_id end;
  for v_recipient_id in
    update public.communication_recipients
    set status='skipped',blocked_reason='Datos de contacto o permiso actualizados · prepara la lista de nuevo',updated_at=now()
    where person_id=v_person_id and status='ready'
    returning id
  loop
    insert into public.communication_events(recipient_id,event_type,detail,created_by)
    values(v_recipient_id,'skipped','Invalidado automáticamente al cambiar contacto o permiso',(select auth.uid()));
  end loop;
  return new;
end;
$$;
revoke execute on function private.invalidate_ready_communications() from public,anon,authenticated;

drop trigger if exists people_invalidate_ready_communications on public.people;
create trigger people_invalidate_ready_communications
after update of display_name,first_name,last_name,email,phone,country_code on public.people
for each row
when (
  old.display_name is distinct from new.display_name or old.first_name is distinct from new.first_name or
  old.last_name is distinct from new.last_name or old.email is distinct from new.email or
  old.phone is distinct from new.phone or old.country_code is distinct from new.country_code
)
execute function private.invalidate_ready_communications();

drop trigger if exists crm_profiles_invalidate_ready_communications on public.crm_profiles;
create trigger crm_profiles_invalidate_ready_communications
after update of contact_permission on public.crm_profiles
for each row
when (old.contact_permission is distinct from new.contact_permission)
execute function private.invalidate_ready_communications();

create or replace function public.validate_communication_dispatch(p_recipient_id bigint)
returns table(allowed boolean,reason text,channel text,destination text,message_snapshot text,campaign_title text)
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_recipient public.communication_recipients;
  v_permission text;
  v_phone text;
  v_email text;
  v_country text;
  v_active boolean;
  v_current_destination text;
  v_digits text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para abrir comunicaciones.' using errcode='42501'; end if;
  select * into v_recipient from public.communication_recipients where id=p_recipient_id for update;
  if not found then raise exception 'El destinatario no existe.' using errcode='P0002'; end if;
  if v_recipient.status <> 'ready' then
    return query select false,coalesce(v_recipient.blocked_reason,'Este destinatario ya no está listo.'),null::text,null::text,null::text,null::text;
    return;
  end if;

  select p.active,p.phone,p.email,p.country_code,coalesce(cp.contact_permission,'unknown')
  into v_active,v_phone,v_email,v_country,v_permission
  from public.people p left join public.crm_profiles cp on cp.person_id=p.id
  where p.id=v_recipient.person_id;

  if v_recipient.channel='whatsapp' then
    v_digits:=regexp_replace(coalesce(v_phone,''),'[^0-9]','','g');
    if left(btrim(coalesce(v_phone,'')),1)='+' then v_current_destination:=nullif(v_digits,'');
    elsif upper(coalesce(v_country,''))='ES' and length(v_digits)=9 then v_current_destination:='34'||v_digits;
    elsif upper(coalesce(v_country,''))='ES' and length(v_digits)=11 and left(v_digits,2)='34' then v_current_destination:=v_digits;
    elsif length(v_digits)>=11 then v_current_destination:=v_digits;
    end if;
  else
    v_current_destination:=nullif(lower(btrim(coalesce(v_email,''))),'');
  end if;

  if not coalesce(v_active,false) or v_permission <> 'allowed' or v_current_destination is null or v_current_destination is distinct from v_recipient.destination then
    update public.communication_recipients
    set status='skipped',blocked_reason='El permiso o el destino han cambiado · prepara la lista de nuevo',updated_at=now()
    where id=v_recipient.id;
    insert into public.communication_events(recipient_id,event_type,detail,created_by)
    values(v_recipient.id,'skipped','Validación previa al envío rechazada',(select auth.uid()));
    return query select false,'Revisa el permiso o los datos de contacto y prepara la lista de nuevo.',null::text,null::text,null::text,null::text;
    return;
  end if;

  return query select true,null::text,v_recipient.channel,v_recipient.destination,v_recipient.message_snapshot,
    (select c.title from public.marketing_campaigns c where c.id=v_recipient.campaign_id);
end;
$$;
revoke all on function public.validate_communication_dispatch(bigint) from public,anon;
grant execute on function public.validate_communication_dispatch(bigint) to authenticated;

create or replace function public.mark_communication_sent(p_recipient_id bigint)
returns public.communication_recipients
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_recipient public.communication_recipients;
  v_campaign_title text;
  v_stage text;
  v_permission text;
  v_phone text;
  v_email text;
  v_country text;
  v_active boolean;
  v_current_destination text;
  v_digits text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para registrar comunicaciones.' using errcode='42501'; end if;
  select * into v_recipient from public.communication_recipients where id=p_recipient_id for update;
  if not found then raise exception 'El destinatario no existe.' using errcode='P0002'; end if;
  if v_recipient.status='sent' then return v_recipient; end if;
  if v_recipient.status <> 'ready' then raise exception 'Este contacto ya no está habilitado para recibir la campaña.' using errcode='22023'; end if;

  select p.active,p.phone,p.email,p.country_code,p.crm_stage,coalesce(cp.contact_permission,'unknown')
  into v_active,v_phone,v_email,v_country,v_stage,v_permission
  from public.people p left join public.crm_profiles cp on cp.person_id=p.id
  where p.id=v_recipient.person_id for update of p;

  if v_recipient.channel='whatsapp' then
    v_digits:=regexp_replace(coalesce(v_phone,''),'[^0-9]','','g');
    if left(btrim(coalesce(v_phone,'')),1)='+' then v_current_destination:=nullif(v_digits,'');
    elsif upper(coalesce(v_country,''))='ES' and length(v_digits)=9 then v_current_destination:='34'||v_digits;
    elsif upper(coalesce(v_country,''))='ES' and length(v_digits)=11 and left(v_digits,2)='34' then v_current_destination:=v_digits;
    elsif length(v_digits)>=11 then v_current_destination:=v_digits;
    end if;
  else
    v_current_destination:=nullif(lower(btrim(coalesce(v_email,''))),'');
  end if;
  if not coalesce(v_active,false) or v_permission <> 'allowed' or v_current_destination is null or v_current_destination is distinct from v_recipient.destination then
    raise exception 'El permiso o el destino han cambiado. Prepara la lista de nuevo.' using errcode='22023';
  end if;

  update public.communication_recipients set status='sent',sent_at=now(),blocked_reason=null,updated_at=now()
  where id=p_recipient_id returning * into v_recipient;
  select c.title into v_campaign_title from public.marketing_campaigns c where c.id=v_recipient.campaign_id;
  if v_stage='new' then
    update public.people set crm_stage='contacted',updated_at=now() where id=v_recipient.person_id;
    insert into public.crm_activities(person_id,activity_type,summary,from_stage,to_stage,created_by)
    values(v_recipient.person_id,'stage_change','Estado actualizado al registrar un mensaje enviado','new','contacted',(select auth.uid()));
  end if;
  insert into public.crm_activities(person_id,activity_type,summary,created_by)
  values(v_recipient.person_id,'message','Mensaje enviado · '||coalesce(v_campaign_title,'Campaña'),(select auth.uid()));
  insert into public.communication_events(recipient_id,event_type,detail,created_by)
  values(v_recipient.id,'sent','Confirmado manualmente desde CYA Hub',(select auth.uid()));
  return v_recipient;
end;
$$;
revoke all on function public.mark_communication_sent(bigint) from public,anon;
grant execute on function public.mark_communication_sent(bigint) to authenticated;

