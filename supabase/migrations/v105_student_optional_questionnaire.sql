create table if not exists public.student_declared_dance_styles (
  person_id bigint not null references public.people(id) on delete cascade,
  style_term_id bigint not null references public.catalog_terms(id) on delete restrict,
  role_mode text not null check (role_mode in ('leader','follower','both')),
  self_reported_level_term_id bigint null references public.catalog_terms(id) on delete set null,
  is_primary boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(person_id,style_term_id)
);

alter table public.student_declared_dance_styles enable row level security;
drop policy if exists student_declared_dance_styles_staff_all on public.student_declared_dance_styles;
create policy student_declared_dance_styles_staff_all on public.student_declared_dance_styles for all to authenticated using ((select private.is_staff())) with check ((select private.is_staff()));
drop policy if exists student_declared_dance_styles_student_read on public.student_declared_dance_styles;
create policy student_declared_dance_styles_student_read on public.student_declared_dance_styles for select to authenticated using (person_id=(select private.current_person_id()));
create unique index if not exists student_declared_dance_styles_one_primary on public.student_declared_dance_styles(person_id) where active and is_primary;

do $$
declare v_form_id bigint; v_old_version_id bigint; v_new_version_id bigint; v_new_version integer;
begin
  select id,active_version into v_form_id,v_new_version from public.form_definitions where form_key='student_personal' for update;
  if v_form_id is not null and v_new_version < 5 then
    select id into v_old_version_id from public.form_versions where form_id=v_form_id and version_number=v_new_version;
    v_new_version:=v_new_version+1;
    insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by)
      values(v_form_id,v_new_version,'draft','Separar datos personales del cuestionario opcional de baile y retirar Motivación','{}'::jsonb,auth.uid()) returning id into v_new_version_id;
    insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active)
      select v_new_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active
      from public.form_fields where form_version_id=v_old_version_id and field_key not in ('dance_context_info','primary_dance_style','primary_dance_role','self_reported_level','motivation');
    update public.form_versions set status='superseded' where id=v_old_version_id and status='active';
    update public.form_versions set status='active',published_at=now(),published_by=auth.uid() where id=v_new_version_id;
    update public.form_definitions set active_version=v_new_version,status='active',updated_at=now(),updated_by=auth.uid() where id=v_form_id;
  end if;
end $$;

do $$
declare v_form_id bigint; v_old_id bigint; v_version integer; v_version_id bigint;
begin
  select id,active_version into v_form_id,v_version from public.form_definitions where form_key='onboarding' for update;
  if v_form_id is null then
    insert into public.form_definitions(form_key,admin_name,visible_title,description,context_key,form_type,status,active_version,settings,created_by,updated_by)
      values('onboarding','Cuestionario opcional del alumno','Cuéntanos un poco sobre ti','Opcional. Puede finalizarse dejando respuestas vacías.','student_followup','student','draft',1,'{"phase":"post_registration","optional":true,"runtime_engine":"generic_v1"}'::jsonb,auth.uid(),auth.uid()) returning id into v_form_id;
    v_version:=0;
  end if;
  if v_version < 4 then
    select id into v_old_id from public.form_versions where form_id=v_form_id and version_number=v_version;
    v_version:=v_version+1;
    insert into public.form_versions(form_id,version_number,status,change_note,snapshot,created_by)
      values(v_form_id,v_version,'draft','Nuevo cuestionario opcional condicional de alumno','{}'::jsonb,auth.uid()) returning id into v_version_id;

    insert into public.form_fields(form_version_id,field_key,field_type,label,help_text,required,canonical_path,options,visibility,condition,validation,sort_order,active) values
    (v_version_id,'dance_experience','select','¿Ya sabes bailar o quieres empezar desde 0?',null,false,null,'[{"value":"already_dance","label":"Ya sé bailar"},{"value":"start_zero","label":"Quiero empezar desde 0"}]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{}',10,true),
    (v_version_id,'desired_styles','multiselect','¿Qué estilos te gustaría aprender?','Puedes elegir varios o marcar «No lo sé».',false,null,'{"catalog_taxonomy":"dance_style"}'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{"field":"dance_experience","operator":"eq","value":"start_zero"}'::jsonb,'{}',20,true),
    (v_version_id,'desired_styles_unknown','checkbox','No lo sé todavía',null,false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{"field":"dance_experience","operator":"eq","value":"start_zero"}'::jsonb,'{}',21,true),
    (v_version_id,'starting_styles','multiselect','¿Con cuáles te gustaría empezar?','Puedes elegir varios. Solo se mostrarán estilos elegidos en la pregunta anterior.',false,null,'{"catalog_taxonomy":"dance_style"}'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{"field":"dance_experience","operator":"eq","value":"start_zero"}'::jsonb,'{"filter_options_from_field":"desired_styles"}',30,true),
    (v_version_id,'starting_styles_unknown','checkbox','No lo sé todavía',null,false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{"field":"dance_experience","operator":"eq","value":"start_zero"}'::jsonb,'{}',31,true),
    (v_version_id,'has_practice_partner','select','¿Tienes pareja de baile habitual o alguien con quien practicar?',null,false,null,'[{"value":"yes","label":"Sí"},{"value":"no","label":"No"},{"value":"not_sure","label":"No lo tengo claro"}]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{}',40,true),
    (v_version_id,'reasons','multiselect','¿Por qué quieres clases o contenido con nosotros?','Puedes marcar varias opciones.',false,null,'[{"value":"learn_zero","label":"Quiero aprender a bailar desde cero"},{"value":"keep_improving","label":"Quiero continuar aprendiendo o mejorar mi baile"},{"value":"specific_aspects","label":"Quiero trabajar aspectos concretos"},{"value":"wedding","label":"Quiero preparar un baile de boda"},{"value":"teacher_training","label":"Soy profesor y quiero ampliar mi formación"},{"value":"online_content","label":"Quiero ver contenido online"},{"value":"classes_cya","label":"Quiero reservar clases con Carlos & Andy"},{"value":"temporary_stay","label":"Estoy aquí de forma temporal"},{"value":"other","label":"Otro"}]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{}',50,true),
    (v_version_id,'class_location_interest','text','¿En qué localidad te gustaría dar las clases?','Puede ser cualquier localidad del mundo.',false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{"max_length":160}',60,true),
    (v_version_id,'temporary_until','text','Si estás aquí de forma temporal, ¿hasta cuándo aproximadamente?',null,false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{"max_length":160}',70,true),
    (v_version_id,'plans_return','select','¿Tienes pensado volver próximamente?',null,false,null,'[{"value":"yes","label":"Sí"},{"value":"no","label":"No"},{"value":"dont_know","label":"No lo sé"}]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{}',80,true),
    (v_version_id,'how_found_us','select','¿Cómo nos conociste?',null,false,null,'[{"value":"instagram","label":"Instagram"},{"value":"google","label":"Google"},{"value":"recommendation","label":"Recomendación"},{"value":"social_event","label":"Social o evento"},{"value":"student","label":"Otro alumno"},{"value":"festival","label":"Festival"},{"value":"other","label":"Otro"}]'::jsonb,'{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{}',90,true),
    (v_version_id,'referred_by','text','¿Quién te recomendó?','Si fue una recomendación, dinos quién.',false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{"field":"how_found_us","operator":"eq","value":"recommendation"}'::jsonb,'{"max_length":160}',100,true),
    (v_version_id,'goals_detail','textarea','¿Hay algo concreto que quieras conseguir o trabajar?',null,false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{"max_length":2000}',110,true),
    (v_version_id,'health_notes_optional','textarea','¿Hay alguna lesión, limitación física o cuestión que debamos tener en cuenta?',null,false,null,'[]','{"audiences":["student","staff"],"editable_by":["student","staff"]}'::jsonb,'{}','{"max_length":2000}',120,true);

    if v_old_id is not null then update public.form_versions set status='superseded' where id=v_old_id and status='active'; end if;
    update public.form_versions set status='active',published_at=now(),published_by=auth.uid() where id=v_version_id;
    update public.form_definitions set visible_title='Cuéntanos un poco sobre ti',description='Cuestionario opcional. Puedes finalizarlo aunque dejes respuestas vacías.',context_key='student_followup',form_type='student',status='active',active_version=v_version,settings='{"phase":"post_registration","optional":true,"runtime_engine":"generic_v1"}'::jsonb,updated_at=now(),updated_by=auth.uid() where id=v_form_id;
  end if;
end $$;

create or replace function private.validate_optional_questionnaire_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_key text; v_desired jsonb; v_starting jsonb; v_item jsonb;
begin
  select fd.form_key into v_key from public.form_versions fv join public.form_definitions fd on fd.id=fv.form_id where fv.id=new.form_version_id;
  if v_key<>'onboarding' then return new; end if;
  v_desired:=coalesce(new.answers->'desired_styles','[]'::jsonb);
  v_starting:=coalesce(new.answers->'starting_styles','[]'::jsonb);
  if jsonb_typeof(v_starting)='array' then
    for v_item in select value from jsonb_array_elements(v_starting) loop
      if not exists(select 1 from jsonb_array_elements(v_desired) d(value) where d.value=v_item) then
        raise exception 'Los estilos con los que quieres empezar deben estar entre los estilos que te gustaría aprender.' using errcode='22023';
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_optional_questionnaire_submission on public.form_submissions;
create trigger trg_validate_optional_questionnaire_submission before insert or update on public.form_submissions for each row execute function private.validate_optional_questionnaire_submission();

create or replace function public.student_optional_questionnaire_status(p_person_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_person_id bigint:=coalesce(p_person_id,(select private.current_person_id())); v_form_id bigint; v_last timestamptz; v_count int;
begin
  if v_person_id is null then raise exception 'No se ha encontrado la persona.' using errcode='P0002'; end if;
  if v_person_id is distinct from (select private.current_person_id()) and not (select private.is_staff()) then raise exception 'No tienes permiso.' using errcode='42501'; end if;
  select id into v_form_id from public.form_definitions where form_key='onboarding';
  select max(submitted_at),count(*) into v_last,v_count from public.form_submissions fs join public.form_versions fv on fv.id=fs.form_version_id where fs.person_id=v_person_id and fv.form_id=v_form_id;
  return jsonb_build_object('person_id',v_person_id,'finalized',v_count>0,'submission_count',v_count,'last_finalized_at',v_last);
end $$;
revoke all on function public.student_optional_questionnaire_status(bigint) from public,anon;
grant execute on function public.student_optional_questionnaire_status(bigint) to authenticated;
