-- CYA Hub P0F / v54
-- Dar clase operativo + evaluación por hitos.
-- Incremental, idempotent, no destructive backfill.

begin;

-- 1) Correcciones: estado intermedio canónico.
alter table public.student_content_assignments
  drop constraint if exists student_content_assignments_assignment_status_check;
alter table public.student_content_assignments
  add constraint student_content_assignments_assignment_status_check
  check (assignment_status = any (array['pending'::text,'in_correction'::text,'corrected'::text,'explained'::text,'active'::text,'completed'::text]));

-- 2) Observaciones individuales ligadas opcionalmente a un contenido.
alter table public.class_notes
  add column if not exists content_id bigint references public.teaching_contents(id) on delete cascade;
create index if not exists class_notes_content_idx on public.class_notes(content_id) where content_id is not null;
create unique index if not exists class_notes_class_person_content_uidx
  on public.class_notes(class_id,person_id,content_id)
  where content_id is not null and person_id is not null;

alter table public.class_content_events
  drop constraint if exists class_content_events_event_type_check;
alter table public.class_content_events
  add constraint class_content_events_event_type_check
  check (event_type = any (array[
    'added'::text,'improved'::text,'reviewed'::text,'status_changed'::text,'measurement_changed'::text,
    'exercise_pending'::text,'exercise_active'::text,'exercise_completed'::text,'note_changed'::text
  ]));

-- 3) El hito es estado pedagógico; raw_score es la única puntuación real.
alter table public.student_aptitude_progress
  add column if not exists current_milestone_id bigint references public.evaluation_milestones(id) on delete set null,
  add column if not exists score_before_pending smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.student_aptitude_progress'::regclass
      and conname='student_aptitude_progress_score_before_pending_check'
  ) then
    alter table public.student_aptitude_progress
      add constraint student_aptitude_progress_score_before_pending_check
      check (score_before_pending is null or (score_before_pending >= 0 and score_before_pending <= 100));
  end if;
end $$;
create index if not exists student_aptitude_progress_current_milestone_idx
  on public.student_aptitude_progress(current_milestone_id) where current_milestone_id is not null;

-- Compatibilidad histórica: cualquier hito previamente aceptado pasa a ser hito actual.
update public.student_aptitude_progress p
set current_milestone_id = accepted.milestone_id,
    effective_score = p.raw_score,
    updated_at = now()
from lateral (
  select d.milestone_id
  from public.evaluation_milestone_decisions d
  join public.evaluation_milestones m on m.id=d.milestone_id
  where d.progress_id=p.id and d.decision='accepted'
  order by m.threshold_score desc,d.created_at desc,d.id desc
  limit 1
) accepted
where p.current_milestone_id is null;

update public.student_aptitude_progress
set effective_score=raw_score
where effective_score is distinct from raw_score;

-- Las decisiones de hito son del alumno/parámetro. Clase y sesión son procedencia opcional.
alter table public.evaluation_milestone_decisions alter column session_id drop not null;
alter table public.evaluation_milestone_decisions alter column class_id drop not null;

-- 4) Ninguna evaluación puede bloquear el cierre pedagógico.
drop trigger if exists trg_require_final_evaluation on public.classes;

-- 5) Crear corrección: Pendiente por defecto; Frecuencia + Influencia habilitadas,
--    pero ambos valores pueden empezar en NULL.
create or replace function public.create_class_correction(
  p_class_id bigint,
  p_person_id bigint,
  p_title text,
  p_measurement_mode text default 'both',
  p_frequency smallint default null,
  p_importance smallint default null
)
returns public.student_content_assignments
language plpgsql
set search_path to ''
as $function$
declare
  v_style_id bigint;
  v_role_id bigint;
  v_level_id bigint;
  v_category_id bigint;
  v_content public.teaching_contents;
  v_assignment public.student_content_assignments;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para crear correcciones.' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_title,'')))=0 then
    raise exception 'Escribe el nombre de la corrección.' using errcode='22023';
  end if;
  if p_measurement_mode not in ('frequency','importance','both','none') then
    raise exception 'Modo de medición no válido.' using errcode='22023';
  end if;
  if p_frequency is not null and (p_frequency<0 or p_frequency>100) then
    raise exception 'Frecuencia fuera de rango.' using errcode='22023';
  end if;
  if p_importance is not null and (p_importance<0 or p_importance>100) then
    raise exception 'Influencia fuera de rango.' using errcode='22023';
  end if;

  select c.style_term_id,cp.role_term_id,cp.level_term_id
    into v_style_id,v_role_id,v_level_id
  from public.classes c
  join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=p_person_id
    and c.status in ('active','finished') and c.pedagogy_closed_at is null;
  if not found or v_style_id is null or v_role_id is null or v_level_id is null then
    raise exception 'Indica primero estilo, rol y nivel del alumno.' using errcode='22023';
  end if;

  select id into v_category_id
  from public.catalog_terms
  where taxonomy='correction_category' and term_key='general' and active limit 1;

  insert into public.teaching_contents(
    content_type,title,completion_status,publication_status,visibility,measurement_mode,category_term_id,created_by
  ) values (
    'correction',btrim(p_title),'incomplete','draft','staff',p_measurement_mode,v_category_id,(select auth.uid())
  ) returning * into v_content;

  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style_id);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role_id);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level_id);

  insert into public.student_content_assignments(
    person_id,content_id,assignment_status,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,
    snapshot_measurement_mode,current_frequency,current_importance,source_class_id,assigned_by
  ) values (
    p_person_id,v_content.id,'pending',v_style_id,v_role_id,v_level_id,p_measurement_mode,
    p_frequency,p_importance,p_class_id,(select auth.uid())
  ) returning * into v_assignment;

  insert into public.student_content_measurements(
    assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
  ) values (
    v_assignment.id,p_class_id,'pending',p_frequency,p_importance,(select auth.uid())
  );

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,new_status,payload,created_by
  ) values (
    p_class_id,p_person_id,v_content.id,'added','pending',
    jsonb_build_object('content_type','correction','measurement_mode',p_measurement_mode),(select auth.uid())
  );
  return v_assignment;
end
$function$;

-- 6) Edición de corrección: NULL significa sin valorar; no fabricar cero.
create or replace function public.update_correction_assignment(
  p_assignment_id bigint,
  p_class_id bigint,
  p_assignment_status text,
  p_frequency smallint default null,
  p_importance smallint default null
)
returns public.student_content_assignments
language plpgsql
set search_path to ''
as $function$
declare
  v_assignment public.student_content_assignments;
  v_old_status text;
  v_old_frequency smallint;
  v_old_importance smallint;
  v_recent bigint;
  v_event text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar correcciones.' using errcode='42501';
  end if;
  if p_assignment_status not in ('pending','in_correction','corrected') then
    raise exception 'Estado de corrección no válido.' using errcode='22023';
  end if;
  select a.* into v_assignment
  from public.student_content_assignments a
  join public.teaching_contents t on t.id=a.content_id
  where a.id=p_assignment_id and t.content_type='correction'
  for update of a;
  if not found then raise exception 'La corrección no existe.' using errcode='P0002'; end if;
  if not exists(select 1 from public.class_participants where class_id=p_class_id and person_id=v_assignment.person_id)
     or not exists(select 1 from public.classes where id=p_class_id and status in ('active','finished') and pedagogy_closed_at is null) then
    raise exception 'La corrección no pertenece a una clase abierta.' using errcode='22023';
  end if;
  if p_frequency is not null and (p_frequency<0 or p_frequency>100) then
    raise exception 'Frecuencia fuera de rango.' using errcode='22023';
  end if;
  if p_importance is not null and (p_importance<0 or p_importance>100) then
    raise exception 'Influencia fuera de rango.' using errcode='22023';
  end if;

  v_old_status:=v_assignment.assignment_status;
  v_old_frequency:=v_assignment.current_frequency;
  v_old_importance:=v_assignment.current_importance;

  update public.student_content_assignments
  set assignment_status=p_assignment_status,
      current_frequency=p_frequency,
      current_importance=p_importance,
      completed_at=case when p_assignment_status='corrected' then coalesce(completed_at,now()) else null end,
      student_visible_at=case when p_assignment_status in ('pending','in_correction') then null else student_visible_at end
  where id=p_assignment_id returning * into v_assignment;

  select id into v_recent
  from public.student_content_measurements
  where assignment_id=p_assignment_id and created_at>=now()-interval '120 seconds'
  order by created_at desc limit 1 for update;
  if v_recent is null then
    insert into public.student_content_measurements(
      assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
    ) values (p_assignment_id,p_class_id,p_assignment_status,p_frequency,p_importance,(select auth.uid()));
  else
    update public.student_content_measurements
    set class_id=p_class_id,assignment_status=p_assignment_status,frequency_score=p_frequency,
        importance_score=p_importance,measured_by=(select auth.uid())
    where id=v_recent;
  end if;

  if v_old_status is distinct from p_assignment_status then v_event:='status_changed';
  elsif v_old_frequency is distinct from p_frequency or v_old_importance is distinct from p_importance then v_event:='measurement_changed';
  else return v_assignment;
  end if;

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_by
  ) values (
    p_class_id,v_assignment.person_id,v_assignment.content_id,v_event,v_old_status,p_assignment_status,
    jsonb_build_object(
      'content_type','correction','old_frequency',v_old_frequency,'new_frequency',p_frequency,
      'old_influence',v_old_importance,'new_influence',p_importance
    ),(select auth.uid())
  );
  return v_assignment;
end
$function$;

-- 7) Una observación editable por alumno + contenido + clase, con visibilidad independiente.
create or replace function public.upsert_class_content_note(
  p_class_id bigint,
  p_person_id bigint,
  p_content_id bigint,
  p_body text,
  p_visibility_scope text default 'internal'
)
returns public.class_notes
language plpgsql
set search_path to ''
as $function$
declare
  v_note public.class_notes;
  v_old_body text;
  v_old_visibility text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para guardar observaciones.' using errcode='42501';
  end if;
  if p_visibility_scope not in ('internal','student') then
    raise exception 'Visibilidad no válida.' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_body,'')))=0 then
    raise exception 'La observación está vacía.' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.classes c join public.class_participants cp on cp.class_id=c.id
    where c.id=p_class_id and cp.person_id=p_person_id
      and c.status in ('active','finished') and c.pedagogy_closed_at is null
  ) then raise exception 'La clase no está abierta para este alumno.' using errcode='22023'; end if;
  if not exists(select 1 from public.teaching_contents where id=p_content_id) then
    raise exception 'El contenido no existe.' using errcode='P0002';
  end if;

  select body,visibility_scope into v_old_body,v_old_visibility
  from public.class_notes
  where class_id=p_class_id and person_id=p_person_id and content_id=p_content_id
  for update;

  insert into public.class_notes(class_id,person_id,content_id,note_kind,body,visibility_scope,created_by)
  values(p_class_id,p_person_id,p_content_id,'quick',btrim(p_body),p_visibility_scope,(select auth.uid()))
  on conflict(class_id,person_id,content_id) where content_id is not null and person_id is not null
  do update set body=excluded.body,visibility_scope=excluded.visibility_scope,updated_at=now()
  returning * into v_note;

  if v_old_body is distinct from v_note.body or v_old_visibility is distinct from v_note.visibility_scope then
    insert into public.class_content_events(
      class_id,person_id,content_id,event_type,payload,created_by
    ) values (
      p_class_id,p_person_id,p_content_id,'note_changed',
      jsonb_build_object('old_visibility',v_old_visibility,'new_visibility',v_note.visibility_scope),(select auth.uid())
    );
  end if;
  return v_note;
end
$function$;

-- 8) Motor canónico de puntuación/hitos.
create or replace function private.refresh_aptitude_progress(
  p_progress_id bigint,
  p_class_id bigint default null,
  p_previous_score smallint default null
)
returns public.student_aptitude_progress
language plpgsql
set search_path to ''
as $function$
declare
  v_progress public.student_aptitude_progress;
  v_current_threshold smallint:=0;
  v_next public.evaluation_milestones;
  v_restore smallint;
begin
  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found then raise exception 'El progreso no existe.' using errcode='P0002'; end if;

  -- Hitos históricos aceptados se reconocen si la columna nueva aún no estaba poblada.
  if v_progress.current_milestone_id is null then
    select d.milestone_id into v_progress.current_milestone_id
    from public.evaluation_milestone_decisions d
    join public.evaluation_milestones m on m.id=d.milestone_id
    where d.progress_id=v_progress.id and d.decision='accepted'
    order by m.threshold_score desc,d.created_at desc,d.id desc limit 1;
    if v_progress.current_milestone_id is not null then
      update public.student_aptitude_progress set current_milestone_id=v_progress.current_milestone_id where id=v_progress.id;
    end if;
  end if;

  if v_progress.current_milestone_id is not null then
    select threshold_score into v_current_threshold
    from public.evaluation_milestones
    where id=v_progress.current_milestone_id and active;
    v_current_threshold:=coalesce(v_current_threshold,0);
  end if;

  select m.* into v_next
  from public.evaluation_milestones m
  where m.active
    and m.style_term_id=v_progress.style_term_id
    and m.role_term_id=v_progress.role_term_id
    and m.level_term_id=v_progress.level_term_id
    and m.aptitude_term_id=v_progress.aptitude_term_id
    and m.threshold_score>v_current_threshold
    and m.threshold_score<=v_progress.raw_score
  order by m.threshold_score,m.sort_order,m.id
  limit 1;

  if found then
    v_restore:=case
      when p_previous_score is not null and p_previous_score<v_next.threshold_score then p_previous_score
      when v_progress.pending_milestone_id=v_next.id then v_progress.score_before_pending
      else null
    end;
    update public.student_aptitude_progress
    set effective_score=raw_score,
        pending_milestone_id=v_next.id,
        pending_since_class_id=case
          when pending_milestone_id is distinct from v_next.id then p_class_id
          else coalesce(pending_since_class_id,p_class_id)
        end,
        score_before_pending=case
          when pending_milestone_id is distinct from v_next.id then v_restore
          else coalesce(score_before_pending,v_restore)
        end,
        updated_at=now()
    where id=v_progress.id returning * into v_progress;
  else
    update public.student_aptitude_progress
    set effective_score=raw_score,
        pending_milestone_id=null,
        pending_since_class_id=null,
        score_before_pending=null,
        updated_at=now()
    where id=v_progress.id returning * into v_progress;
  end if;
  return v_progress;
end
$function$;

create or replace function private.award_teaching_content_points(
  p_class_id bigint,
  p_person_id bigint,
  p_content_id bigint,
  p_source_event_id bigint default null
)
returns void
language plpgsql
set search_path to ''
as $function$
declare
  v_style bigint;
  v_role bigint;
  v_level bigint;
  v_map public.teaching_content_evaluation_points;
  v_progress public.student_aptitude_progress;
  v_award_id bigint;
  v_previous smallint;
begin
  select c.style_term_id,cp.role_term_id,cp.level_term_id
    into v_style,v_role,v_level
  from public.classes c join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id and cp.person_id=p_person_id;
  if not found or v_style is null or v_role is null or v_level is null then return; end if;

  for v_map in
    select * from public.teaching_content_evaluation_points m
    where m.content_id=p_content_id and m.style_term_id=v_style and m.role_term_id=v_role
      and m.level_term_id=v_level and m.active
  loop
    insert into public.student_aptitude_progress(
      person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,raw_score,effective_score
    ) values (p_person_id,v_style,v_role,v_level,v_map.aptitude_term_id,0,0)
    on conflict(person_id,style_term_id,role_term_id,level_term_id,aptitude_term_id) do nothing;

    select * into v_progress
    from public.student_aptitude_progress
    where person_id=p_person_id and style_term_id=v_style and role_term_id=v_role
      and level_term_id=v_level and aptitude_term_id=v_map.aptitude_term_id
    for update;
    v_previous:=v_progress.raw_score;
    v_award_id:=null;

    insert into public.evaluation_progress_awards(
      progress_id,class_id,person_id,content_id,style_term_id,role_term_id,level_term_id,
      aptitude_term_id,points,source_event_id,awarded_by
    ) values (
      v_progress.id,p_class_id,p_person_id,p_content_id,v_style,v_role,v_level,v_map.aptitude_term_id,
      v_map.points,p_source_event_id,(select auth.uid())
    ) on conflict(person_id,content_id,style_term_id,role_term_id,level_term_id,aptitude_term_id)
      do nothing returning id into v_award_id;

    if v_award_id is not null then
      update public.student_aptitude_progress
      set raw_score=least(100,raw_score+v_map.points),effective_score=least(100,raw_score+v_map.points),updated_at=now()
      where id=v_progress.id;
      perform private.refresh_aptitude_progress(v_progress.id,p_class_id,v_previous);
    end if;
  end loop;
end
$function$;

-- El motor existía pero no estaba conectado al stream real de eventos de clase.
drop trigger if exists trg_class_content_progress on public.class_content_events;
create trigger trg_class_content_progress
after insert on public.class_content_events
for each row execute function private.class_content_progress_trigger();

-- 9) Decisión rápida sobre el hito pendiente, sin hacer que la clase sea propietaria.
create or replace function public.decide_aptitude_milestone(
  p_progress_id bigint,
  p_decision text,
  p_class_id bigint default null,
  p_note text default null
)
returns public.student_aptitude_progress
language plpgsql
set search_path to ''
as $function$
declare
  v_progress public.student_aptitude_progress;
  v_milestone public.evaluation_milestones;
  v_restore smallint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para revisar hitos.' using errcode='42501';
  end if;
  if p_decision not in ('accepted','rejected') then
    raise exception 'Decisión de hito no válida.' using errcode='22023';
  end if;
  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found then raise exception 'El progreso no existe.' using errcode='P0002'; end if;
  if v_progress.pending_milestone_id is null then
    raise exception 'Este parámetro no tiene un hito pendiente de revisión.' using errcode='22023';
  end if;
  select * into v_milestone from public.evaluation_milestones
  where id=v_progress.pending_milestone_id and active;
  if not found then raise exception 'El hito pendiente ya no está disponible.' using errcode='22023'; end if;

  insert into public.evaluation_milestone_decisions(
    session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by
  ) values (
    null,v_progress.id,v_milestone.id,p_class_id,p_decision,null,
    nullif(btrim(coalesce(p_note,'')),''),(select auth.uid())
  );

  if p_decision='accepted' then
    update public.student_aptitude_progress
    set current_milestone_id=v_milestone.id,
        effective_score=raw_score,
        pending_milestone_id=null,pending_since_class_id=null,score_before_pending=null,updated_at=now()
    where id=v_progress.id returning * into v_progress;
    v_progress:=private.refresh_aptitude_progress(v_progress.id,p_class_id,v_progress.raw_score);
  else
    v_restore:=v_progress.score_before_pending;
    if v_restore is null or v_restore>=v_milestone.threshold_score then
      raise exception 'No existe una puntuación previa válida bajo el umbral; revisa la puntuación manualmente.' using errcode='22023';
    end if;
    update public.student_aptitude_progress
    set raw_score=v_restore,effective_score=v_restore,
        pending_milestone_id=null,pending_since_class_id=null,score_before_pending=null,updated_at=now()
    where id=v_progress.id returning * into v_progress;
  end if;
  return v_progress;
end
$function$;

-- Selección manual de hito: el hito es la acción principal; el score manual es opcional.
create or replace function public.set_aptitude_milestone(
  p_progress_id bigint,
  p_milestone_id bigint,
  p_score smallint default null,
  p_class_id bigint default null,
  p_note text default null
)
returns public.student_aptitude_progress
language plpgsql
set search_path to ''
as $function$
declare
  v_progress public.student_aptitude_progress;
  v_milestone public.evaluation_milestones;
  v_score smallint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para modificar hitos.' using errcode='42501';
  end if;
  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found then raise exception 'El progreso no existe.' using errcode='P0002'; end if;
  select * into v_milestone from public.evaluation_milestones
  where id=p_milestone_id and active
    and style_term_id=v_progress.style_term_id and role_term_id=v_progress.role_term_id
    and level_term_id=v_progress.level_term_id and aptitude_term_id=v_progress.aptitude_term_id;
  if not found then raise exception 'El hito no corresponde a este parámetro.' using errcode='22023'; end if;
  v_score:=coalesce(p_score,v_milestone.threshold_score);
  if v_score<0 or v_score>100 then raise exception 'Puntuación fuera de rango.' using errcode='22023'; end if;

  insert into public.evaluation_milestone_decisions(
    session_id,progress_id,milestone_id,class_id,decision,descriptor_id,note,decided_by
  ) values(null,v_progress.id,v_milestone.id,p_class_id,'accepted',null,
           nullif(btrim(coalesce(p_note,'')),''),(select auth.uid()));

  update public.student_aptitude_progress
  set current_milestone_id=v_milestone.id,raw_score=v_score,effective_score=v_score,
      pending_milestone_id=null,pending_since_class_id=null,score_before_pending=null,updated_at=now()
  where id=v_progress.id returning * into v_progress;
  v_progress:=private.refresh_aptitude_progress(v_progress.id,p_class_id,v_score);
  return v_progress;
end
$function$;

create or replace function public.adjust_aptitude_score(
  p_progress_id bigint,
  p_score smallint,
  p_class_id bigint default null
)
returns public.student_aptitude_progress
language plpgsql
set search_path to ''
as $function$
declare
  v_progress public.student_aptitude_progress;
  v_previous smallint;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para modificar puntuaciones.' using errcode='42501';
  end if;
  if p_score<0 or p_score>100 then raise exception 'Puntuación fuera de rango.' using errcode='22023'; end if;
  select * into v_progress from public.student_aptitude_progress where id=p_progress_id for update;
  if not found then raise exception 'El progreso no existe.' using errcode='P0002'; end if;
  v_previous:=v_progress.raw_score;
  update public.student_aptitude_progress set raw_score=p_score,effective_score=p_score,updated_at=now()
  where id=p_progress_id;
  return private.refresh_aptitude_progress(p_progress_id,p_class_id,v_previous);
end
$function$;

-- 10) Todas las evaluaciones comparten el mismo cierre funcional.
create or replace function public.complete_context_evaluation(p_session_id bigint)
returns public.evaluation_sessions
language plpgsql
set search_path to ''
as $function$
declare
  v_session public.evaluation_sessions;
  v_expected integer;
  v_reviewed integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para cerrar evaluaciones.' using errcode='42501'; end if;
  select * into v_session from public.evaluation_sessions where id=p_session_id for update;
  if not found then raise exception 'La evaluación no existe.' using errcode='P0002'; end if;
  if v_session.status='completed' then return v_session; end if;
  select count(*) into v_expected from public.student_evaluations where session_id=p_session_id;
  select count(*) into v_reviewed from public.student_evaluations where session_id=p_session_id and reviewed_at is not null;
  if v_expected=0 then raise exception 'La evaluación no tiene parámetros.' using errcode='22023'; end if;
  if v_reviewed<v_expected then
    raise exception 'Completa todos los parámetros de la evaluación (% de %).',v_reviewed,v_expected using errcode='22023';
  end if;
  update public.evaluation_sessions set status='completed',completed_at=now(),updated_at=now()
  where id=p_session_id returning * into v_session;
  return v_session;
end
$function$;

-- 11) Cerrar una clase solo exige el cierre administrativo; nunca una evaluación.
create or replace function private.require_final_evaluation_before_pedagogy_close()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if old.pedagogy_closed_at is not null or new.pedagogy_closed_at is null then return new; end if;
  if new.administrative_finished_at is null then
    raise exception 'Termina primero la parte administrativa de la clase.' using errcode='22023';
  end if;
  return new;
end
$function$;

-- Seguridad de RPC nuevas/modificadas.
revoke all on function public.upsert_class_content_note(bigint,bigint,bigint,text,text) from public, anon;
grant execute on function public.upsert_class_content_note(bigint,bigint,bigint,text,text) to authenticated;
revoke all on function public.decide_aptitude_milestone(bigint,text,bigint,text) from public, anon;
grant execute on function public.decide_aptitude_milestone(bigint,text,bigint,text) to authenticated;
revoke all on function public.set_aptitude_milestone(bigint,bigint,smallint,bigint,text) from public, anon;
grant execute on function public.set_aptitude_milestone(bigint,bigint,smallint,bigint,text) to authenticated;
revoke all on function public.adjust_aptitude_score(bigint,smallint,bigint) from public, anon;
grant execute on function public.adjust_aptitude_score(bigint,smallint,bigint) to authenticated;

commit;
