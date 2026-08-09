begin;

-- Dar clase: contexto congelado por participante.
alter table public.class_participants
  add column role_term_id bigint references public.catalog_terms(id) on delete set null,
  add column level_term_id bigint references public.catalog_terms(id) on delete set null;

create index class_participants_role_term_id_idx on public.class_participants(role_term_id) where role_term_id is not null;
create index class_participants_level_term_id_idx on public.class_participants(level_term_id) where level_term_id is not null;

-- La categoria general permite capturar una correccion completa durante la clase sin
-- inventar una taxonomia paralela. Se podra reclasificar desde Ensenanza mas adelante.
insert into public.catalog_terms(taxonomy,term_key,label,sort_order,metadata)
values('correction_category','general','General',10,'{}'::jsonb)
on conflict (taxonomy,term_key) do nothing;

create table public.class_notes (
  id bigint generated always as identity primary key,
  class_id bigint not null references public.classes(id) on delete cascade,
  person_id bigint references public.student_profiles(person_id) on delete cascade,
  note_kind text not null default 'quick' check (note_kind in ('quick','general')),
  body text not null check (length(btrim(body)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_evaluations (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.student_profiles(person_id) on delete cascade,
  class_id bigint references public.classes(id) on delete set null,
  style_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  role_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  level_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  aptitude_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  evaluation_kind text not null check (evaluation_kind in ('initial','class','manual')),
  score smallint not null check (score between 0 and 100 and score % 25 = 0),
  note text,
  evaluated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(class_id,person_id,aptitude_term_id)
);

-- Estructura canonica compartida por Correcciones, Explicaciones, Ejercicios y Secuencias.
create table public.teaching_contents (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in ('correction','explanation','exercise','sequence')),
  title text not null check (length(btrim(title)) > 0),
  description text,
  correction_guidance text,
  completion_status text not null default 'incomplete' check (completion_status in ('incomplete','complete')),
  publication_status text not null default 'draft' check (publication_status in ('draft','published','archived')),
  visibility text not null default 'staff' check (visibility in ('staff','student')),
  measurement_mode text not null default 'none' check (measurement_mode in ('frequency','importance','both','none')),
  category_term_id bigint references public.catalog_terms(id) on delete set null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teaching_content_styles (
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  style_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  primary key(content_id,style_term_id)
);

create table public.teaching_content_roles (
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  role_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  primary key(content_id,role_term_id)
);

create table public.teaching_content_levels (
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  level_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  primary key(content_id,level_term_id)
);

create table public.student_content_assignments (
  id bigint generated always as identity primary key,
  person_id bigint not null references public.student_profiles(person_id) on delete cascade,
  content_id bigint not null references public.teaching_contents(id) on delete cascade,
  assignment_status text not null default 'pending_explanation'
    check (assignment_status in ('pending_explanation','explained','in_correction','improving','corrected','reopened')),
  snapshot_style_term_id bigint references public.catalog_terms(id) on delete set null,
  snapshot_role_term_id bigint references public.catalog_terms(id) on delete set null,
  snapshot_level_term_id bigint references public.catalog_terms(id) on delete set null,
  snapshot_measurement_mode text not null default 'none'
    check (snapshot_measurement_mode in ('frequency','importance','both','none')),
  current_frequency smallint check (current_frequency between 0 and 100),
  current_importance smallint check (current_importance between 0 and 100),
  source_class_id bigint references public.classes(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(person_id,content_id)
);

create table public.student_content_measurements (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.student_content_assignments(id) on delete cascade,
  class_id bigint references public.classes(id) on delete set null,
  assignment_status text not null
    check (assignment_status in ('pending_explanation','explained','in_correction','improving','corrected','reopened')),
  frequency_score smallint check (frequency_score between 0 and 100),
  importance_score smallint check (importance_score between 0 and 100),
  note text,
  measured_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index class_notes_class_created_idx on public.class_notes(class_id,created_at desc);
create index class_notes_person_created_idx on public.class_notes(person_id,created_at desc) where person_id is not null;
create index class_notes_created_by_idx on public.class_notes(created_by) where created_by is not null;
create index student_evaluations_person_context_created_idx on public.student_evaluations(person_id,style_term_id,role_term_id,created_at desc);
create index student_evaluations_class_id_idx on public.student_evaluations(class_id) where class_id is not null;
create index student_evaluations_style_term_id_idx on public.student_evaluations(style_term_id);
create index student_evaluations_role_term_id_idx on public.student_evaluations(role_term_id);
create index student_evaluations_level_term_id_idx on public.student_evaluations(level_term_id);
create index student_evaluations_aptitude_term_id_idx on public.student_evaluations(aptitude_term_id);
create index student_evaluations_evaluated_by_idx on public.student_evaluations(evaluated_by) where evaluated_by is not null;
create index teaching_contents_category_term_id_idx on public.teaching_contents(category_term_id) where category_term_id is not null;
create index teaching_contents_created_by_idx on public.teaching_contents(created_by) where created_by is not null;
create index teaching_contents_type_status_idx on public.teaching_contents(content_type,active,completion_status,publication_status);
create index teaching_content_styles_style_term_id_idx on public.teaching_content_styles(style_term_id);
create index teaching_content_roles_role_term_id_idx on public.teaching_content_roles(role_term_id);
create index teaching_content_levels_level_term_id_idx on public.teaching_content_levels(level_term_id);
create index student_content_assignments_content_id_idx on public.student_content_assignments(content_id);
create index student_content_assignments_person_status_idx on public.student_content_assignments(person_id,assignment_status,updated_at desc);
create index student_content_assignments_style_term_id_idx on public.student_content_assignments(snapshot_style_term_id) where snapshot_style_term_id is not null;
create index student_content_assignments_role_term_id_idx on public.student_content_assignments(snapshot_role_term_id) where snapshot_role_term_id is not null;
create index student_content_assignments_level_term_id_idx on public.student_content_assignments(snapshot_level_term_id) where snapshot_level_term_id is not null;
create index student_content_assignments_source_class_id_idx on public.student_content_assignments(source_class_id) where source_class_id is not null;
create index student_content_assignments_assigned_by_idx on public.student_content_assignments(assigned_by) where assigned_by is not null;
create index student_content_measurements_assignment_created_idx on public.student_content_measurements(assignment_id,created_at desc);
create index student_content_measurements_class_id_idx on public.student_content_measurements(class_id) where class_id is not null;
create index student_content_measurements_measured_by_idx on public.student_content_measurements(measured_by) where measured_by is not null;

create trigger class_notes_touch_updated_at before update on public.class_notes for each row execute function private.touch_updated_at();
create trigger student_evaluations_touch_updated_at before update on public.student_evaluations for each row execute function private.touch_updated_at();
create trigger teaching_contents_touch_updated_at before update on public.teaching_contents for each row execute function private.touch_updated_at();
create trigger student_content_assignments_touch_updated_at before update on public.student_content_assignments for each row execute function private.touch_updated_at();

alter table public.class_notes enable row level security;
alter table public.student_evaluations enable row level security;
alter table public.teaching_contents enable row level security;
alter table public.teaching_content_styles enable row level security;
alter table public.teaching_content_roles enable row level security;
alter table public.teaching_content_levels enable row level security;
alter table public.student_content_assignments enable row level security;
alter table public.student_content_measurements enable row level security;

create policy class_notes_staff_select on public.class_notes for select to authenticated using((select private.is_staff()));
create policy class_notes_staff_insert on public.class_notes for insert to authenticated with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy class_notes_staff_update on public.class_notes for update to authenticated using((select private.is_staff())) with check((select private.is_staff()));

create policy student_evaluations_select on public.student_evaluations for select to authenticated
  using(person_id=(select private.current_person_id()) or (select private.is_staff()));
create policy student_evaluations_staff_insert on public.student_evaluations for insert to authenticated
  with check((select private.is_staff()) and evaluated_by=(select auth.uid()));
create policy student_evaluations_staff_update on public.student_evaluations for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));

create policy teaching_contents_staff_select on public.teaching_contents for select to authenticated using((select private.is_staff()));
create policy teaching_contents_staff_insert on public.teaching_contents for insert to authenticated
  with check((select private.is_staff()) and created_by=(select auth.uid()));
create policy teaching_contents_staff_update on public.teaching_contents for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));
create policy teaching_content_styles_staff_select on public.teaching_content_styles for select to authenticated using((select private.is_staff()));
create policy teaching_content_styles_staff_insert on public.teaching_content_styles for insert to authenticated with check((select private.is_staff()));
create policy teaching_content_roles_staff_select on public.teaching_content_roles for select to authenticated using((select private.is_staff()));
create policy teaching_content_roles_staff_insert on public.teaching_content_roles for insert to authenticated with check((select private.is_staff()));
create policy teaching_content_levels_staff_select on public.teaching_content_levels for select to authenticated using((select private.is_staff()));
create policy teaching_content_levels_staff_insert on public.teaching_content_levels for insert to authenticated with check((select private.is_staff()));

create policy student_content_assignments_select on public.student_content_assignments for select to authenticated
  using(person_id=(select private.current_person_id()) or (select private.is_staff()));
create policy student_content_assignments_staff_insert on public.student_content_assignments for insert to authenticated
  with check((select private.is_staff()) and assigned_by=(select auth.uid()));
create policy student_content_assignments_staff_update on public.student_content_assignments for update to authenticated
  using((select private.is_staff())) with check((select private.is_staff()));
create policy student_content_measurements_select on public.student_content_measurements for select to authenticated
  using((select private.is_staff()) or exists(
    select 1 from public.student_content_assignments a
    where a.id=assignment_id and a.person_id=(select private.current_person_id())
  ));
create policy student_content_measurements_staff_insert on public.student_content_measurements for insert to authenticated
  with check((select private.is_staff()) and measured_by=(select auth.uid()));

revoke all on public.class_notes,public.student_evaluations,public.teaching_contents,
  public.teaching_content_styles,public.teaching_content_roles,public.teaching_content_levels,
  public.student_content_assignments,public.student_content_measurements from anon,authenticated;
grant select,insert,update on public.class_notes,public.student_evaluations,public.teaching_contents,public.student_content_assignments to authenticated;
grant select,insert on public.teaching_content_styles,public.teaching_content_roles,public.teaching_content_levels,public.student_content_measurements to authenticated;
grant usage on sequence public.class_notes_id_seq,public.student_evaluations_id_seq,public.teaching_contents_id_seq,
  public.student_content_assignments_id_seq,public.student_content_measurements_id_seq to authenticated;

create function public.start_class(p_class_id bigint)
returns public.classes language plpgsql security invoker set search_path='' as $$
declare v_class public.classes;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para iniciar clases.' using errcode='42501'; end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status='active' then return v_class; end if;
  if v_class.status<>'scheduled' then raise exception 'Solo se puede iniciar una clase programada.' using errcode='22023'; end if;
  if v_class.style_term_id is null or not exists(
    select 1 from public.catalog_terms where id=v_class.style_term_id and taxonomy='dance_style' and active
  ) then raise exception 'Indica el estilo antes de empezar la clase.' using errcode='22023'; end if;
  update public.classes set status='active',started_at=coalesce(started_at,now()) where id=p_class_id returning * into v_class;
  return v_class;
end;
$$;

create function public.start_manual_class(
  p_class_type text,p_student_ids bigint[],p_scheduled_start_at timestamptz,p_duration_minutes integer,
  p_style_term_id bigint,p_location_term_id bigint default null,p_notes text default null
) returns public.classes language plpgsql security invoker set search_path='' as $$
declare clean_ids bigint[]; new_class public.classes; expected_count integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para iniciar clases.' using errcode='42501'; end if;
  if p_class_type not in ('individual','pair') then raise exception 'Tipo de clase no valido.' using errcode='22023'; end if;
  select coalesce(array_agg(id order by id),'{}'::bigint[]) into clean_ids from (select distinct unnest(p_student_ids) id) s;
  expected_count:=case when p_class_type='pair' then 2 else 1 end;
  if cardinality(clean_ids)<>expected_count then raise exception 'La clase requiere % alumno(s) distintos.',expected_count using errcode='22023'; end if;
  if p_duration_minutes is null or p_duration_minutes<=0 or p_duration_minutes>480 then raise exception 'Duracion no valida.' using errcode='22023'; end if;
  if p_scheduled_start_at is null then raise exception 'Fecha y hora obligatorias.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_style_term_id and taxonomy='dance_style' and active) then raise exception 'Estilo no valido.' using errcode='22023'; end if;
  if (select count(*) from public.student_profiles sp join public.people p on p.id=sp.person_id where sp.person_id=any(clean_ids) and sp.active and p.active)<>expected_count then raise exception 'Hay alumnos no validos o inactivos.' using errcode='22023'; end if;
  insert into public.classes(teacher_user_id,class_type,status,scheduled_start_at,duration_minutes,style_term_id,location_term_id,notes,started_at,created_by)
  values((select auth.uid()),p_class_type,'active',p_scheduled_start_at,p_duration_minutes,p_style_term_id,p_location_term_id,nullif(btrim(p_notes),''),now(),(select auth.uid()))
  returning * into new_class;
  insert into public.class_participants(class_id,person_id) select new_class.id,unnest(clean_ids);
  return new_class;
end;
$$;

create function public.set_class_participant_context(
  p_class_id bigint,p_person_id bigint,p_role_term_id bigint,p_level_term_id bigint
) returns public.class_participants language plpgsql security invoker set search_path='' as $$
declare v_style_id bigint; v_participant public.class_participants; v_primary boolean;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para editar el contexto de clase.' using errcode='42501'; end if;
  select c.style_term_id into v_style_id from public.classes c
  where c.id=p_class_id and c.status in ('active','finished') and c.pedagogy_closed_at is null;
  if not found then raise exception 'La clase no esta abierta para trabajo pedagogico.' using errcode='22023'; end if;
  if not exists(select 1 from public.class_participants where class_id=p_class_id and person_id=p_person_id) then raise exception 'El alumno no pertenece a esta clase.' using errcode='22023'; end if;
  if v_style_id is null then raise exception 'La clase necesita un estilo.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_role_term_id and taxonomy='dance_role' and active) then raise exception 'Rol no valido.' using errcode='22023'; end if;
  if not exists(select 1 from public.catalog_terms where id=p_level_term_id and taxonomy='dance_level' and active) then raise exception 'Nivel no valido.' using errcode='22023'; end if;
  select not exists(select 1 from public.student_dance_profiles where person_id=p_person_id and style_term_id=v_style_id and active) into v_primary;
  insert into public.student_dance_profiles(person_id,style_term_id,role_term_id,level_term_id,is_primary,active)
  values(p_person_id,v_style_id,p_role_term_id,p_level_term_id,v_primary,true)
  on conflict(person_id,style_term_id,role_term_id) do update set level_term_id=excluded.level_term_id,active=true;
  update public.class_participants set role_term_id=p_role_term_id,level_term_id=p_level_term_id
  where class_id=p_class_id and person_id=p_person_id returning * into v_participant;
  return v_participant;
end;
$$;

create function public.add_class_note(p_class_id bigint,p_person_id bigint,p_body text)
returns public.class_notes language plpgsql security invoker set search_path='' as $$
declare v_note public.class_notes;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para guardar notas de clase.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_body,'')))=0 then raise exception 'La nota esta vacia.' using errcode='22023'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and status in ('active','finished') and pedagogy_closed_at is null) then raise exception 'La clase no esta abierta.' using errcode='22023'; end if;
  if p_person_id is not null and not exists(select 1 from public.class_participants where class_id=p_class_id and person_id=p_person_id) then raise exception 'El alumno no pertenece a esta clase.' using errcode='22023'; end if;
  insert into public.class_notes(class_id,person_id,note_kind,body,created_by)
  values(p_class_id,p_person_id,'quick',btrim(p_body),(select auth.uid())) returning * into v_note;
  return v_note;
end;
$$;

create function public.save_class_evaluation(p_class_id bigint,p_person_id bigint,p_aptitude_term_id bigint,p_score smallint)
returns public.student_evaluations language plpgsql security invoker set search_path='' as $$
declare v_style_id bigint; v_role_id bigint; v_level_id bigint; v_level_key text; v_kind text; v_eval public.student_evaluations;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para evaluar alumnos.' using errcode='42501'; end if;
  if p_score not in (0,25,50,75,100) then raise exception 'La puntuacion debe ser 0, 25, 50, 75 o 100.' using errcode='22023'; end if;
  select c.style_term_id,cp.role_term_id,cp.level_term_id,l.term_key
  into v_style_id,v_role_id,v_level_id,v_level_key
  from public.classes c join public.class_participants cp on cp.class_id=c.id
  left join public.catalog_terms l on l.id=cp.level_term_id and l.taxonomy='dance_level'
  where c.id=p_class_id and cp.person_id=p_person_id and c.status in ('active','finished') and c.pedagogy_closed_at is null;
  if not found or v_style_id is null or v_role_id is null or v_level_id is null then raise exception 'Indica primero estilo, rol y nivel del alumno.' using errcode='22023'; end if;
  if not exists(
    select 1 from public.catalog_terms a
    where a.id=p_aptitude_term_id and a.taxonomy='aptitude' and a.active
      and coalesce((a.metadata->'levels') ? v_level_key,false)
  ) then raise exception 'Esta aptitud no corresponde al nivel actual.' using errcode='22023'; end if;
  v_kind:=case when exists(
    select 1 from public.student_evaluations e
    where e.person_id=p_person_id and e.style_term_id=v_style_id and e.role_term_id=v_role_id
      and e.class_id is distinct from p_class_id
  ) then 'class' else 'initial' end;
  insert into public.student_evaluations(person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,evaluation_kind,score,evaluated_by)
  values(p_person_id,p_class_id,v_style_id,v_role_id,v_level_id,p_aptitude_term_id,v_kind,p_score,(select auth.uid()))
  on conflict(class_id,person_id,aptitude_term_id) do update
    set style_term_id=excluded.style_term_id,role_term_id=excluded.role_term_id,level_term_id=excluded.level_term_id,
        evaluation_kind=excluded.evaluation_kind,score=excluded.score,evaluated_by=excluded.evaluated_by
  returning * into v_eval;
  return v_eval;
end;
$$;

create function public.create_class_correction(
  p_class_id bigint,p_person_id bigint,p_title text,p_measurement_mode text,
  p_frequency smallint default null,p_importance smallint default null
) returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare v_style_id bigint; v_role_id bigint; v_level_id bigint; v_category_id bigint; v_content public.teaching_contents; v_assignment public.student_content_assignments;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para crear correcciones.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,'')))=0 then raise exception 'Escribe el nombre de la correccion.' using errcode='22023'; end if;
  if p_measurement_mode not in ('frequency','importance','both','none') then raise exception 'Modo de medicion no valido.' using errcode='22023'; end if;
  if p_frequency is not null and (p_frequency<0 or p_frequency>100) then raise exception 'Frecuencia fuera de rango.' using errcode='22023'; end if;
  if p_importance is not null and (p_importance<0 or p_importance>100) then raise exception 'Importancia fuera de rango.' using errcode='22023'; end if;
  if p_measurement_mode in ('frequency','both') and p_frequency is null then raise exception 'Indica la frecuencia.' using errcode='22023'; end if;
  if p_measurement_mode in ('importance','both') and p_importance is null then raise exception 'Indica la importancia.' using errcode='22023'; end if;
  select c.style_term_id,cp.role_term_id,cp.level_term_id into v_style_id,v_role_id,v_level_id
  from public.classes c join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=p_person_id and c.status in ('active','finished') and c.pedagogy_closed_at is null;
  if not found or v_style_id is null or v_role_id is null or v_level_id is null then raise exception 'Indica primero estilo, rol y nivel del alumno.' using errcode='22023'; end if;
  select id into v_category_id from public.catalog_terms where taxonomy='correction_category' and term_key='general' and active limit 1;
  if v_category_id is null then raise exception 'Falta la categoria general de correcciones.' using errcode='22023'; end if;
  insert into public.teaching_contents(content_type,title,completion_status,publication_status,visibility,measurement_mode,category_term_id,created_by)
  values('correction',btrim(p_title),'complete','published','student',p_measurement_mode,v_category_id,(select auth.uid())) returning * into v_content;
  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style_id);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role_id);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level_id);
  insert into public.student_content_assignments(person_id,content_id,assignment_status,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,current_frequency,current_importance,source_class_id,assigned_by)
  values(p_person_id,v_content.id,'in_correction',v_style_id,v_role_id,v_level_id,p_measurement_mode,p_frequency,p_importance,p_class_id,(select auth.uid()))
  returning * into v_assignment;
  insert into public.student_content_measurements(assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by)
  values(v_assignment.id,p_class_id,'in_correction',p_frequency,p_importance,(select auth.uid()));
  return v_assignment;
end;
$$;

create function public.update_correction_assignment(
  p_assignment_id bigint,p_class_id bigint,p_assignment_status text,p_frequency smallint,p_importance smallint
) returns public.student_content_assignments language plpgsql security invoker set search_path='' as $$
declare v_assignment public.student_content_assignments; v_mode text;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para actualizar correcciones.' using errcode='42501'; end if;
  if p_assignment_status not in ('pending_explanation','explained','in_correction','improving','corrected','reopened') then raise exception 'Estado de correccion no valido.' using errcode='22023'; end if;
  select a.* into v_assignment
  from public.student_content_assignments a join public.teaching_contents t on t.id=a.content_id
  where a.id=p_assignment_id and t.content_type='correction' for update of a;
  if not found then raise exception 'La correccion no existe.' using errcode='P0002'; end if;
  v_mode:=v_assignment.snapshot_measurement_mode;
  if not exists(select 1 from public.class_participants where class_id=p_class_id and person_id=v_assignment.person_id) then raise exception 'La correccion no pertenece a un alumno de esta clase.' using errcode='22023'; end if;
  if not exists(select 1 from public.classes where id=p_class_id and status in ('active','finished') and pedagogy_closed_at is null) then raise exception 'La clase no esta abierta.' using errcode='22023'; end if;
  if p_frequency is not null and (p_frequency<0 or p_frequency>100) then raise exception 'Frecuencia fuera de rango.' using errcode='22023'; end if;
  if p_importance is not null and (p_importance<0 or p_importance>100) then raise exception 'Importancia fuera de rango.' using errcode='22023'; end if;
  if v_mode in ('frequency','both') and p_frequency is null then raise exception 'Indica la frecuencia.' using errcode='22023'; end if;
  if v_mode in ('importance','both') and p_importance is null then raise exception 'Indica la importancia.' using errcode='22023'; end if;
  update public.student_content_assignments
  set assignment_status=p_assignment_status,current_frequency=p_frequency,current_importance=p_importance,
      completed_at=case when p_assignment_status='corrected' then coalesce(completed_at,now()) else null end
  where id=p_assignment_id returning * into v_assignment;
  insert into public.student_content_measurements(assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by)
  values(p_assignment_id,p_class_id,p_assignment_status,p_frequency,p_importance,(select auth.uid()));
  return v_assignment;
end;
$$;

create function public.administratively_finish_class(
  p_class_id bigint,p_person_ids bigint[],p_attendance text[],p_grant_ids bigint[]
) returns public.classes language plpgsql security invoker set search_path='' as $$
declare v_class public.classes; v_expected integer; i integer; v_person_id bigint; v_grant_id bigint; v_attendance text; v_balance integer; v_movement_person bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para terminar clases.' using errcode='42501'; end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.status<>'active' then raise exception 'Solo se puede terminar una clase activa.' using errcode='22023'; end if;
  select count(*) into v_expected from public.class_participants where class_id=p_class_id;
  if cardinality(p_person_ids)<>v_expected or cardinality(p_attendance)<>v_expected or cardinality(p_grant_ids)<>v_expected then raise exception 'Faltan datos de asistencia o bono.' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_person_ids) x)<>v_expected
     or (select count(*) from public.class_participants where class_id=p_class_id and person_id=any(p_person_ids))<>v_expected then
    raise exception 'La lista de alumnos no coincide con la clase.' using errcode='22023';
  end if;
  for i in 1..v_expected loop
    v_person_id:=p_person_ids[i]; v_attendance:=p_attendance[i]; v_grant_id:=p_grant_ids[i];
    if v_attendance not in ('present','absent') then raise exception 'Asistencia no valida.' using errcode='22023'; end if;
    if v_attendance='absent' and v_grant_id is not null then raise exception 'Un alumno ausente no puede consumir bono.' using errcode='22023'; end if;
    if v_grant_id is not null then
      if not exists(
        select 1 from public.credit_grants g join public.credit_grant_members gm on gm.grant_id=g.id
        where g.id=v_grant_id and gm.person_id=v_person_id and g.status='active'
      ) then raise exception 'El bono seleccionado no esta disponible para este alumno.' using errcode='22023'; end if;
    end if;
    update public.class_participants set attendance_status=v_attendance,billing_grant_id=case when v_attendance='present' then v_grant_id else null end
    where class_id=p_class_id and person_id=v_person_id;
  end loop;
  for v_grant_id in select distinct x from unnest(p_grant_ids) x where x is not null loop
    perform 1 from public.credit_grants where id=v_grant_id for update;
    select coalesce(sum(delta_minutes),0) into v_balance from public.credit_movements where grant_id=v_grant_id;
    if v_balance<v_class.duration_minutes then raise exception 'Saldo insuficiente en uno de los bonos seleccionados.' using errcode='22023'; end if;
    select case when count(*)=1 then min(person_id) else null end into v_movement_person
    from unnest(p_person_ids,p_grant_ids) as x(person_id,grant_id) where grant_id=v_grant_id;
    insert into public.credit_movements(grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by)
    values(v_grant_id,v_movement_person,p_class_id,'class',-v_class.duration_minutes,'Consumo de clase',(select auth.uid()));
    if v_balance-v_class.duration_minutes=0 then update public.credit_grants set status='exhausted' where id=v_grant_id; end if;
  end loop;
  update public.classes set status='finished',administrative_finished_at=now() where id=p_class_id returning * into v_class;
  return v_class;
end;
$$;

create function public.close_class_pedagogy(p_class_id bigint)
returns public.classes language plpgsql security invoker set search_path='' as $$
declare v_class public.classes;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cerrar clases.' using errcode='42501'; end if;
  select * into v_class from public.classes where id=p_class_id for update;
  if not found then raise exception 'La clase no existe.' using errcode='P0002'; end if;
  if v_class.pedagogy_closed_at is not null then return v_class; end if;
  if v_class.status<>'finished' or v_class.administrative_finished_at is null then raise exception 'Termina primero la parte administrativa de la clase.' using errcode='22023'; end if;
  update public.classes set pedagogy_closed_at=now() where id=p_class_id returning * into v_class;
  return v_class;
end;
$$;

revoke all on function public.start_class(bigint) from public,anon;
revoke all on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) from public,anon;
revoke all on function public.set_class_participant_context(bigint,bigint,bigint,bigint) from public,anon;
revoke all on function public.add_class_note(bigint,bigint,text) from public,anon;
revoke all on function public.save_class_evaluation(bigint,bigint,bigint,smallint) from public,anon;
revoke all on function public.create_class_correction(bigint,bigint,text,text,smallint,smallint) from public,anon;
revoke all on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint) from public,anon;
revoke all on function public.administratively_finish_class(bigint,bigint[],text[],bigint[]) from public,anon;
revoke all on function public.close_class_pedagogy(bigint) from public,anon;
grant execute on function public.start_class(bigint) to authenticated;
grant execute on function public.start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text) to authenticated;
grant execute on function public.set_class_participant_context(bigint,bigint,bigint,bigint) to authenticated;
grant execute on function public.add_class_note(bigint,bigint,text) to authenticated;
grant execute on function public.save_class_evaluation(bigint,bigint,bigint,smallint) to authenticated;
grant execute on function public.create_class_correction(bigint,bigint,text,text,smallint,smallint) to authenticated;
grant execute on function public.update_correction_assignment(bigint,bigint,text,smallint,smallint) to authenticated;
grant execute on function public.administratively_finish_class(bigint,bigint[],text[],bigint[]) to authenticated;
grant execute on function public.close_class_pedagogy(bigint) to authenticated;

commit;
