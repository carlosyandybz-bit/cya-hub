-- v81 — Integrate Feedback Online into P28/P32 backup and reset.
-- Product configuration is preserved like other Administration settings; operational orders, ledger and requests follow their data scope.

alter function private.backup_tables_for_domain(text) rename to backup_tables_for_domain_pre_feedback;

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language plpgsql
stable
set search_path=''
as $$
declare
  v_tables text[];
begin
  if p_domain='feedback' then
    return array[
      'feedback_products',
      'feedback_credit_orders',
      'feedback_requests',
      'feedback_credit_ledger',
      'feedback_request_events',
      'feedback_request_contents'
    ]::text[];
  end if;

  v_tables:=private.backup_tables_for_domain_pre_feedback(p_domain);
  if v_tables is null then return null; end if;

  if p_domain='settings' then
    return v_tables || array['feedback_products']::text[];
  elsif p_domain='complete' then
    return v_tables || array[
      'feedback_products',
      'feedback_credit_orders',
      'feedback_requests',
      'feedback_credit_ledger',
      'feedback_request_events',
      'feedback_request_contents'
    ]::text[];
  end if;
  return v_tables;
end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public,anon,authenticated;
revoke all on function private.backup_tables_for_domain_pre_feedback(text) from public,anon,authenticated;

alter function private.admin_reset_preview_counts(text,bigint) rename to admin_reset_preview_counts_pre_feedback;

create or replace function private.admin_reset_preview_counts(p_scope text,p_target_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_counts jsonb;
  v_feedback bigint:=0;
begin
  v_counts:=private.admin_reset_preview_counts_pre_feedback(p_scope,p_target_id);

  if p_scope='person' and p_target_id is not null then
    select
      (select count(*) from public.feedback_request_contents c where exists(select 1 from public.feedback_requests r where r.id=c.request_id and r.person_id=p_target_id))
      +(select count(*) from public.feedback_request_events where person_id=p_target_id)
      +(select count(*) from public.feedback_credit_ledger where person_id=p_target_id)
      +(select count(*) from public.feedback_requests where person_id=p_target_id)
      +(select count(*) from public.feedback_credit_orders where person_id=p_target_id)
    into v_feedback;
  elsif p_scope='students' then
    select
      (select count(*) from public.feedback_request_contents c where exists(select 1 from public.feedback_requests r join public.student_profiles sp on sp.person_id=r.person_id where r.id=c.request_id))
      +(select count(*) from public.feedback_request_events e where exists(select 1 from public.student_profiles sp where sp.person_id=e.person_id))
      +(select count(*) from public.feedback_credit_ledger l where exists(select 1 from public.student_profiles sp where sp.person_id=l.person_id))
      +(select count(*) from public.feedback_requests r where exists(select 1 from public.student_profiles sp where sp.person_id=r.person_id))
      +(select count(*) from public.feedback_credit_orders o where exists(select 1 from public.student_profiles sp where sp.person_id=o.person_id))
    into v_feedback;
  elsif p_scope='teaching_content' and p_target_id is not null then
    select count(*) into v_feedback from public.feedback_request_contents where content_id=p_target_id;
  elsif p_scope='teaching' then
    select count(*) into v_feedback from public.feedback_request_contents;
  elsif p_scope in ('operational','full') then
    select
      (select count(*) from public.feedback_request_contents)
      +(select count(*) from public.feedback_request_events)
      +(select count(*) from public.feedback_credit_ledger)
      +(select count(*) from public.feedback_requests)
      +(select count(*) from public.feedback_credit_orders)
    into v_feedback;
  end if;

  return coalesce(v_counts,'{}'::jsonb)||jsonb_build_object('feedback_online',coalesce(v_feedback,0));
end;
$$;

revoke all on function private.admin_reset_preview_counts(text,bigint) from public,anon,authenticated;
revoke all on function private.admin_reset_preview_counts_pre_feedback(text,bigint) from public,anon,authenticated;

alter function private.execute_admin_data_reset(text,bigint) rename to execute_admin_data_reset_pre_feedback;

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
    delete from public.feedback_request_contents c
    where exists(select 1 from public.feedback_requests r where r.id=c.request_id and r.person_id=p_target_id);
    delete from public.feedback_request_events where person_id=p_target_id;
    delete from public.feedback_credit_ledger where person_id=p_target_id;
    delete from public.feedback_requests where person_id=p_target_id;
    delete from public.feedback_credit_orders where person_id=p_target_id;
  elsif p_scope='students' then
    delete from public.feedback_request_contents c
    where exists(select 1 from public.feedback_requests r join public.student_profiles sp on sp.person_id=r.person_id where r.id=c.request_id);
    delete from public.feedback_request_events e where exists(select 1 from public.student_profiles sp where sp.person_id=e.person_id);
    delete from public.feedback_credit_ledger l where exists(select 1 from public.student_profiles sp where sp.person_id=l.person_id);
    delete from public.feedback_requests r where exists(select 1 from public.student_profiles sp where sp.person_id=r.person_id);
    delete from public.feedback_credit_orders o where exists(select 1 from public.student_profiles sp where sp.person_id=o.person_id);
  elsif p_scope='teaching_content' and p_target_id is not null then
    delete from public.feedback_request_contents where content_id=p_target_id;
  elsif p_scope='teaching' then
    delete from public.feedback_request_contents;
  elsif p_scope in ('operational','full') then
    delete from public.feedback_request_contents;
    delete from public.feedback_request_events;
    delete from public.feedback_credit_ledger;
    delete from public.feedback_requests;
    delete from public.feedback_credit_orders;
  end if;

  v_result:=private.execute_admin_data_reset_pre_feedback(p_scope,p_target_id);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'feedback_online_reset',
    p_scope in ('person','students','teaching_content','teaching','operational','full')
  );
end;
$$;

revoke all on function private.execute_admin_data_reset(text,bigint) from public,anon,authenticated;
revoke all on function private.execute_admin_data_reset_pre_feedback(text,bigint) from public,anon,authenticated;
