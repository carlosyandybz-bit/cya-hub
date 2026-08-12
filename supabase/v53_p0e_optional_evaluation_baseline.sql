-- CYA Hub · v53 · P0E · baseline derivada y evaluación opcional/contextual
--
-- Contrato:
-- - baseline = primera evaluación COMPLETA y VÁLIDA por persona + estilo + rol,
--   independientemente de evaluation_kind o de si ocurrió dentro/fuera de una clase;
-- - los borradores no son baseline;
-- - una evaluación manual/reevaluación nunca bloquea el cierre de clase;
-- - el cierre pedagógico, cuando exige revisión, exige exclusivamente evaluation_kind='class'
--   para ESA clase;
-- - la revisión post-clase puede ser la primera evaluación válida y convertirse en baseline.

begin;

create or replace function private.evaluation_session_is_valid(p_session_id bigint)
returns boolean
language sql
stable
set search_path=''
as $$
  select exists(
    select 1
    from public.evaluation_sessions s
    join public.catalog_terms style on style.id=s.style_term_id and style.taxonomy='dance_style'
    join public.catalog_terms role_term on role_term.id=s.role_term_id and role_term.taxonomy='dance_role'
    join public.catalog_terms level_term on level_term.id=s.level_term_id and level_term.taxonomy='dance_level'
    cross join lateral (
      select count(*)::integer as expected_count
      from public.catalog_terms aptitude
      where aptitude.taxonomy='aptitude' and aptitude.active
        and (not (aptitude.metadata ? 'styles') or coalesce((aptitude.metadata->'styles') ? style.term_key,false))
        and (not (aptitude.metadata ? 'roles') or coalesce((aptitude.metadata->'roles') ? role_term.term_key,false))
        and (not (aptitude.metadata ? 'levels') or coalesce((aptitude.metadata->'levels') ? level_term.term_key,false))
    ) expected
    cross join lateral (
      select count(distinct evaluation.aptitude_term_id)::integer as actual_count
      from public.student_evaluations evaluation
      where evaluation.session_id=s.id
    ) actual
    where s.id=p_session_id
      and s.status='completed'
      and s.completed_at is not null
      and expected.expected_count>0
      and actual.actual_count>=expected.expected_count
  );
$$;

create or replace function private.first_valid_evaluation_session_id(
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint
)
returns bigint
language plpgsql
stable
set search_path=''
as $$
declare
  v_id bigint;
begin
  select s.id into v_id
  from public.evaluation_sessions s
  where s.person_id=p_person_id
    and s.style_term_id=p_style_term_id
    and s.role_term_id=p_role_term_id
    and s.status='completed'
    and private.evaluation_session_is_valid(s.id)
  order by s.completed_at asc nulls last,s.created_at asc,s.id asc
  limit 1;
  return v_id;
end;
$$;

-- Compatibilidad con funciones antiguas: el nombre se conserva, pero su semántica
-- pasa a ser «existe baseline válida», sin exigir evaluation_kind='initial'.
create or replace function private.initial_evaluation_is_complete(
  p_person_id bigint,
  p_style_key text,
  p_role_term_id bigint
)
returns boolean
language sql
stable
set search_path=''
as $$
  select exists(
    select 1
    from public.catalog_terms style
    where style.taxonomy='dance_style'
      and style.term_key=p_style_key
      and private.first_valid_evaluation_session_id(p_person_id,style.id,p_role_term_id) is not null
  );
$$;

create or replace function public.get_evaluation_baseline_session(
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint
)
returns public.evaluation_sessions
language plpgsql
stable
set search_path=''
as $$
declare
  v_id bigint;
  v_session public.evaluation_sessions;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para consultar evaluaciones.' using errcode='42501';
  end if;
  v_id:=private.first_valid_evaluation_session_id(p_person_id,p_style_term_id,p_role_term_id);
  if v_id is null then return null; end if;
  select * into v_session from public.evaluation_sessions where id=v_id;
  return v_session;
end;
$$;

create or replace function public.start_context_evaluation(
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint,
  p_class_id bigint default null,
  p_evaluation_kind text default 'manual'
)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
  v_class public.classes;
  v_participant public.class_participants;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501';
  end if;
  if p_evaluation_kind not in ('manual','reevaluation') then
    raise exception 'Tipo de evaluación contextual no válido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=p_person_id and sp.active and p.active) then
    raise exception 'El alumno no está disponible.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then
    raise exception 'Selecciona un estilo válido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then
    raise exception 'Selecciona un rol válido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then
    raise exception 'Selecciona un nivel válido.' using errcode='22023';
  end if;

  if p_class_id is not null then
    select * into v_class from public.classes where id=p_class_id;
    if not found or v_class.pedagogy_closed_at is not null then
      raise exception 'La clase no está disponible para evaluar.' using errcode='22023';
    end if;
    select * into v_participant from public.class_participants where class_id=p_class_id and person_id=p_person_id;
    if not found or v_class.style_term_id<>p_style_term_id or v_participant.role_term_id<>p_role_term_id then
      raise exception 'El contexto de evaluación no coincide con esta clase.' using errcode='22023';
    end if;
  end if;

  -- Un borrador contextual se reanuda aunque se iniciara en una clase anterior.
  -- Se conserva su class_id original como procedencia histórica.
  select * into v_session
  from public.evaluation_sessions s
  where s.person_id=p_person_id
    and s.style_term_id=p_style_term_id
    and s.role_term_id=p_role_term_id
    and s.status='draft'
    and s.evaluation_kind in ('manual','reevaluation','initial')
  order by s.started_at asc,s.id asc
  limit 1
  for update;
  if found then return v_session; end if;

  perform public.ensure_student_aptitude_progress(p_person_id,p_style_term_id,p_role_term_id,p_level_term_id);

  insert into public.evaluation_sessions(
    person_id,class_id,style_term_id,role_term_id,level_term_id,
    evaluation_kind,status,evaluated_by,started_at
  ) values (
    p_person_id,p_class_id,p_style_term_id,p_role_term_id,p_level_term_id,
    p_evaluation_kind,'draft',(select auth.uid()),now()
  ) returning * into v_session;

  for v_progress in
    select * from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=p_style_term_id
      and p.role_term_id=p_role_term_id
      and p.level_term_id=p_level_term_id
    order by p.aptitude_term_id
  loop
    insert into public.student_evaluations(
      session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,evaluation_kind,score,note,evaluated_by,
      answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
    ) values (
      v_session.id,p_person_id,p_class_id,p_style_term_id,p_role_term_id,p_level_term_id,
      v_progress.aptitude_term_id,p_evaluation_kind,v_progress.effective_score,null,(select auth.uid()),
      null,null,null,null,null
    ) on conflict(session_id,aptitude_term_id) where session_id is not null do nothing;
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
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status<>'draft' then raise exception 'Esta evaluación ya está cerrada.' using errcode='22023'; end if;

  -- Solo la revisión post-clase está ligada al estado de una clase. Las evaluaciones
  -- manuales/reevaluaciones/initial legado pueden retomarse después sin quedar atrapadas.
  if v_session.class_id is not null and v_session.evaluation_kind='class' then
    if not exists(select 1 from public.classes c where c.id=v_session.class_id and c.status='finished' and c.administrative_finished_at is not null and c.pedagogy_closed_at is null) then
      raise exception 'La revisión posterior a clase solo puede editarse entre el cierre administrativo y el pedagógico.' using errcode='22023';
    end if;
  end if;

  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found or v_progress.person_id<>v_session.person_id or v_progress.style_term_id<>v_session.style_term_id or v_progress.role_term_id<>v_session.role_term_id or v_progress.level_term_id<>v_session.level_term_id then
    raise exception 'La pregunta no corresponde a esta evaluación.' using errcode='22023';
  end if;
  if p_scale_term_id is not null then
    select * into v_scale from public.catalog_terms where id=p_scale_term_id and taxonomy='evaluation_scale' and active;
    if not found then raise exception 'La respuesta seleccionada no está disponible.' using errcode='22023'; end if;
    if not (v_scale.metadata ? 'score') then raise exception 'La respuesta no tiene valor interno configurado.' using errcode='22023'; end if;
    v_score:=(v_scale.metadata->>'score')::smallint;
    if v_score<0 or v_score>100 then raise exception 'El valor interno de la respuesta está fuera de rango.' using errcode='22023'; end if;
    v_label:=v_scale.label;
  else
    select d.* into v_descriptor
    from public.evaluation_descriptors d join public.evaluation_milestones m on m.id=d.milestone_id
    where d.id=p_descriptor_id and d.active and m.active
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
  set raw_score=v_score,effective_score=v_score,
      pending_milestone_id=case when v_decision='rejected' then v_milestone.id else null end,
      pending_since_class_id=case when v_decision='rejected' then v_session.class_id else null end,
      last_descriptor_id=p_descriptor_id,last_evaluation_session_id=v_session.id,updated_at=now()
  where id=v_progress.id returning * into v_progress;

  insert into public.student_evaluations(
    session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
    aptitude_term_id,evaluation_kind,score,note,evaluated_by,
    answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
  ) values (
    v_session.id,v_session.person_id,v_session.class_id,v_session.style_term_id,v_session.role_term_id,v_session.level_term_id,
    v_progress.aptitude_term_id,v_session.evaluation_kind,v_score,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()),
    p_scale_term_id,p_descriptor_id,v_label,now(),(select auth.uid())
  ) on conflict(session_id,aptitude_term_id) where session_id is not null
  do update set score=excluded.score,note=excluded.note,evaluated_by=excluded.evaluated_by,
    answer_scale_term_id=excluded.answer_scale_term_id,descriptor_id=excluded.descriptor_id,
    answer_label=excluded.answer_label,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,updated_at=now()
  returning * into v_evaluation;

  if p_descriptor_id is not null then
    insert into public.evaluation_milestone_decisions(session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by)
    values(v_session.id,v_progress.id,v_milestone.id,v_session.class_id,v_decision,p_descriptor_id,nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()))
    on conflict(session_id,progress_id,milestone_id) do update set decision=excluded.decision,descriptor_id=excluded.descriptor_id,note=excluded.note,decided_by=excluded.decided_by,created_at=now();
  end if;
  return v_evaluation;
end;
$$;

create or replace function public.review_context_evaluation_question(
  p_session_id bigint,
  p_aptitude_term_id bigint,
  p_scale_term_id bigint,
  p_note text default null
)
returns public.student_evaluations
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_progress_id bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501'; end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  select id into v_progress_id
  from public.student_aptitude_progress
  where person_id=v_session.person_id
    and style_term_id=v_session.style_term_id
    and role_term_id=v_session.role_term_id
    and level_term_id=v_session.level_term_id
    and aptitude_term_id=p_aptitude_term_id
  limit 1;
  if v_progress_id is null then raise exception 'La aptitud no pertenece a este contexto.' using errcode='22023'; end if;
  return public.review_evaluation_question(p_session_id,v_progress_id,p_scale_term_id,null,p_note);
end;
$$;

create or replace function public.complete_context_evaluation(p_session_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_expected integer;
  v_reviewed integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cerrar evaluaciones.' using errcode='42501'; end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status='completed' then return v_session; end if;
  if v_session.evaluation_kind='class' then raise exception 'La revisión post-clase se cierra con su flujo específico.' using errcode='22023'; end if;
  select count(*) into v_expected from public.student_evaluations where session_id=p_session_id;
  select count(*) into v_reviewed from public.student_evaluations where session_id=p_session_id and reviewed_at is not null;
  if v_expected=0 then raise exception 'La evaluación no tiene preguntas.' using errcode='22023'; end if;
  if v_reviewed<v_expected then raise exception 'Completa todas las preguntas de la evaluación (% de %).',v_reviewed,v_expected using errcode='22023'; end if;
  update public.evaluation_sessions set status='completed',completed_at=now(),updated_at=now() where id=p_session_id returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.complete_initial_evaluation(p_session_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare v_session public.evaluation_sessions;
begin
  select * into v_session from public.evaluation_sessions where id=p_session_id;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.evaluation_kind<>'initial' then raise exception 'Esta operación es solo para sesiones initial heredadas.' using errcode='22023'; end if;
  return public.complete_context_evaluation(p_session_id);
end;
$$;

create or replace function public.prepare_post_class_evaluation(p_class_id bigint,p_person_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_style bigint;
  v_role bigint;
  v_level bigint;
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501'; end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then raise exception 'La revisión se realiza después de terminar la parte administrativa de la clase.' using errcode='22023'; end if;
  if v_class.pedagogy_closed_at is not null then raise exception 'La clase ya está cerrada pedagógicamente.' using errcode='22023'; end if;
  select v_class.style_term_id,cp.role_term_id,cp.level_term_id into v_style,v_role,v_level
  from public.class_participants cp where cp.class_id=p_class_id and cp.person_id=p_person_id;
  if not found or v_style is null or v_role is null or v_level is null then raise exception 'La clase no tiene estilo, rol o nivel suficiente para evaluar.' using errcode='22023'; end if;

  select * into v_session from public.evaluation_sessions s
  where s.class_id=p_class_id and s.person_id=p_person_id and s.style_term_id=v_style
    and s.role_term_id=v_role and s.level_term_id=v_level and s.evaluation_kind='class'
  order by s.id desc limit 1;
  if found then return v_session; end if;

  -- No exige baseline previa: esta revisión puede ser la primera evaluación válida.
  perform public.ensure_student_aptitude_progress(p_person_id,v_style,v_role,v_level);
  insert into public.evaluation_sessions(person_id,class_id,style_term_id,role_term_id,level_term_id,evaluation_kind,status,evaluated_by,started_at)
  values(p_person_id,p_class_id,v_style,v_role,v_level,'class','draft',(select auth.uid()),now()) returning * into v_session;
  for v_progress in select * from public.student_aptitude_progress p
    where p.person_id=p_person_id and p.style_term_id=v_style and p.role_term_id=v_role and p.level_term_id=v_level
  loop
    insert into public.student_evaluations(session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,evaluated_by,answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by)
    values(v_session.id,p_person_id,p_class_id,v_style,v_role,v_level,v_progress.aptitude_term_id,'class',v_progress.effective_score,null,(select auth.uid()),null,null,null,null,null)
    on conflict(session_id,aptitude_term_id) where session_id is not null do nothing;
    update public.student_aptitude_progress set last_evaluation_session_id=v_session.id,updated_at=now() where id=v_progress.id;
  end loop;
  return v_session;
end;
$$;

create or replace function private.require_final_evaluation_before_pedagogy_close()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_participant record;
  v_class_style_key text;
  v_other_style_key text;
  v_other_style_id bigint;
  v_has_bachata boolean;
  v_has_bachazouk boolean;
begin
  if old.pedagogy_closed_at is not null or new.pedagogy_closed_at is null then return new; end if;
  if new.administrative_finished_at is null then raise exception 'Termina primero la parte administrativa de la clase.' using errcode='22023'; end if;
  select term_key into v_class_style_key from public.catalog_terms where id=new.style_term_id and taxonomy='dance_style';

  for v_participant in select cp.person_id,cp.role_term_id,cp.level_term_id from public.class_participants cp where cp.class_id=new.id
  loop
    if v_participant.role_term_id is null or v_participant.level_term_id is null then raise exception 'Todos los participantes necesitan rol y nivel antes del cierre pedagógico.' using errcode='22023'; end if;
    if not exists(
      select 1 from public.evaluation_sessions s
      where s.class_id=new.id and s.person_id=v_participant.person_id and s.style_term_id=new.style_term_id
        and s.role_term_id=v_participant.role_term_id and s.evaluation_kind='class'
        and s.status='completed' and s.completed_at is not null
    ) then raise exception 'Completa la revisión posterior de todos los alumnos antes del cierre pedagógico.' using errcode='22023'; end if;
    if exists(
      select 1 from public.evaluation_sessions s
      where s.class_id=new.id and s.person_id=v_participant.person_id
        and s.evaluation_kind='class' and s.status<>'completed'
    ) then raise exception 'La revisión posterior de esta clase todavía no está completa.' using errcode='22023'; end if;

    if v_class_style_key in ('bachata','bachazouk') then
      select private.first_valid_evaluation_session_id(v_participant.person_id,style.id,v_participant.role_term_id) is not null
      into v_has_bachata from public.catalog_terms style where style.taxonomy='dance_style' and style.term_key='bachata' limit 1;
      select private.first_valid_evaluation_session_id(v_participant.person_id,style.id,v_participant.role_term_id) is not null
      into v_has_bachazouk from public.catalog_terms style where style.taxonomy='dance_style' and style.term_key='bachazouk' limit 1;
      if coalesce(v_has_bachata,false) and coalesce(v_has_bachazouk,false) then
        v_other_style_key:=case when v_class_style_key='bachata' then 'bachazouk' else 'bachata' end;
        select id into v_other_style_id from public.catalog_terms where taxonomy='dance_style' and term_key=v_other_style_key and active limit 1;
        if v_other_style_id is null or not exists(
          select 1 from public.evaluation_sessions s where s.class_id=new.id and s.person_id=v_participant.person_id
            and s.style_term_id=v_other_style_id and s.role_term_id=v_participant.role_term_id
            and s.evaluation_kind='class' and s.status='completed' and s.completed_at is not null
        ) then raise exception 'Este alumno tiene Bachata y Bachazouk: completa la revisión de ambos estilos antes del cierre pedagógico.' using errcode='22023'; end if;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.get_evaluation_baseline_session(bigint,bigint,bigint) from public,anon;
revoke all on function public.start_context_evaluation(bigint,bigint,bigint,bigint,bigint,text) from public,anon;
revoke all on function public.review_context_evaluation_question(bigint,bigint,bigint,text) from public,anon;
revoke all on function public.complete_context_evaluation(bigint) from public,anon;
grant execute on function public.get_evaluation_baseline_session(bigint,bigint,bigint) to authenticated;
grant execute on function public.start_context_evaluation(bigint,bigint,bigint,bigint,bigint,text) to authenticated;
grant execute on function public.review_context_evaluation_question(bigint,bigint,bigint,text) to authenticated;
grant execute on function public.complete_context_evaluation(bigint) to authenticated;

commit;
