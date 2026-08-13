-- P30E — Un mismo panel puede asignarse a varios profesores.
create table if not exists public.statistics_dashboard_assignments (
  dashboard_id bigint not null references public.statistics_dashboards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_default boolean not null default true,
  assigned_by uuid not null default auth.uid() references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key(dashboard_id,user_id)
);
alter table public.statistics_dashboard_assignments enable row level security;
create policy statistics_dashboard_assignments_staff_read on public.statistics_dashboard_assignments for select to authenticated using(private.is_staff());
create policy statistics_dashboard_assignments_admin_write on public.statistics_dashboard_assignments for all to authenticated using(private.is_admin()) with check(private.is_admin());

create or replace function public.statistics_dashboard_for_current_user()
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_dashboard public.statistics_dashboards;
begin
  if not private.is_staff() then raise exception 'Las estadísticas globales están disponibles para profesores.' using errcode='42501'; end if;
  select d.* into v_dashboard from public.statistics_dashboards d
  where d.active and (
    (d.scope='personal' and d.target_user_id=v_user) or
    (d.scope='teacher' and (d.target_user_id=v_user or exists(select 1 from public.statistics_dashboard_assignments a where a.dashboard_id=d.id and a.user_id=v_user))) or
    d.scope='global'
  )
  order by case when d.scope='personal' then 1 when d.scope='teacher' then 2 else 3 end,
           case when exists(select 1 from public.statistics_dashboard_assignments a where a.dashboard_id=d.id and a.user_id=v_user and a.is_default) then 0 else 1 end,
           d.is_default desc,d.updated_at desc,d.id desc limit 1;
  if v_dashboard.id is null then return jsonb_build_object('dashboard',null,'cards','[]'::jsonb); end if;
  return jsonb_build_object('dashboard',to_jsonb(v_dashboard),'cards',coalesce((select jsonb_agg(to_jsonb(c) order by c.position,c.id) from public.statistics_dashboard_cards c where c.dashboard_id=v_dashboard.id and c.active),'[]'::jsonb));
end;
$$;
revoke all on function public.statistics_dashboard_for_current_user() from public,anon;
grant execute on function public.statistics_dashboard_for_current_user() to authenticated;
