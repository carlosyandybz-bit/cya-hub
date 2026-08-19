alter table public.people add column if not exists internal_alias text;

create table if not exists public.person_identity_history (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.people(id) on delete cascade,
  field_name text not null,
  old_value text,
  new_value text,
  lifecycle_status text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  context text not null default 'profile_update',
  check (field_name in ('first_name','last_name','display_name','email','phone','country_code','instagram_handle','internal_alias'))
);

alter table public.person_identity_history enable row level security;
drop policy if exists person_identity_history_staff_read on public.person_identity_history;
create policy person_identity_history_staff_read on public.person_identity_history for select to authenticated using (private.is_staff());

create or replace function private.audit_people_identity_changes()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_status text;
  v_context text := case when old.auth_user_id is distinct from new.auth_user_id then 'merge_or_account_link' else 'profile_update' end;
begin
  v_status := private.person_lifecycle_status_unchecked(old.id);
  if old.first_name is distinct from new.first_name then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'first_name',old.first_name,new.first_name,v_status,auth.uid(),v_context); end if;
  if old.last_name is distinct from new.last_name then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'last_name',old.last_name,new.last_name,v_status,auth.uid(),v_context); end if;
  if old.display_name is distinct from new.display_name then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'display_name',old.display_name,new.display_name,v_status,auth.uid(),v_context); end if;
  if old.email is distinct from new.email then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'email',old.email,new.email,v_status,auth.uid(),v_context); end if;
  if old.phone is distinct from new.phone then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'phone',old.phone,new.phone,v_status,auth.uid(),v_context); end if;
  if old.country_code is distinct from new.country_code then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'country_code',old.country_code,new.country_code,v_status,auth.uid(),v_context); end if;
  if old.instagram_handle is distinct from new.instagram_handle then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'instagram_handle',old.instagram_handle,new.instagram_handle,v_status,auth.uid(),v_context); end if;
  if old.internal_alias is distinct from new.internal_alias then insert into public.person_identity_history(person_id,field_name,old_value,new_value,lifecycle_status,changed_by,context) values(old.id,'internal_alias',old.internal_alias,new.internal_alias,v_status,auth.uid(),v_context); end if;
  return new;
end; $$;

drop trigger if exists trg_people_identity_history on public.people;
create trigger trg_people_identity_history before update on public.people for each row execute function private.audit_people_identity_changes();

create table if not exists public.person_merge_cases (
  id bigint generated always as identity primary key,
  source_person_id bigint not null references public.people(id) on delete cascade,
  candidate_person_id bigint not null references public.people(id) on delete cascade,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  match_reasons jsonb not null default '[]'::jsonb,
  source_lifecycle text,
  candidate_lifecycle text,
  dedupe_key text not null unique,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  canonical_person_id bigint references public.people(id) on delete set null,
  note text,
  check (source_person_id <> candidate_person_id)
);

alter table public.person_merge_cases enable row level security;
drop policy if exists person_merge_cases_staff_all on public.person_merge_cases;
create policy person_merge_cases_staff_all on public.person_merge_cases for all to authenticated using (private.is_staff()) with check (private.is_staff());

create or replace function private.upsert_person_merge_case(p_source_person_id bigint,p_candidate_person_id bigint,p_reasons jsonb)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_id bigint;
  v_a bigint := least(p_source_person_id,p_candidate_person_id);
  v_b bigint := greatest(p_source_person_id,p_candidate_person_id);
  v_key text := 'identity_merge:'||v_a::text||':'||v_b::text;
begin
  insert into public.person_merge_cases(source_person_id,candidate_person_id,match_reasons,source_lifecycle,candidate_lifecycle,dedupe_key)
  values(p_source_person_id,p_candidate_person_id,coalesce(p_reasons,'[]'::jsonb),private.person_lifecycle_status_unchecked(p_source_person_id),private.person_lifecycle_status_unchecked(p_candidate_person_id),v_key)
  on conflict(dedupe_key) do update set
    status='open', match_reasons=excluded.match_reasons, source_lifecycle=excluded.source_lifecycle,
    candidate_lifecycle=excluded.candidate_lifecycle, detected_at=now(), resolved_at=null, resolved_by=null
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.save_person_internal_alias(p_person_id bigint,p_alias text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_alias text := nullif(btrim(coalesce(p_alias,'')),''); begin
  if not private.is_staff() then raise exception 'No tienes permiso para modificar el alias interno.' using errcode='42501'; end if;
  update public.people set internal_alias=v_alias,updated_at=now() where id=p_person_id and active;
  if not found then raise exception 'La persona no existe.' using errcode='P0002'; end if;
  return v_alias;
end; $$;
revoke all on function public.save_person_internal_alias(bigint,text) from public,anon;
grant execute on function public.save_person_internal_alias(bigint,text) to authenticated;

create or replace function public.complete_registration_profile(p_first_name text, p_last_name text, p_phone text, p_country_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person_id bigint; v_match bigint; v_case_id bigint;
  v_first text := nullif(btrim(coalesce(p_first_name,'')),'');
  v_last text := nullif(btrim(coalesce(p_last_name,'')),'');
  v_phone text := nullif(btrim(coalesce(p_phone,'')),'');
  v_phone_normalized text := private.normalize_person_phone(p_phone);
  v_country text := nullif(upper(btrim(coalesce(p_country_code,''))),'');
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.' using errcode='42501'; end if;
  if v_first is null then raise exception 'El nombre es obligatorio.' using errcode='22023'; end if;
  if v_last is null then raise exception 'Los apellidos son obligatorios.' using errcode='22023'; end if;
  if v_phone_normalized is null or length(v_phone_normalized) < 7 then raise exception 'Introduce un teléfono válido.' using errcode='22023'; end if;
  if v_country is null then raise exception 'El país es obligatorio.' using errcode='22023'; end if;
  select p.id into v_person_id from public.people p where p.auth_user_id=auth.uid() and p.active for update;
  if v_person_id is null then raise exception 'No se ha encontrado tu ficha personal.' using errcode='P0002'; end if;
  perform private.lock_person_identity(null,v_phone);
  select private.match_person_identity(null,v_phone,v_person_id) into v_match;
  if v_match is not null then
    select private.upsert_person_merge_case(v_person_id,v_match,jsonb_build_array('phone')) into v_case_id;
    return jsonb_build_object('available',true,'complete',false,'merge_required',true,'merge_case_id',v_case_id,'person_id',v_person_id,'missing',jsonb_build_array('identity_merge'));
  end if;
  update public.people set first_name=v_first,last_name=v_last,display_name=concat_ws(' ',v_first,v_last),phone=v_phone,country_code=v_country,updated_at=now() where id=v_person_id;
  return public.registration_profile_status();
end; $$;

create or replace function public.admin_search_person_merge_candidates(p_source_person_id bigint, p_query text)
returns table(person_id bigint, display_name text, email text, phone text, lifecycle_status text)
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_query text := nullif(btrim(coalesce(p_query,'')),'');
  v_phone text := private.normalize_person_phone(p_query);
begin
  if not private.is_admin() then raise exception 'Solo administración puede fusionar fichas.' using errcode='42501'; end if;
  if v_query is null then return; end if;
  return query
  select p.id,p.display_name,p.email,p.phone,private.person_lifecycle_status_unchecked(p.id)
  from public.people p
  where p.active and p.id<>p_source_person_id and (
    p.display_name ilike '%'||v_query||'%' or coalesce(p.internal_alias,'') ilike '%'||v_query||'%' or
    coalesce(p.email,'') ilike '%'||v_query||'%' or coalesce(p.phone,'') ilike '%'||v_query||'%' or
    (v_phone is not null and private.normalize_person_phone(p.phone) like '%'||v_phone||'%')
  )
  order by case when lower(coalesce(p.display_name,''))=lower(v_query) then 0 when lower(coalesce(p.internal_alias,''))=lower(v_query) then 1 else 2 end,
           case private.person_lifecycle_status_unchecked(p.id) when 'registered' then 0 when 'provisional' then 1 else 2 end,
           p.display_name
  limit 20;
end; $$;
