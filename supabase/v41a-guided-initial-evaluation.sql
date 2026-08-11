-- CYA Hub · v41a · evaluación inicial guiada DURANTE la clase
--
-- Capacidad compatible: añade el flujo inicial sin retirar todavía el fallback
-- postclase. El corte obligatorio se hará cuando la UI esté validada.

create or replace function public.start_initial_evaluation(
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
  v_progress public.student_aptitude_progress;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para iniciar evaluaciones.' using errcode='42501';
  end if;

  select * into v_class
  from public.classes
  where id=p_class_id
  for update;

  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status<>'active' or v_class.started_at is null or v_class.pedagogy_closed_at is not null then
    raise exception 'La evaluación inicial guiada solo se realiza durante una clase activa.' using errcode='22023';
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

  -- Cualquier evaluación completada previa de ese estilo+rol significa que ya no
  -- estamos ante una evaluación inicial. El nivel puede cambiar después sin repetir
  -- el cuestionario inicial completo.
  if exists(
    select 1
    from public.evaluation_sessions s
    where s.person_id=p_person_id
      and s.style_term_id=v_style
      and s.role_term_id=v_role
      and s.status='completed'
  ) then
    raise exception 'Este alumno ya tiene una evaluación previa para este estilo y rol.' using errcode='22023';
  end if;

  if v_style_key='bachazouk'
     and not private.initial_evaluation_is_complete(p_person_id,'bachata',v_role) then
    raise exception 'Completa primero toda la evaluación inicial de Bachata antes de abrir Bachazouk.' using errcode='22023';
  end if;

  perform public.ensure_student_aptitude_progress(p_person_id,v_style,v_role,v_level);

  select * into v_session
  from public.evaluation_sessions
  where class_id=p_class_id
    and person_id=p_person_id
    and style_term_id=v_style
    and role_term_id=v_role
    and level_term_id=v_level
  limit 1;

  if found then
    if v_session.evaluation_kind<>'initial' then
      raise exception 'Esta clase ya tiene otro tipo de evaluación preparado.' using errcode='22023';
    end if;
    return v_session;
  end if;

  insert into public.evaluation_sessions(
    person_id,class_id,style_term_id,role_term_id,level_term_id,
    evaluation_kind,status,evaluated_by,started_at
  )
  values(
    p_person_id,p_class_id,v_style,v_role,v_level,
    'initial','draft',(select auth.uid()),now()
  )
  returning * into v_session;

  for v_progress in
    select *
    from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=v_style
      and p.role_term_id=v_role
      and p.level_term_id=v_level
    order by p.aptitude_term_id
  loop
    insert into public.student_evaluations(
      session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,evaluation_kind,score,note,evaluated_by,
      answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
    )
    values(
      v_session.id,p_person_id,p_class_id,v_style,v_role,v_level,
      v_progress.aptitude_term_id,'initial',v_progress.effective_score,
      null,(select auth.uid()),null,null,null,null,null
    )
    on conflict(session_id,aptitude_term_id) where session_id is not null do nothing;

    update public.student_aptitude_progress
    set last_evaluation_session_id=v_session.id,updated_at=now()
    where id=v_progress.id;
  end loop;

  return v_session;
end;
$$;

create or replace function public.review_evaluation_question(
  p_session_id bigint,
  p_progress_id bigint,
  p_scale_term_id bigint default null,
  p_descriptor_id bigint default null,
  p_note text default null
)
returns public.student_evaluations
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
  v_scale public.catalog_terms;
  v_descriptor public.evaluation_descriptors;
  v_milestone public.evaluation_milestones;
  v_score smallint;
  v_label text;
  v_decision text;
  v_evaluation public.student_evaluations;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para revisar evaluaciones.' using errcode='42501'; end if;
  if (p_scale_term_id is null) = (p_descriptor_id is null) then raise exception 'Selecciona una única respuesta.' using errcode='22023'; end if;

  select * into v_session
  from public.evaluation_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' then raise exception 'Esta evaluación ya está cerrada.' using errcode='22023'; end if;

  if v_session.class_id is not null then
    if v_session.evaluation_kind='initial' then
      if not exists(
        select 1 from public.classes c
        where c.id=v_session.class_id
          and c.status='active'
          and c.started_at is not null
          and c.pedagogy_closed_at is null
      ) then
        raise exception 'La evaluación inicial solo puede editarse durante la clase activa.' using errcode='22023';
      end if;
    else
      if not exists(
        select 1 from public.classes c
        where c.id=v_session.class_id
          and c.status='finished'
          and c.administrative_finished_at is not null
          and c.pedagogy_closed_at is null
      ) then
        raise exception 'La revisión posterior a clase solo puede editarse entre el cierre administrativo y el pedagógico.' using errcode='22023';
      end if;
    end if;
  end if;

  select * into v_progress
  from public.student_aptitude_progress
  where id=p_progress_id
  for update;
  if not found
     or v_progress.person_id<>v_session.person_id
     or v_progress.style_term_id<>v_session.style_term_id
     or v_progress.role_term_id<>v_session.role_term_id
     or v_progress.level_term_id<>v_session.level_term_id then
    raise exception 'La pregunta no corresponde a esta evaluación.' using errcode='22023';
  end if;

  if p_scale_term_id is not null then
    select * into v_scale
    from public.catalog_terms
    where id=p_scale_term_id and taxonomy='evaluation_scale' and active;
    if not found then raise exception 'La respuesta seleccionada no está disponible.' using errcode='22023'; end if;
    if not (v_scale.metadata ? 'score') then raise exception 'La respuesta no tiene valor interno configurado.' using errcode='22023'; end if;
    v_score:=(v_scale.metadata->>'score')::smallint;
    if v_score<0 or v_score>100 then raise exception 'El valor interno de la respuesta está fuera de rango.' using errcode='22023'; end if;
    v_label:=v_scale.label;
  else
    select d.* into v_descriptor
    from public.evaluation_descriptors d
    join public.evaluation_milestones m on m.id=d.milestone_id
    where d.id=p_descriptor_id
      and d.active and m.active
      and m.style_term_id=v_progress.style_term_id
      and m.role_term_id=v_progress.role_term_id
      and m.level_term_id=v_progress.level_term_id
      and m.aptitude_term_id=v_progress.aptitude_term_id;
    if not found then raise exception 'El descriptor no corresponde a esta pregunta.' using errcode='22023'; end if;
    select * into v_milestone from public.evaluation_milestones where id=v_descriptor.milestone_id;
    v_score:=v_descriptor.internal_score;
    v_label:=v_descriptor.label;
    v_decision:=case when v_score>=v_milestone.threshold_score then 'accepted' else 'rejected' end;
  end if;

  update public.student_aptitude_progress
  set raw_score=v_score,
      effective_score=v_score,
      pending_milestone_id=case when v_decision='rejected' then v_milestone.id else null end,
      pending_since_class_id=case when v_decision='rejected' then v_session.class_id else null end,
      last_descriptor_id=p_descriptor_id,
      last_evaluation_session_id=v_session.id,
      updated_at=now()
  where id=v_progress.id
  returning * into v_progress;

  insert into public.student_evaluations(
    session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
    aptitude_term_id,evaluation_kind,score,note,evaluated_by,
    answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
  )
  values(
    v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,
    v_session.role_term_id,v_session.level_term_id,v_progress.aptitude_term_id,
    v_session.evaluation_kind,v_score,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()),
    p_scale_term_id,p_descriptor_id,v_label,now(),(select auth.uid())
  )
  on conflict(session_id,aptitude_term_id) where session_id is not null
  do update set
    score=excluded.score,
    note=excluded.note,
    evaluated_by=excluded.evaluated_by,
    answer_scale_term_id=excluded.answer_scale_term_id,
    descriptor_id=excluded.descriptor_id,
    answer_label=excluded.answer_label,
    reviewed_at=excluded.reviewed_at,
    reviewed_by=excluded.reviewed_by,
    updated_at=now()
  returning * into v_evaluation;

  if p_descriptor_id is not null then
    insert into public.evaluation_milestone_decisions(
      session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by
    )
    values(
      v_session.id,v_progress.id,v_milestone.id,v_session.class_id,
      v_decision,p_descriptor_id,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid())
    )
    on conflict(session_id,progress_id,milestone_id)
    do update set
      decision=excluded.decision,
      descriptor_id=excluded.descriptor_id,
      note=excluded.note,
      decided_by=excluded.decided_by,
      created_at=now();
  end if;

  return v_evaluation;
end;
$$;

create or replace function public.complete_initial_evaluation(p_session_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_expected integer;
  v_reviewed integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para cerrar evaluaciones.' using errcode='42501';
  end if;

  select * into v_session
  from public.evaluation_sessions
  where id=p_session_id
  for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status='completed' then return v_session; end if;
  if v_session.evaluation_kind<>'initial' or v_session.class_id is null then
    raise exception 'Esta operación es solo para evaluaciones iniciales guiadas.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.classes c
    where c.id=v_session.class_id
      and c.status='active'
      and c.started_at is not null
      and c.pedagogy_closed_at is null
  ) then
    raise exception 'La evaluación inicial debe completarse durante la clase activa.' using errcode='22023';
  end if;

  select count(*) into v_expected
  from public.student_evaluations e
  where e.session_id=v_session.id;
  select count(*) into v_reviewed
  from public.student_evaluations e
  where e.session_id=v_session.id and e.reviewed_at is not null;

  if v_expected=0 then raise exception 'La evaluación inicial no tiene preguntas.' using errcode='22023'; end if;
  if v_reviewed<v_expected then
    raise exception 'Completa todas las preguntas de la evaluación inicial (% de %).',v_reviewed,v_expected using errcode='22023';
  end if;

  update public.evaluation_sessions
  set status='completed',completed_at=now(),updated_at=now()
  where id=v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.start_initial_evaluation(bigint,bigint) from public,anon;
revoke all on function public.complete_initial_evaluation(bigint) from public,anon;
grant execute on function public.start_initial_evaluation(bigint,bigint) to authenticated;
grant execute on function public.complete_initial_evaluation(bigint) to authenticated;
