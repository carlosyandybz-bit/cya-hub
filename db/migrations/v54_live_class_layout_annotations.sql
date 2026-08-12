begin;

-- P21 corrective / v54 — live-class compact editing, five-level measurements and per-content observations.
-- This migration is intentionally backwards-compatible and must not be applied to production without explicit approval.

alter table public.class_content_events
  drop constraint if exists class_content_events_event_type_check;

alter table public.class_content_events
  add constraint class_content_events_event_type_check
  check (event_type = any (array[
    'added'::text,
    'improved'::text,
    'reviewed'::text,
    'status_changed'::text,
    'measurement_changed'::text,
    'exercise_pending'::text,
    'exercise_active'::text,
    'exercise_completed'::text,
    'annotation_changed'::text
  ]));

create or replace function public.create_class_correction(
  p_class_id bigint,
  p_person_id bigint,
  p_title text,
  p_measurement_mode text,
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
  if p_frequency is not null and p_frequency not in (0,25,50,75,100) then
    raise exception 'La frecuencia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;
  if p_importance is not null and p_importance not in (0,25,50,75,100) then
    raise exception 'La importancia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;
  if p_measurement_mode not in ('frequency','both') then p_frequency:=null; end if;
  if p_measurement_mode not in ('importance','both') then p_importance:=null; end if;

  select c.style_term_id,cp.role_term_id,cp.level_term_id
    into v_style_id,v_role_id,v_level_id
  from public.classes c
  join public.class_participants cp on cp.class_id=c.id
  where c.id=p_class_id
    and cp.person_id=p_person_id
    and c.status in ('active','finished')
    and c.pedagogy_closed_at is null;
  if not found or v_style_id is null or v_role_id is null or v_level_id is null then
    raise exception 'Indica primero estilo, rol y nivel del alumno.' using errcode='22023';
  end if;

  select id into v_category_id
  from public.catalog_terms
  where taxonomy='correction_category' and term_key='general' and active
  limit 1;

  insert into public.teaching_contents(
    content_type,title,completion_status,publication_status,visibility,measurement_mode,category_term_id,created_by
  ) values(
    'correction',btrim(p_title),'incomplete','draft','staff',p_measurement_mode,v_category_id,(select auth.uid())
  ) returning * into v_content;

  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style_id);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role_id);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level_id);

  insert into public.student_content_assignments(
    person_id,content_id,assignment_status,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,
    snapshot_measurement_mode,current_frequency,current_importance,source_class_id,assigned_by
  ) values(
    p_person_id,v_content.id,'pending',v_style_id,v_role_id,v_level_id,p_measurement_mode,p_frequency,p_importance,p_class_id,(select auth.uid())
  ) returning * into v_assignment;

  insert into public.student_content_measurements(
    assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
  ) values(
    v_assignment.id,p_class_id,'pending',p_frequency,p_importance,(select auth.uid())
  );

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,new_status,payload,created_by
  ) values(
    p_class_id,p_person_id,v_content.id,'added','pending',
    jsonb_build_object('content_type','correction','frequency',p_frequency,'importance',p_importance),
    (select auth.uid())
  );
  return v_assignment;
end;
$function$;

create or replace function public.create_quick_class_content(
  p_class_id bigint,
  p_person_id bigint,
  p_content_type text,
  p_title text
)
returns public.teaching_contents
language plpgsql
set search_path to ''
as $function$
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
  select id into v_category
  from public.catalog_terms
  where taxonomy=v_tax and term_key='general' and active
  limit 1;

  insert into public.teaching_contents(
    content_type,title,completion_status,publication_status,visibility,measurement_mode,category_term_id,created_by
  ) values(
    p_content_type,btrim(p_title),'incomplete','draft','staff','both',v_category,(select auth.uid())
  ) returning * into v_content;

  insert into public.teaching_content_styles(content_id,style_term_id) values(v_content.id,v_style);
  insert into public.teaching_content_roles(content_id,role_term_id) values(v_content.id,v_role);
  insert into public.teaching_content_levels(content_id,level_term_id) values(v_content.id,v_level);

  if p_content_type='exercise' then
    insert into public.class_content_events(class_id,person_id,content_id,event_type,new_status,payload,created_by)
    values(p_class_id,p_person_id,v_content.id,'exercise_pending','pending',jsonb_build_object('content_type','exercise'),(select auth.uid()));
  else
    insert into public.student_content_assignments(
      person_id,content_id,assignment_status,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,
      snapshot_measurement_mode,current_frequency,current_importance,source_class_id,assigned_by
    ) values(
      p_person_id,v_content.id,'pending',v_style,v_role,v_level,'both',null,null,p_class_id,(select auth.uid())
    ) returning * into v_assignment;

    insert into public.student_content_measurements(
      assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
    ) values(v_assignment.id,p_class_id,'pending',null,null,(select auth.uid()));

    insert into public.class_content_events(class_id,person_id,content_id,event_type,new_status,payload,created_by)
    values(p_class_id,p_person_id,v_content.id,'added','pending',jsonb_build_object('content_type',p_content_type),(select auth.uid()));
  end if;
  return v_content;
end;
$function$;

create or replace function public.update_teaching_assignment_status(
  p_assignment_id bigint,
  p_assignment_status text
)
returns public.student_content_assignments
language plpgsql
set search_path to ''
as $function$
declare
  v_assignment public.student_content_assignments;
  v_type text;
  v_done boolean;
  v_releasable boolean;
  v_source_closed boolean:=false;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar enseñanza.' using errcode='42501';
  end if;
  select a into v_assignment from public.student_content_assignments a where a.id=p_assignment_id for update;
  if not found then raise exception 'La asignación no existe.' using errcode='P0002'; end if;
  select t.content_type into v_type from public.teaching_contents t where t.id=v_assignment.content_id;
  if (v_type='correction' and p_assignment_status not in ('pending','active','corrected'))
     or (v_type in ('explanation','sequence') and p_assignment_status not in ('pending','explained'))
     or (v_type='exercise' and p_assignment_status not in ('pending','active','completed')) then
    raise exception 'Estado no válido para este tipo de contenido.' using errcode='22023';
  end if;
  v_done:=p_assignment_status in ('corrected','explained','completed');
  v_releasable:=private.assignment_is_student_releasable(v_type,p_assignment_status);
  if v_assignment.source_class_id is not null then
    select c.pedagogy_closed_at is not null into v_source_closed from public.classes c where c.id=v_assignment.source_class_id;
  end if;
  update public.student_content_assignments
  set assignment_status=p_assignment_status,
      completed_at=case when v_done then coalesce(completed_at,now()) else null end,
      student_visible_at=case
        when not v_releasable then null
        when source_class_id is null then coalesce(student_visible_at,now())
        when v_source_closed then coalesce(student_visible_at,now())
        else student_visible_at
      end
  where id=p_assignment_id
  returning * into v_assignment;
  insert into public.student_content_measurements(
    assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
  ) values(
    v_assignment.id,null,p_assignment_status,v_assignment.current_frequency,v_assignment.current_importance,(select auth.uid())
  );
  return v_assignment;
end;
$function$;

create or replace function public.update_correction_assignment(
  p_assignment_id bigint,
  p_class_id bigint,
  p_assignment_status text,
  p_frequency smallint,
  p_importance smallint
)
returns public.student_content_assignments
language plpgsql
set search_path to ''
as $function$
declare
  v_assignment public.student_content_assignments;
  v_mode text;
  v_old_status text;
  v_old_frequency smallint;
  v_old_importance smallint;
  v_recent bigint;
  v_event text;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para actualizar correcciones.' using errcode='42501';
  end if;
  if p_assignment_status not in ('pending','active','corrected') then
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
  v_mode:=v_assignment.snapshot_measurement_mode;
  v_old_status:=v_assignment.assignment_status;
  v_old_frequency:=v_assignment.current_frequency;
  v_old_importance:=v_assignment.current_importance;
  if p_frequency is not null and p_frequency not in (0,25,50,75,100) then
    raise exception 'La frecuencia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;
  if p_importance is not null and p_importance not in (0,25,50,75,100) then
    raise exception 'La importancia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;
  if v_mode not in ('frequency','both') then p_frequency:=null; end if;
  if v_mode not in ('importance','both') then p_importance:=null; end if;

  update public.student_content_assignments
  set assignment_status=p_assignment_status,
      current_frequency=p_frequency,
      current_importance=p_importance,
      completed_at=case when p_assignment_status='corrected' then coalesce(completed_at,now()) else null end,
      student_visible_at=case when p_assignment_status<>'corrected' then null else student_visible_at end
  where id=p_assignment_id
  returning * into v_assignment;

  select id into v_recent
  from public.student_content_measurements
  where assignment_id=p_assignment_id and created_at>=now()-interval '120 seconds'
  order by created_at desc limit 1 for update;
  if v_recent is null then
    insert into public.student_content_measurements(
      assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
    ) values(p_assignment_id,p_class_id,p_assignment_status,p_frequency,p_importance,(select auth.uid()));
  else
    update public.student_content_measurements
    set class_id=p_class_id,assignment_status=p_assignment_status,frequency_score=p_frequency,importance_score=p_importance,measured_by=(select auth.uid())
    where id=v_recent;
  end if;

  v_event:=case when v_old_status is distinct from p_assignment_status then 'status_changed' else 'measurement_changed' end;
  if v_old_status is distinct from p_assignment_status
     or v_old_frequency is distinct from p_frequency
     or v_old_importance is distinct from p_importance then
    insert into public.class_content_events(
      class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_by
    ) values(
      p_class_id,v_assignment.person_id,v_assignment.content_id,v_event,v_old_status,p_assignment_status,
      jsonb_build_object(
        'content_type','correction',
        'old_frequency',v_old_frequency,'new_frequency',p_frequency,
        'old_importance',v_old_importance,'new_importance',p_importance
      ),
      (select auth.uid())
    );
  end if;
  return v_assignment;
end;
$function$;

create or replace function public.set_class_content_measurement(
  p_class_id bigint,
  p_person_id bigint,
  p_content_id bigint,
  p_frequency smallint,
  p_importance smallint
)
returns public.class_content_events
language plpgsql
set search_path to ''
as $function$
declare
  v_type text;
  v_mode text;
  v_assignment public.student_content_assignments;
  v_old_frequency smallint;
  v_old_importance smallint;
  v_event public.class_content_events;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para valorar contenido durante una clase.' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.classes c
    join public.class_participants cp on cp.class_id=c.id
    where c.id=p_class_id and cp.person_id=p_person_id
      and c.status in ('active','finished') and c.pedagogy_closed_at is null
  ) then
    raise exception 'La clase no está abierta para este alumno.' using errcode='22023';
  end if;
  if p_frequency is not null and p_frequency not in (0,25,50,75,100) then
    raise exception 'La frecuencia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;
  if p_importance is not null and p_importance not in (0,25,50,75,100) then
    raise exception 'La importancia debe usar uno de los cinco niveles permitidos.' using errcode='22023';
  end if;

  select content_type,measurement_mode into v_type,v_mode
  from public.teaching_contents where id=p_content_id and active;
  if v_type is null then raise exception 'El contenido no existe.' using errcode='P0002'; end if;
  if v_mode='none' then raise exception 'Este contenido no usa frecuencia ni importancia.' using errcode='22023'; end if;
  if v_mode='frequency' then p_importance:=null; end if;
  if v_mode='importance' then p_frequency:=null; end if;

  select * into v_assignment
  from public.student_content_assignments
  where person_id=p_person_id and content_id=p_content_id
  for update;

  if found then
    v_old_frequency:=v_assignment.current_frequency;
    v_old_importance:=v_assignment.current_importance;
    update public.student_content_assignments
      set current_frequency=p_frequency,current_importance=p_importance
    where id=v_assignment.id
    returning * into v_assignment;
    insert into public.student_content_measurements(
      assignment_id,class_id,assignment_status,frequency_score,importance_score,measured_by
    ) values(
      v_assignment.id,p_class_id,v_assignment.assignment_status,p_frequency,p_importance,(select auth.uid())
    );
  elsif v_type='exercise' then
    if not exists(
      select 1 from public.class_content_events e
      where e.class_id=p_class_id and e.person_id=p_person_id and e.content_id=p_content_id
        and e.event_type in ('exercise_pending','exercise_active','exercise_completed')
    ) then
      raise exception 'El ejercicio todavía no pertenece a esta clase.' using errcode='22023';
    end if;
    select
      nullif(payload->>'new_frequency','')::smallint,
      nullif(payload->>'new_importance','')::smallint
      into v_old_frequency,v_old_importance
    from public.class_content_events
    where class_id=p_class_id and person_id=p_person_id and content_id=p_content_id and event_type='measurement_changed'
    order by created_at desc,id desc limit 1;
  else
    raise exception 'El contenido todavía no está asignado a este alumno.' using errcode='22023';
  end if;

  if v_old_frequency is not distinct from p_frequency and v_old_importance is not distinct from p_importance then
    select * into v_event
    from public.class_content_events
    where class_id=p_class_id and person_id=p_person_id and content_id=p_content_id
    order by created_at desc,id desc limit 1;
    return v_event;
  end if;

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_by
  ) values(
    p_class_id,p_person_id,p_content_id,'measurement_changed',v_assignment.assignment_status,v_assignment.assignment_status,
    jsonb_build_object(
      'content_type',v_type,
      'old_frequency',v_old_frequency,'new_frequency',p_frequency,
      'old_importance',v_old_importance,'new_importance',p_importance
    ),
    (select auth.uid())
  ) returning * into v_event;
  return v_event;
end;
$function$;

create or replace function public.set_class_content_annotation(
  p_class_id bigint,
  p_person_id bigint,
  p_content_id bigint,
  p_body text,
  p_visible_to_student boolean default false
)
returns public.class_content_events
language plpgsql
set search_path to ''
as $function$
declare
  v_type text;
  v_body text:=btrim(coalesce(p_body,''));
  v_previous public.class_content_events;
  v_event public.class_content_events;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para guardar observaciones de contenido.' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.classes c
    join public.class_participants cp on cp.class_id=c.id
    where c.id=p_class_id and cp.person_id=p_person_id
      and c.status in ('active','finished') and c.pedagogy_closed_at is null
  ) then
    raise exception 'La clase no está abierta para este alumno.' using errcode='22023';
  end if;
  select content_type into v_type from public.teaching_contents where id=p_content_id and active;
  if v_type is null then raise exception 'El contenido no existe.' using errcode='P0002'; end if;
  if v_type='exercise' then
    if not exists(
      select 1 from public.class_content_events
      where class_id=p_class_id and person_id=p_person_id and content_id=p_content_id
        and event_type in ('exercise_pending','exercise_active','exercise_completed')
    ) then raise exception 'El ejercicio todavía no pertenece a esta clase.' using errcode='22023'; end if;
  elsif not exists(
    select 1 from public.student_content_assignments where person_id=p_person_id and content_id=p_content_id
  ) then
    raise exception 'El contenido todavía no está asignado a este alumno.' using errcode='22023';
  end if;

  select * into v_previous
  from public.class_content_events
  where class_id=p_class_id and person_id=p_person_id and content_id=p_content_id and event_type='annotation_changed'
  order by created_at desc,id desc limit 1;

  insert into public.class_content_events(
    class_id,person_id,content_id,event_type,previous_status,new_status,payload,visible_to_student,created_by
  ) values(
    p_class_id,p_person_id,p_content_id,'annotation_changed',v_previous.new_status,v_previous.new_status,
    jsonb_build_object(
      'content_type',v_type,
      'body',v_body,
      'previous_body',coalesce(v_previous.payload->>'body',''),
      'previous_visible',coalesce(v_previous.visible_to_student,false)
    ),
    (p_visible_to_student and length(v_body)>0),
    (select auth.uid())
  ) returning * into v_event;
  return v_event;
end;
$function$;

create or replace function private.student_visible_class_content_annotations_json(p_person_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if not (select private.is_staff())
     and not ((select private.has_app_role('student')) and (select private.current_person_id())=p_person_id) then
    raise exception 'No tienes permiso para consultar estas observaciones.' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',latest.id,
    'class_id',latest.class_id,
    'content_id',latest.content_id,
    'title',t.title,
    'content_type',t.content_type,
    'body',latest.payload->>'body',
    'created_at',latest.created_at
  ) order by latest.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select distinct on (e.class_id,e.person_id,e.content_id)
      e.id,e.class_id,e.person_id,e.content_id,e.payload,e.visible_to_student,e.created_at
    from public.class_content_events e
    join public.classes c on c.id=e.class_id
    where e.person_id=p_person_id
      and e.event_type='annotation_changed'
      and c.pedagogy_closed_at is not null
    order by e.class_id,e.person_id,e.content_id,e.created_at desc,e.id desc
  ) latest
  join public.teaching_contents t on t.id=latest.content_id
  where latest.visible_to_student
    and length(btrim(coalesce(latest.payload->>'body','')))>0;
  return v_result;
end;
$function$;

revoke all on function private.student_visible_class_content_annotations_json(bigint) from public;
grant execute on function private.student_visible_class_content_annotations_json(bigint) to authenticated;

create or replace function public.student_portal_snapshot_for(p_person_id bigint default null)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_person bigint:=coalesce(p_person_id,(select private.current_person_id()));
  v_result jsonb;
begin
  if v_person is null then
    raise exception 'No hemos podido vincular esta cuenta con una ficha de alumno.' using errcode='22023';
  end if;
  v_result:=private.student_portal_snapshot_for(v_person);
  v_result:=jsonb_set(v_result,'{assignments}',private.student_visible_assignments_json(v_person),true);
  v_result:=jsonb_set(v_result,'{evaluations}',private.student_visible_evaluations_json(v_person),true);
  v_result:=jsonb_set(v_result,'{content_annotations}',private.student_visible_class_content_annotations_json(v_person),true);
  return v_result;
end;
$function$;

revoke all on function public.set_class_content_measurement(bigint,bigint,bigint,smallint,smallint) from public;
grant execute on function public.set_class_content_measurement(bigint,bigint,bigint,smallint,smallint) to authenticated;
revoke all on function public.set_class_content_annotation(bigint,bigint,bigint,text,boolean) from public;
grant execute on function public.set_class_content_annotation(bigint,bigint,bigint,text,boolean) to authenticated;

commit;
