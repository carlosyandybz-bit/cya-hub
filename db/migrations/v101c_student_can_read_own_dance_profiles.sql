-- V1-020 — El alumno puede consultar sus propios perfiles de baile.
-- La escritura directa continúa restringida; el nivel autodeclarado se modifica
-- exclusivamente mediante save_student_self_reported_dance_preference().

drop policy if exists dance_profiles_self_select on public.student_dance_profiles;
create policy dance_profiles_self_select on public.student_dance_profiles
for select to authenticated
using (person_id = (select private.current_person_id()));

comment on policy dance_profiles_self_select on public.student_dance_profiles is
'V1-020: el alumno puede leer sus propios perfiles de baile, incluidos nivel autodeclarado y nivel pedagógico visible, pero no escribir directamente la tabla.';
