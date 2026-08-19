alter table public.crm_stat_panels add column if not exists source_kind text not null default 'crm';
alter table public.crm_stat_panels add column if not exists period jsonb not null default '{}'::jsonb;
alter table public.crm_stat_panels drop constraint if exists crm_stat_panels_metric_check;
alter table public.crm_stat_panels drop constraint if exists crm_stat_panels_source_kind_check;
alter table public.crm_stat_panels drop constraint if exists crm_stat_panels_metric_key_format_check;
alter table public.crm_stat_panels add constraint crm_stat_panels_source_kind_check check (source_kind in ('crm','catalog'));
alter table public.crm_stat_panels add constraint crm_stat_panels_metric_key_format_check check (metric_key ~ '^[a-z0-9_]{1,80}$');
alter table public.crm_stat_panels drop constraint if exists crm_stat_panels_period_object_check;
alter table public.crm_stat_panels add constraint crm_stat_panels_period_object_check check (jsonb_typeof(period)='object');

create or replace function public.save_stat_panel(p_panel_id bigint,p_title text,p_description text,p_metric_key text,p_filters jsonb,p_display_order integer default 0,p_source_kind text default 'crm',p_period jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path='public','private' as $$
declare v_id bigint;
begin
  if not private.is_staff() then raise exception 'staff only'; end if;
  if btrim(coalesce(p_title,''))='' then raise exception 'title required'; end if;
  if coalesce(p_source_kind,'crm') not in ('crm','catalog') then raise exception 'invalid source'; end if;
  if coalesce(p_metric_key,'') !~ '^[a-z0-9_]{1,80}$' then raise exception 'invalid metric'; end if;
  if jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'invalid filters'; end if;
  if jsonb_typeof(coalesce(p_period,'{}'::jsonb))<>'object' then raise exception 'invalid period'; end if;
  if p_panel_id is null then
    insert into public.crm_stat_panels(owner_user_id,title,description,metric_key,filters,display_order,source_kind,period)
    values(auth.uid(),btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),p_metric_key,coalesce(p_filters,'{}'::jsonb),greatest(coalesce(p_display_order,0),0),coalesce(p_source_kind,'crm'),coalesce(p_period,'{}'::jsonb)) returning id into v_id;
  else
    update public.crm_stat_panels set title=btrim(p_title),description=nullif(btrim(coalesce(p_description,'')),''),metric_key=p_metric_key,filters=coalesce(p_filters,'{}'::jsonb),display_order=greatest(coalesce(p_display_order,0),0),source_kind=coalesce(p_source_kind,'crm'),period=coalesce(p_period,'{}'::jsonb),updated_at=now()
    where id=p_panel_id and owner_user_id=auth.uid() returning id into v_id;
    if v_id is null then raise exception 'panel not found'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_stat_panel(bigint,text,text,text,jsonb,integer,text,jsonb) from public,anon;
grant execute on function public.save_stat_panel(bigint,text,text,text,jsonb,integer,text,jsonb) to authenticated;
