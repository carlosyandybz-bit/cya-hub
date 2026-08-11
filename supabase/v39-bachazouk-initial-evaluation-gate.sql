-- CYA Hub · v39 · puerta de evaluación inicial Bachazouk
--
-- Regla pedagógica cerrada:
-- la posible rama Bachazouk puede detectarse durante Bachata, pero no se evalúa
-- hasta haber completado TODA la evaluación inicial de Bachata del mismo rol.
-- No depende de puntos de contenido ni de un porcentaje de progreso.

create or replace function private.initial_evaluation_is_complete(
  p_person_id bigint,
  p_style_key text,
  p_role_term_id bigint
)
returns boolean
language sql
stable
security invoker
set search_path=''
as $$
  select exists(
    select 1
    from public.evaluation_sessions s
    join public.catalog_terms style
      on style.id=s.style_term_id and style.taxonomy='dance_style'
    join public.catalog_terms role_term
      on role_term.id=s.role_term_id and role_term.taxonomy='dance_role'
    join public.catalog_terms level_term
      on level_term.id=s.level_term_id and level_term.taxonomy='dance_level'
    cross join lateral (
      select count(*)::integer as expected_count
      from public.catalog_terms aptitude
      where aptitude.taxonomy='aptitude'
        and aptitude.active
        and (
          not (aptitude.metadata ? 'styles')
          or coalesce((aptitude.metadata->'styles') ? style.term_key,false)
        )
        and (
          not (aptitude.metadata ? 'roles')
          or coalesce((aptitude.metadata->'roles') ? role_term.term_key,false)
        )
        and (
          not (aptitude.metadata ? 'levels')
          or coalesce((aptitude.metadata->'levels') ? level_term.term_key,false)
        )
    ) expected
    cross join lateral (
      select count(distinct evaluation.aptitude_term_id)::integer as actual_count
      from public.student_evaluations evaluation
      where evaluation.session_id=s.id
    ) actual
    where s.person_id=p_person_id
      and s.role_term_id=p_role_term_id
      and s.evaluation_kind='initial'
      and s.status='completed'
      and style.term_key=p_style_key
      and expected.expected_count>0
      and actual.actual_count>=expected.expected_count
  );
$$;

revoke all on function private.initial_evaluation_is_complete(bigint,text,bigint) from public,anon;
grant execute on function private.initial_evaluation_is_complete(bigint,text,bigint) to authenticated;

create or replace function public.prepare_post_class_evaluation(
  p_class_id bigint,
  p_person_id bigint
)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_style bigint;
  v_style_key text;
  v_role bigint;
  v_level bigint;
  v_session public.evaluation_sessions;
  v_kind text;
  v_progress public.student_aptitude_progress;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501';
  end if;

  select * into v_class
  from public.classes
  where id=p_class_id
  for update;

  if not found then
    raise exception 'La clase no existe.' using errcode='P0002';
  end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then
    raise exception 'La evaluación se realiza después de terminar la parte administrativa de la clase.' using errcode='22023';
  end if;
  if v_class.pedagogy_closed_at is not null then
    raise exception 'La clase ya está cerrada pedagógicamente.' using errcode='22023';
  end if;

  select v_class.style_term_id,style.term_key,cp.role_term_id,cp.level_term_id
  into v_style,v_style_key,v_role,v_level
  from public.class_participants cp
  left join public.catalog_terms style
    on style.id=v_class.style_term_id and style.taxonomy='dance_style'
  where cp.class_id=p_class_id and cp.person_id=p_person_id;

  if not found or v_style is null or v_style_key is null or v_role is null or v_level is null then
    raise exception 'La clase no tiene estilo, rol o nivel suficiente para evaluar.' using errcode='22023';
  end if;

  -- Solo se aplica a la PRIMERA evaluación de Bachazouk. Si ya existe una
  -- evaluación completada de Bachazouk para ese rol, las evaluaciones de clase
  -- posteriores continúan normalmente.
  if v_style_key='bachazouk'
     and not exists(
       select 1
       from public.evaluation_sessions s
       where s.person_id=p_person_id
         and s.style_term_id=v_style
         and s.role_term_id=v_role
         and s.status='completed'
     )
     and not private.initial_evaluation_is_complete(
       p_person_id,
       'bachata',
       v_role
     ) then
    raise exception 'Completa primero toda la evaluación inicial de Bachata antes de abrir Bachazouk.' using errcode='22023';
  end if;

  perform public.ensure_student_aptitude_progress(
    p_person_id,v_style,v_role,v_level
  );

  select * into v_session
  from public.evaluation_sessions
  where class_id=p_class_id
    and person_id=p_person_id
    and style_term_id=v_style
    and role_term_id=v_role
    and level_term_id=v_level
  order by id desc
  limit 1;

  if not found then
    v_kind:=case
      when exists(
        select 1
        from public.evaluation_sessions s
        where s.person_id=p_person_id
          and s.style_term_id=v_style
          and s.role_term_id=v_role
          and s.status='completed'
      ) then 'class'
      else 'initial'
    end;

    insert into public.evaluation_sessions(
      person_id,class_id,style_term_id,role_term_id,level_term_id,
      evaluation_kind,status,evaluated_by,started_at
    )
    values(
      p_person_id,p_class_id,v_style,v_role,v_level,
      v_kind,'draft',(select auth.uid()),now()
    )
    returning * into v_session;
  elsif v_session.status='completed' then
    return v_session;
  end if;

  for v_progress in
    select *
    from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=v_style
      and p.role_term_id=v_role
      and p.level_term_id=v_level
  loop
    v_progress:=private.refresh_aptitude_progress(v_progress.id,p_class_id);

    insert into public.student_evaluations(
      session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,evaluation_kind,score,note,evaluated_by
    )
    values(
      v_session.id,p_person_id,p_class_id,v_style,v_role,v_level,
      v_progress.aptitude_term_id,v_session.evaluation_kind,
      v_progress.effective_score,null,(select auth.uid())
    )
    on conflict(session_id,aptitude_term_id)
      where session_id is not null
    do update
      set score=excluded.score,
          evaluated_by=excluded.evaluated_by,
          updated_at=now();

    update public.student_aptitude_progress
    set last_evaluation_session_id=v_session.id,
        updated_at=now()
    where id=v_progress.id;
  end loop;

  return v_session;
end;
$$;
