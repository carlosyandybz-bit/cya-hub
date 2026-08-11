revoke all on public.integration_secret_store from anon, authenticated;
drop policy if exists integration_secret_store_authenticated_select on public.integration_secret_store;
drop policy if exists integration_secret_store_staff_insert on public.integration_secret_store;
drop policy if exists integration_secret_store_staff_update on public.integration_secret_store;
drop policy if exists integration_secret_store_staff_delete on public.integration_secret_store;

create or replace function public.current_user_can_manage_teaching()
returns boolean
language sql
stable
security invoker
set search_path=''
as $$ select coalesce((select private.is_staff()),false) $$;
revoke all on function public.current_user_can_manage_teaching() from public;
grant execute on function public.current_user_can_manage_teaching() to authenticated;

create or replace function public.set_integration_secret_ciphertext(p_integration_key text, p_ciphertext text, p_metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para configurar integraciones.' using errcode='42501';
  end if;
  if p_integration_key <> 'google_drive' or length(coalesce(p_ciphertext,'')) < 32 then
    raise exception 'Configuración de integración no válida.' using errcode='22023';
  end if;
  insert into public.integration_secret_store(integration_key,secret_ciphertext,metadata,updated_by,updated_at)
  values(p_integration_key,p_ciphertext,coalesce(p_metadata,'{}'::jsonb),(select auth.uid()),now())
  on conflict(integration_key) do update set secret_ciphertext=excluded.secret_ciphertext,metadata=excluded.metadata,updated_by=excluded.updated_by,updated_at=now();
  update public.integration_settings set status='connected',last_checked_at=now(),last_error=null where integration_key=p_integration_key;
end;
$$;
revoke all on function public.set_integration_secret_ciphertext(text,text,jsonb) from public;
grant execute on function public.set_integration_secret_ciphertext(text,text,jsonb) to authenticated;

create or replace function public.integration_secret_ciphertext_for_server(p_integration_key text)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select secret_ciphertext from public.integration_secret_store where integration_key=p_integration_key;
$$;
revoke all on function public.integration_secret_ciphertext_for_server(text) from public;
grant execute on function public.integration_secret_ciphertext_for_server(text) to anon, authenticated;

create or replace function public.can_access_teaching_media(p_external_file_id text)
returns boolean
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_person bigint;
begin
  if (select private.is_staff()) then return true; end if;
  select private.current_person_id() into v_person;
  if v_person is null or not (select private.has_app_role('student')) then return false; end if;
  return exists(
    select 1
    from public.teaching_content_media m
    join public.teaching_contents tc on tc.id=m.content_id
    join public.student_content_assignments a on a.content_id=tc.id and a.person_id=v_person
    where (m.external_file_id=p_external_file_id or m.thumbnail_external_file_id=p_external_file_id)
      and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'
  );
end;
$$;
revoke all on function public.can_access_teaching_media(text) from public;
grant execute on function public.can_access_teaching_media(text) to authenticated;
