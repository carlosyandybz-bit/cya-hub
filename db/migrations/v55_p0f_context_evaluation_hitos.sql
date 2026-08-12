-- CYA Hub P0F / v55
-- Las evaluaciones editan hitos del alumno; la clase solo queda como procedencia.

begin;

create or replace function public.review_context_evaluation_milestone(
  p_session_id bigint,
  p_aptitude_term_id bigint,
  p_milestone_id bigint,
  p_score smallint default null,
  p_note text default null
)
returns public.student_evaluations
language plpgsql
set search_path to ''
as $function$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
  v_milestone public.evaluation_milestones;
  v_evaluation public.student_evaluations;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501';
  end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' then raise exception 'Esta evaluación ya está cerrada.' using errcode='22023'; end if;

  select * into v_progress
  from public.student_aptitude_progress
  where person_id=v_session.person_id
    and style_term_id=v_session.style_term_id
    and role_term_id=v_session.role_term_id
    and level_term_id=v_session.level_term_id
    and aptitude_term_id=p_aptitude_term_id
  for update;
  if not found then raise exception 'El parámetro no pertenece a esta evaluación.' using errcode='22023'; end if;

  select * into v_milestone from public.evaluation_milestones
  where id=p_milestone_id and active
    and style_term_id=v_progress.style_term_id
    and role_term_id=v_progress.role_term_id
    and level_term_id=v_progress.level_term_id
    and aptitude_term_id=v_progress.aptitude_term_id;
  if not found then raise exception 'El hito no corresponde a este parámetro.' using errcode='22023'; end if;

  v_progress:=public.set_aptitude_milestone(v_progress.id,v_milestone.id,p_score,v_session.class_id,p_note);

  insert into public.student_evaluations(
    session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
    aptitude_term_id,evaluation_kind,score,note,evaluated_by,
    answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
  ) values (
    v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,v_session.role_term_id,v_session.level_term_id,
    v_progress.aptitude_term_id,v_session.evaluation_kind,v_progress.raw_score,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()),
    null,null,v_milestone.label,now(),(select auth.uid())
  ) on conflict(session_id,aptitude_term_id) where session_id is not null
  do update set score=excluded.score,note=excluded.note,evaluated_by=excluded.evaluated_by,
    answer_scale_term_id=null,descriptor_id=null,answer_label=excluded.answer_label,
    reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now()
  returning * into v_evaluation;
  return v_evaluation;
end
$function$;

create or replace function public.review_context_evaluation_no_change(
  p_session_id bigint,
  p_aptitude_term_id bigint,
  p_note text default null
)
returns public.student_evaluations
language plpgsql
set search_path to ''
as $function$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
  v_label text;
  v_evaluation public.student_evaluations;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501';
  end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' then raise exception 'Esta evaluación ya está cerrada.' using errcode='22023'; end if;
  select * into v_progress
  from public.student_aptitude_progress
  where person_id=v_session.person_id
    and style_term_id=v_session.style_term_id
    and role_term_id=v_session.role_term_id
    and level_term_id=v_session.level_term_id
    and aptitude_term_id=p_aptitude_term_id;
  if not found then raise exception 'El parámetro no pertenece a esta evaluación.' using errcode='22023'; end if;
  select label into v_label from public.evaluation_milestones where id=v_progress.current_milestone_id;

  insert into public.student_evaluations(
    session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
    aptitude_term_id,evaluation_kind,score,note,evaluated_by,
    answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
  ) values (
    v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,v_session.role_term_id,v_session.level_term_id,
    v_progress.aptitude_term_id,v_session.evaluation_kind,v_progress.raw_score,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()),
    null,null,coalesce(v_label,'Sin hito establecido'),now(),(select auth.uid())
  ) on conflict(session_id,aptitude_term_id) where session_id is not null
  do update set score=excluded.score,note=excluded.note,evaluated_by=excluded.evaluated_by,
    answer_scale_term_id=null,descriptor_id=null,answer_label=excluded.answer_label,
    reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now()
  returning * into v_evaluation;
  return v_evaluation;
end
$function$;

revoke all on function public.review_context_evaluation_milestone(bigint,bigint,bigint,smallint,text) from public, anon;
grant execute on function public.review_context_evaluation_milestone(bigint,bigint,bigint,smallint,text) to authenticated;
revoke all on function public.review_context_evaluation_no_change(bigint,bigint,text) from public, anon;
grant execute on function public.review_context_evaluation_no_change(bigint,bigint,text) to authenticated;

commit;
