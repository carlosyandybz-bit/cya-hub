-- PR-D · Academia Online · P28/P32 integration
-- Operational reset preserves Academy program configuration.
-- Full reset removes Academy programs because the canonical teaching library is also removed.
-- Module ordering is Administration configuration and survives every reset.

do $$
begin
  if to_regprocedure('private.backup_tables_for_domain_pre_academy(text)') is null then
    alter function private.backup_tables_for_domain(text) rename to backup_tables_for_domain_pre_academy;
  end if;
end;
$$;

create or replace function private.backup_tables_for_domain(p_domain text)
returns text[]
language plpgsql stable set search_path=''
as $$
declare v_tables text[];
begin
  if p_domain='academy' then
    return array[
      'app_module_settings',
      'academy_programs',
      'academy_program_contents',
      'academy_enrollments',
      'academy_progress'
    ]::text[];
  end if;

  v_tables:=private.backup_tables_for_domain_pre_academy(p_domain);
  if v_tables is null then return null; end if;

  if p_domain='settings' then
    return v_tables || array['app_module_settings']::text[];
  elsif p_domain='complete' then
    return v_tables || array[
      'app_module_settings',
      'academy_programs',
      'academy_program_contents',
      'academy_enrollments',
      'academy_progress'
    ]::text[];
  end if;
  return v_tables;
end;
$$;

revoke all on function private.backup_tables_for_domain(text) from public,anon,authenticated;
revoke all on function private.backup_tables_for_domain_pre_academy(text) from public,anon,authenticated;

do $$
begin
  if to_regprocedure('private.admin_reset_preview_counts_pre_academy(text,bigint)') is null then
    alter function private.admin_reset_preview_counts(text,bigint) rename to admin_reset_preview_counts_pre_academy;
  end if;
end;
$$;

create or replace function private.admin_reset_preview_counts(p_scope text,p_target_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_counts jsonb;
  v_academy bigint:=0;
begin
  v_counts:=private.admin_reset_preview_counts_pre_academy(p_scope,p_target_id);

  if p_scope='person' and p_target_id is not null then
    select
      (select count(*) from public.academy_progress ap where exists(select 1 from public.academy_enrollments e where e.id=ap.enrollment_id and e.person_id=p_target_id))
      +(select count(*) from public.academy_enrollments where person_id=p_target_id)
    into v_academy;
  elsif p_scope='students' then
    select
      (select count(*) from public.academy_progress ap where exists(
        select 1 from public.academy_enrollments e join public.student_profiles sp on sp.person_id=e.person_id
        where e.id=ap.enrollment_id
      ))
      +(select count(*) from public.academy_enrollments e where exists(select 1 from public.student_profiles sp where sp.person_id=e.person_id))
    into v_academy;
  elsif p_scope='teaching_content' and p_target_id is not null then
    select
      (select count(*) from public.academy_progress ap where exists(select 1 from public.academy_program_contents c where c.id=ap.program_content_id and c.content_id=p_target_id))
      +(select count(*) from public.academy_program_contents where content_id=p_target_id)
    into v_academy;
  elsif p_scope='teaching' then
    select (select count(*) from public.academy_progress)+(select count(*) from public.academy_program_contents) into v_academy;
  elsif p_scope='operational' then
    select (select count(*) from public.academy_progress)+(select count(*) from public.academy_enrollments) into v_academy;
  elsif p_scope='full' then
    select
      (select count(*) from public.academy_progress)
      +(select count(*) from public.academy_enrollments)
      +(select count(*) from public.academy_program_contents)
      +(select count(*) from public.academy_programs)
    into v_academy;
  end if;

  return coalesce(v_counts,'{}'::jsonb)||jsonb_build_object('academy_online',coalesce(v_academy,0));
end;
$$;

revoke all on function private.admin_reset_preview_counts(text,bigint) from public,anon,authenticated;
revoke all on function private.admin_reset_preview_counts_pre_academy(text,bigint) from public,anon,authenticated;

do $$
begin
  if to_regprocedure('private.execute_admin_data_reset_pre_academy(text,bigint)') is null then
    alter function private.execute_admin_data_reset(text,bigint) rename to execute_admin_data_reset_pre_academy;
  end if;
end;
$$;

create or replace function private.execute_admin_data_reset(p_scope text,p_target_id bigint default null)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if p_scope='person' and p_target_id is not null then
    delete from public.academy_progress ap
    where exists(select 1 from public.academy_enrollments e where e.id=ap.enrollment_id and e.person_id=p_target_id);
    delete from public.academy_enrollments where person_id=p_target_id;
  elsif p_scope='students' then
    delete from public.academy_progress ap
    where exists(
      select 1 from public.academy_enrollments e join public.student_profiles sp on sp.person_id=e.person_id
      where e.id=ap.enrollment_id
    );
    delete from public.academy_enrollments e
    where exists(select 1 from public.student_profiles sp where sp.person_id=e.person_id);
  elsif p_scope='teaching_content' and p_target_id is not null then
    delete from public.academy_program_contents where content_id=p_target_id;
  elsif p_scope='teaching' then
    delete from public.academy_program_contents;
  elsif p_scope='operational' then
    delete from public.academy_progress;
    delete from public.academy_enrollments;
  elsif p_scope='full' then
    delete from public.academy_progress;
    delete from public.academy_enrollments;
    delete from public.academy_program_contents;
    delete from public.academy_programs;
  end if;

  v_result:=private.execute_admin_data_reset_pre_academy(p_scope,p_target_id);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'academy_online_reset',
    p_scope in ('person','students','teaching_content','teaching','operational','full')
  );
end;
$$;

revoke all on function private.execute_admin_data_reset(text,bigint) from public,anon,authenticated;
revoke all on function private.execute_admin_data_reset_pre_academy(text,bigint) from public,anon,authenticated;
