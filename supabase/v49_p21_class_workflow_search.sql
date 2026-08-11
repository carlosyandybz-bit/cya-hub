-- CYA Hub · v49 · P21.1 DAR CLASE definitivo
-- Compatible cutover: same search RPC signature/shape + workflow_stage consistency.

begin;

create or replace function public.search_class_teaching_content(
  p_class_id bigint,
  p_person_id bigint,
  p_query text default '',
  p_content_type text default null,
  p_limit integer default 30
)
returns table(
  content_id bigint,
  title text,
  content_type text,
  description text,
  correction_guidance text,
  completion_status text,
  publication_status text,
  visibility text,
  measurement_mode text,
  ready boolean
)
language plpgsql
stable
set search_path=''
as $$
declare
  v_style_id bigint;
  v_role_id bigint;
  v_level_id bigint;
  v_query text;
  v_limit integer;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para buscar contenido de clase.' using errcode='42501';
  end if;
  if p_content_type is not null and p_content_type not in ('correction','explanation','exercise','sequence') then
    raise exception 'Tipo de contenido no válido.' using errcode='22023';
  end if;
  if length(coalesce(p_query,'')) > 120 then
    raise exception 'La búsqueda es demasiado larga.' using errcode='22023';
  end if;

  v_limit := greatest(1,least(coalesce(p_limit,30),50));
  v_query := lower(btrim(coalesce(p_query,'')));

  select c.style_term_id,cp.role_term_id,cp.level_term_id
    into v_style_id,v_role_id,v_level_id
  from public.classes c
  join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id
    and cp.person_id=p_person_id
    and c.status in ('active','finished')
    and c.pedagogy_closed_at is null
    and (c.status='active' or c.administrative_finished_at is not null);

  if not found then
    raise exception 'El alumno no pertenece a una clase abierta para edición pedagógica.' using errcode='22023';
  end if;
  if v_style_id is null or v_role_id is null or v_level_id is null then
    raise exception 'Falta estilo, rol o nivel para buscar contenido compatible.' using errcode='22023';
  end if;

  return query
  select
    t.id,
    t.title,
    t.content_type,
    t.description,
    t.correction_guidance,
    t.completion_status,
    t.publication_status,
    t.visibility,
    t.measurement_mode,
    (t.completion_status='complete' and t.publication_status='published') as ready
  from public.teaching_contents t
  where t.active
    and (p_content_type is null or t.content_type=p_content_type)
    and exists (select 1 from public.teaching_content_styles s where s.content_id=t.id and s.style_term_id=v_style_id)
    and exists (select 1 from public.teaching_content_roles r where r.content_id=t.id and r.role_term_id=v_role_id)
    and exists (select 1 from public.teaching_content_levels l where l.content_id=t.id and l.level_term_id=v_level_id)
    and (
      v_query=''
      or strpos(lower(t.title),v_query)>0
      or strpos(lower(coalesce(t.description,'')),v_query)>0
      or strpos(lower(coalesce(t.correction_guidance,'')),v_query)>0
      or exists (
        select 1 from public.teaching_content_tags tag
        where tag.content_id=t.id and strpos(lower(tag.tag),v_query)>0
      )
      or exists (
        select 1 from public.catalog_terms category
        where category.id=t.category_term_id
          and (strpos(lower(category.label),v_query)>0 or strpos(lower(category.term_key),v_query)>0)
      )
      or exists (
        select 1
        from public.teaching_content_relations rel
        join public.teaching_contents related
          on related.id=case when rel.source_content_id=t.id then rel.target_content_id else rel.source_content_id end
        where (rel.source_content_id=t.id or rel.target_content_id=t.id)
          and (
            strpos(lower(rel.relation_type),v_query)>0
            or strpos(lower(related.title),v_query)>0
            or strpos(lower(coalesce(related.description,'')),v_query)>0
            or exists (
              select 1 from public.teaching_content_tags related_tag
              where related_tag.content_id=related.id and strpos(lower(related_tag.tag),v_query)>0
            )
          )
      )
    )
  order by
    case
      when t.content_type='correction' and exists (
        select 1 from public.student_content_assignments a
        where a.person_id=p_person_id and a.content_id=t.id and a.assignment_status='pending'
      ) then 0
      when exists (
        select 1 from public.student_content_assignments a
        where a.person_id=p_person_id and a.content_id=t.id
      ) then 1
      when t.content_type='exercise' and exists (
        select 1 from public.class_content_events e
        where e.class_id=p_class_id and e.person_id=p_person_id and e.content_id=t.id
          and e.event_type like 'exercise_%'
      ) then 1
      when exists (
        select 1
        from public.teaching_content_relations rel
        where
          (rel.source_content_id=t.id and (
            exists(select 1 from public.student_content_assignments a where a.person_id=p_person_id and a.content_id=rel.target_content_id)
            or exists(select 1 from public.class_content_events e where e.class_id=p_class_id and e.person_id=p_person_id and e.content_id=rel.target_content_id)
          ))
          or
          (rel.target_content_id=t.id and (
            exists(select 1 from public.student_content_assignments a where a.person_id=p_person_id and a.content_id=rel.source_content_id)
            or exists(select 1 from public.class_content_events e where e.class_id=p_class_id and e.person_id=p_person_id and e.content_id=rel.source_content_id)
          ))
      ) then 2
      when t.completion_status='complete' and t.publication_status='published' then 3
      else 4
    end,
    case
      when v_query<>'' and lower(t.title)=v_query then 0
      when v_query<>'' and left(lower(t.title),length(v_query))=v_query then 1
      else 2
    end,
    t.updated_at desc,
    t.id desc
  limit v_limit;
end;
$$;

create or replace function private.sync_class_workflow_stage_p21()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  -- Scheduled classes keep their explicit data/prepare stage.
  if new.pedagogy_closed_at is not null then
    new.workflow_stage := 'closed';
  elsif new.status='finished' and new.administrative_finished_at is not null then
    new.workflow_stage := 'administrative';
  elsif new.status='active' then
    new.workflow_stage := 'live';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_class_workflow_stage_p21 on public.classes;
create trigger trg_sync_class_workflow_stage_p21
before insert or update of status,administrative_finished_at,pedagogy_closed_at,workflow_stage
on public.classes
for each row execute function private.sync_class_workflow_stage_p21();

-- Reconcile only states whose operational meaning is unequivocal.
update public.classes set workflow_stage='closed'
where pedagogy_closed_at is not null and workflow_stage is distinct from 'closed';

update public.classes set workflow_stage='administrative'
where status='finished' and administrative_finished_at is not null and pedagogy_closed_at is null
  and workflow_stage is distinct from 'administrative';

update public.classes set workflow_stage='live'
where status='active' and pedagogy_closed_at is null and workflow_stage is distinct from 'live';

revoke all on function private.sync_class_workflow_stage_p21() from public,anon,authenticated;

commit;
