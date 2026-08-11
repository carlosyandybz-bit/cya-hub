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
  if not exists (
    select 1 from public.teaching_content_media m
    where m.external_file_id=p_external_file_id or m.thumbnail_external_file_id=p_external_file_id
  ) then return false; end if;

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
