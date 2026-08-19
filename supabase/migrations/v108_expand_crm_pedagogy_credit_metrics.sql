alter table public.crm_stat_panels drop constraint if exists crm_stat_panels_metric_check;
alter table public.crm_stat_panels add constraint crm_stat_panels_metric_check check (metric_key = any(array[
'people_count','percentage_total','average_age','reserved_count','reservation_rate','next_class_count','questionnaire_pending_count',
'registered_count','registered_rate','total_reservations','average_reservations','people_with_cancellations','total_cancellations',
'credit_balance_people','credit_balance_total_minutes','credit_balance_average_minutes','active_correction_people','active_content_people','total_active_content','average_active_content'
]));

create or replace function public.save_crm_stat_panel(p_panel_id bigint,p_title text,p_description text,p_metric_key text,p_filters jsonb,p_display_order integer default 0)
returns bigint language plpgsql security definer set search_path='public','private' as $$
declare v_id bigint;
begin
  if not private.is_staff() then raise exception 'staff only'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
  if p_metric_key not in ('people_count','percentage_total','average_age','reserved_count','reservation_rate','next_class_count','questionnaire_pending_count','registered_count','registered_rate','total_reservations','average_reservations','people_with_cancellations','total_cancellations','credit_balance_people','credit_balance_total_minutes','credit_balance_average_minutes','active_correction_people','active_content_people','total_active_content','average_active_content') then raise exception 'invalid metric'; end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'invalid filters'; end if;
  if p_panel_id is null then
    insert into public.crm_stat_panels(owner_user_id,title,description,metric_key,filters,display_order)
    values(auth.uid(),btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_metric_key,coalesce(p_filters,'{}'::jsonb),greatest(coalesce(p_display_order,0),0)) returning id into v_id;
  else
    update public.crm_stat_panels set title=btrim(p_title),description=nullif(btrim(coalesce(p_description,'')),''),metric_key=p_metric_key,filters=coalesce(p_filters,'{}'::jsonb),display_order=greatest(coalesce(p_display_order,0),0),updated_at=now()
    where id=p_panel_id and owner_user_id=auth.uid() returning id into v_id;
    if v_id is null then raise exception 'panel not found'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_crm_stat_panel(bigint,text,text,text,jsonb,integer) from public,anon;
grant execute on function public.save_crm_stat_panel(bigint,text,text,text,jsonb,integer) to authenticated;
