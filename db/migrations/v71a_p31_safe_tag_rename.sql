-- P31 — Renombrado seguro de etiquetas sin eliminar relaciones.

grant update on table public.teaching_content_tags to authenticated;

drop policy if exists teaching_content_tags_admin_update on public.teaching_content_tags;
create policy teaching_content_tags_admin_update
on public.teaching_content_tags
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

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

  if exists (
    select 1
    from public.teaching_content_tags
    where lower(tag) = lower(v_new)
      and tag <> v_old
  ) then
    raise exception 'Ya existe una etiqueta con ese nombre. Elige otro nombre para evitar una fusión implícita.' using errcode = '23505';
  end if;

  update public.teaching_content_tags
  set tag = v_new
  where tag = v_old;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;

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
  'P31: renombra una etiqueta global hacia un nombre libre, conservando relaciones mediante UPDATE, SECURITY INVOKER y RLS.';
