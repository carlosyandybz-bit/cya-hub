begin;

drop policy if exists student_content_measurements_staff_update on public.student_content_measurements;
create policy student_content_measurements_staff_update on public.student_content_measurements for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));

grant update on public.student_content_measurements to authenticated;

commit;
