-- P30F2 — Métricas de marketing adicionales sobre datos canónicos de campaña.
create or replace function private.statistics_marketing_extended_metric(p_key text,p_from timestamptz,p_to timestamptz,p_filters jsonb)
returns numeric
language plpgsql
stable
set search_path=''
as $$
declare
  v_campaign bigint;
  v_num numeric;
  v_den numeric;
  v_value numeric;
begin
  begin v_campaign:=nullif(p_filters->>'campaign','')::bigint; exception when others then raise exception 'Campaña no válida.' using errcode='22023'; end;

  if p_key in ('marketing_impressions','marketing_reach','marketing_clicks','marketing_inquiries') then
    select case p_key
      when 'marketing_impressions' then coalesce(sum(mm.impressions),0)::numeric
      when 'marketing_reach' then coalesce(sum(mm.reach),0)::numeric
      when 'marketing_clicks' then coalesce(sum(mm.clicks),0)::numeric
      when 'marketing_inquiries' then coalesce(sum(mm.inquiries),0)::numeric
    end into v_value
    from public.marketing_campaign_metrics mm
    where mm.metric_date>=p_from::date and mm.metric_date<p_to::date+1
      and (v_campaign is null or mm.campaign_id=v_campaign);
  elsif p_key in ('marketing_ctr','marketing_inquiry_rate','marketing_booking_rate','marketing_roi') then
    if p_key='marketing_ctr' then
      select coalesce(sum(mm.clicks),0),coalesce(sum(mm.impressions),0) into v_num,v_den
      from public.marketing_campaign_metrics mm
      where mm.metric_date>=p_from::date and mm.metric_date<p_to::date+1 and (v_campaign is null or mm.campaign_id=v_campaign);
    elsif p_key='marketing_inquiry_rate' then
      select coalesce(sum(mm.inquiries),0),coalesce(sum(mm.clicks),0) into v_num,v_den
      from public.marketing_campaign_metrics mm
      where mm.metric_date>=p_from::date and mm.metric_date<p_to::date+1 and (v_campaign is null or mm.campaign_id=v_campaign);
    elsif p_key='marketing_booking_rate' then
      select coalesce(sum(mm.bookings),0),coalesce(sum(mm.inquiries),0) into v_num,v_den
      from public.marketing_campaign_metrics mm
      where mm.metric_date>=p_from::date and mm.metric_date<p_to::date+1 and (v_campaign is null or mm.campaign_id=v_campaign);
    else
      select coalesce(sum(mm.revenue_cents),0)-coalesce(sum(mm.spend_cents),0),coalesce(sum(mm.spend_cents),0) into v_num,v_den
      from public.marketing_campaign_metrics mm
      where mm.metric_date>=p_from::date and mm.metric_date<p_to::date+1 and (v_campaign is null or mm.campaign_id=v_campaign);
    end if;
    v_value:=case when v_den=0 then null else round((v_num/v_den)*100,1) end;
  else
    raise exception 'Métrica de marketing no soportada.' using errcode='22023';
  end if;
  return v_value;
end;
$$;
revoke all on function private.statistics_marketing_extended_metric(text,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
