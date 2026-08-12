begin;

create or replace function public.prepare_post_class_evaluation(p_class_id bigint, p_person_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
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

  if not found then
    raise exception 'La clase no existe.' using errcode='P0002';
  end if;

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

  /* An initial session is a prerequisite, never the post-class review itself. */
  select * into v_session
  from public.evaluation_sessions s
  where s.class_id=p_class_id
    and s.person_id=p_person_id
    and s.style_term_id=v_style
    and s.role_term_id=v_role
    and s.level_term_id=v_level
    and s.evaluation_kind='class'
  order by s.id desc
  limit 1;

  if found then
    return v_session;
  end if;

  if exists(
    select 1
    from public.evaluation_sessions s
    where s.class_id=p_class_id
      and s.person_id=p_person_id
      and s.style_term_id=v_style
      and s.role_term_id=v_role
      and s.level_term_id=v_level
      and s.evaluation_kind='initial'
      and s.status<>'completed'
  ) then
    raise exception 'La evaluación inicial no se completó durante la clase. Requiere intervención administrativa antes de cerrar.' using errcode='22023';
  end if;

  if not exists(
    select 1
    from public.evaluation_sessions s
    where s.person_id=p_person_id
      and s.style_term_id=v_style
      and s.role_term_id=v_role
      and s.evaluation_kind='initial'
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
    )
    on conflict(session_id,aptitude_term_id) where session_id is not null do nothing;

    update public.student_aptitude_progress
    set last_evaluation_session_id=v_session.id,updated_at=now()
    where id=v_progress.id;
  end loop;

  return v_session;
end;
$function$;

create or replace function private.ensure_post_class_review_session(
  p_class_id bigint,
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint
)
returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
begin
  perform public.ensure_student_aptitude_progress(p_person_id,p_style_term_id,p_role_term_id,p_level_term_id);

  select * into v_session
  from public.evaluation_sessions s
  where s.class_id=p_class_id
    and s.person_id=p_person_id
    and s.style_term_id=p_style_term_id
    and s.role_term_id=p_role_term_id
    and s.level_term_id=p_level_term_id
    and s.evaluation_kind='class'
  order by s.id desc
  limit 1;

  if not found then
    insert into public.evaluation_sessions(
      person_id,class_id,style_term_id,role_term_id,level_term_id,
      evaluation_kind,status,evaluated_by,started_at
    )
    values(
      p_person_id,p_class_id,p_style_term_id,p_role_term_id,p_level_term_id,
      'class','draft',(select auth.uid()),now()
    )
    returning * into v_session;
  end if;

  if v_session.status='completed' then
    return v_session;
  end if;

  for v_progress in
    select *
    from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=p_style_term_id
      and p.role_term_id=p_role_term_id
      and p.level_term_id=p_level_term_id
  loop
    insert into public.student_evaluations(
      session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,evaluation_kind,score,note,evaluated_by,
      answer_scale_term_id,descriptor_id,answer_label,reviewed_at,reviewed_by
    )
    values(
      v_session.id,p_person_id,p_class_id,p_style_term_id,p_role_term_id,p_level_term_id,
      v_progress.aptitude_term_id,'class',v_progress.effective_score,null,
      (select auth.uid()),null,null,null,null,null
    )
    on conflict(session_id,aptitude_term_id) where session_id is not null do nothing;

    update public.student_aptitude_progress
    set last_evaluation_session_id=v_session.id,updated_at=now()
    where id=v_progress.id;
  end loop;

  return v_session;
end;
$function$;

commit;
