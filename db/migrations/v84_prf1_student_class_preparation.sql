-- CYA Hub · v84 · PR-F1 · preparación colaborativa de la próxima clase
--
-- Amplía el dominio canónico class_preparation_requests sin crear un buzón paralelo:
-- - enlaces externos seguros como un tipo de preparación propio;
-- - vídeos de preparación accesibles al alumno propietario y al staff mediante tickets Drive;
-- - contexto servidor para iniciar subidas únicamente sobre una clase programada propia;
-- - varios contenidos elegidos para una misma clase, manteniendo BZ como premio único por clase.

begin;

alter table public.class_preparation_requests
  drop constraint if exists class_preparation_requests_request_type_check;

alter table public.class_preparation_requests
  add constraint class_preparation_requests_request_type_check
  check (request_type in ('focus','comment','video','content','link'));

alter table public.class_preparation_requests
  drop constraint if exists class_preparation_requests_link_payload_check;

alter table public.class_preparation_requests
  add constraint class_preparation_requests_link_payload_check
  check (
    request_type <> 'link'
    or (
      body is not null
      and char_length(body) between 8 and 2048
      and body ~* '^https?://[^[:space:]]+$'
      and external_file_id is null
      and content_id is null
    )
  );

create index if not exists class_preparation_requests_person_class_idx
  on public.class_preparation_requests(person_id,class_id,updated_at desc);

-- Contexto mínimo utilizado por el servidor para autorizar la subida de un vídeo.
-- No devuelve datos de otra persona y exige que la clase siga programada.
create or replace function public.class_preparation_upload_context(
  p_class_id bigint
)
returns table(class_id bigint,person_id bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person bigint := (select private.current_person_id());
begin
  if v_person is null or not (select private.has_app_role('student')) then
    raise exception 'Necesitas un perfil de alumno activo.' using errcode='42501';
  end if;

  return query
  select c.id, v_person
  from public.classes c
  join public.class_participants cp
    on cp.class_id=c.id
   and cp.person_id=v_person
  where c.id=p_class_id
    and c.status='scheduled'
    and cp.attendance_status<>'absent'
  limit 1;

  if not found then
    raise exception 'Solo puedes preparar una clase programada en la que participas.' using errcode='42501';
  end if;
end;
$$;

revoke all on function public.class_preparation_upload_context(bigint) from public,anon;
grant execute on function public.class_preparation_upload_context(bigint) to authenticated;

-- El mismo helper que protege el resto de multimedia del portal incorpora ahora
-- los vídeos que el alumno envía para preparar una clase.
create or replace function private.can_access_student_portal_media(
  p_external_file_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_person bigint;
begin
  if p_external_file_id is null
     or p_external_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    return false;
  end if;

  if (select private.is_staff()) then
    return exists(
      select 1
      from public.teaching_content_media m
      where m.external_file_id=p_external_file_id
         or m.thumbnail_external_file_id=p_external_file_id
    )
    or exists(
      select 1
      from public.class_video_resources v
      where v.external_file_id=p_external_file_id
    )
    or exists(
      select 1
      from public.class_media_resources m
      where m.external_file_id=p_external_file_id
    )
    or exists(
      select 1
      from public.class_preparation_requests r
      where r.request_type='video'
        and r.external_file_id=p_external_file_id
    );
  end if;

  if not (select private.has_app_role('student')) then
    return false;
  end if;

  select private.current_person_id() into v_person;
  if v_person is null then
    return false;
  end if;

  -- El vídeo fue aportado por la propia persona: permanece visible como parte
  -- de su historia de preparación incluso después de la clase.
  if exists(
    select 1
    from public.class_preparation_requests r
    join public.class_participants cp
      on cp.class_id=r.class_id
     and cp.person_id=r.person_id
    where r.request_type='video'
      and r.external_file_id=p_external_file_id
      and r.person_id=v_person
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.class_video_resources v
    join public.classes c on c.id=v.class_id
    where v.external_file_id=p_external_file_id
      and v.visibility_scope='private_student'
      and v.person_id=v_person
      and c.pedagogy_closed_at is not null
  ) then
    return true;
  end if;

  if exists(
    select 1
    from public.class_media_resources m
    join public.classes c on c.id=m.class_id
    where m.external_file_id=p_external_file_id
      and m.person_id=v_person
      and c.pedagogy_closed_at is not null
  ) then
    return true;
  end if;

  return exists(
    select 1
    from public.teaching_content_media m
    join public.student_content_assignments a
      on a.content_id=m.content_id
     and a.person_id=v_person
    where (m.external_file_id=p_external_file_id
       or m.thumbnail_external_file_id=p_external_file_id)
      and private.student_can_read_assignment(
        a.person_id,
        a.content_id,
        a.assignment_status,
        a.student_visible_at
      )
  );
end;
$$;

-- v50b expone el wrapper como SECURITY INVOKER y delega aquí. Conservamos
-- exactamente ese contrato de ejecución.
revoke all on function private.can_access_student_portal_media(text) from public,anon;
grant execute on function private.can_access_student_portal_media(text) to authenticated;

-- Varias elecciones pueden convivir para la próxima clase. BZ se mantiene
-- idempotente: la primera elección de la clase premia; cambiar o añadir otra no.
create or replace function public.bz_choose_next_class_content(p_class_id bigint,p_content_id bigint)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person bigint:=(select private.current_person_id());
  v_date date:=(select private.bz_local_date());
  v_class public.classes;
  v_content public.teaching_contents;
  v_action_id bigint;
  v_ledger_id bigint;
  v_request_id bigint;
begin
  if v_person is null then raise exception 'Necesitas un perfil de alumno activo.' using errcode='42501'; end if;
  v_class:=private.bz_validate_next_class(v_person,p_class_id);
  select * into v_content from public.teaching_contents
  where id=p_content_id and active and completion_status='complete' and publication_status='published' and visibility='student';
  if not found then raise exception 'Ese contenido no está disponible para el alumno.' using errcode='42501'; end if;

  select id into v_request_id
  from public.class_preparation_requests
  where class_id=p_class_id
    and person_id=v_person
    and request_type='content'
    and content_id=p_content_id
  order by created_at desc
  limit 1;

  if v_request_id is null then
    insert into public.class_preparation_requests(class_id,person_id,request_type,content_id,body,created_by)
    values(p_class_id,v_person,'content',p_content_id,v_content.title,(select auth.uid()))
    returning id into v_request_id;
  else
    update public.class_preparation_requests
    set body=v_content.title,updated_at=now(),created_by=(select auth.uid())
    where id=v_request_id;
  end if;

  insert into public.bz_action_events(person_id,action_key,local_date,class_id,content_id,idempotency_key,evidence)
  values(v_person,'next_class_content_choice',v_date,p_class_id,p_content_id,
    'bz-action:content-choice:'||v_person||':'||p_class_id,jsonb_build_object('class_id',p_class_id,'content_id',p_content_id))
  on conflict(idempotency_key) do update
    set content_id=excluded.content_id,evidence=excluded.evidence,updated_at=now()
  returning id into v_action_id;

  v_ledger_id:=private.bz_award(v_person,'next_class_content_choice','class',p_class_id::text,
    'bz:content-choice:'||v_person||':'||p_class_id,jsonb_build_object('class_id',p_class_id,'content_id',p_content_id),now());

  return jsonb_build_object(
    'class_id',p_class_id,
    'content_id',p_content_id,
    'request_id',v_request_id,
    'action_id',v_action_id,
    'points_awarded',v_ledger_id is not null
  );
end;
$$;

revoke all on function public.bz_choose_next_class_content(bigint,bigint) from public,anon;
grant execute on function public.bz_choose_next_class_content(bigint,bigint) to authenticated;

commit;
