-- CYA Hub · v36 · visibilidad segura de evaluaciones en el área Alumno
--
-- Regla de publicación:
-- 1) una evaluación con sesión solo es visible si la sesión está completada;
-- 2) si pertenece a una clase, además exige cierre pedagógico;
-- 3) el histórico legado sin session_id se conserva, pero si tiene clase vinculada
--    también exige cierre pedagógico;
-- 4) Profesor/Administración mantienen acceso completo para trabajar borradores.

create or replace function private.student_visible_evaluations_json(p_person_id bigint)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
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
$$;

revoke all on function private.student_visible_evaluations_json(bigint) from public,anon,authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_current bigint;
  v_result jsonb;
begin
  select private.current_person_id() into v_current;

  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;

  if not (select private.is_staff())
     and not ((select private.has_app_role('student')) and v_current=v_person) then
    raise exception 'No tienes permiso para ver esta experiencia de alumno.' using errcode='42501';
  end if;

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

-- RLS coherente con la proyección del portal: un alumno que consulte directamente
-- tampoco puede observar una sesión antes de su liberación pedagógica.
drop policy if exists evaluation_sessions_student_select on public.evaluation_sessions;
create policy evaluation_sessions_student_select
on public.evaluation_sessions
for select
to authenticated
using (
  person_id=(select private.current_person_id())
  and status='completed'
  and (
    class_id is null
    or exists(
      select 1 from public.classes c
      where c.id=evaluation_sessions.class_id
        and c.pedagogy_closed_at is not null
    )
  )
);

drop policy if exists student_evaluations_select on public.student_evaluations;
create policy student_evaluations_select
on public.student_evaluations
for select
to authenticated
using (
  (select private.is_staff())
  or (
    person_id=(select private.current_person_id())
    and (
      (
        session_id is not null
        and exists(
          select 1
          from public.evaluation_sessions s
          left join public.classes c on c.id=s.class_id
          where s.id=student_evaluations.session_id
            and s.status='completed'
            and (s.class_id is null or c.pedagogy_closed_at is not null)
        )
      )
      or
      (
        session_id is null
        and (
          class_id is null
          or exists(
            select 1 from public.classes c
            where c.id=student_evaluations.class_id
              and c.pedagogy_closed_at is not null
          )
        )
      )
    )
  )
);
