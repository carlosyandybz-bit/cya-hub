-- CYA Hub · v42 · P16.0 · Correlación RLS de alumnos por clase
--
-- Corrige dos límites de autorización:
-- 1) el resumen de alumno se entrega exclusivamente mediante
--    student_portal_snapshot, que proyecta student_message pero no internal_note;
-- 2) un alumno solo puede crear o actualizar su propia solicitud de
--    preparación para una clase programada en la que figura como participante.

begin;

drop policy if exists class_pedagogy_summaries_student_select
on public.class_pedagogy_summaries;

-- No se recrea una política SELECT de alumno: la tabla contiene también
-- internal_note. El portal mantiene el comportamiento legítimo a través del RPC
-- filtrado, mientras class_pedagogy_summaries_staff_all permanece intacta.

drop policy if exists class_preparation_requests_student_insert
on public.class_preparation_requests;

create policy class_preparation_requests_student_insert
on public.class_preparation_requests
for insert
to authenticated
with check (
  class_preparation_requests.person_id = (select private.current_person_id())
  and exists (
    select 1
    from public.classes c
    join public.class_participants cp on cp.class_id = c.id
    where c.id = class_preparation_requests.class_id
      and cp.person_id = class_preparation_requests.person_id
      and c.status = 'scheduled'
  )
);

drop policy if exists class_preparation_requests_student_update
on public.class_preparation_requests;

create policy class_preparation_requests_student_update
on public.class_preparation_requests
for update
to authenticated
using (
  class_preparation_requests.person_id = (select private.current_person_id())
  and exists (
    select 1
    from public.classes c
    join public.class_participants cp on cp.class_id = c.id
    where c.id = class_preparation_requests.class_id
      and cp.person_id = class_preparation_requests.person_id
      and c.status = 'scheduled'
  )
)
with check (
  class_preparation_requests.person_id = (select private.current_person_id())
  and exists (
    select 1
    from public.classes c
    join public.class_participants cp on cp.class_id = c.id
    where c.id = class_preparation_requests.class_id
      and cp.person_id = class_preparation_requests.person_id
      and c.status = 'scheduled'
  )
);

commit;
