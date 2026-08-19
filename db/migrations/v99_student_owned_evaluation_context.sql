-- Evaluations belong to the student. class_id is optional provenance only.

create or replace function public.start_student_evaluation(
  p_person_id bigint,
  p_level_term_id bigint,
  p_evaluation_kind text,
  p_style_term_id bigint default null,
  p_role_term_id bigint default null,
  p_class_id bigint default null,
  p_note text default null
) returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
declare
  v_session public.evaluation_sessions;
  v_style bigint:=p_style_term_id;
  v_role bigint:=p_role_term_id;
  v_class_style bigint;
  v_class_role bigint;
  v_kind text:=p_evaluation_kind;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501'; end if;
  if v_kind not in ('initial','class','manual','reevaluation') then raise exception 'Tipo de evaluación no válido.' using errcode='22023'; end if;
  if not exists(select 1 from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=p_person_id and sp.active and p.active) then raise exception 'El alumno no está disponible.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Selecciona un nivel válido.' using errcode='22023'; end if;

  if p_class_id is not null then
    select c.style_term_id,cp.role_term_id into v_class_style,v_class_role
    from public.classes c join public.class_participants cp on cp.class_id=c.id
    where c.id=p_class_id and cp.person_id=p_person_id;
    if not found then raise exception 'El alumno no pertenece a la clase indicada.' using errcode='22023'; end if;
    if v_style is not null and v_class_style is not null and v_style<>v_class_style then raise exception 'El estilo no coincide con el contexto de la clase.' using errcode='22023'; end if;
    if v_role is not null and v_class_role is not null and v_role<>v_class_role then raise exception 'El rol no coincide con el contexto de la clase.' using errcode='22023'; end if;
    v_style:=coalesce(v_style,v_class_style);
    v_role:=coalesce(v_role,v_class_role);
  end if;

  if v_style is null or not exists(select 1 from public.catalog_terms where id=v_style and taxonomy='dance_style' and active) then raise exception 'Selecciona un estilo válido.' using errcode='22023'; end if;
  if v_role is null or not exists(select 1 from public.catalog_terms where id=v_role and taxonomy='dance_role' and active) then raise exception 'Selecciona un rol válido.' using errcode='22023'; end if;

  -- Legacy "class" means capture provenance, not ownership.
  if v_kind='class' then
    v_kind:=case when exists(
      select 1 from public.evaluation_sessions s
      where s.person_id=p_person_id and s.style_term_id=v_style and s.role_term_id=v_role and s.status='completed'
    ) then 'reevaluation' else 'manual' end;
  end if;

  -- Resume a student-owned draft regardless of where it was started.
  select * into v_session
  from public.evaluation_sessions s
  where s.person_id=p_person_id
    and s.style_term_id=v_style
    and s.role_term_id=v_role
    and s.level_term_id=p_level_term_id
    and s.status='draft'
  order by s.started_at asc,s.id asc
  limit 1
  for update;
  if found then return v_session; end if;

  if v_kind='initial' and exists(select 1 from public.evaluation_sessions where person_id=p_person_id and style_term_id=v_style and role_term_id=v_role and status='completed') then
    v_kind:='reevaluation';
  end if;

  insert into public.evaluation_sessions(person_id,class_id,style_term_id,role_term_id,level_term_id,evaluation_kind,status,note,evaluated_by)
  values(p_person_id,p_class_id,v_style,v_role,p_level_term_id,v_kind,'draft',nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()))
  returning * into v_session;
  return v_session;
end
$function$;

create or replace function public.complete_post_class_evaluation(p_session_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
begin
  -- Backwards-compatible alias. Completion no longer depends on class lifecycle.
  return public.complete_context_evaluation(p_session_id);
end
$function$;

create or replace function public.prepare_post_class_evaluation(p_class_id bigint,p_person_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
declare
  v_style bigint;
  v_role bigint;
  v_level bigint;
  v_session public.evaluation_sessions;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501'; end if;
  select c.style_term_id,cp.role_term_id,cp.level_term_id into v_style,v_role,v_level
  from public.classes c join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=p_person_id;
  if not found or v_style is null or v_role is null or v_level is null then raise exception 'La clase no tiene estilo, rol o nivel suficiente para evaluar.' using errcode='22023'; end if;

  select * into v_session from public.evaluation_sessions s
  where s.person_id=p_person_id and s.style_term_id=v_style and s.role_term_id=v_role and s.level_term_id=v_level and s.status='draft'
  order by s.started_at asc,s.id asc limit 1;
  if found then return v_session; end if;

  return public.start_student_evaluation(p_person_id,v_level,'class',v_style,v_role,p_class_id,'Acceso rápido desde clase #'||p_class_id);
end
$function$;

comment on column public.evaluation_sessions.class_id is 'Optional provenance: class context from which the student-owned evaluation was captured. Never the owner of the evaluation.';
comment on column public.student_evaluations.class_id is 'Optional provenance of the observation. Evaluation data belongs to person_id; class_id must not be used to scope student evaluation history.';
