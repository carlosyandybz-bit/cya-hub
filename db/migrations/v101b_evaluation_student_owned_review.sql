create or replace function public.review_evaluation_question(p_session_id bigint, p_progress_id bigint, p_scale_term_id bigint default null, p_descriptor_id bigint default null, p_note text default null)
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
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' then raise exception 'Esta evaluación ya está cerrada.' using errcode='22023'; end if;

  -- La evaluación pertenece al alumno. class_id es únicamente procedencia/contexto.
  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found or v_progress.person_id<>v_session.person_id or v_progress.style_term_id<>v_session.style_term_id or v_progress.role_term_id<>v_session.role_term_id or v_progress.level_term_id<>v_session.level_term_id then raise exception 'La pregunta no corresponde a esta evaluación.' using errcode='22023'; end if;

  if p_scale_term_id is not null then
    select * into v_scale from public.catalog_terms where id=p_scale_term_id and taxonomy='evaluation_scale' and active;
    if not found then raise exception 'La respuesta seleccionada no está disponible.' using errcode='22023'; end if;
    if not (v_scale.metadata ? 'score') then raise exception 'La respuesta no tiene valor interno configurado.' using errcode='22023'; end if;
    v_score:=(v_scale.metadata->>'score')::smallint;
    if v_score<0 or v_score>100 then raise exception 'El valor interno de la respuesta está fuera de rango.' using errcode='22023'; end if;
    v_label:=v_scale.label;
  else
    select d.* into v_descriptor from public.evaluation_descriptors d join public.evaluation_milestones m on m.id=d.milestone_id
    where d.id=p_descriptor_id and d.active and m.active and m.style_term_id=v_progress.style_term_id and m.role_term_id=v_progress.role_term_id and m.level_term_id=v_progress.level_term_id and m.aptitude_term_id=v_progress.aptitude_term_id;
    if not found then raise exception 'El descriptor no corresponde a esta pregunta.' using errcode='22023'; end if;
    select * into v_milestone from public.evaluation_milestones where id=v_descriptor.milestone_id;
    v_score:=v_descriptor.internal_score; v_label:=v_descriptor.label;
    v_decision:=case when v_score>=v_milestone.threshold_score then 'accepted' else 'rejected' end;
  end if;

  update public.student_aptitude_progress set raw_score=v_score,effective_score=v_score,pending_milestone_id=case when v_decision='rejected' then v_milestone.id else null end,pending_since_class_id=case when v_decision='rejected' then v_session.class_id else null end,last_descriptor_id=p_descriptor_id,last_evaluation_session_id=v_session.id,updated_at=now()
  where id=v_progress.id returning * into v_progress;

  insert into public.student_evaluations(session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,evaluated_by,answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by,milestone_id)
  values(v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,v_session.role_term_id,v_session.level_term_id,v_progress.aptitude_term_id,v_session.evaluation_kind,v_score,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()),p_scale_term_id,p_descriptor_id,v_label,now(),(select auth.uid()),v_progress.current_milestone_id)
  on conflict(session_id,aptitude_term_id) where session_id is not null do update set score=excluded.score,note=excluded.note,evaluated_by=excluded.evaluated_by,answer_scale_term_id=excluded.answer_scale_term_id,descriptor_id=excluded.descriptor_id,answer_label=excluded.answer_label,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,milestone_id=excluded.milestone_id,updated_at=now()
  returning * into v_evaluation;

  if p_descriptor_id is not null then
    insert into public.evaluation_milestone_decisions(session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by)
    values(v_session.id,v_progress.id,v_milestone.id,v_session.class_id,v_decision,p_descriptor_id,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()))
    on conflict(session_id,progress_id,milestone_id) do update set decision=excluded.decision,descriptor_id=excluded.descriptor_id,note=excluded.note,decided_by=excluded.decided_by,created_at=now();
  end if;
  return v_evaluation;
end;$$;
