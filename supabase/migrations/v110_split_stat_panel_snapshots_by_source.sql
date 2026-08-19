create or replace function public.crm_stat_panels_snapshot()
returns setof public.crm_stat_panels language sql security definer set search_path='public','private' as $$
  select p.* from public.crm_stat_panels p
  where private.is_staff() and p.owner_user_id=auth.uid() and p.source_kind='crm'
  order by p.display_order,p.id;
$$;
revoke all on function public.crm_stat_panels_snapshot() from public,anon;
grant execute on function public.crm_stat_panels_snapshot() to authenticated;

create or replace function public.catalog_stat_panels_snapshot()
returns setof public.crm_stat_panels language sql security definer set search_path='public','private' as $$
  select p.* from public.crm_stat_panels p
  where private.is_staff() and p.owner_user_id=auth.uid() and p.source_kind='catalog'
  order by p.display_order,p.id;
$$;
revoke all on function public.catalog_stat_panels_snapshot() from public,anon;
grant execute on function public.catalog_stat_panels_snapshot() to authenticated;
