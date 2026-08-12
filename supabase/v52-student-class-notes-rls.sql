-- CYA Hub · v52 · Observaciones de clase visibles para su alumno
--
-- `classes` es staff-only por RLS. Una policy de class_notes que consulte
-- directamente public.classes queda también limitada por esa RLS y devuelve
-- falso para el alumno aunque la clase esté cerrada. El helper privado valida
-- identidad + participación + cierre sin abrir la tabla de clases.

begin;

create or replace function private.can_read_own_closed_class_note(
  p_class_id bigint,
  p_person_id bigint,
  p_visibility_scope text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select
    (select auth.uid()) is not null
    and (select private.has_app_role('student'))
    and p_visibility_scope='student'
    and p_person_id=(select private.current_person_id())
    and exists (
      select 1
      from public.classes c
      join public.class_participants cp
        on cp.class_id=c.id
       and cp.person_id=p_person_id
      where c.id=p_class_id
        and c.pedagogy_closed_at is not null
    );
$function$;

revoke all on function private.can_read_own_closed_class_note(bigint,bigint,text)
from public,anon;
grant execute on function private.can_read_own_closed_class_note(bigint,bigint,text)
to authenticated;

drop policy if exists class_notes_student_select on public.class_notes;
create policy class_notes_student_select
on public.class_notes
for select
to authenticated
using (
  (select private.can_read_own_closed_class_note(
    class_notes.class_id,
    class_notes.person_id,
    class_notes.visibility_scope
  ))
);

commit;
