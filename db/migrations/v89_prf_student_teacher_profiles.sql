-- PR-F: permite que un alumno vea únicamente los perfiles profesionales de profesores
-- con los que mantiene una relación canónica a través de clases no canceladas.
-- No crea una tabla de vínculos paralela: la relación se deriva de class_participants + classes.

begin;

create or replace function public.student_teacher_profiles()
returns table (
  person_id bigint,
  professional_name text,
  bio text,
  specialties text,
  first_class_at timestamptz,
  last_class_at timestamptz,
  next_class_at timestamptz,
  class_count bigint
)
language sql
stable
security definer
set search_path=''
as $$
  with current_student as (
    select p.id as person_id
    from public.people p
    where p.auth_user_id = (select auth.uid())
      and p.active
    limit 1
  )
  select
    tp.person_id,
    coalesce(
      nullif(btrim(tp.professional_name), ''),
      nullif(btrim(teacher_person.display_name), ''),
      'Profesor CYA'
    ) as professional_name,
    tp.bio,
    tp.specialties,
    min(c.scheduled_start_at) as first_class_at,
    max(c.scheduled_start_at) filter (where c.status = 'finished') as last_class_at,
    min(c.scheduled_start_at) filter (
      where c.status = 'scheduled'
        and c.scheduled_start_at >= now()
    ) as next_class_at,
    count(*)::bigint as class_count
  from current_student student
  join public.class_participants cp
    on cp.person_id = student.person_id
  join public.classes c
    on c.id = cp.class_id
   and c.status <> 'cancelled'
  join public.people teacher_person
    on teacher_person.auth_user_id = c.teacher_user_id
   and teacher_person.active
  join public.teacher_profiles tp
    on tp.person_id = teacher_person.id
   and tp.active
  group by tp.person_id, tp.professional_name, tp.bio, tp.specialties, teacher_person.display_name
  order by
    min(c.scheduled_start_at) filter (
      where c.status = 'scheduled'
        and c.scheduled_start_at >= now()
    ) nulls last,
    max(c.scheduled_start_at) filter (where c.status = 'finished') desc nulls last,
    professional_name;
$$;

revoke all on function public.student_teacher_profiles() from public, anon, authenticated;
grant execute on function public.student_teacher_profiles() to authenticated;

comment on function public.student_teacher_profiles() is
  'Devuelve exclusivamente profesores vinculados al usuario autenticado mediante clases no canceladas.';

commit;
