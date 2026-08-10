-- CYA Hub · v32 · buscador contextual de Dar clase

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
    and c.status='active'
    and c.pedagogy_closed_at is null;

  if not found then
    raise exception 'El alumno no pertenece a una clase activa.' using errcode='22023';
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
    and exists (
      select 1 from public.teaching_content_styles s
      where s.content_id=t.id and s.style_term_id=v_style_id
    )
    and exists (
      select 1 from public.teaching_content_roles r
      where r.content_id=t.id and r.role_term_id=v_role_id
    )
    and exists (
      select 1 from public.teaching_content_levels l
      where l.content_id=t.id and l.level_term_id=v_level_id
    )
    and (
      v_query=''
      or strpos(lower(t.title),v_query)>0
      or strpos(lower(coalesce(t.description,'')),v_query)>0
      or strpos(lower(coalesce(t.correction_guidance,'')),v_query)>0
      or exists (
        select 1 from public.teaching_content_tags tag
        where tag.content_id=t.id and strpos(lower(tag.tag),v_query)>0
      )
    )
  order by
    case
      when exists (
        select 1 from public.student_content_assignments a
        where a.person_id=p_person_id and a.content_id=t.id
      ) then 0
      when t.content_type='exercise' and exists (
        select 1 from public.class_content_events e
        where e.class_id=p_class_id and e.person_id=p_person_id and e.content_id=t.id and e.event_type like 'exercise_%'
      ) then 0
      else 1
    end,
    case
      when v_query<>'' and lower(t.title)=v_query then 0
      when v_query<>'' and left(lower(t.title),length(v_query))=v_query then 1
      else 2
    end,
    case when t.completion_status='complete' and t.publication_status='published' then 0 else 1 end,
    t.updated_at desc,
    t.id desc
  limit v_limit;
end $$;

revoke all on function public.search_class_teaching_content(bigint,bigint,text,text,integer) from public;
revoke all on function public.search_class_teaching_content(bigint,bigint,text,text,integer) from anon;
grant execute on function public.search_class_teaching_content(bigint,bigint,text,text,integer) to authenticated;
