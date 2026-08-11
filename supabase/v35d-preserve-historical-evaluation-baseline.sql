-- CYA Hub · v35d · compatibilidad histórica del motor de progreso
--
-- Regla:
-- - alumno/contexto realmente nuevo => aptitudes en 0;
-- - si ya existe historial de evaluación, el nuevo motor continúa desde el último
--   valor histórico de cada aptitud en vez de provocar una caída falsa a cero.

create or replace function public.ensure_student_aptitude_progress(
  p_person_id bigint,p_style_term_id bigint,p_role_term_id bigint,p_level_term_id bigint
) returns setof public.student_aptitude_progress
language plpgsql set search_path='' as $$
declare
  v_style_key text;
  v_role_key text;
  v_level_key text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para preparar evaluaciones.' using errcode='42501';
  end if;
  if not exists(
    select 1
    from public.student_profiles sp
    join public.people p on p.id=sp.person_id
    where sp.person_id=p_person_id and sp.active and p.active
  ) then
    raise exception 'El alumno no está disponible.' using errcode='22023';
  end if;

  select term_key into v_style_key from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active;
  select term_key into v_role_key from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active;
  select term_key into v_level_key from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active;
  if v_style_key is null or v_role_key is null or v_level_key is null then
    raise exception 'Falta contexto válido de estilo, rol o nivel.' using errcode='22023';
  end if;

  insert into public.student_aptitude_progress(
    person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,raw_score,effective_score
  )
  select
    p_person_id,p_style_term_id,p_role_term_id,p_level_term_id,a.id,
    coalesce(seed.score,0)::smallint,
    coalesce(seed.score,0)::smallint
  from public.catalog_terms a
  left join lateral (
    select se.score::smallint as score
    from public.student_evaluations se
    left join public.evaluation_sessions s on s.id=se.session_id
    where se.person_id=p_person_id
      and se.style_term_id=p_style_term_id
      and se.role_term_id=p_role_term_id
      and se.level_term_id=p_level_term_id
      and se.aptitude_term_id=a.id
      and (se.session_id is null or s.status='completed')
    order by coalesce(s.completed_at,se.created_at) desc,se.id desc
    limit 1
  ) seed on true
  where a.taxonomy='aptitude' and a.active
    and (not (a.metadata ? 'styles') or coalesce((a.metadata->'styles') ? v_style_key,false))
    and (not (a.metadata ? 'roles') or coalesce((a.metadata->'roles') ? v_role_key,false))
    and (not (a.metadata ? 'levels') or coalesce((a.metadata->'levels') ? v_level_key,false))
  on conflict(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id) do nothing;

  return query
    select p.*
    from public.student_aptitude_progress p
    where p.person_id=p_person_id
      and p.style_term_id=p_style_term_id
      and p.role_term_id=p_role_term_id
      and p.level_term_id=p_level_term_id
    order by p.aptitude_term_id;
end $$;

-- Reparación conservadora por si alguna fila se hubiera creado en la breve ventana
-- entre v35 y esta migración. Solo toca filas a cero sin premios ni decisiones.
with latest as (
  select distinct on (
    se.person_id,se.style_term_id,se.role_term_id,se.level_term_id,se.aptitude_term_id
  )
    se.person_id,se.style_term_id,se.role_term_id,se.level_term_id,se.aptitude_term_id,
    se.score::smallint as score
  from public.student_evaluations se
  left join public.evaluation_sessions s on s.id=se.session_id
  where (se.session_id is null or s.status='completed')
  order by
    se.person_id,se.style_term_id,se.role_term_id,se.level_term_id,se.aptitude_term_id,
    coalesce(s.completed_at,se.created_at) desc,se.id desc
)
update public.student_aptitude_progress p
set raw_score=l.score,effective_score=l.score,updated_at=now()
from latest l
where p.person_id=l.person_id
  and p.style_term_id=l.style_term_id
  and p.role_term_id=l.role_term_id
  and p.level_term_id=l.level_term_id
  and p.aptitude_term_id=l.aptitude_term_id
  and p.raw_score=0 and p.effective_score=0
  and l.score>0
  and not exists(select 1 from public.evaluation_progress_awards a where a.progress_id=p.id)
  and not exists(select 1 from public.evaluation_milestone_decisions d where d.progress_id=p.id);

revoke all on function public.ensure_student_aptitude_progress(bigint,bigint,bigint,bigint) from public,anon;
grant execute on function public.ensure_student_aptitude_progress(bigint,bigint,bigint,bigint) to authenticated;
