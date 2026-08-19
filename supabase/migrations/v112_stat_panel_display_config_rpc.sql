create or replace function public.set_stat_panel_display_config(p_panel_id bigint,p_display_config jsonb) returns void
language plpgsql security definer set search_path='public','private' as $$
declare v_chart text;
begin
 if not private.is_staff() then raise exception 'staff only'; end if;
 if jsonb_typeof(coalesce(p_display_config,'{}'::jsonb))<>'object' then raise exception 'invalid display config'; end if;
 v_chart:=coalesce(p_display_config->>'chart','line');
 if v_chart not in ('none','line','bars') then raise exception 'invalid chart'; end if;
 update public.crm_stat_panels set display_config=coalesce(p_display_config,'{}'::jsonb),updated_at=now() where id=p_panel_id and owner_user_id=auth.uid();
 if not found then raise exception 'panel not found'; end if;
end $$;
revoke all on function public.set_stat_panel_display_config(bigint,jsonb) from public,anon;
grant execute on function public.set_stat_panel_display_config(bigint,jsonb) to authenticated;
