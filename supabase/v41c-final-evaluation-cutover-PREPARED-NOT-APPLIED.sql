-- CYA Hub · v41c · CUTOVER FINAL DE EVALUACIÓN
-- ESTADO: PREPARADA, NO APLICAR HASTA VERIFICAR QUE PRODUCCIÓN SIRVE EL FRONTEND v41.
--
-- Este archivo es deliberadamente incompatible con la interfaz antigua.
-- Cuando se aplique:
-- 1) desaparecen las RPC de puntuación numérica heredadas;
-- 2) una evaluación inicial nueva solo puede haberse completado durante clase;
-- 3) el cierre pedagógico exige la revisión correspondiente de cada participante;
-- 4) si el alumno ya tiene Bachata+Bachazouk para el mismo rol, exige ambas;
-- 5) se elimina cualquier autocompletado legado de sesiones.

-- -----------------------------------------------------------------------------
-- A. Retirar superficies numéricas heredadas.
-- -----------------------------------------------------------------------------
revoke all on function public.save_class_evaluation(bigint,bigint,bigint,smallint)
  from public,anon,authenticated;
revoke all on function public.save_class_evaluation_v2(bigint,bigint,bigint,bigint,smallint)
  from public,anon,authenticated;
revoke all on function public.save_evaluation_score(bigint,bigint,smallint,text)
  from public,anon,authenticated;
revoke all on function public.start_student_evaluation(bigint,bigint,text,bigint,bigint,bigint,text)
  from public,anon,authenticated;
revoke all on function public.complete_evaluation_session(bigint)
  from public,anon,authenticated;
revoke all on function public.decide_evaluation_milestone(bigint,bigint,text,bigint,text)
  from public,anon,authenticated;

-- El modelo antiguo cerraba borradores al cerrar pedagógicamente la clase.
-- Eso invalida la revisión explícita del profesor.
drop trigger if exists trg_complete_class_evaluation_sessions on public.classes;

-- -----------------------------------------------------------------------------
-- B. El singular deja de fabricar una evaluación inicial después de clase.
--    Si la evaluación inicial ya se completó DURANTE esta clase, se reutiliza.
-- -----------------------------------------------------------------------------
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
  v_progress public.student_aptitude_progress;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501';
  end if;

  select * into v_class
  from public.classes
  where id=p_class_id
  for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then
    raise exception 'La revisión se realiza después de terminar la parte administrativa de la clase.' using errcode='22023';
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

  -- Si la evaluación inicial de esta misma clase fue completada durante la clase,
  -- constituye la evaluación de esa primera clase y no se duplica postclase.
  select * into v_session
  from public.evaluation_sessions s
  where s.class_id=p_class_id
    and s.person_id=p_person_id
    and s.style_term_id=v_style
    and s.role_term_id=v_role
    and s.level_term_id=v_level
  order by s.id desc
  limit 1;

  if found then
    if v_session.evaluation_kind='initial' and v_session.status<>'completed' then
      raise exception 'La evaluación inicial no se completó durante la clase. Requiere intervención administrativa antes de cerrar.' using errcode='22023';
    end if;
    return v_session;
  end if;

  -- Sin evaluación previa completada ya no existe fallback postclase.
  if not exists(
    select 1
    from public.evaluation_sessions s
    where s.person_id=p_person_id
      and s.style_term_id=v_style
      and s.role_term_id=v_role
      and s.status='completed'
  ) then
    raise exception 'Falta la evaluación inicial guiada. Debe realizarse durante una clase activa antes de usar la revisión postclase.' using errcode='22023';
  end if;

  if v_style_key='bachazouk'
     and not private.initial_evaluation_is_complete(p_person_id,'bachata',v_role) then
    raise exception 'Completa primero toda la evaluación inicial de Bachata antes de revisar Bachazouk.' using errcode='22023';
  end if;

  perform public.ensure_student_aptitude_progress(p_person_id,v_style,v_role,v_level);

  insert into public.evaluation_sessions(
    person_id,class_id,style_term_id,role_term_id,level_term_id,
    evaluation_kind,status,evaluated_by,started_at
  )
  values(
    p_person_id,p_class_id,v_style,v_role,v_level,
    'class','draft',(select auth.uid()),now()
  )
  returning * into v_session;

  for v_progress in
    select *
    from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=v_style
      and p.role_term_id=v_role
      and p.level_term_id=v_level
  loop
    insert into public.student_evaluations(
      session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,evaluation_kind,score,note,evaluated_by,
      answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
    )
    values(
      v_session.id,p_person_id,p_class_id,v_style,v_role,v_level,
      v_progress.aptitude_term_id,'class',v_progress.effective_score,
      null,(select auth.uid()),null,null,null,null,null
    );

    update public.student_aptitude_progress
    set last_evaluation_session_id=v_session.id,updated_at=now()
    where id=v_progress.id;
  end loop;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- C. Guard de cierre pedagógico, incluida la revisión dual.
-- -----------------------------------------------------------------------------
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
  if old.pedagogy_closed_at is not null or new.pedagogy_closed_at is null then
    return new;
  end if;

  if new.administrative_finished_at is null then
    raise exception 'Termina primero la parte administrativa de la clase.' using errcode='22023';
  end if;

  select term_key into v_class_style_key
  from public.catalog_terms
  where id=new.style_term_id and taxonomy='dance_style';

  for v_participant in
    select cp.person_id,cp.role_term_id,cp.level_term_id
    from public.class_participants cp
    where cp.class_id=new.id
  loop
    if v_participant.role_term_id is null or v_participant.level_term_id is null then
      raise exception 'Todos los participantes necesitan rol y nivel antes del cierre pedagógico.' using errcode='22023';
    end if;

    -- Siempre exige la evaluación/revisión del contexto principal de la clase.
    if not exists(
      select 1
      from public.evaluation_sessions s
      where s.class_id=new.id
        and s.person_id=v_participant.person_id
        and s.style_term_id=new.style_term_id
        and s.role_term_id=v_participant.role_term_id
        and s.status='completed'
    ) then
      raise exception 'Completa la evaluación de todos los alumnos antes del cierre pedagógico.' using errcode='22023';
    end if;

    -- Cualquier sesión borrador ligada a la clase es una revisión inconclusa.
    if exists(
      select 1
      from public.evaluation_sessions s
      where s.class_id=new.id
        and s.person_id=v_participant.person_id
        and s.status<>'completed'
    ) then
      raise exception 'Hay una evaluación de esta clase todavía sin completar.' using errcode='22023';
    end if;

    if v_class_style_key in ('bachata','bachazouk') then
      select exists(
        select 1
        from public.evaluation_sessions s
        join public.catalog_terms style on style.id=s.style_term_id
        where s.person_id=v_participant.person_id
          and s.role_term_id=v_participant.role_term_id
          and s.status='completed'
          and style.term_key='bachata'
      ) into v_has_bachata;

      select exists(
        select 1
        from public.evaluation_sessions s
        join public.catalog_terms style on style.id=s.style_term_id
        where s.person_id=v_participant.person_id
          and s.role_term_id=v_participant.role_term_id
          and s.status='completed'
          and style.term_key='bachazouk'
      ) into v_has_bachazouk;

      if v_has_bachata and v_has_bachazouk then
        v_other_style_key:=case
          when v_class_style_key='bachata' then 'bachazouk'
          else 'bachata'
        end;

        select id into v_other_style_id
        from public.catalog_terms
        where taxonomy='dance_style' and term_key=v_other_style_key and active
        limit 1;

        if v_other_style_id is null or not exists(
          select 1
          from public.evaluation_sessions s
          where s.class_id=new.id
            and s.person_id=v_participant.person_id
            and s.style_term_id=v_other_style_id
            and s.role_term_id=v_participant.role_term_id
            and s.status='completed'
        ) then
          raise exception 'Este alumno tiene Bachata y Bachazouk: completa la revisión de ambos estilos antes del cierre pedagógico.' using errcode='22023';
        end if;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_require_post_class_evaluation on public.classes;
drop trigger if exists trg_require_final_evaluation on public.classes;
create trigger trg_require_final_evaluation
before update of pedagogy_closed_at on public.classes
for each row execute function private.require_final_evaluation_before_pedagogy_close();

-- -----------------------------------------------------------------------------
-- D. Mantener exclusivamente la superficie final.
-- -----------------------------------------------------------------------------
grant execute on function public.start_initial_evaluation(bigint,bigint) to authenticated;
grant execute on function public.review_evaluation_question(bigint,bigint,bigint,bigint,text) to authenticated;
grant execute on function public.complete_initial_evaluation(bigint) to authenticated;
grant execute on function public.prepare_post_class_evaluation(bigint,bigint) to authenticated;
grant execute on function public.prepare_post_class_evaluations(bigint,bigint) to authenticated;
grant execute on function public.complete_post_class_evaluation(bigint) to authenticated;
