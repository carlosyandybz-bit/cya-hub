-- CYA Hub v20 — teaching multimedia system
-- Applied to production on 2026-08-09.

alter table public.teaching_content_media
  add column if not exists group_label text,
  add column if not exists is_cover boolean not null default false,
  add column if not exists is_preview boolean not null default false,
  add column if not exists display_in_resources boolean not null default true,
  add column if not exists thumbnail_external_file_id text,
  add column if not exists thumbnail_mime_type text,
  add column if not exists preview_start_seconds numeric(10,3),
  add column if not exists preview_end_seconds numeric(10,3);

alter table public.teaching_content_media
  drop constraint if exists teaching_content_media_group_label_length,
  add constraint teaching_content_media_group_label_length check (group_label is null or char_length(group_label) <= 80),
  drop constraint if exists teaching_content_media_thumbnail_id_format,
  add constraint teaching_content_media_thumbnail_id_format check (thumbnail_external_file_id is null or thumbnail_external_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drop constraint if exists teaching_content_media_preview_range,
  add constraint teaching_content_media_preview_range check (
    (preview_start_seconds is null or preview_start_seconds >= 0)
    and (preview_end_seconds is null or preview_end_seconds > 0)
    and (preview_start_seconds is null or preview_end_seconds is null or preview_end_seconds > preview_start_seconds)
  );

create unique index if not exists teaching_content_media_one_cover_idx
  on public.teaching_content_media(content_id) where is_cover;
create unique index if not exists teaching_content_media_one_preview_idx
  on public.teaching_content_media(content_id) where is_preview;

create table if not exists public.integration_secret_store (
  integration_key text primary key,
  secret_ciphertext text not null,
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integration_secret_store enable row level security;
revoke all on public.integration_secret_store from anon, authenticated;

create or replace function public.current_user_can_manage_teaching()
returns boolean language sql stable security invoker set search_path=''
as $$ select coalesce((select private.is_staff()),false) $$;
revoke all on function public.current_user_can_manage_teaching() from public;
grant execute on function public.current_user_can_manage_teaching() to authenticated;

create or replace function public.set_integration_secret_ciphertext(p_integration_key text, p_ciphertext text, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para configurar integraciones.' using errcode='42501'; end if;
  if p_integration_key <> 'google_drive' or length(coalesce(p_ciphertext,'')) < 32 then raise exception 'Configuración de integración no válida.' using errcode='22023'; end if;
  insert into public.integration_secret_store(integration_key,secret_ciphertext,metadata,updated_by,updated_at)
  values(p_integration_key,p_ciphertext,coalesce(p_metadata,'{}'::jsonb),(select auth.uid()),now())
  on conflict(integration_key) do update set secret_ciphertext=excluded.secret_ciphertext,metadata=excluded.metadata,updated_by=excluded.updated_by,updated_at=now();
  update public.integration_settings set status='connected',last_checked_at=now(),last_error=null where integration_key=p_integration_key;
end; $$;
revoke all on function public.set_integration_secret_ciphertext(text,text,jsonb) from public;
grant execute on function public.set_integration_secret_ciphertext(text,text,jsonb) to authenticated;

create or replace function public.integration_secret_ciphertext_for_server(p_integration_key text)
returns text language sql stable security definer set search_path=''
as $$ select secret_ciphertext from public.integration_secret_store where integration_key=p_integration_key $$;
revoke all on function public.integration_secret_ciphertext_for_server(text) from public;
grant execute on function public.integration_secret_ciphertext_for_server(text) to anon, authenticated;

create or replace function public.can_access_teaching_media(p_external_file_id text)
returns boolean language plpgsql stable security invoker set search_path=''
as $$
declare v_person bigint;
begin
  if (select private.is_staff()) then return true; end if;
  select private.current_person_id() into v_person;
  if v_person is null or not (select private.has_app_role('student')) then return false; end if;
  return exists(
    select 1 from public.teaching_content_media m
    join public.teaching_contents tc on tc.id=m.content_id
    join public.student_content_assignments a on a.content_id=tc.id and a.person_id=v_person
    where (m.external_file_id=p_external_file_id or m.thumbnail_external_file_id=p_external_file_id)
      and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'
  );
end; $$;
revoke all on function public.can_access_teaching_media(text) from public;
grant execute on function public.can_access_teaching_media(text) to authenticated;

-- save_teaching_content_with_media is replaced in production to persist cover/preview/resource metadata
-- and remove CYA associations omitted from the submitted media array, while never deleting Drive files.
-- private.student_portal_snapshot_for is also replaced so student snapshots include the new media fields.
