-- P36 — Registro semántico de iconos administrables.
-- Los defaults viven en código; esta tabla guarda únicamente sustituciones visuales.

create table if not exists public.app_icon_settings (
  icon_key text primary key check (icon_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and length(icon_key) <= 120),
  storage_path text not null check (storage_path ~ '^p36/[a-z0-9._/-]+$' and length(storage_path) <= 512),
  updated_by uuid null references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_icon_settings enable row level security;

revoke all on table public.app_icon_settings from public, anon, authenticated;
grant select on table public.app_icon_settings to anon, authenticated;
grant insert, update, delete on table public.app_icon_settings to authenticated;

drop policy if exists app_icon_settings_read on public.app_icon_settings;
create policy app_icon_settings_read on public.app_icon_settings
for select to anon, authenticated using (true);

drop policy if exists app_icon_settings_admin_insert on public.app_icon_settings;
create policy app_icon_settings_admin_insert on public.app_icon_settings
for insert to authenticated
with check ((select private.is_admin()));

drop policy if exists app_icon_settings_admin_update on public.app_icon_settings;
create policy app_icon_settings_admin_update on public.app_icon_settings
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists app_icon_settings_admin_delete on public.app_icon_settings;
create policy app_icon_settings_admin_delete on public.app_icon_settings
for delete to authenticated
using ((select private.is_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cya-icons', 'cya-icons', true, 524288,
  array['image/png','image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cya_icons_admin_insert" on storage.objects;
create policy "cya_icons_admin_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'cya-icons'
  and (storage.foldername(name))[1] = 'p36'
  and (select private.is_admin())
);

drop policy if exists "cya_icons_admin_update" on storage.objects;
create policy "cya_icons_admin_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'cya-icons'
  and (storage.foldername(name))[1] = 'p36'
  and (select private.is_admin())
)
with check (
  bucket_id = 'cya-icons'
  and (storage.foldername(name))[1] = 'p36'
  and (select private.is_admin())
);

drop policy if exists "cya_icons_admin_delete" on storage.objects;
create policy "cya_icons_admin_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'cya-icons'
  and (storage.foldername(name))[1] = 'p36'
  and (select private.is_admin())
);

comment on table public.app_icon_settings is 'P36 overrides de iconografía global; defaults y metadatos viven en el catálogo de producto.';
