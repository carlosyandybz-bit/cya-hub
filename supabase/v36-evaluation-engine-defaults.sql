-- CYA Hub · v36 · Punto 12R · compatibilidad inicial y reglas finales Bachazouk

-- Conserva las aptitudes existentes y convierte la antigua escala en hitos iniciales configurables.
insert into public.evaluation_milestones(style_term_id,role_term_id,level_term_id,aptitude_term_id,label,score,sort_order,version,active)
select s.id,r.id,l.id,a.id,sc.label,(sc.metadata->>'score')::smallint,sc.sort_order,1,true
from public.catalog_terms s
cross join public.catalog_terms r
join public.catalog_terms l on l.taxonomy='dance_level' and l.active
join public.evaluation_level_contexts lc on lc.style_term_id=s.id and lc.level_term_id=l.id and lc.active
cross join public.catalog_terms a
cross join public.catalog_terms sc
where s.taxonomy='dance_style' and s.active
  and r.taxonomy='dance_role' and r.active
  and a.taxonomy='aptitude' and a.active
  and sc.taxonomy='evaluation_scale' and sc.active
  and l.term_key<>'desde_cero'
  and (not (a.metadata ? 'levels') or coalesce((a.metadata->'levels') ? l.term_key,false))
on conflict(style_term_id,role_term_id,level_term_id,aptitude_term_id,version,score) do nothing;

-- Un único cuestionario inicial por aptitud reutiliza los descriptores históricos hasta que Administración los personalice.
insert into public.evaluation_questions(style_term_id,role_term_id,level_term_id,aptitude_term_id,prompt,sort_order,version,active)
select m.style_term_id,m.role_term_id,m.level_term_id,m.aptitude_term_id,'¿Qué nivel tiene en '||a.label||'?',a.sort_order,1,true
from (select distinct style_term_id,role_term_id,level_term_id,aptitude_term_id from public.evaluation_milestones where active) m
join public.catalog_terms a on a.id=m.aptitude_term_id
where not exists(select 1 from public.evaluation_questions q where q.style_term_id=m.style_term_id and q.role_term_id=m.role_term_id and q.level_term_id=m.level_term_id and q.aptitude_term_id=m.aptitude_term_id and q.version=1);

insert into public.evaluation_question_options(question_id,label,milestone_id,sort_order,active)
select q.id,m.label,m.id,m.sort_order,true
from public.evaluation_questions q
join public.evaluation_milestones m on m.style_term_id=q.style_term_id and m.role_term_id=q.role_term_id and m.level_term_id=q.level_term_id and m.aptitude_term_id=q.aptitude_term_id and m.active
where q.version=1 and not exists(select 1 from public.evaluation_question_options o where o.question_id=q.id and o.milestone_id=m.id);

-- Desde cero se inicializa a 0 utilizando las aptitudes aplicables al primer nivel posterior del estilo.
create or replace function public.initialize_zero_evaluation(p_person_id bigint,p_style_term_id bigint,p_role_term_id bigint,p_class_id bigint default null)
returns public.evaluation_sessions language plpgsql set search_path='' as $$
declare lvl bigint; next_lvl bigint; s public.evaluation_sessions; a record;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar.' using errcode='42501'; end if;
  select l.id into lvl from public.catalog_terms l join public.evaluation_level_contexts c on c.level_term_id=l.id and c.style_term_id=p_style_term_id and c.active where l.taxonomy='dance_level' and l.term_key='desde_cero' limit 1;
  if lvl is null then raise exception 'Este estilo no dispone de nivel Desde cero.' using errcode='22023'; end if;
  select c.level_term_id into next_lvl from public.evaluation_level_contexts c where c.style_term_id=p_style_term_id and c.active and c.level_term_id<>lvl order by c.sort_order,c.id limit 1;
  s:=public.start_evaluation_v3(p_person_id,p_style_term_id,p_role_term_id,lvl,'diagnostic',p_class_id);
  for a in select t.* from public.catalog_terms t join public.catalog_terms nl on nl.id=next_lvl where t.taxonomy='aptitude' and t.active and (not (t.metadata?'levels') or coalesce((t.metadata->'levels')?nl.term_key,false)) order by t.sort_order,t.id loop
    insert into public.student_evaluations(session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,evaluated_by)
    values(s.id,p_person_id,p_class_id,p_style_term_id,p_role_term_id,lvl,a.id,'diagnostic',0,'Desde cero',(select auth.uid()))
    on conflict(session_id,aptitude_term_id) where session_id is not null do update set score=0,note='Desde cero',evaluated_by=excluded.evaluated_by,updated_at=now();
    insert into public.student_evaluation_state(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,milestone_id,score,milestone_label,source_session_id,updated_by)
    values(p_person_id,p_style_term_id,p_role_term_id,lvl,a.id,null,0,'Desde cero',s.id,(select auth.uid()))
    on conflict(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id) do update set milestone_id=null,score=0,milestone_label='Desde cero',source_session_id=excluded.source_session_id,updated_by=excluded.updated_by,updated_at=now();
  end loop;
  update public.evaluation_sessions set status='completed',completed_at=now(),updated_at=now() where id=s.id returning * into s;
  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,is_primary,active)
  values(p_person_id,p_style_term_id,p_role_term_id,lvl,false,true)
  on conflict(person_id,style_term_id,role_term_id) do update set level_term_id=excluded.level_term_id,active=true,updated_at=now();
  if p_class_id is not null then
    insert into public.evaluation_review_confirmations(class_id,person_id,style_term_id,role_term_id,level_term_id,session_id,no_changes,confirmed_by)
    values(p_class_id,p_person_id,p_style_term_id,p_role_term_id,lvl,s.id,false,(select auth.uid()))
    on conflict(class_id,person_id,style_term_id,role_term_id,level_term_id) do update set session_id=excluded.session_id,no_changes=false,confirmed_by=excluded.confirmed_by,confirmed_at=now();
  end if;
  return s;
end $$;

-- Activar un complemento como principiante crea una evaluación mínima real del primer nivel disponible.
create or replace function public.resolve_complement_track(
  p_person_id bigint,p_parent_style_term_id bigint,p_role_term_id bigint,p_answer text,p_class_id bigint default null
) returns jsonb language plpgsql set search_path='' as $$
declare r public.dance_style_relations; lvl bigint; s public.evaluation_sessions; a record; m public.evaluation_milestones;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para modificar recorridos.' using errcode='42501'; end if;
  select * into r from public.dance_style_relations where parent_style_term_id=p_parent_style_term_id and active order by id limit 1;
  if r.id is null then return jsonb_build_object('active',false,'reason','no_complement'); end if;
  if p_answer='knows' then return jsonb_build_object('active',false,'needs_diagnostic',true,'style_term_id',r.complement_style_term_id); end if;
  if p_answer='wants_to_learn' then
    select c.level_term_id into lvl from public.evaluation_level_contexts c where c.style_term_id=r.complement_style_term_id and c.active order by c.sort_order,c.id limit 1;
    insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,is_primary,active)
    values(p_person_id,r.complement_style_term_id,p_role_term_id,lvl,false,true)
    on conflict(person_id,style_term_id,role_term_id) do update set level_term_id=excluded.level_term_id,active=true,updated_at=now();
    s:=public.start_evaluation_v3(p_person_id,r.complement_style_term_id,p_role_term_id,lvl,'diagnostic',p_class_id);
    for a in select distinct aptitude_term_id from public.evaluation_milestones where style_term_id=r.complement_style_term_id and role_term_id=p_role_term_id and level_term_id=lvl and active loop
      select * into m from public.evaluation_milestones where style_term_id=r.complement_style_term_id and role_term_id=p_role_term_id and level_term_id=lvl and aptitude_term_id=a.aptitude_term_id and active order by score,sort_order,id limit 1;
      insert into public.student_evaluations(session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,note,evaluated_by)
      values(s.id,p_person_id,p_class_id,r.complement_style_term_id,p_role_term_id,lvl,a.aptitude_term_id,'diagnostic',m.score,m.label,(select auth.uid()))
      on conflict(session_id,aptitude_term_id) where session_id is not null do update set score=excluded.score,note=excluded.note,evaluated_by=excluded.evaluated_by,updated_at=now();
      insert into public.student_evaluation_state(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,milestone_id,score,milestone_label,source_session_id,updated_by)
      values(p_person_id,r.complement_style_term_id,p_role_term_id,lvl,a.aptitude_term_id,m.id,m.score,m.label,s.id,(select auth.uid()))
      on conflict(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id) do update set milestone_id=excluded.milestone_id,score=excluded.score,milestone_label=excluded.milestone_label,source_session_id=excluded.source_session_id,updated_by=excluded.updated_by,updated_at=now();
    end loop;
    update public.evaluation_sessions set status='completed',completed_at=now(),updated_at=now() where id=s.id;
    if p_class_id is not null then
      insert into public.evaluation_review_confirmations(class_id,person_id,style_term_id,role_term_id,level_term_id,session_id,no_changes,confirmed_by)
      values(p_class_id,p_person_id,r.complement_style_term_id,p_role_term_id,lvl,s.id,false,(select auth.uid()))
      on conflict(class_id,person_id,style_term_id,role_term_id,level_term_id) do update set session_id=excluded.session_id,no_changes=false,confirmed_by=excluded.confirmed_by,confirmed_at=now();
    end if;
    return jsonb_build_object('active',true,'needs_diagnostic',false,'style_term_id',r.complement_style_term_id,'level_term_id',lvl);
  end if;
  return jsonb_build_object('active',false,'needs_diagnostic',false,'style_term_id',r.complement_style_term_id);
end $$;

-- Si el recorrido Bachazouk se activa por su primera explicación, debe entrar en el cierre como diagnóstico aunque aún no exista evaluación.
create or replace function public.class_evaluation_requirements(p_class_id bigint)
returns table(person_id bigint,style_term_id bigint,role_term_id bigint,level_term_id bigint,mode text,confirmed boolean)
language sql stable set search_path='' as $$
with base as (
  select cp.person_id,c.style_term_id,cp.role_term_id,cp.level_term_id
  from public.classes c join public.class_participants cp on cp.class_id=c.id where c.id=p_class_id
), expanded as (
  select b.person_id,b.style_term_id,b.role_term_id,b.level_term_id from base b
  union
  select b.person_id,dp.style_term_id,dp.role_term_id,dp.level_term_id
  from base b join public.dance_style_relations r on r.active and (r.parent_style_term_id=b.style_term_id or r.complement_style_term_id=b.style_term_id)
  join public.student_dance_profiles dp on dp.person_id=b.person_id and dp.active and dp.style_term_id=case when r.parent_style_term_id=b.style_term_id then r.complement_style_term_id else r.parent_style_term_id end and dp.role_term_id=b.role_term_id
)
select e.person_id,e.style_term_id,e.role_term_id,e.level_term_id,
  case when exists(select 1 from public.evaluation_sessions s where s.person_id=e.person_id and s.style_term_id=e.style_term_id and s.role_term_id=e.role_term_id and s.status='completed' and s.class_id is distinct from p_class_id) then 'review' else 'diagnostic' end,
  exists(select 1 from public.evaluation_review_confirmations c where c.class_id=p_class_id and c.person_id=e.person_id and c.style_term_id=e.style_term_id and c.role_term_id=e.role_term_id and c.level_term_id=e.level_term_id)
from expanded e where e.style_term_id is not null and e.role_term_id is not null and e.level_term_id is not null;
$$;
