-- P32 — Alinear preview/reset full con Estadísticas P30 sin alterar otros scopes.
-- Conservamos las implementaciones v44 efectivas como helpers privados y retiramos su ejecución directa.

alter function private.admin_reset_preview_counts(text,bigint)
  rename to admin_reset_preview_counts_pre_p32;

revoke all on function private.admin_reset_preview_counts_pre_p32(text,bigint)
  from public, anon, authenticated;

create or replace function private.admin_reset_preview_counts(
  p_scope text,
  p_target_id bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_counts jsonb;
  v_statistics bigint := 0;
begin
  v_counts := private.admin_reset_preview_counts_pre_p32(p_scope,p_target_id);

  if p_scope='full' then
    select
      (select count(*) from public.statistics_dashboard_assignments)
      + (select count(*) from public.statistics_dashboard_cards)
      + (select count(*) from public.statistics_dashboards)
      + (select count(*) from public.statistics_metric_settings)
      + (select count(*) from public.statistics_settings
          where quick_periods is distinct from array[7,30,90,365]::integer[]
             or default_period_kind is distinct from 'this_month'
             or updated_by is not null)
    into v_statistics;

    v_counts := v_counts || jsonb_build_object('estadisticas',v_statistics);
  end if;

  return v_counts;
end;
$$;

revoke all on function private.admin_reset_preview_counts(text,bigint)
  from public, anon, authenticated;

alter function private.execute_admin_data_reset(text,bigint)
  rename to execute_admin_data_reset_pre_p32;

revoke all on function private.execute_admin_data_reset_pre_p32(text,bigint)
  from public, anon, authenticated;

create or replace function private.execute_admin_data_reset(
  p_scope text,
  p_target_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  v_result := private.execute_admin_data_reset_pre_p32(p_scope,p_target_id);

  if p_scope='full' then
    delete from public.statistics_dashboard_assignments;
    delete from public.statistics_dashboard_cards;
    delete from public.statistics_dashboards;
    delete from public.statistics_metric_settings;

    insert into public.statistics_settings(
      singleton,quick_periods,default_period_kind,updated_by,updated_at
    ) values(
      true,array[7,30,90,365]::integer[],'this_month',null,now()
    )
    on conflict(singleton) do update set
      quick_periods=excluded.quick_periods,
      default_period_kind=excluded.default_period_kind,
      updated_by=null,
      updated_at=now();

    v_result := coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object('statistics_reset',true);
  end if;

  return v_result;
end;
$$;

revoke all on function private.execute_admin_data_reset(text,bigint)
  from public, anon, authenticated;

comment on function private.admin_reset_preview_counts(text,bigint) is
  'P32 wrapper: adds P30 statistics to full reset preview; delegates all previous scopes unchanged.';
comment on function private.execute_admin_data_reset(text,bigint) is
  'P32 wrapper: resets P30 statistics only for full scope; operational and selective scopes delegate unchanged.';
