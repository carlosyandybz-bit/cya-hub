-- CYA Hub · v41b · revisión dual Bachata + Bachazouk
--
-- Regla final:
-- si una persona ya tiene evaluaciones completadas de Bachata Y Bachazouk para
-- el mismo rol, cerrar una clase de cualquiera de esos estilos prepara revisión
-- de ambos contextos. Cada estilo conserva su nivel independiente.

create or replace function private.ensure_post_class_review_session(
  p_class_id bigint,
  p_person_id bigint,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint
)
returns public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_session public.evaluation_sessions;
  v_progress public.student_aptitude_progress;
begin
  perform public.ensure_student_aptitude_progress(
    p_person_id,p_style_term_id,p_role_term_id,p_level_term_id
  );

  select * into v_session
  from public.evaluation_sessions s
  where s.class_id=p_class_id
    and s.person_id=p_person_id
    and s.style_term_id=p_style_term_id
    and s.role_term_id=p_role_term_id
    and s.level_term_id=p_level_term_id
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
$$;

create or replace function public.prepare_post_class_evaluations(
  p_class_id bigint,
  p_person_id bigint
)
returns setof public.evaluation_sessions
language plpgsql
set search_path=''
as $$
declare
  v_class public.classes;
  v_primary_session public.evaluation_sessions;
  v_class_style_key text;
  v_role bigint;
  v_primary_level bigint;
  v_other_style_id bigint;
  v_other_style_key text;
  v_other_level bigint;
  v_has_bachata boolean:=false;
  v_has_bachazouk boolean:=false;
  v_other_session public.evaluation_sessions;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para preparar evaluaciones.' using errcode='42501';
  end if;

  select c.* into v_class
  from public.classes c
  where c.id=p_class_id
  for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then
    raise exception 'La revisión se prepara después de terminar la parte administrativa.' using errcode='22023';
  end if;
  if v_class.pedagogy_closed_at is not null then
    raise exception 'La clase ya está cerrada pedagógicamente.' using errcode='22023';
  end if;

  select style.term_key,cp.role_term_id,cp.level_term_id
  into v_class_style_key,v_role,v_primary_level
  from public.class_participants cp
  left join public.catalog_terms style
    on style.id=v_class.style_term_id and style.taxonomy='dance_style'
  where cp.class_id=p_class_id and cp.person_id=p_person_id;

  if not found or v_class.style_term_id is null or v_class_style_key is null
     or v_role is null or v_primary_level is null then
    raise exception 'La clase no tiene estilo, rol o nivel suficiente para evaluar.' using errcode='22023';
  end if;

  -- La sesión principal conserva exactamente la lógica compatible ya existente.
  v_primary_session:=public.prepare_post_class_evaluation(p_class_id,p_person_id);
  return next v_primary_session;

  if v_class_style_key not in ('bachata','bachazouk') then
    return;
  end if;

  select exists(
    select 1
    from public.evaluation_sessions s
    join public.catalog_terms style on style.id=s.style_term_id
    where s.person_id=p_person_id
      and s.role_term_id=v_role
      and s.status='completed'
      and style.term_key='bachata'
  ) into v_has_bachata;

  select exists(
    select 1
    from public.evaluation_sessions s
    join public.catalog_terms style on style.id=s.style_term_id
    where s.person_id=p_person_id
      and s.role_term_id=v_role
      and s.status='completed'
      and style.term_key='bachazouk'
  ) into v_has_bachazouk;

  if not (v_has_bachata and v_has_bachazouk) then
    return;
  end if;

  v_other_style_key:=case
    when v_class_style_key='bachata' then 'bachazouk'
    else 'bachata'
  end;

  select id into v_other_style_id
  from public.catalog_terms
  where taxonomy='dance_style' and term_key=v_other_style_key and active
  limit 1;

  if v_other_style_id is null then
    raise exception 'No está configurado el estilo complementario %.',v_other_style_key using errcode='22023';
  end if;

  -- Fuente preferente: perfil actual de ese estilo+rol.
  select dp.level_term_id into v_other_level
  from public.student_dance_profiles dp
  where dp.person_id=p_person_id
    and dp.style_term_id=v_other_style_id
    and dp.role_term_id=v_role
    and dp.active
    and dp.level_term_id is not null
  limit 1;

  -- Fallback seguro: el nivel de la evaluación completada más reciente del
  -- estilo complementario. Nunca copiar el nivel de la clase actual.
  if v_other_level is null then
    select s.level_term_id into v_other_level
    from public.evaluation_sessions s
    where s.person_id=p_person_id
      and s.style_term_id=v_other_style_id
      and s.role_term_id=v_role
      and s.status='completed'
    order by s.completed_at desc nulls last,s.id desc
    limit 1;
  end if;

  if v_other_level is null then
    raise exception 'Bachata y Bachazouk deben conservar niveles independientes; falta el nivel del estilo complementario.' using errcode='22023';
  end if;

  v_other_session:=private.ensure_post_class_review_session(
    p_class_id,p_person_id,v_other_style_id,v_role,v_other_level
  );
  return next v_other_session;
end;
$$;

revoke all on function public.prepare_post_class_evaluations(bigint,bigint) from public,anon;
grant execute on function public.prepare_post_class_evaluations(bigint,bigint) to authenticated;
