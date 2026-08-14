-- Academia Online · keep positions contiguous after a lesson is removed.

create or replace function public.academy_remove_program_content(p_program_content_id bigint)
returns void language plpgsql security definer set search_path=''
as $$
declare v_program_id bigint;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para organizar Academia Online.' using errcode='42501'; end if;

  select program_id into v_program_id from public.academy_program_contents where id=p_program_content_id for update;
  if not found then raise exception 'No se ha encontrado el contenido del programa.' using errcode='22023'; end if;

  delete from public.academy_program_contents where id=p_program_content_id;

  set constraints academy_program_contents_program_id_position_key deferred;
  with ranked as (
    select id,row_number() over(order by position,id)::integer as next_position
    from public.academy_program_contents
    where program_id=v_program_id
  )
  update public.academy_program_contents c
  set position=r.next_position
  from ranked r
  where c.id=r.id and c.position<>r.next_position;
end;
$$;

revoke all on function public.academy_remove_program_content(bigint) from public,anon;
grant execute on function public.academy_remove_program_content(bigint) to authenticated;
