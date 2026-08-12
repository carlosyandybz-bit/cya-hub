-- CYA Hub · v50b · P22 Portal del alumno · wrapper multimedia invoker
--
-- Supabase Advisor flags public SECURITY DEFINER RPCs callable by authenticated.
-- v50b keeps the guarded SECURITY DEFINER data access in the non-exposed private
-- schema and makes the public boolean wrapper SECURITY INVOKER.

begin;

-- Required by the invoker chain. The helper remains in private, validates
-- auth.uid()/roles/ownership internally and is not granted to anon/public.
grant execute on function private.can_access_student_portal_media(text)
to authenticated;
revoke all on function private.can_access_student_portal_media(text)
from public,anon;

create or replace function public.can_access_teaching_media(
  p_external_file_id text
)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select private.can_access_student_portal_media(p_external_file_id);
$$;

revoke all on function public.can_access_teaching_media(text) from public,anon;
grant execute on function public.can_access_teaching_media(text) to authenticated;

commit;
