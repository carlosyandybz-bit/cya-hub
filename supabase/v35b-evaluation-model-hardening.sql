-- CYA Hub · v35b · endurecimiento del modelo final de evaluación
-- Índices de claves foráneas, integridad de taxonomías y uso efectivo del valor interno de descriptor.

create index if not exists evaluation_milestones_role_idx on public.evaluation_milestones(role_term_id);
create index if not exists evaluation_milestones_level_idx on public.evaluation_milestones(level_term_id);
create index if not exists evaluation_milestones_aptitude_idx on public.evaluation_milestones(aptitude_term_id);
create index if not exists evaluation_milestones_created_by_idx on public.evaluation_milestones(created_by);
create index if not exists evaluation_descriptors_created_by_idx on public.evaluation_descriptors(created_by);

create index if not exists teaching_content_eval_points_role_idx on public.teaching_content_evaluation_points(role_term_id);
create index if not exists teaching_content_eval_points_level_idx on public.teaching_content_evaluation_points(level_term_id);
create index if not exists teaching_content_eval_points_aptitude_idx on public.teaching_content_evaluation_points(aptitude_term_id);
create index if not exists teaching_content_eval_points_created_by_idx on public.teaching_content_evaluation_points(created_by);

create index if not exists student_aptitude_progress_style_idx on public.student_aptitude_progress(style_term_id);
create index if not exists student_aptitude_progress_role_idx on public.student_aptitude_progress(role_term_id);
create index if not exists student_aptitude_progress_level_idx on public.student_aptitude_progress(level_term_id);
create index if not exists student_aptitude_progress_aptitude_idx on public.student_aptitude_progress(aptitude_term_id);
create index if not exists student_aptitude_progress_pending_class_idx on public.student_aptitude_progress(pending_since_class_id);
create index if not exists student_aptitude_progress_last_descriptor_idx on public.student_aptitude_progress(last_descriptor_id);
create index if not exists student_aptitude_progress_last_session_idx on public.student_aptitude_progress(last_evaluation_session_id);

create index if not exists evaluation_progress_awards_class_idx on public.evaluation_progress_awards(class_id);
create index if not exists evaluation_progress_awards_content_idx on public.evaluation_progress_awards(content_id);
create index if not exists evaluation_progress_awards_style_idx on public.evaluation_progress_awards(style_term_id);
create index if not exists evaluation_progress_awards_role_idx on public.evaluation_progress_awards(role_term_id);
create index if not exists evaluation_progress_awards_level_idx on public.evaluation_progress_awards(level_term_id);
create index if not exists evaluation_progress_awards_aptitude_idx on public.evaluation_progress_awards(aptitude_term_id);
create index if not exists evaluation_progress_awards_source_event_idx on public.evaluation_progress_awards(source_event_id);
create index if not exists evaluation_progress_awards_awarded_by_idx on public.evaluation_progress_awards(awarded_by);

create index if not exists evaluation_milestone_decisions_session_idx on public.evaluation_milestone_decisions(session_id);
create index if not exists evaluation_milestone_decisions_milestone_idx on public.evaluation_milestone_decisions(milestone_id);
create index if not exists evaluation_milestone_decisions_descriptor_idx on public.evaluation_milestone_decisions(descriptor_id);
create index if not exists evaluation_milestone_decisions_decided_by_idx on public.evaluation_milestone_decisions(decided_by);

create or replace function private.validate_evaluation_milestone_context()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.catalog_terms where id=new.style_term_id and taxonomy='dance_style') then raise exception 'El estilo del hito no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.role_term_id and taxonomy='dance_role') then raise exception 'El rol del hito no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.level_term_id and taxonomy='dance_level') then raise exception 'El nivel del hito no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.aptitude_term_id and taxonomy='aptitude') then raise exception 'La aptitud del hito no es válida.' using errcode='22023'; end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists trg_validate_evaluation_milestone_context on public.evaluation_milestones;
create trigger trg_validate_evaluation_milestone_context before insert or update on public.evaluation_milestones for each row execute function private.validate_evaluation_milestone_context();

create or replace function private.validate_evaluation_descriptor()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.evaluation_milestones where id=new.milestone_id) then raise exception 'El hito del descriptor no existe.' using errcode='22023'; end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists trg_validate_evaluation_descriptor on public.evaluation_descriptors;
create trigger trg_validate_evaluation_descriptor before insert or update on public.evaluation_descriptors for each row execute function private.validate_evaluation_descriptor();

create or replace function private.validate_teaching_content_evaluation_points()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.catalog_terms where id=new.style_term_id and taxonomy='dance_style') then raise exception 'El estilo de puntuación no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.role_term_id and taxonomy='dance_role') then raise exception 'El rol de puntuación no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.level_term_id and taxonomy='dance_level') then raise exception 'El nivel de puntuación no es válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=new.aptitude_term_id and taxonomy='aptitude') then raise exception 'La aptitud de puntuación no es válida.' using errcode='22023'; end if;
  if not exists(select 1 from public.teaching_contents where id=new.content_id and active) then raise exception 'El contenido no está disponible.' using errcode='22023'; end if;
  new.updated_at:=now();
  return new;
end $$;
drop trigger if exists trg_validate_teaching_content_evaluation_points on public.teaching_content_evaluation_points;
create trigger trg_validate_teaching_content_evaluation_points before insert or update on public.teaching_content_evaluation_points for each row execute function private.validate_teaching_content_evaluation_points();

create or replace function public.decide_evaluation_milestone(
  p_session_id bigint,p_progress_id bigint,p_decision text,p_descriptor_id bigint default null,p_note text default null
) returns public.evaluation_milestone_decisions
language plpgsql set search_path='' as $$
declare
  v_session public.evaluation_sessions; v_progress public.student_aptitude_progress; v_milestone public.evaluation_milestones;
  v_descriptor public.evaluation_descriptors; v_decision public.evaluation_milestone_decisions; v_has_descriptors boolean;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para confirmar hitos.' using errcode='42501'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Decisión de hito no válida.' using errcode='22023'; end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' or v_session.class_id is null then raise exception 'Esta evaluación no admite decisiones.' using errcode='22023'; end if;
  if not exists(select 1 from public.classes c where c.id=v_session.class_id and c.status='finished' and c.administrative_finished_at is not null and c.pedagogy_closed_at is null) then
    raise exception 'Los hitos se confirman después de terminar la parte administrativa y antes del cierre pedagógico.' using errcode='22023';
  end if;

  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found or v_progress.person_id<>v_session.person_id or v_progress.style_term_id<>v_session.style_term_id or v_progress.role_term_id<>v_session.role_term_id or v_progress.level_term_id<>v_session.level_term_id then
    raise exception 'El progreso no corresponde a esta evaluación.' using errcode='22023';
  end if;
  if v_progress.pending_milestone_id is null then raise exception 'Este parámetro no tiene ningún hito pendiente.' using errcode='22023'; end if;
  select * into v_milestone from public.evaluation_milestones where id=v_progress.pending_milestone_id and active;
  if not found then raise exception 'El hito pendiente ya no está disponible.' using errcode='22023'; end if;

  select exists(select 1 from public.evaluation_descriptors d where d.milestone_id=v_milestone.id and d.active) into v_has_descriptors;
  if v_has_descriptors and p_descriptor_id is null then raise exception 'Selecciona el descriptor observable que mejor represente al alumno.' using errcode='22023'; end if;
  if p_descriptor_id is not null then
    select * into v_descriptor from public.evaluation_descriptors where id=p_descriptor_id and milestone_id=v_milestone.id and active;
    if not found then raise exception 'El descriptor no corresponde a este hito.' using errcode='22023'; end if;
    if p_decision='accepted' and v_descriptor.internal_score<v_milestone.threshold_score then
      raise exception 'Este descriptor todavía no demuestra el hito.' using errcode='22023';
    end if;
    if p_decision='rejected' and v_descriptor.internal_score>v_milestone.threshold_score then
      raise exception 'Este descriptor ya supera el hito y no es coherente con rechazarlo.' using errcode='22023';
    end if;
  end if;

  insert into public.evaluation_milestone_decisions(session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by)
  values(v_session.id,v_progress.id,v_milestone.id,v_session.class_id,p_decision,p_descriptor_id,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()))
  returning * into v_decision;

  if p_decision='accepted' then
    update public.student_aptitude_progress
    set raw_score=least(100,greatest(raw_score,coalesce(v_descriptor.internal_score,v_milestone.threshold_score))),
        pending_milestone_id=null,pending_since_class_id=null,last_descriptor_id=p_descriptor_id,updated_at=now()
    where id=v_progress.id;
    v_progress:=private.refresh_aptitude_progress(v_progress.id,v_session.class_id);
  else
    update public.student_aptitude_progress
    set pending_milestone_id=v_milestone.id,pending_since_class_id=coalesce(pending_since_class_id,v_session.class_id),last_descriptor_id=p_descriptor_id,
        effective_score=least(raw_score,v_milestone.threshold_score),updated_at=now()
    where id=v_progress.id returning * into v_progress;
  end if;

  insert into public.student_evaluations(session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,evaluated_by)
  values(v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,v_session.role_term_id,v_session.level_term_id,v_progress.aptitude_term_id,v_session.evaluation_kind,v_progress.effective_score,null,(select auth.uid()))
  on conflict(session_id,aptitude_term_id) where session_id is not null do update
    set score=excluded.score,evaluated_by=excluded.evaluated_by,updated_at=now();
  return v_decision;
end $$;
