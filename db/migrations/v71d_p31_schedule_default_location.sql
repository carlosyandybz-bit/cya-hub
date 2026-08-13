-- P31 — schedule_class consume la ubicación predeterminada sin impedir overrides explícitos.

create or replace function public.schedule_class(
  p_class_type text,
  p_student_ids bigint[],
  p_scheduled_start_at timestamptz,
  p_duration_minutes integer,
  p_style_term_id bigint default null,
  p_location_term_id bigint default null,
  p_notes text default null
)
returns public.classes
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clean_ids bigint[];
  new_class public.classes;
  expected_count integer;
  resolved_location_id bigint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para programar clases.' using errcode='42501';
  end if;
  if p_class_type not in ('individual','pair') then
    raise exception 'Tipo de clase no válido.' using errcode='22023';
  end if;

  select coalesce(array_agg(id order by id),'{}'::bigint[])
  into clean_ids
  from (select distinct unnest(p_student_ids) id) s;

  expected_count:=case when p_class_type='pair' then 2 else 1 end;
  if cardinality(clean_ids)<>expected_count then
    raise exception 'La clase requiere % alumno(s) distintos.',expected_count using errcode='22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes<=0 or p_duration_minutes>480 then
    raise exception 'Duración no válida.' using errcode='22023';
  end if;
  if p_scheduled_start_at is null then
    raise exception 'Fecha y hora obligatorias.' using errcode='22023';
  end if;
  if (
    select count(*)
    from public.student_profiles sp
    join public.people p on p.id=sp.person_id
    where sp.person_id=any(clean_ids) and sp.active and p.active
  )<>expected_count then
    raise exception 'Hay alumnos no válidos o inactivos.' using errcode='22023';
  end if;

  resolved_location_id:=p_location_term_id;
  if resolved_location_id is null then
    select d.default_location_term_id
    into resolved_location_id
    from public.app_operational_defaults d
    where d.singleton=true;
  end if;

  if resolved_location_id is not null and not exists (
    select 1
    from public.catalog_terms t
    where t.id=resolved_location_id
      and t.taxonomy='location'
      and t.active
  ) then
    raise exception 'Ubicación no válida o inactiva.' using errcode='22023';
  end if;

  insert into public.classes(
    teacher_user_id,class_type,scheduled_start_at,duration_minutes,
    style_term_id,location_term_id,notes,created_by
  )
  values(
    (select auth.uid()),p_class_type,p_scheduled_start_at,p_duration_minutes,
    p_style_term_id,resolved_location_id,nullif(btrim(p_notes),''),(select auth.uid())
  )
  returning * into new_class;

  insert into public.class_participants(class_id,person_id)
  select new_class.id,unnest(clean_ids);

  return new_class;
end;
$$;

revoke all on function public.schedule_class(text,bigint[],timestamptz,integer,bigint,bigint,text) from public, anon;
grant execute on function public.schedule_class(text,bigint[],timestamptz,integer,bigint,bigint,text) to authenticated;
