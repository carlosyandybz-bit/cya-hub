-- CYA Hub v20 — definitive Teaching multimedia system
-- Applied to production on 2026-08-09.
-- Media binaries remain in Google Drive. Supabase stores metadata, relationships and access rules only.

alter table public.teaching_content_media
  add column if not exists group_label text,
  add column if not exists is_cover boolean not null default false,
  add column if not exists is_preview boolean not null default false,
  add column if not exists display_in_resources boolean not null default true,
  add column if not exists thumbnail_external_file_id text,
  add column if not exists thumbnail_mime_type text,
  add column if not exists preview_start_seconds numeric(10,3),
  add column if not exists preview_end_seconds numeric(10,3);

alter table public.teaching_content_media
  drop constraint if exists teaching_content_media_group_label_length,
  add constraint teaching_content_media_group_label_length check (group_label is null or char_length(group_label) <= 80),
  drop constraint if exists teaching_content_media_thumbnail_id_format,
  add constraint teaching_content_media_thumbnail_id_format check (thumbnail_external_file_id is null or thumbnail_external_file_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  drop constraint if exists teaching_content_media_preview_range,
  add constraint teaching_content_media_preview_range check (
    (preview_start_seconds is null or preview_start_seconds >= 0)
    and (preview_end_seconds is null or preview_end_seconds > 0)
    and (preview_start_seconds is null or preview_end_seconds is null or preview_end_seconds > preview_start_seconds)
  );

create unique index if not exists teaching_content_media_one_cover_idx
  on public.teaching_content_media(content_id) where is_cover;
create unique index if not exists teaching_content_media_one_preview_idx
  on public.teaching_content_media(content_id) where is_preview;

with first_images as (
  select distinct on (content_id) id
  from public.teaching_content_media
  where media_type='image'
  order by content_id, sort_order, id
)
update public.teaching_content_media media
set is_cover=true
from first_images fi
where media.id=fi.id
  and not exists (
    select 1 from public.teaching_content_media existing
    where existing.content_id=media.content_id and existing.is_cover
  );

create or replace function public.current_user_can_manage_teaching()
returns boolean
language sql
stable
security invoker
set search_path=''
as $$ select coalesce((select private.is_staff()),false) $$;
revoke all on function public.current_user_can_manage_teaching() from public;
grant execute on function public.current_user_can_manage_teaching() to authenticated;

create or replace function public.can_access_teaching_media(p_external_file_id text)
returns boolean
language plpgsql
stable
security invoker
set search_path=''
as $$
declare v_person bigint;
begin
  if not exists (
    select 1 from public.teaching_content_media m
    where m.external_file_id=p_external_file_id or m.thumbnail_external_file_id=p_external_file_id
  ) then return false; end if;
  if (select private.is_staff()) then return true; end if;
  select private.current_person_id() into v_person;
  if v_person is null or not (select private.has_app_role('student')) then return false; end if;
  return exists(
    select 1
    from public.teaching_content_media m
    join public.teaching_contents tc on tc.id=m.content_id
    join public.student_content_assignments a on a.content_id=tc.id and a.person_id=v_person
    where (m.external_file_id=p_external_file_id or m.thumbnail_external_file_id=p_external_file_id)
      and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'
  );
end;
$$;
revoke all on function public.can_access_teaching_media(text) from public;
grant execute on function public.can_access_teaching_media(text) to authenticated;

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

create or replace function private.student_portal_snapshot_for(p_person_id bigint)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_result jsonb; v_current bigint;
begin
  select private.current_person_id() into v_current;
  if not (select private.is_staff()) and not ((select private.has_app_role('student')) and v_current=p_person_id) then
    raise exception 'No tienes permiso para ver esta experiencia de alumno.' using errcode='42501';
  end if;
  if not exists(select 1 from public.student_profiles where person_id=p_person_id and active) then
    raise exception 'La ficha de alumno no está activa.' using errcode='P0002';
  end if;
  select jsonb_build_object(
    'profile',(select jsonb_build_object('id',p.id,'display_name',p.display_name,'first_name',p.first_name,'last_name',p.last_name,
      'email',p.email,'phone',p.phone,'country_code',p.country_code,'student_since',sp.student_since,'goals',sp.goals)
      from public.people p join public.student_profiles sp on sp.person_id=p.id where p.id=p_person_id),
    'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'class_type',c.class_type,'status',c.status,
      'scheduled_start_at',c.scheduled_start_at,'duration_minutes',c.duration_minutes,'style',style.label,
      'attendance_status',cp.attendance_status,'role',role_term.label,'level',level_term.label) order by c.scheduled_start_at desc)
      from public.class_participants cp join public.classes c on c.id=cp.class_id
      left join public.catalog_terms style on style.id=c.style_term_id left join public.catalog_terms role_term on role_term.id=cp.role_term_id
      left join public.catalog_terms level_term on level_term.id=cp.level_term_id where cp.person_id=p_person_id),'[]'::jsonb),
    'credits',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'label',g.label,'modality',g.modality,
      'total_minutes',g.total_minutes,'balance_minutes',coalesce((select sum(m.delta_minutes) from public.credit_movements m where m.grant_id=g.id),0),
      'status',g.status,'purchased_at',g.purchased_at,'expires_at',g.expires_at) order by g.purchased_at desc)
      from public.credit_grant_members gm join public.credit_grants g on g.id=gm.grant_id where gm.person_id=p_person_id),'[]'::jsonb),
    'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'content_id',a.content_id,'title',tc.title,
      'content_type',tc.content_type,'description',tc.description,'correction_guidance',tc.correction_guidance,
      'assignment_status',a.assignment_status,'current_frequency',a.current_frequency,'current_importance',a.current_importance,
      'updated_at',a.updated_at,'media',coalesce((select jsonb_agg(jsonb_build_object(
        'id',media.id,'media_type',media.media_type,'provider',media.provider,'external_file_id',media.external_file_id,
        'title',media.title,'mime_type',media.mime_type,'group_label',media.group_label,'is_cover',media.is_cover,
        'is_preview',media.is_preview,'display_in_resources',media.display_in_resources,
        'thumbnail_external_file_id',media.thumbnail_external_file_id,'thumbnail_mime_type',media.thumbnail_mime_type,
        'preview_start_seconds',media.preview_start_seconds,'preview_end_seconds',media.preview_end_seconds
      ) order by media.sort_order,media.id)
        from public.teaching_content_media media where media.content_id=tc.id),'[]'::jsonb)) order by a.updated_at desc)
      from public.student_content_assignments a join public.teaching_contents tc on tc.id=a.content_id
      where a.person_id=p_person_id and tc.active and tc.completion_status='complete' and tc.publication_status='published' and tc.visibility='student'),'[]'::jsonb),
    'evaluations',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'class_id',e.class_id,'score',e.score,
      'aptitude',apt.label,'created_at',e.created_at) order by e.created_at desc)
      from public.student_evaluations e join public.catalog_terms apt on apt.id=e.aptitude_term_id where e.person_id=p_person_id),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
