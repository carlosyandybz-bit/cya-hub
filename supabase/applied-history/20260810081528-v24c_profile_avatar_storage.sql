insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'avatars','avatars',true,5242880,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.identity_context()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  select jsonb_build_object(
    'user_id',(select auth.uid()),
    'display_name',coalesce(p.first_name,up.display_name,'CYA'),
    'profile_name',coalesce(up.display_name,p.display_name,'CYA'),
    'avatar_url',up.avatar_url,
    'person_id',p.id,
    'roles',coalesce((select jsonb_agg(x.role order by x.priority) from (
      select distinct r.role,case r.role when 'admin' then 1 when 'teacher_admin' then 2 when 'teacher' then 3 else 4 end priority
      from public.app_member_roles r where r.user_id=(select auth.uid()) and r.active
    ) x),'[]'::jsonb),
    'timezone',coalesce(pref.timezone,'Europe/Madrid'),
    'greeting_boundaries',coalesce(pref.greeting_boundaries,'{"morning_start":"05:00","afternoon_start":"12:00","night_start":"20:00"}'::jsonb),
    'can_admin',(select private.is_admin()),
    'can_teach',(select private.is_staff()),
    'can_study',(select private.has_app_role('student'))
  )
  from public.user_profiles up
  left join public.people p on p.auth_user_id=up.id and p.active
  left join public.user_preferences pref on pref.user_id=up.id
  where up.id=(select auth.uid());
$function$;