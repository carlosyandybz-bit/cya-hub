-- P30F5 — Enrutador público ampliado para todas las métricas configurables actuales.
create or replace function public.statistics_card_value(
  p_metric_key text,
  p_period_kind text default 'this_month',
  p_period_days integer default null,
  p_filters jsonb default '{}'::jsonb,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_value numeric;
begin
  if not private.is_staff() then raise exception 'Las estadísticas globales están disponibles para profesores.' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'Filtros no válidos.' using errcode='22023'; end if;
  select from_at,to_at into v_from,v_to from private.statistics_period_bounds(p_period_kind,p_period_days,p_from,p_to);

  if p_metric_key in ('classes_count','class_minutes','attendance_rate') then
    v_value:=private.statistics_class_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('students_active','new_students','credit_sales','credit_grants') then
    v_value:=private.statistics_people_business_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('assignments_completed','evaluations_count','evaluation_average','marketing_spend','marketing_revenue','marketing_bookings') then
    v_value:=private.statistics_teaching_marketing_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('assignments_created','assignments_pending') then
    v_value:=private.statistics_teaching_extended_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('marketing_impressions','marketing_reach','marketing_clicks','marketing_inquiries','marketing_ctr','marketing_inquiry_rate','marketing_booking_rate','marketing_roi') then
    v_value:=private.statistics_marketing_extended_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('missions_open','missions_completed','notifications_sent','notifications_failed') then
    v_value:=private.statistics_operations_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  elsif p_metric_key in ('missions_not_done','notification_attempts') then
    v_value:=private.statistics_operations_extended_metric(p_metric_key,v_from,v_to,coalesce(p_filters,'{}'::jsonb));
  else
    raise exception 'Métrica no soportada: %',p_metric_key using errcode='22023';
  end if;

  return jsonb_build_object('metric_key',p_metric_key,'value',v_value,'from',v_from,'to',v_to,'filters',coalesce(p_filters,'{}'::jsonb));
end;
$$;
revoke all on function public.statistics_card_value(text,text,integer,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.statistics_card_value(text,text,integer,jsonb,timestamptz,timestamptz) to authenticated;
