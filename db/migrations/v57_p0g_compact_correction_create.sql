-- CYA Hub P0G / v57
-- Creación rápida atómica: corrección + Frecuencia/Influencia opcionales + observación opcional.

begin;

create or replace function public.create_class_correction_compact(
  p_class_id bigint,
  p_person_id bigint,
  p_title text,
  p_frequency smallint default null,
  p_importance smallint default null,
  p_observation text default null,
  p_observation_visibility text default 'internal'
)
returns public.student_content_assignments
language plpgsql
set search_path to ''
as $function$
declare
  v_assignment public.student_content_assignments;
  v_observation text := nullif(btrim(coalesce(p_observation,'')), '');
begin
  if p_observation_visibility not in ('internal','student') then
    raise exception 'Visibilidad de observación no válida.' using errcode='22023';
  end if;

  select * into v_assignment
  from public.create_class_correction(
    p_class_id,
    p_person_id,
    p_title,
    'both',
    p_frequency,
    p_importance
  );

  if v_observation is not null then
    perform public.upsert_class_content_note(
      p_class_id,
      p_person_id,
      v_assignment.content_id,
      v_observation,
      p_observation_visibility
    );
  end if;

  return v_assignment;
end
$function$;

revoke all on function public.create_class_correction_compact(bigint,bigint,text,smallint,smallint,text,text) from public;
grant execute on function public.create_class_correction_compact(bigint,bigint,text,smallint,smallint,text,text) to authenticated;

commit;
