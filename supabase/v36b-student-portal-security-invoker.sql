-- CYA Hub · v36b · endurecimiento del filtrado de evaluaciones del portal
-- La función pública vuelve a SECURITY INVOKER. El acceso privilegiado queda en
-- schema private y comprueba explícitamente alumno propio o equipo autorizado.

create or replace function private.student_visible_evaluations_json(p_person_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_current bigint;
  v_result jsonb;
begin
  select private.current_person_id() into v_current;

  if not (select private.is_staff())
     and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para consultar estas evaluaciones.' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'class_id',e.class_id,
        'score',e.score,
        'aptitude',apt.label,
        'created_at',e.created_at
      )
      order by e.created_at desc,e.id desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.student_evaluations e
  join public.catalog_terms apt on apt.id=e.aptitude_term_id
  left join public.evaluation_sessions s on s.id=e.session_id
  left join public.classes c on c.id=coalesce(s.class_id,e.class_id)
  where e.person_id=p_person_id
    and (
      (
        e.session_id is not null
        and s.status='completed'
        and (s.class_id is null or c.pedagogy_closed_at is not null)
      )
      or
      (
        e.session_id is null
        and (e.class_id is null or c.pedagogy_closed_at is not null)
      )
    );

  return v_result;
end;
$$;

revoke all on function private.student_visible_evaluations_json(bigint) from public,anon;
grant execute on function private.student_visible_evaluations_json(bigint) to authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_result jsonb;
begin
  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;

  -- private.student_portal_snapshot_for ya aplica la autorización de identidad.
  v_result:=private.student_portal_snapshot_for(v_person);

  return jsonb_set(
    v_result,
    '{evaluations}',
    private.student_visible_evaluations_json(v_person),
    true
  );
end;
$$;

revoke all on function public.student_portal_snapshot_for(bigint) from public,anon;
grant execute on function public.student_portal_snapshot_for(bigint) to authenticated;
