-- Administration · transactional primary-module ordering.

create or replace function public.admin_move_module(p_module_key text,p_direction text)
returns setof public.app_module_settings
language plpgsql security definer set search_path=''
as $$
declare
  v_current public.app_module_settings;
  v_neighbor public.app_module_settings;
begin
  if not (select private.is_admin()) then raise exception 'Solo Administración puede ordenar los módulos.' using errcode='42501'; end if;
  if p_direction not in ('up','down') then raise exception 'La dirección no es válida.' using errcode='22023'; end if;

  select * into v_current from public.app_module_settings where module_key=p_module_key for update;
  if not found then raise exception 'El módulo no existe.' using errcode='22023'; end if;

  if p_direction='up' then
    select * into v_neighbor from public.app_module_settings
    where sort_order<v_current.sort_order
    order by sort_order desc,module_key limit 1 for update;
  else
    select * into v_neighbor from public.app_module_settings
    where sort_order>v_current.sort_order
    order by sort_order,module_key limit 1 for update;
  end if;

  if v_neighbor.module_key is null then
    return query select * from public.app_module_settings order by sort_order,module_key;
    return;
  end if;

  update public.app_module_settings
  set sort_order=case
    when module_key=v_current.module_key then v_neighbor.sort_order
    when module_key=v_neighbor.module_key then v_current.sort_order
    else sort_order end,
    updated_by=(select auth.uid())
  where module_key in (v_current.module_key,v_neighbor.module_key);

  return query select * from public.app_module_settings order by sort_order,module_key;
end;
$$;

revoke all on function public.admin_move_module(text,text) from public,anon;
grant execute on function public.admin_move_module(text,text) to authenticated;
