begin;

-- CYA Hub · Enseñanza
-- Extiende el núcleo pedagógico creado por live-class.sql sin sustituir datos existentes.

insert into public.catalog_terms(taxonomy,term_key,label,sort_order,metadata)
values
  ('explanation_category','general','General',10,'{}'::jsonb),
  ('exercise_category','general','General',10,'{}'::jsonb),
  ('sequence_category','general','General',10,'{}'::jsonb)
on conflict (taxonomy,term_key) do nothing;

alter table public.teaching_contents
  add column if not exists published_at timestamptz;

update public.teaching_contents
set published_at=coalesce(published_at,created_at)
where publication_status='published' and published_at is null;

create table public.teaching_content_tags (
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  tag text not null check (length(btrim(tag))>0 and length(btrim(tag))<=60),
  primary key(content_id,tag)
);

create table public.teaching_content_relations (
  id bigint generated always as identity primary key,
  source_content_id bigint not null references public.teaching_contents(id) on delete cascade,
  target_content_id bigint not null references public.teaching_contents(id) on delete cascade,
  relation_type text not null check (relation_type in (
    'prerequisite','counterpart','exercise_explanation','exercise_correction','sequence_item','related'
  )),
  position integer check (position is null or position>0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_content_relations_not_self check (source_content_id<>target_content_id),
  constraint teaching_content_relations_source_target_type_key unique(source_content_id,target_content_id,relation_type),
  constraint teaching_content_relations_sequence_position check (relation_type<>'sequence_item' or position is not null)
);

create unique index teaching_content_relations_symmetric_unique_idx
  on public.teaching_content_relations(
    least(source_content_id,target_content_id),greatest(source_content_id,target_content_id),relation_type
  ) where relation_type in ('counterpart','related');
create unique index teaching_content_relations_sequence_position_idx
  on public.teaching_content_relations(source_content_id,position)
  where relation_type='sequence_item';
create index teaching_content_relations_target_idx on public.teaching_content_relations(target_content_id,relation_type);
create index teaching_content_relations_created_by_idx on public.teaching_content_relations(created_by) where created_by is not null;
create index teaching_content_tags_tag_idx on public.teaching_content_tags(tag);

create table public.teaching_content_media (
  id bigint generated always as identity primary key,
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  media_type text not null check (media_type in ('video','image')),
  provider text not null default 'google_drive' check (provider in ('google_drive')),
  external_file_id text not null check (length(btrim(external_file_id))>0),
  title text,
  mime_type text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(content_id,provider,external_file_id)
);

create index teaching_content_media_content_order_idx on public.teaching_content_media(content_id,sort_order,id);
create index teaching_content_media_created_by_idx on public.teaching_content_media(created_by) where created_by is not null;

-- El historial anterior se normaliza antes de estrechar los estados visibles de Correcciones.
update public.student_content_assignments a
set assignment_status=case a.assignment_status
  when 'pending_explanation' then 'pending'
  when 'explained' then 'in_correction'
  when 'improving' then 'in_correction'
  when 'reopened' then 'in_correction'
  else a.assignment_status
end
from public.teaching_contents t
where t.id=a.content_id
  and t.content_type='correction'
  and a.assignment_status in ('pending_explanation','explained','improving','reopened');

update public.student_content_measurements m
set assignment_status=case m.assignment_status
  when 'pending_explanation' then 'pending'
  when 'explained' then 'in_correction'
  when 'improving' then 'in_correction'
  when 'reopened' then 'in_correction'
  else m.assignment_status
end
from public.student_content_assignments a, public.teaching_contents t
where a.id=m.assignment_id
  and t.id=a.content_id
  and t.content_type='correction'
  and m.assignment_status in ('pending_explanation','explained','improving','reopened');

alter table public.student_content_assignments
  alter column assignment_status set default 'pending',
  drop constraint student_content_assignments_assignment_status_check,
  add constraint student_content_assignments_assignment_status_check
    check (assignment_status in ('pending','in_correction','corrected','explained','practicing','completed'));

alter table public.student_content_measurements
  drop constraint student_content_measurements_assignment_status_check,
  add constraint student_content_measurements_assignment_status_check
    check (assignment_status in ('pending','in_correction','corrected','explained','practicing','completed'));

create or replace function private.guard_teaching_content_relation()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  v_source_type text;
  v_target_type text;
begin
  select content_type into v_source_type from public.teaching_contents where id=new.source_content_id and active;
  select content_type into v_target_type from public.teaching_contents where id=new.target_content_id and active;
  if v_source_type is null or v_target_type is null then
    raise exception 'Los dos contenidos de la relación deben estar activos.' using errcode='22023';
  end if;

  if new.relation_type='counterpart' and (v_source_type<>'explanation' or v_target_type<>'explanation') then
    raise exception 'Una homóloga debe relacionar dos explicaciones.' using errcode='22023';
  elsif new.relation_type='exercise_explanation' and (v_source_type<>'exercise' or v_target_type<>'explanation') then
    raise exception 'Esta relación requiere un ejercicio y una explicación.' using errcode='22023';
  elsif new.relation_type='exercise_correction' and (v_source_type<>'exercise' or v_target_type<>'correction') then
    raise exception 'Esta relación requiere un ejercicio y una corrección.' using errcode='22023';
  elsif new.relation_type='sequence_item' and v_source_type<>'sequence' then
    raise exception 'Solo una secuencia puede contener pasos.' using errcode='22023';
  end if;

  if new.relation_type in ('prerequisite','sequence_item') and exists(
    with recursive walk(content_id) as (
      select r.target_content_id
      from public.teaching_content_relations r
      where r.source_content_id=new.target_content_id and r.relation_type=new.relation_type
      union
      select r.target_content_id
      from public.teaching_content_relations r
      join walk w on w.content_id=r.source_content_id
      where r.relation_type=new.relation_type
    )
    select 1 from walk where content_id=new.source_content_id
  ) then
    raise exception 'La relación crearía un ciclo en el mapa de enseñanza.' using errcode='22023';
  end if;
  return new;
end;
$$;

create trigger teaching_content_relations_guard
before insert or update on public.teaching_content_relations
for each row execute function private.guard_teaching_content_relation();

create trigger teaching_content_relations_touch_updated_at
before update on public.teaching_content_relations
for each row execute function private.touch_updated_at();

create trigger teaching_content_media_touch_updated_at
before update on public.teaching_content_media
for each row execute function private.touch_updated_at();

alter table public.teaching_content_tags enable row level security;
alter table public.teaching_content_relations enable row level security;
alter table public.teaching_content_media enable row level security;

drop policy if exists teaching_contents_staff_select on public.teaching_contents;
drop policy if exists teaching_contents_select on public.teaching_contents;
create policy teaching_contents_select on public.teaching_contents for select to authenticated
using(
  (select private.is_staff())
  or (
    active and completion_status='complete' and publication_status='published' and visibility='student'
    and exists(
      select 1 from public.student_content_assignments a
      where a.content_id=teaching_contents.id and a.person_id=(select private.current_person_id())
    )
  )
);

create policy teaching_content_styles_staff_delete on public.teaching_content_styles for delete to authenticated using((select private.is_staff()));
create policy teaching_content_roles_staff_delete on public.teaching_content_roles for delete to authenticated using((select private.is_staff()));
create policy teaching_content_levels_staff_delete on public.teaching_content_levels for delete to authenticated using((select private.is_staff()));

create policy teaching_content_tags_staff_select on public.teaching_content_tags for select to authenticated using((select private.is_staff()));
create policy teaching_content_tags_staff_insert on public.teaching_content_tags for insert to authenticated with check((select private.is_staff()));
create policy teaching_content_tags_staff_delete on public.teaching_content_tags for delete to authenticated using((select private.is_staff()));

create policy teaching_content_relations_staff_select on public.teaching_content_relations for select to authenticated using((select private.is_staff()));
create policy teaching_content_relations_staff_insert on public.teaching_content_relations for insert to authenticated
  with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy teaching_content_relations_staff_update on public.teaching_content_relations for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));
create policy teaching_content_relations_staff_delete on public.teaching_content_relations for delete to authenticated using((select private.is_staff()));

create policy teaching_content_media_staff_select on public.teaching_content_media for select to authenticated using((select private.is_staff()));
create policy teaching_content_media_staff_insert on public.teaching_content_media for insert to authenticated
  with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy teaching_content_media_staff_update on public.teaching_content_media for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));
create policy teaching_content_media_staff_delete on public.teaching_content_media for delete to authenticated using((select private.is_staff()));

create policy student_content_measurements_staff_update on public.student_content_measurements for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));

revoke all on public.teaching_content_tags,public.teaching_content_relations,public.teaching_content_media from anon,authenticated;
grant select,insert,delete on public.teaching_content_tags to authenticated;
grant select,insert,update,delete on public.teaching_content_relations,public.teaching_content_media to authenticated;
grant delete on public.teaching_content_styles,public.teaching_content_roles,public.teaching_content_levels to authenticated;
grant update on public.student_content_measurements to authenticated;
grant usage on sequence public.teaching_content_relations_id_seq,public.teaching_content_media_id_seq to authenticated;

create or replace function public.save_teaching_content(
  p_content_id bigint,
  p_content_type text,
  p_title text,
  p_description text,
  p_correction_guidance text,
  p_completion_status text,
  p_publication_status text,
  p_visibility text,
  p_measurement_mode text,
  p_category_term_id bigint,
  p_style_term_ids bigint[],
  p_role_term_ids bigint[],
  p_level_term_ids bigint[],
  p_tags text[]
) returns public.teaching_contents language plpgsql security invoker set search_path='' as $$
declare
  v_content public.teaching_contents;
  v_existing_type text;
  v_category_taxonomy text;
  v_styles bigint[];
  v_roles bigint[];
  v_levels bigint[];
  v_tags text[];
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para editar enseñanza.' using errcode='42501';
  end if;
  if p_content_type not in ('correction','explanation','exercise','sequence') then
    raise exception 'Tipo de contenido no válido.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_title,'')))=0 then
    raise exception 'El título es obligatorio.' using errcode='22023';
  end if;
  if p_completion_status not in ('incomplete','complete') then
    raise exception 'Estado de completitud no válido.' using errcode='22023';
  end if;
  if p_publication_status not in ('draft','published') then
    raise exception 'Estado de publicación no válido.' using errcode='22023';
  end if;
  if p_visibility not in ('staff','student') then
    raise exception 'Visibilidad no válida.' using errcode='22023';
  end if;
  if p_measurement_mode not in ('frequency','importance','both','none') then
    raise exception 'Modo de medición no válido.' using errcode='22023';
  end if;

  select coalesce(array_agg(x order by x),'{}'::bigint[]) into v_styles
  from (select distinct unnest(coalesce(p_style_term_ids,'{}'::bigint[])) x) s;
  select coalesce(array_agg(x order by x),'{}'::bigint[]) into v_roles
  from (select distinct unnest(coalesce(p_role_term_ids,'{}'::bigint[])) x) s;
  select coalesce(array_agg(x order by x),'{}'::bigint[]) into v_levels
  from (select distinct unnest(coalesce(p_level_term_ids,'{}'::bigint[])) x) s;
  select coalesce(array_agg(tag order by tag),'{}'::text[]) into v_tags
  from (
    select distinct btrim(x) tag
    from unnest(coalesce(p_tags,'{}'::text[])) x
    where length(btrim(x))>0
  ) s;

  if exists(select 1 from unnest(v_tags) t where length(t)>60) then
    raise exception 'Las etiquetas pueden tener hasta 60 caracteres.' using errcode='22023';
  end if;
  if (select count(*) from public.catalog_terms where id=any(v_styles) and taxonomy='dance_style' and active)<>cardinality(v_styles) then
    raise exception 'Hay un estilo no válido.' using errcode='22023';
  end if;
  if (select count(*) from public.catalog_terms where id=any(v_roles) and taxonomy='dance_role' and active)<>cardinality(v_roles) then
    raise exception 'Hay un rol no válido.' using errcode='22023';
  end if;
  if (select count(*) from public.catalog_terms where id=any(v_levels) and taxonomy='dance_level' and active)<>cardinality(v_levels) then
    raise exception 'Hay un nivel no válido.' using errcode='22023';
  end if;

  v_category_taxonomy:=case p_content_type
    when 'correction' then 'correction_category'
    when 'explanation' then 'explanation_category'
    when 'exercise' then 'exercise_category'
    else 'sequence_category'
  end;
  if p_category_term_id is not null and not exists(
    select 1 from public.catalog_terms
    where id=p_category_term_id and taxonomy=v_category_taxonomy and active
  ) then
    raise exception 'La categoría no corresponde a este tipo de contenido.' using errcode='22023';
  end if;

  if p_completion_status='complete' and (
    p_category_term_id is null or cardinality(v_styles)=0 or cardinality(v_roles)=0 or cardinality(v_levels)=0
  ) then
    raise exception 'Para completar el contenido indica categoría, estilo, rol y nivel.' using errcode='22023';
  end if;
  if p_completion_status='incomplete' and p_publication_status='published' then
    raise exception 'Un contenido incompleto no se puede publicar.' using errcode='22023';
  end if;

  if p_content_id is null then
    insert into public.teaching_contents(
      content_type,title,description,correction_guidance,completion_status,publication_status,
      visibility,measurement_mode,category_term_id,published_at,created_by
    ) values(
      p_content_type,btrim(p_title),nullif(btrim(p_description),''),
      case when p_content_type='correction' then nullif(btrim(p_correction_guidance),'') else null end,
      p_completion_status,p_publication_status,p_visibility,
      case when p_content_type='correction' then p_measurement_mode else 'none' end,
      p_category_term_id,case when p_publication_status='published' then now() else null end,(select auth.uid())
    ) returning * into v_content;
  else
    select content_type into v_existing_type from public.teaching_contents where id=p_content_id and active for update;
    if not found then raise exception 'El contenido no existe o está archivado.' using errcode='P0002'; end if;
    if v_existing_type<>p_content_type then raise exception 'No se puede cambiar el tipo de un contenido existente.' using errcode='22023'; end if;
    update public.teaching_contents set
      title=btrim(p_title),
      description=nullif(btrim(p_description),''),
      correction_guidance=case when p_content_type='correction' then nullif(btrim(p_correction_guidance),'') else null end,
      completion_status=p_completion_status,
      publication_status=p_publication_status,
      visibility=p_visibility,
      measurement_mode=case when p_content_type='correction' then p_measurement_mode else 'none' end,
      category_term_id=p_category_term_id,
      published_at=case when p_publication_status='published' then coalesce(published_at,now()) else published_at end
    where id=p_content_id returning * into v_content;
  end if;

  delete from public.teaching_content_styles where content_id=v_content.id;
  delete from public.teaching_content_roles where content_id=v_content.id;
  delete from public.teaching_content_levels where content_id=v_content.id;
  delete from public.teaching_content_tags where content_id=v_content.id;
  insert into public.teaching_content_styles(content_id,style_term_id) select v_content.id,unnest(v_styles);
  insert into public.teaching_content_roles(content_id,role_term_id) select v_content.id,unnest(v_roles);
  insert into public.teaching_content_levels(content_id,level_term_id) select v_content.id,unnest(v_levels);
  insert into public.teaching_content_tags(content_id,tag) select v_content.id,unnest(v_tags);
  return v_content;
end;
$$;

create or replace function public.archive_teaching_content(p_content_id bigint)
returns public.teaching_contents language plpgsql security invoker set search_path='' as $$
declare v_content public.teaching_contents;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para archivar enseñanza.' using errcode='42501'; end if;
  update public.teaching_contents
  set active=false,publication_status='archived'
  where id=p_content_id and active
  returning * into v_content;
  if not found then raise exception 'El contenido no existe o ya está archivado.' using errcode='P0002'; end if;
  return v_content;
end;
$$;

create or replace function public.save_teaching_relation(
  p_source_content_id bigint,p_target_content_id bigint,p_relation_type text,p_position integer
) returns public.teaching_content_relations language plpgsql security invoker set search_path='' as $$
declare
  v_relation public.teaching_content_relations;
  v_source bigint:=p_source_content_id;
  v_target bigint:=p_target_content_id;
  v_position integer:=p_position;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para relacionar contenido.' using errcode='42501'; end if;
  if p_relation_type not in ('prerequisite','counterpart','exercise_explanation','exercise_correction','sequence_item','related') then
    raise exception 'Tipo de relación no válido.' using errcode='22023';
  end if;
  if v_source=v_target then raise exception 'Un contenido no puede relacionarse consigo mismo.' using errcode='22023'; end if;
  if p_relation_type in ('counterpart','related') and v_source>v_target then
    v_source:=p_target_content_id; v_target:=p_source_content_id;
  end if;
  if p_relation_type='sequence_item' and v_position is null then
    select coalesce(max(position),0)+10 into v_position
    from public.teaching_content_relations
    where source_content_id=v_source and relation_type='sequence_item';
  end if;
  insert into public.teaching_content_relations(source_content_id,target_content_id,relation_type,position,created_by)
  values(v_source,v_target,p_relation_type,v_position,(select auth.uid()))
  on conflict(source_content_id,target_content_id,relation_type) do update
    set position=excluded.position
  returning * into v_relation;
  return v_relation;
end;
$$;

create or replace function public.delete_teaching_relation(p_relation_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para quitar relaciones.' using errcode='42501'; end if;
  delete from public.teaching_content_relations where id=p_relation_id;
end;
$$;

create or replace function public.assign_teaching_content(
  p_person_id bigint,p_content_id bigint,p_style_term_id bigint,p_role_term_id bigint,p_level_term_id bigint,p_source_class_id bigint
) returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare
  v_content public.teaching_contents;
  v_assignment public.student_content_assignments;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para asignar enseñanza.' using errcode='42501'; end if;
  if not exists(select 1 from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=p_person_id and sp.active and p.active) then
    raise exception 'El alumno no está activo.' using errcode='22023';
  end if;
  select * into v_content from public.teaching_contents
  where id=p_content_id and active and completion_status='complete' and publication_status='published';
  if not found then raise exception 'Solo se puede asignar contenido completo y publicado.' using errcode='22023'; end if;
  if not exists(select 1 from public.teaching_content_styles where content_id=p_content_id and style_term_id=p_style_term_id) then
    raise exception 'El estilo no corresponde a este contenido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.teaching_content_roles where content_id=p_content_id and role_term_id=p_role_term_id) then
    raise exception 'El rol no corresponde a este contenido.' using errcode='22023';
  end if;
  if not exists(select 1 from public.teaching_content_levels where content_id=p_content_id and level_term_id=p_level_term_id) then
    raise exception 'El nivel no corresponde a este contenido.' using errcode='22023';
  end if;
  if p_source_class_id is not null and not exists(
    select 1 from public.classes c join public.class_participants cp on cp.class_id=c.id
    where c.id=p_source_class_id and cp.person_id=p_person_id and c.status in ('active','finished') and c.pedagogy_closed_at is null
  ) then
    raise exception 'La clase no está abierta para este alumno.' using errcode='22023';
  end if;

  insert into public.student_content_assignments(
    person_id,content_id,assignment_status,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,
    snapshot_measurement_mode,source_class_id,assigned_by
  ) values(
    p_person_id,p_content_id,'pending',p_style_term_id,p_role_term_id,p_level_term_id,
    v_content.measurement_mode,p_source_class_id,(select auth.uid())
  ) on conflict(person_id,content_id) do nothing
  returning * into v_assignment;

  if v_assignment.id is null then
    select * into v_assignment from public.student_content_assignments
    where person_id=p_person_id and content_id=p_content_id;
  else
    insert into public.student_content_measurements(assignment_id,class_id,assignment_status,measured_by)
    values(v_assignment.id,p_source_class_id,'pending',(select auth.uid()));
  end if;
  return v_assignment;
end;
$$;

create or replace function public.update_teaching_assignment_status(p_assignment_id bigint,p_assignment_status text)
returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare
  v_assignment public.student_content_assignments;
  v_content_type text;
  v_done boolean;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para actualizar enseñanza.' using errcode='42501'; end if;
  select a.* into v_assignment
  from public.student_content_assignments a
  where a.id=p_assignment_id
  for update of a;
  if not found then raise exception 'La asignación no existe.' using errcode='P0002'; end if;
  select t.content_type into v_content_type from public.teaching_contents t where t.id=v_assignment.content_id;

  if (v_content_type='correction' and p_assignment_status not in ('pending','in_correction','corrected'))
     or (v_content_type='explanation' and p_assignment_status not in ('pending','explained'))
     or (v_content_type in ('exercise','sequence') and p_assignment_status not in ('pending','practicing','completed')) then
    raise exception 'Estado no válido para este tipo de contenido.' using errcode='22023';
  end if;
  if v_content_type='correction' and p_assignment_status='corrected'
     and v_assignment.snapshot_measurement_mode in ('frequency','both') and v_assignment.current_frequency is null then
    raise exception 'Indica la frecuencia antes de corregirla.' using errcode='22023';
  end if;
  if v_content_type='correction' and p_assignment_status='corrected'
     and v_assignment.snapshot_measurement_mode in ('importance','both') and v_assignment.current_importance is null then
    raise exception 'Indica la importancia antes de corregirla.' using errcode='22023';
  end if;
  v_done:=p_assignment_status in ('corrected','explained','completed');
  update public.student_content_assignments
  set assignment_status=p_assignment_status,completed_at=case when v_done then coalesce(completed_at,now()) else null end
  where id=p_assignment_id returning * into v_assignment;
  insert into public.student_content_measurements(
    assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
  ) values(
    v_assignment.id,null,p_assignment_status,v_assignment.current_frequency,v_assignment.current_importance,(select auth.uid())
  );
  return v_assignment;
end;
$$;

create or replace function public.update_correction_assignment(
  p_assignment_id bigint,p_class_id bigint,p_assignment_status text,p_frequency smallint,p_importance smallint
) returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare
  v_assignment public.student_content_assignments;
  v_mode text;
  v_recent_measurement_id bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para actualizar correcciones.' using errcode='42501'; end if;
  if p_assignment_status not in ('pending','in_correction','corrected') then raise exception 'Estado de corrección no válido.' using errcode='22023'; end if;
  select a.* into v_assignment
  from public.student_content_assignments a join public.teaching_contents t on t.id=a.content_id
  where a.id=p_assignment_id and t.content_type='correction' for update of a;
  if not found then raise exception 'La corrección no existe.' using errcode='P0002'; end if;
  v_mode:=v_assignment.snapshot_measurement_mode;
  if not exists(select 1 from public.class_participants where class_id=p_class_id and person_id=v_assignment.person_id) then raise exception 'La corrección no pertenece a un alumno de esta clase.' using errcode='22023'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and status in ('active','finished') and pedagogy_closed_at is null) then raise exception 'La clase no está abierta.' using errcode='22023'; end if;
  if p_frequency is not null and (p_frequency<0 or p_frequency>100) then raise exception 'Frecuencia fuera de rango.' using errcode='22023'; end if;
  if p_importance is not null and (p_importance<0 or p_importance>100) then raise exception 'Importancia fuera de rango.' using errcode='22023'; end if;
  if v_mode in ('frequency','both') and p_frequency is null then raise exception 'Indica la frecuencia.' using errcode='22023'; end if;
  if v_mode in ('importance','both') and p_importance is null then raise exception 'Indica la importancia.' using errcode='22023'; end if;

  update public.student_content_assignments
  set assignment_status=p_assignment_status,current_frequency=p_frequency,current_importance=p_importance,
      completed_at=case when p_assignment_status='corrected' then coalesce(completed_at,now()) else null end
  where id=p_assignment_id returning * into v_assignment;

  select id into v_recent_measurement_id
  from public.student_content_measurements
  where assignment_id=p_assignment_id and created_at>=now()-interval '120 seconds'
  order by created_at desc limit 1 for update;
  if v_recent_measurement_id is null then
    insert into public.student_content_measurements(assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by)
    values(p_assignment_id,p_class_id,p_assignment_status,p_frequency,p_importance,(select auth.uid()));
  else
    update public.student_content_measurements
    set class_id=p_class_id,assignment_status=p_assignment_status,frequency_score=p_frequency,
        importance_score=p_importance,measured_by=(select auth.uid())
    where id=v_recent_measurement_id;
  end if;
  return v_assignment;
end;
$$;

revoke all on function public.save_teaching_content(bigint,text,text,text,text,text,text,text,text,bigint,bigint[],bigint[],bigint[],text[]) from public,anon;
revoke all on function public.archive_teaching_content(bigint) from public,anon;
revoke all on function public.save_teaching_relation(bigint,bigint,text,integer) from public,anon;
revoke all on function public.delete_teaching_relation(bigint) from public,anon;
revoke all on function public.assign_teaching_content(bigint,bigint,bigint,bigint,bigint,bigint) from public,anon;
revoke all on function public.update_teaching_assignment_status(bigint,text) from public,anon;
revoke all on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint) from public,anon;

grant execute on function public.save_teaching_content(bigint,text,text,text,text,text,text,text,text,bigint,bigint[],bigint[],bigint[],text[]) to authenticated;
grant execute on function public.archive_teaching_content(bigint) to authenticated;
grant execute on function public.save_teaching_relation(bigint,bigint,text,integer) to authenticated;
grant execute on function public.delete_teaching_relation(bigint) to authenticated;
grant execute on function public.assign_teaching_content(bigint,bigint,bigint,bigint,bigint,bigint) to authenticated;
grant execute on function public.update_teaching_assignment_status(bigint,text) to authenticated;
grant execute on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint) to authenticated;

commit;
