-- The student upload endpoint is owner-only even though staff can read Feedback requests.
-- Return the current file id so the server can delete the previous private Drive file after a successful replacement.
create or replace function public.feedback_upload_context(p_request_id bigint)
returns table(request_id bigint, person_id bigint, external_file_id text)
language sql stable security invoker set search_path=''
as $$
  select r.id, r.person_id, r.external_file_id
  from public.feedback_requests r
  where r.id=p_request_id
    and r.status='draft'
    and r.person_id=(select private.current_person_id())
  limit 1;
$$;

revoke all on function public.feedback_upload_context(bigint) from public, anon;
grant execute on function public.feedback_upload_context(bigint) to authenticated;
