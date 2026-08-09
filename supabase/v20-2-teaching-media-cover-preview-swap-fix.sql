-- CYA Hub v20.2
-- Permite cambiar portada/preview de forma atómica sin colisionar con los
-- índices parciales que garantizan un único elemento de cada tipo.

create or replace function public.save_teaching_content_with_media(
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
  p_tags text[],
  p_media jsonb default '[]'::jsonb
)
returns public.teaching_contents
language plpgsql
set search_path=''
as $$
declare
  v_content public.teaching_contents;
  v_media record;
  v_file_id text;
  v_media_type text;
  v_title text;
  v_group_label text;
  v_thumbnail_id text;
  v_seen_ids text[] := array[]::text[];
  v_cover_count integer := 0;
  v_preview_count integer := 0;
begin
  if not (select private.is_staff()) then
    raise exception 'No tienes permiso para editar enseñanza.' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_media,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media,'[]'::jsonb)) > 80 then
    raise exception 'Revisa los archivos multimedia.' using errcode='22023';
  end if;

  select count(*) filter (where coalesce((value->>'is_cover')::boolean,false)),
         count(*) filter (where coalesce((value->>'is_preview')::boolean,false))
  into v_cover_count, v_preview_count
  from jsonb_array_elements(coalesce(p_media,'[]'::jsonb));
  if v_cover_count > 1 or v_preview_count > 1 then
    raise exception 'Solo puede haber una portada y un preview por contenido.' using errcode='22023';
  end if;

  select * into v_content from public.save_teaching_content(
    p_content_id,p_content_type,p_title,p_description,p_correction_guidance,p_completion_status,
    p_publication_status,p_visibility,p_measurement_mode,p_category_term_id,p_style_term_ids,
    p_role_term_ids,p_level_term_ids,p_tags
  );

  -- Serializa ediciones simultáneas del mismo contenido y libera primero
  -- los slots de los índices únicos parciales de portada/preview.
  perform 1 from public.teaching_contents where id=v_content.id for update;
  update public.teaching_content_media
  set is_cover=false,
      is_preview=false,
      updated_at=now()
  where content_id=v_content.id
    and (is_cover or is_preview);

  for v_media in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_media,'[]'::jsonb)) with ordinality
  loop
    v_file_id := btrim(coalesce(v_media.value->>'external_file_id',''));
    v_media_type := coalesce(v_media.value->>'media_type','');
    v_title := nullif(btrim(coalesce(v_media.value->>'title','')),'');
    v_group_label := nullif(btrim(coalesce(v_media.value->>'group_label','')),'');
    v_thumbnail_id := nullif(btrim(coalesce(v_media.value->>'thumbnail_external_file_id','')),'');

    if v_media_type not in ('image','video')
      or v_file_id !~ '^[A-Za-z0-9_-]{10,200}$'
      or length(coalesce(v_title,'')) > 160
      or length(coalesce(v_group_label,'')) > 80
      or (v_thumbnail_id is not null and v_thumbnail_id !~ '^[A-Za-z0-9_-]{10,200}$') then
      raise exception 'Hay un archivo multimedia no válido.' using errcode='22023';
    end if;

    v_seen_ids := array_append(v_seen_ids, v_file_id);

    insert into public.teaching_content_media(
      content_id,media_type,provider,external_file_id,title,mime_type,sort_order,created_by,
      group_label,is_cover,is_preview,display_in_resources,thumbnail_external_file_id,
      thumbnail_mime_type,preview_start_seconds,preview_end_seconds
    ) values (
      v_content.id,v_media_type,'google_drive',v_file_id,v_title,nullif(v_media.value->>'mime_type',''),
      v_media.ordinality::integer,(select auth.uid()),v_group_label,
      coalesce((v_media.value->>'is_cover')::boolean,false),
      coalesce((v_media.value->>'is_preview')::boolean,false),
      coalesce((v_media.value->>'display_in_resources')::boolean,true),
      v_thumbnail_id,nullif(v_media.value->>'thumbnail_mime_type',''),
      nullif(v_media.value->>'preview_start_seconds','')::numeric,
      nullif(v_media.value->>'preview_end_seconds','')::numeric
    )
    on conflict(content_id,provider,external_file_id) do update set
      media_type=excluded.media_type,title=excluded.title,mime_type=excluded.mime_type,
      sort_order=excluded.sort_order,group_label=excluded.group_label,is_cover=excluded.is_cover,
      is_preview=excluded.is_preview,display_in_resources=excluded.display_in_resources,
      thumbnail_external_file_id=excluded.thumbnail_external_file_id,
      thumbnail_mime_type=excluded.thumbnail_mime_type,
      preview_start_seconds=excluded.preview_start_seconds,preview_end_seconds=excluded.preview_end_seconds,
      updated_at=now();
  end loop;

  delete from public.teaching_content_media
  where content_id=v_content.id
    and provider='google_drive'
    and (coalesce(array_length(v_seen_ids,1),0)=0 or not (external_file_id=any(v_seen_ids)));

  return v_content;
end;
$$;
