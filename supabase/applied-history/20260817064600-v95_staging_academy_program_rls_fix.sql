-- STAGING ONLY — CYA Hub v95
-- Fix Academy Online program visibility for enrolled students.
--
-- Regression: academy_programs_read compared academy_enrollments.program_id
-- with academy_enrollments.id, so a valid enrollment could not normally expose
-- its published program to the enrolled student.

begin;

alter policy academy_programs_read
on public.academy_programs
using (
  (select private.is_staff())
  or (
    active
    and publication_status = 'published'
    and exists (
      select 1
      from public.academy_enrollments e
      where e.program_id = academy_programs.id
        and e.person_id = (select private.current_person_id())
        and e.status = any (array['active'::text, 'completed'::text])
        and e.starts_at <= now()
        and (e.expires_at is null or e.expires_at > now())
    )
  )
);

-- Hard guard against reintroducing the broken correlation.
do $$
declare
  expr text;
begin
  select pg_get_expr(pol.polqual, pol.polrelid)
    into expr
  from pg_policy pol
  join pg_class cls on cls.oid = pol.polrelid
  join pg_namespace n on n.oid = cls.relnamespace
  where n.nspname = 'public'
    and cls.relname = 'academy_programs'
    and pol.polname = 'academy_programs_read';

  if expr is null or expr like '%e.program_id = e.id%' then
    raise exception 'academy_programs_read regression guard failed';
  end if;
end $$;

commit;
