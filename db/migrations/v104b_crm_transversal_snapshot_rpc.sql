create or replace function public.crm_person_explorer_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
begin
  if not private.is_staff() then raise exception 'staff_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.display_name) from public.crm_person_explorer_v v),'[]'::jsonb);
end $$;

create or replace function public.crm_saved_views_snapshot()
returns jsonb
language plpgsql security definer set search_path=public,private
as $$
begin
  if not private.is_staff() then raise exception 'staff_required'; end if;
  return coalesce((select jsonb_agg(to_jsonb(v) order by v.is_system desc,v.name) from public.crm_saved_views v where v.active and (v.is_system or v.owner_user_id=auth.uid())),'[]'::jsonb);
end $$;

revoke all on function public.crm_person_explorer_snapshot() from public, anon;
grant execute on function public.crm_person_explorer_snapshot() to authenticated;
revoke all on function public.crm_saved_views_snapshot() from public, anon;
grant execute on function public.crm_saved_views_snapshot() to authenticated;
