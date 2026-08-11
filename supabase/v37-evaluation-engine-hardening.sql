-- CYA Hub · v37 · Punto 12R · hardening de permisos y flujo Desde cero

-- Desde cero usa las aptitudes aplicables a Inicio y conserva la misma escala inicial hasta que Administración la personalice.
insert into public.evaluation_milestones(style_term_id,role_term_id,level_term_id,aptitude_term_id,label,score,sort_order,version,active)
select s.id,r.id,z.id,a.id,sc.label,(sc.metadata->>'score')::smallint,sc.sort_order,1,true
from public.catalog_terms s
cross join public.catalog_terms r
join public.catalog_terms z on z.taxonomy='dance_level' and z.term_key='desde_cero' and z.active
join public.evaluation_level_contexts lc on lc.style_term_id=s.id and lc.level_term_id=z.id and lc.active
cross join public.catalog_terms a
cross join public.catalog_terms sc
where s.taxonomy='dance_style' and s.active
  and r.taxonomy='dance_role' and r.active
  and a.taxonomy='aptitude' and a.active
  and sc.taxonomy='evaluation_scale' and sc.active
  and (not (a.metadata ? 'levels') or coalesce((a.metadata->'levels') ? 'inicio',false))
on conflict(style_term_id,role_term_id,level_term_id,aptitude_term_id,version,score) do nothing;

insert into public.evaluation_questions(style_term_id,role_term_id,level_term_id,aptitude_term_id,prompt,sort_order,version,active)
select m.style_term_id,m.role_term_id,m.level_term_id,m.aptitude_term_id,'¿Qué nivel tiene en '||a.label||'?',a.sort_order,1,true
from (select distinct style_term_id,role_term_id,level_term_id,aptitude_term_id from public.evaluation_milestones m join public.catalog_terms l on l.id=m.level_term_id where l.term_key='desde_cero' and m.active) m
join public.catalog_terms a on a.id=m.aptitude_term_id
where not exists(select 1 from public.evaluation_questions q where q.style_term_id=m.style_term_id and q.role_term_id=m.role_term_id and q.level_term_id=m.level_term_id and q.aptitude_term_id=m.aptitude_term_id and q.version=1);

insert into public.evaluation_question_options(question_id,label,milestone_id,sort_order,active)
select q.id,m.label,m.id,m.sort_order,true
from public.evaluation_questions q
join public.catalog_terms l on l.id=q.level_term_id and l.term_key='desde_cero'
join public.evaluation_milestones m on m.style_term_id=q.style_term_id and m.role_term_id=q.role_term_id and m.level_term_id=q.level_term_id and m.aptitude_term_id=q.aptitude_term_id and m.active
where q.version=1 and not exists(select 1 from public.evaluation_question_options o where o.question_id=q.id and o.milestone_id=m.id);

-- Completar un diagnóstico hecho dentro de una clase satisface la obligación de evaluación de esa clase.
create or replace function public.complete_evaluation_v3(p_session_id bigint)
returns public.evaluation_sessions language plpgsql set search_path='' as $$
declare s public.evaluation_sessions; needed int; answered int;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cerrar evaluaciones.' using errcode='42501'; end if;
  select * into s from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if s.status='completed' then return s; end if;
  if s.evaluation_kind in ('diagnostic','promotion') then
    select count(*) into needed from public.evaluation_questions q where q.style_term_id=s.style_term_id and q.role_term_id=s.role_term_id and q.level_term_id=s.level_term_id and q.active;
    select count(*) into answered from public.evaluation_answers a join public.evaluation_questions q on q.id=a.question_id where a.session_id=s.id and q.active;
    if needed>0 and answered<needed then raise exception 'Completa todas las preguntas de la evaluación inicial.' using errcode='22023'; end if;
  end if;
  update public.evaluation_sessions set status='completed',completed_at=now(),updated_at=now() where id=s.id returning * into s;
  if s.class_id is not null and s.evaluation_kind in ('diagnostic','promotion') then
    insert into public.evaluation_review_confirmations(class_id,person_id,style_term_id,role_term_id,level_term_id,session_id,no_changes,confirmed_by)
    values(s.class_id,s.person_id,s.style_term_id,s.role_term_id,s.level_term_id,s.id,false,(select auth.uid()))
    on conflict(class_id,person_id,style_term_id,role_term_id,level_term_id) do update set session_id=excluded.session_id,no_changes=false,confirmed_by=excluded.confirmed_by,confirmed_at=now();
  end if;
  return s;
end $$;

-- Configuración pedagógica: lectura para profesores, escritura solo para administración.
do $$
declare t text;
begin
  foreach t in array array['evaluation_level_contexts','dance_style_relations','evaluation_milestones','evaluation_questions','evaluation_question_options','required_level_explanations'] loop
    execute format('drop policy if exists %I_staff_all on public.%I',t,t);
    execute format('drop policy if exists %I_staff_select on public.%I',t,t);
    execute format('drop policy if exists %I_admin_insert on public.%I',t,t);
    execute format('drop policy if exists %I_admin_update on public.%I',t,t);
    execute format('drop policy if exists %I_admin_delete on public.%I',t,t);
    execute format('create policy %I_staff_select on public.%I for select to authenticated using ((select private.is_staff()))',t,t);
    execute format('create policy %I_admin_insert on public.%I for insert to authenticated with check ((select private.is_admin()))',t,t);
    execute format('create policy %I_admin_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',t,t);
    execute format('create policy %I_admin_delete on public.%I for delete to authenticated using ((select private.is_admin()))',t,t);
  end loop;
end $$;
