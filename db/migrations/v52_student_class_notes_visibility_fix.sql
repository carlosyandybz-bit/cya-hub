begin;

create or replace function private.can_read_student_class_note(
  p_class_id bigint,
  p_person_id bigint,
  p_visibility_scope text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select
    p_visibility_scope = 'student'
    and p_person_id = private.current_person_id()
    and exists (
      select 1
      from public.class_participants cp
      join public.people p on p.id = cp.person_id
      join public.classes c on c.id = cp.class_id
      where cp.class_id = p_class_id
        and cp.person_id = p_person_id
        and p.auth_user_id = (select auth.uid())
        and c.pedagogy_closed_at is not null
    );
$function$;

revoke all on function private.can_read_student_class_note(bigint,bigint,text) from public;
grant execute on function private.can_read_student_class_note(bigint,bigint,text) to authenticated;

drop policy if exists class_notes_student_select on public.class_notes;
create policy class_notes_student_select
on public.class_notes
for select
to authenticated
using (
  (select private.can_read_student_class_note(class_id, person_id, visibility_scope))
);

commit;
