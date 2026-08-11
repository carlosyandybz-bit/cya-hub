-- v45 — Fix recursive teaching RLS and allow post-administrative summary edits.

create or replace function private.student_can_read_assignment(
  p_person_id bigint,
  p_content_id bigint,
  p_assignment_status text,
  p_student_visible_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    p_person_id = (select private.current_person_id())
    and p_student_visible_at is not null
    and exists (
      select 1
      from public.teaching_contents t
      where t.id=p_content_id
        and t.active
        and t.completion_status='complete'
        and t.publication_status='published'
        and t.visibility='student'
        and private.assignment_is_student_releasable(t.content_type,p_assignment_status)
    );
$$;

create or replace function private.student_can_read_teaching_content(p_content_id bigint)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists (
    select 1
    from public.student_content_assignments a
    join public.teaching_contents t on t.id=a.content_id
    where a.content_id=p_content_id
      and a.person_id=(select private.current_person_id())
      and a.student_visible_at is not null
      and t.active
      and t.completion_status='complete'
      and t.publication_status='published'
      and t.visibility='student'
      and private.assignment_is_student_releasable(t.content_type,a.assignment_status)
  );
$$;

revoke all on function private.student_can_read_assignment(bigint,bigint,text,timestamptz) from public, anon;
revoke all on function private.student_can_read_teaching_content(bigint) from public, anon;
grant execute on function private.student_can_read_assignment(bigint,bigint,text,timestamptz) to authenticated;
grant execute on function private.student_can_read_teaching_content(bigint) to authenticated;

drop policy if exists student_content_assignments_select on public.student_content_assignments;
create policy student_content_assignments_select
on public.student_content_assignments
for select
to authenticated
using (
  (select private.is_staff())
  or private.student_can_read_assignment(person_id,content_id,assignment_status,student_visible_at)
);

drop policy if exists teaching_contents_select on public.teaching_contents;
create policy teaching_contents_select
on public.teaching_contents
for select
to authenticated
using (
  (select private.is_staff())
  or private.student_can_read_teaching_content(id)
);

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
      or exists (select 1 from public.teaching_content_tags tag where tag.content_id=t.id and strpos(lower(tag.tag),v_query)>0)
    )
  order by
    case
      when exists (select 1 from public.student_content_assignments a where a.person_id=p_person_id and a.content_id=t.id) then 0
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
end;
$$;

create or replace function public.create_quick_class_content(
  p_class_id bigint,
  p_person_id bigint,
  p_content_type text,
  p_title text
)
returns public.teaching_contents
language plpgsql
set search_path=''
as $$
declare
  v_style bigint;
  v_role bigint;
  v_level bigint;
  v_category bigint;
  v_content public.teaching_contents;
  v_assignment public.student_content_assignments;
  v_tax text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para crear contenido.' using errcode='42501';
  end if;
  if p_content_type not in ('explanation','exercise','sequence') then
    raise exception 'Tipo de contenido no válido.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_title,'')))=0 then
    raise exception 'Escribe un título.' using errcode='22023';
  end if;

  select c.style_term_id,cp.role_term_id,cp.level_term_id
    into v_style,v_role,v_level
  from public.classes c
  join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id
    and cp.person_id=p_person_id
    and c.status in ('active','finished')
    and c.pedagogy_closed_at is null
    and (c.status='active' or c.administrative_finished_at is not null);

  if not found or v_style is null or v_role is null or v_level is null then
    raise exception 'Falta el contexto del alumno.' using errcode='22023';
  end if;

  v_tax:=p_content_type||'_category';
  select id into v_category from public.catalog_terms where taxonomy=v_tax and term_key='general' and active limit 1;

  insert into public.teaching_contents(
    content_type,title,completion_status,publication_status,visibility,
    measurement_mode,category_term_id,created_by
  ) values(
    p_content_type,btrim(p_title),'incomplete','draft','staff','none',v_category,(select auth.uid())
  ) returning * into v_content;

  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level);

  if p_content_type='exercise' then
    insert into public.class_content_events(class_id,person_id,content_id,event_type,new_status,payload,created_by)
    values(p_class_id,p_person_id,v_content.id,'exercise_pending','pending',jsonb_build_object('content_type','exercise'),(select auth.uid()));
  else
    insert into public.student_content_assignments(
      person_id,content_id,assignment_status,snapshot_style_term_id,
      snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,
      source_class_id,assigned_by
    ) values(
      p_person_id,v_content.id,'pending',v_style,v_role,v_level,'none',p_class_id,(select auth.uid())
    ) returning * into v_assignment;

    insert into public.class_content_events(class_id,person_id,content_id,event_type,new_status,payload,created_by)
    values(p_class_id,p_person_id,v_content.id,'added','pending',jsonb_build_object('content_type',p_content_type),(select auth.uid()));
  end if;
  return v_content;
end;
$$;

grant execute on function public.search_class_teaching_content(bigint,bigint,text,text,integer) to authenticated;
grant execute on function public.create_quick_class_content(bigint,bigint,text,text) to authenticated;
