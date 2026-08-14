-- Academia Online · safe content ordering
-- Make the per-program position constraint deferrable so two rows can swap positions atomically.

alter table public.academy_program_contents
  drop constraint if exists academy_program_contents_program_id_position_key;

alter table public.academy_program_contents
  add constraint academy_program_contents_program_id_position_key
  unique(program_id,position) deferrable initially immediate;

create or replace function public.academy_move_program_content(
  p_program_content_id bigint,
  p_new_position integer
) returns public.academy_program_contents
language plpgsql security definer set search_path=''
as $$
declare
  v_row public.academy_program_contents;
  v_old integer;
  v_max integer;
begin
  if not (select private.is_staff()) then raise exception 'No tienes permiso para ordenar Academia Online.' using errcode='42501'; end if;

  select * into v_row from public.academy_program_contents where id=p_program_content_id for update;
  if not found then raise exception 'No se ha encontrado el contenido del programa.' using errcode='22023'; end if;

  select count(*)::integer into v_max from public.academy_program_contents where program_id=v_row.program_id;
  if p_new_position is null or p_new_position<1 or p_new_position>v_max then raise exception 'La posición no es válida.' using errcode='22023'; end if;

  v_old:=v_row.position;
  if p_new_position=v_old then return v_row; end if;

  set constraints academy_program_contents_program_id_position_key deferred;

  if p_new_position<v_old then
    update public.academy_program_contents
    set position=position+1
    where program_id=v_row.program_id and id<>v_row.id and position>=p_new_position and position<v_old;
  else
    update public.academy_program_contents
    set position=position-1
    where program_id=v_row.program_id and id<>v_row.id and position>v_old and position<=p_new_position;
  end if;

  update public.academy_program_contents set position=p_new_position where id=v_row.id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.academy_move_program_content(bigint,integer) from public,anon;
grant execute on function public.academy_move_program_content(bigint,integer) to authenticated;
