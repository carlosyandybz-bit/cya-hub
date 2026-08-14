-- Academia Online · do not allow context changes that invalidate existing course content.

create or replace function public.academy_save_program(
  p_program_id bigint,
  p_title text,
  p_description text,
  p_style_term_id bigint,
  p_role_term_id bigint,
  p_level_term_id bigint
) returns public.academy_programs
language plpgsql security definer set search_path=''
as $$
declare v_row public.academy_programs;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para editar Academia Online.' using errcode='42501'; end if;
  if nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Indica un título para el programa.' using errcode='22023'; end if;
  perform private.academy_validate_context(p_style_term_id,p_role_term_id,p_level_term_id);

  if p_program_id is null then
    insert into public.academy_programs(title,description,style_term_id,role_term_id,level_term_id,created_by,updated_by)
    values(btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_style_term_id,p_role_term_id,p_level_term_id,(select auth.uid()),(select auth.uid()))
    returning * into v_row;
  else
    if exists(
      select 1
      from public.academy_program_contents c
      where c.program_id=p_program_id
        and (
          not exists(select 1 from public.teaching_content_styles s where s.content_id=c.content_id and s.style_term_id=p_style_term_id)
          or not exists(select 1 from public.teaching_content_roles r where r.content_id=c.content_id and r.role_term_id=p_role_term_id)
          or not exists(select 1 from public.teaching_content_levels l where l.content_id=c.content_id and l.level_term_id=p_level_term_id)
        )
    ) then
      raise exception 'El nuevo contexto no es compatible con todo el temario actual. Retira primero los contenidos incompatibles.' using errcode='22023';
    end if;

    update public.academy_programs
    set title=btrim(p_title),description=nullif(btrim(coalesce(p_description,'')),''),style_term_id=p_style_term_id,
        role_term_id=p_role_term_id,level_term_id=p_level_term_id,updated_by=(select auth.uid())
    where id=p_program_id and publication_status<>'archived'
    returning * into v_row;
    if v_row.id is null then raise exception 'No se ha encontrado un programa editable.' using errcode='22023'; end if;
  end if;
  return v_row;
end;
$$;

revoke all on function public.academy_save_program(bigint,text,text,bigint,bigint,bigint) from public,anon;
grant execute on function public.academy_save_program(bigint,text,text,bigint,bigint,bigint) to authenticated;
