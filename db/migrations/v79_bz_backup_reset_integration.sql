-- v79 — Integrate BZ Points into P28/P32 backup and reset without rewriting proven reset logic.
-- Rules and rewards are administration configuration; dynamic ledger/actions/redemptions follow their data scope.

alter function private.backup_tables_for_domain(text) rename to backup_tables_for_domain_pre_bz;

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language plpgsql
stable
set search_path=''
as $$
declare
  v_tables text[];
begin
  if p_domain='bz' then
    return array[
      'bz_point_rules','bz_rewards','bz_action_events','bz_point_ledger','bz_reward_redemptions'
    ]::text[];
  end if;

  v_tables:=private.backup_tables_for_domain_pre_bz(p_domain);
  if v_tables is null then return null; end if;

  if p_domain='settings' then
    return v_tables || array['bz_point_rules','bz_rewards']::text[];
  elsif p_domain='complete' then
    return v_tables || array[
      'bz_point_rules','bz_rewards','bz_action_events','bz_point_ledger','bz_reward_redemptions'
    ]::text[];
  end if;
  return v_tables;
end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public,anon,authenticated;
revoke all on function private.backup_tables_for_domain_pre_bz(text) from public,anon,authenticated;

alter function private.admin_reset_preview_counts(text,bigint) rename to admin_reset_preview_counts_pre_bz;

create or replace function private.admin_reset_preview_counts(p_scope text,p_target_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_counts jsonb;
  v_bz bigint:=0;
begin
  v_counts:=private.admin_reset_preview_counts_pre_bz(p_scope,p_target_id);

  if p_scope='person' and p_target_id is not null then
    select
      (select count(*) from public.bz_reward_redemptions where person_id=p_target_id)
      +(select count(*) from public.bz_point_ledger where person_id=p_target_id)
      +(select count(*) from public.bz_action_events where person_id=p_target_id)
    into v_bz;
  elsif p_scope='students' then
    select
      (select count(*) from public.bz_reward_redemptions d where exists(select 1 from public.student_profiles sp where sp.person_id=d.person_id))
      +(select count(*) from public.bz_point_ledger l where exists(select 1 from public.student_profiles sp where sp.person_id=l.person_id))
      +(select count(*) from public.bz_action_events a where exists(select 1 from public.student_profiles sp where sp.person_id=a.person_id))
    into v_bz;
  elsif p_scope='classes' then
    select
      (select count(*) from public.bz_action_events a where a.class_id is not null and exists(select 1 from public.classes c where c.id=a.class_id))
      +(select count(*) from public.bz_point_ledger l where l.source_type='class' and l.source_id ~ '^[0-9]+$' and exists(select 1 from public.classes c where c.id=l.source_id::bigint))
    into v_bz;
  elsif p_scope='credits' then
    select count(*) into v_bz
    from public.bz_point_ledger l
    where l.source_type='credit_grant' and l.source_id ~ '^[0-9]+$'
      and exists(select 1 from public.credit_grants g where g.id=l.source_id::bigint);
  elsif p_scope='teaching_content' and p_target_id is not null then
    select
      (select count(*) from public.bz_action_events where content_id=p_target_id)
      +(select count(*) from public.bz_point_ledger where source_type='teaching_content' and source_id=p_target_id::text)
      +(select count(*) from public.bz_point_ledger where rule_key='next_class_content_choice' and detail->>'content_id'=p_target_id::text)
    into v_bz;
  elsif p_scope='teaching' then
    select
      (select count(*) from public.bz_action_events where content_id is not null)
      +(select count(*) from public.bz_point_ledger where source_type='teaching_content' or rule_key='next_class_content_choice')
    into v_bz;
  elsif p_scope in ('operational','full') then
    select
      (select count(*) from public.bz_reward_redemptions)
      +(select count(*) from public.bz_point_ledger)
      +(select count(*) from public.bz_action_events)
    into v_bz;
  end if;

  return coalesce(v_counts,'{}'::jsonb)||jsonb_build_object('bz_points',coalesce(v_bz,0));
end;
$$;

revoke all on function private.admin_reset_preview_counts(text,bigint) from public,anon,authenticated;
revoke all on function private.admin_reset_preview_counts_pre_bz(text,bigint) from public,anon,authenticated;

alter function private.execute_admin_data_reset(text,bigint) rename to execute_admin_data_reset_pre_bz;

create or replace function private.execute_admin_data_reset(p_scope text,p_target_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if p_scope='person' and p_target_id is not null then
    delete from public.bz_reward_redemptions where person_id=p_target_id;
    delete from public.bz_point_ledger where person_id=p_target_id;
    delete from public.bz_action_events where person_id=p_target_id;
  elsif p_scope='students' then
    delete from public.bz_reward_redemptions d where exists(select 1 from public.student_profiles sp where sp.person_id=d.person_id);
    delete from public.bz_point_ledger l where exists(select 1 from public.student_profiles sp where sp.person_id=l.person_id);
    delete from public.bz_action_events a where exists(select 1 from public.student_profiles sp where sp.person_id=a.person_id);
  elsif p_scope='classes' then
    delete from public.bz_action_events a where a.class_id is not null and exists(select 1 from public.classes c where c.id=a.class_id);
    delete from public.bz_point_ledger l
    where l.source_type='class' and l.source_id ~ '^[0-9]+$'
      and exists(select 1 from public.classes c where c.id=l.source_id::bigint);
  elsif p_scope='credits' then
    delete from public.bz_point_ledger l
    where l.source_type='credit_grant' and l.source_id ~ '^[0-9]+$'
      and exists(select 1 from public.credit_grants g where g.id=l.source_id::bigint);
  elsif p_scope='teaching_content' and p_target_id is not null then
    delete from public.bz_action_events where content_id=p_target_id;
    delete from public.bz_point_ledger where source_type='teaching_content' and source_id=p_target_id::text;
    delete from public.bz_point_ledger where rule_key='next_class_content_choice' and detail->>'content_id'=p_target_id::text;
  elsif p_scope='teaching' then
    delete from public.bz_action_events where content_id is not null;
    delete from public.bz_point_ledger where source_type='teaching_content' or rule_key='next_class_content_choice';
  elsif p_scope in ('operational','full') then
    delete from public.bz_reward_redemptions;
    delete from public.bz_point_ledger;
    delete from public.bz_action_events;
  end if;

  v_result:=private.execute_admin_data_reset_pre_bz(p_scope,p_target_id);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('bz_points_reset',p_scope in ('person','students','classes','credits','teaching_content','teaching','operational','full'));
end;
$$;

revoke all on function private.execute_admin_data_reset(text,bigint) from public,anon,authenticated;
revoke all on function private.execute_admin_data_reset_pre_bz(text,bigint) from public,anon,authenticated;
