-- CYA Hub · v84b · PR-F1 · registro y limpieza de vídeo de preparación
--
-- El servidor usa estos RPC para que un archivo de Drive solo quede asociado a
-- la preparación de una clase propia y programada. Si el registro falla, la API
-- puede eliminar el archivo recién subido y evitar huérfanos.

begin;

create or replace function public.register_class_preparation_video(
  p_class_id bigint,
  p_external_file_id text,
  p_title text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person bigint := (select private.current_person_id());
  v_title text := nullif(btrim(coalesce(p_title,'')),'');
  v_request_id bigint;
begin
  if v_person is null or not (select private.has_app_role('student')) then
    raise exception 'Necesitas un perfil de alumno activo.' using errcode='42501';
  end if;
  if p_external_file_id is null or p_external_file_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'El vídeo no es válido.' using errcode='22023';
  end if;
  if v_title is null then v_title := 'Vídeo para preparar la clase'; end if;
  if char_length(v_title)>180 then v_title := left(v_title,180); end if;

  if not exists(
    select 1
    from public.classes c
    join public.class_participants cp
      on cp.class_id=c.id
     and cp.person_id=v_person
    where c.id=p_class_id
      and c.status='scheduled'
      and cp.attendance_status<>'absent'
  ) then
    raise exception 'Solo puedes enviar vídeos para una clase programada en la que participas.' using errcode='42501';
  end if;

  insert into public.class_preparation_requests(
    class_id,person_id,request_type,body,external_file_id,created_by
  ) values (
    p_class_id,v_person,'video',v_title,p_external_file_id,(select auth.uid())
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.remove_class_preparation_video(
  p_request_id bigint
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_person bigint := (select private.current_person_id());
  v_file_id text;
begin
  if v_person is null then
    raise exception 'Necesitas iniciar sesión.' using errcode='42501';
  end if;

  delete from public.class_preparation_requests r
  using public.classes c
  where r.id=p_request_id
    and r.request_type='video'
    and r.person_id=v_person
    and c.id=r.class_id
    and c.status='scheduled'
  returning r.external_file_id into v_file_id;

  if v_file_id is null then
    raise exception 'Ese vídeo ya no se puede quitar desde la preparación.' using errcode='42501';
  end if;
  return v_file_id;
end;
$$;

revoke all on function public.register_class_preparation_video(bigint,text,text) from public,anon;
revoke all on function public.remove_class_preparation_video(bigint) from public,anon;
grant execute on function public.register_class_preparation_video(bigint,text,text) to authenticated;
grant execute on function public.remove_class_preparation_video(bigint) to authenticated;

commit;
