create or replace function public.save_crm_saved_view(p_view_id bigint default null, p_name text default null, p_filters jsonb default '{}'::jsonb, p_columns jsonb default '[]'::jsonb, p_sort jsonb default '[]'::jsonb)
returns public.crm_saved_views
language plpgsql security definer set search_path=public,private
as $$
declare v_row public.crm_saved_views;
begin
  if not private.is_staff() then raise exception 'staff_required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception 'name_required'; end if;
  if p_view_id is null then
    insert into public.crm_saved_views(owner_user_id,name,filters,columns,sort,is_system)
    values(auth.uid(),btrim(p_name),coalesce(p_filters,'{}'::jsonb),coalesce(p_columns,'[]'::jsonb),coalesce(p_sort,'[]'::jsonb),false)
    returning * into v_row;
  else
    update public.crm_saved_views set name=btrim(p_name),filters=coalesce(p_filters,'{}'::jsonb),columns=coalesce(p_columns,'[]'::jsonb),sort=coalesce(p_sort,'[]'::jsonb),updated_at=now()
    where id=p_view_id and owner_user_id=auth.uid() and not is_system and active returning * into v_row;
    if not found then raise exception 'view_not_found_or_not_owned'; end if;
  end if;
  return v_row;
end $$;

create or replace function public.delete_crm_saved_view(p_view_id bigint)
returns void
language plpgsql security definer set search_path=public,private
as $$
begin
  if not private.is_staff() then raise exception 'staff_required'; end if;
  update public.crm_saved_views set active=false,updated_at=now() where id=p_view_id and owner_user_id=auth.uid() and not is_system and active;
  if not found then raise exception 'view_not_found_or_not_owned'; end if;
end $$;

revoke all on function public.save_crm_saved_view(bigint,text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.save_crm_saved_view(bigint,text,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.delete_crm_saved_view(bigint) from public, anon;
grant execute on function public.delete_crm_saved_view(bigint) to authenticated;
