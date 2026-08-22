-- CLASS-ATTENDANCE-SEC-01 effective ACL verification.
-- Run only in an isolated/rollback-only PRE-APPLY harness after loading M1.
-- This file is not a migration and must never be applied to staging as schema history.

begin;

do $test$
declare
  v_role text;
  v_signature text;
  v_roles constant text[] := array['public','anon','authenticated','service_role'];
  v_signatures constant text[] := array[
    'private.prevent_class_attendance_event_mutation()',
    'private.protect_durable_attendance_projection()',
    'private.sync_class_attendance_projection()',
    'private.class_attendance_latest_event(bigint,bigint)',
    'private.record_class_attendance_fact(bigint,bigint,text,text,timestamp with time zone,text,bigint,text,jsonb)',
    'private.person_has_real_attendance_unchecked(bigint)',
    'private.person_first_real_attendance_unchecked(bigint)',
    'private.person_last_real_attendance_unchecked(bigint)',
    'private.person_has_valid_future_class_unchecked(bigint)',
    'private.can_read_person_attendance(bigint)'
  ];
begin
  foreach v_signature in array v_signatures loop
    if to_regprocedure(v_signature) is null then
      raise exception 'missing helper %', v_signature;
    end if;

    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where p.oid=to_regprocedure(v_signature)
        and n.nspname='private'
        and p.prosecdef
        and coalesce(array_to_string(p.proconfig, ','),'') like '%search_path=%'
    ) then
      raise exception 'helper must remain SECURITY DEFINER with explicit search_path: %', v_signature;
    end if;

    foreach v_role in array v_roles loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'external EXECUTE leak: role=% helper=%', v_role, v_signature;
      end if;
    end loop;
  end loop;
end;
$test$;

-- Public mutation RPCs remain callable at ACL level for authenticated, but authorization is enforced inside the RPC.
do $test$
begin
  if not has_function_privilege('authenticated','public.record_class_attendance(bigint,bigint,text,text)','EXECUTE') then
    raise exception 'authenticated lost record_class_attendance RPC EXECUTE';
  end if;
  if not has_function_privilege('authenticated','public.correct_class_attendance(bigint,bigint,text,text,text)','EXECUTE') then
    raise exception 'authenticated lost correct_class_attendance RPC EXECUTE';
  end if;
end;
$test$;

-- Direct helper calls must be denied even if private schema USAGE exists.
set local role authenticated;
do $test$
begin
  begin
    perform private.record_class_attendance_fact(0,0,'present',null,now(),'explicit_record',null,null,'{}'::jsonb);
    raise exception 'authenticated unexpectedly executed private.record_class_attendance_fact';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

set local role anon;
do $test$
begin
  begin
    perform private.record_class_attendance_fact(0,0,'present',null,now(),'explicit_record',null,null,'{}'::jsonb);
    raise exception 'anon unexpectedly executed private.record_class_attendance_fact';
  exception
    when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

-- Functional staff/non-staff behavior requires the normal CLASS-ATTENDANCE-01 fixture identities.
-- Chat 11 must execute public.record_class_attendance/correct_class_attendance with those identities
-- in the PRE-APPLY harness and verify staff succeeds while non-staff receives SQLSTATE 42501.

rollback;
