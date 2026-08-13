-- P31 — Administración de etiquetas sin duplicar catálogo ni perder relaciones.

create or replace function public.admin_rename_teaching_tag(
  p_old_tag text,
  p_new_tag text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old text := btrim(coalesce(p_old_tag, ''));
  v_new text := btrim(coalesce(p_new_tag, ''));
  v_count integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'Solo Administración puede renombrar etiquetas globalmente.' using errcode = '42501';
  end if;

  if v_old = '' or v_new = '' then
    raise exception 'Las etiquetas no pueden estar vacías.' using errcode = '22023';
  end if;
  if length(v_old) > 60 or length(v_new) > 60 then
    raise exception 'Las etiquetas no pueden superar 60 caracteres.' using errcode = '22023';
  end if;
  if v_old = v_new then
    raise exception 'El nuevo nombre debe ser diferente.' using errcode = '22023';
  end if;

  select count(*)::integer into v_count
  from public.teaching_content_tags
  where tag = v_old;

  if v_count = 0 then
    return 0;
  end if;

  insert into public.teaching_content_tags(content_id, tag)
  select content_id, v_new
  from public.teaching_content_tags
  where tag = v_old
  on conflict (content_id, tag) do nothing;

  delete from public.teaching_content_tags
  where tag = v_old;

  insert into public.audit_events(event_type, entity_type, entity_id, summary, detail, actor_user_id)
  values (
    'teaching_tag_renamed',
    'teaching_tag',
    v_old,
    'Etiqueta de enseñanza renombrada desde Administración.',
    jsonb_build_object('previous_tag', v_old, 'new_tag', v_new, 'affected_relations', v_count),
    (select auth.uid())
  );

  return v_count;
end;
$$;

revoke all on function public.admin_rename_teaching_tag(text, text) from public, anon;
grant execute on function public.admin_rename_teaching_tag(text, text) to authenticated;

comment on function public.admin_rename_teaching_tag(text, text) is
  'P31: renombra una etiqueta global de Enseñanza, fusiona duplicados y conserva las relaciones mediante SECURITY INVOKER + RLS.';
