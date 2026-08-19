alter table public.student_profiles
  add column if not exists teaching_approach text null,
  add column if not exists work_priorities text null,
  add column if not exists strengths text null;

create or replace function public.save_student_staff_teaching_profile(
  p_person_id bigint,
  p_teacher_notes text default null,
  p_teaching_approach text default null,
  p_work_priorities text default null,
  p_strengths text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not (select private.is_staff()) then
    raise exception 'Solo el equipo puede editar el perfil docente interno.' using errcode='42501';
  end if;
  if not exists(select 1 from public.people where id=p_person_id and active) then
    raise exception 'El alumno no existe.' using errcode='P0002';
  end if;

  insert into public.student_profiles(person_id,active,teacher_notes,teaching_approach,work_priorities,strengths)
  values(
    p_person_id,
    true,
    nullif(btrim(coalesce(p_teacher_notes,'')),''),
    nullif(btrim(coalesce(p_teaching_approach,'')),''),
    nullif(btrim(coalesce(p_work_priorities,'')),''),
    nullif(btrim(coalesce(p_strengths,'')),'')
  )
  on conflict(person_id) do update set
    teacher_notes=excluded.teacher_notes,
    teaching_approach=excluded.teaching_approach,
    work_priorities=excluded.work_priorities,
    strengths=excluded.strengths,
    updated_at=now();

  return (
    select jsonb_build_object(
      'person_id',sp.person_id,
      'teacher_notes',sp.teacher_notes,
      'teaching_approach',sp.teaching_approach,
      'work_priorities',sp.work_priorities,
      'strengths',sp.strengths
    )
    from public.student_profiles sp
    where sp.person_id=p_person_id
  );
end $$;

revoke all on function public.save_student_staff_teaching_profile(bigint,text,text,text,text) from public,anon;
grant execute on function public.save_student_staff_teaching_profile(bigint,text,text,text,text) to authenticated;
