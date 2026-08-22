-- CLASS-ATTENDANCE-01 — forward-fix for applied M1 runtime privilege defect.
-- STAGING ONLY. Incremental, idempotent, no data backfill, no business-rule rewrite.
-- Source of truth verified against installed STAGING definitions before authoring.

-- Trusted minimum boundary: v2 alone executes as postgres so it can call the sealed
-- private attendance helper while preserving the existing server-side staff check.
alter function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer)
  owner to postgres;
alter function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer)
  security definer;
alter function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer)
  set search_path to '';

-- Wrappers remain SECURITY INVOKER by contract. Installed STAGING owner is postgres and is
-- verified below; their bodies/signatures are not replaced.
alter function public.administratively_finish_class_v3(bigint,bigint[],text[],bigint[],integer,integer)
  security invoker;
alter function public.administratively_finish_class_v4(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb)
  security invoker;
alter function public.administratively_finish_class_v5(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb,integer,bigint)
  security invoker;
alter function public.administratively_finish_class_v6(bigint,bigint[],bigint[],integer,integer,jsonb,jsonb,integer,bigint)
  security invoker;

-- Exact ACL: only owner postgres, authenticated and service_role may invoke v2-v6.
revoke all on function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer) from public,anon;
grant execute on function public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer) to authenticated,service_role;

revoke all on function public.administratively_finish_class_v3(bigint,bigint[],text[],bigint[],integer,integer) from public,anon;
grant execute on function public.administratively_finish_class_v3(bigint,bigint[],text[],bigint[],integer,integer) to authenticated,service_role;

revoke all on function public.administratively_finish_class_v4(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb) from public,anon;
grant execute on function public.administratively_finish_class_v4(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb) to authenticated,service_role;

revoke all on function public.administratively_finish_class_v5(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb,integer,bigint) from public,anon;
grant execute on function public.administratively_finish_class_v5(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb,integer,bigint) to authenticated,service_role;

revoke all on function public.administratively_finish_class_v6(bigint,bigint[],bigint[],integer,integer,jsonb,jsonb,integer,bigint) from public,anon;
grant execute on function public.administratively_finish_class_v6(bigint,bigint[],bigint[],integer,integer,jsonb,jsonb,integer,bigint) to authenticated,service_role;

-- The private helper remains sealed. Do not grant direct external EXECUTE.
revoke execute on function private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb)
  from public,anon,authenticated,service_role;

-- Fail closed if the migration does not produce the exact intended security boundary.
do $forward_fix_guard$
declare
  v_oid oid;
  v_role text;
  v_roles text[] := array['public','anon'];
  v_allowed_roles text[] := array['authenticated','service_role'];
  v_sig text;
  v_wrapper_sigs text[] := array[
    'public.administratively_finish_class_v3(bigint,bigint[],text[],bigint[],integer,integer)',
    'public.administratively_finish_class_v4(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb)',
    'public.administratively_finish_class_v5(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb,integer,bigint)',
    'public.administratively_finish_class_v6(bigint,bigint[],bigint[],integer,integer,jsonb,jsonb,integer,bigint)'
  ];
begin
  v_oid := to_regprocedure('public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer)');
  if v_oid is null then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: v2 signature not found' using errcode='42704';
  end if;

  if not (select p.prosecdef from pg_proc p where p.oid=v_oid) then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: v2 must be SECURITY DEFINER' using errcode='42501';
  end if;
  if (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid=v_oid) <> 'postgres' then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: v2 owner must be postgres' using errcode='42501';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=v_oid and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']::text[]
  ) then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: v2 search_path must be empty' using errcode='42501';
  end if;
  if position('private.is_staff()' in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: v2 staff guard missing' using errcode='42501';
  end if;

  foreach v_role in array v_roles loop
    if has_function_privilege(v_role,v_oid,'EXECUTE') then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: forbidden EXECUTE on v2 role=%',v_role using errcode='42501';
    end if;
  end loop;
  foreach v_role in array v_allowed_roles loop
    if not has_function_privilege(v_role,v_oid,'EXECUTE') then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: required EXECUTE missing on v2 role=%',v_role using errcode='42501';
    end if;
  end loop;

  foreach v_sig in array v_wrapper_sigs loop
    v_oid := to_regprocedure(v_sig);
    if v_oid is null then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: wrapper signature not found: %',v_sig using errcode='42704';
    end if;
    if (select p.prosecdef from pg_proc p where p.oid=v_oid) then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: wrapper must remain SECURITY INVOKER: %',v_sig using errcode='42501';
    end if;
    if (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid=v_oid) <> 'postgres' then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: wrapper owner must remain postgres: %',v_sig using errcode='42501';
    end if;
    foreach v_role in array v_roles loop
      if has_function_privilege(v_role,v_oid,'EXECUTE') then
        raise exception 'ATTENDANCE M1 FORWARD-FIX: forbidden wrapper EXECUTE role=% function=%',v_role,v_sig using errcode='42501';
      end if;
    end loop;
    foreach v_role in array v_allowed_roles loop
      if not has_function_privilege(v_role,v_oid,'EXECUTE') then
        raise exception 'ATTENDANCE M1 FORWARD-FIX: required wrapper EXECUTE missing role=% function=%',v_role,v_sig using errcode='42501';
      end if;
    end loop;
  end loop;

  v_oid := to_regprocedure('private.record_class_attendance_fact(bigint,bigint,text,text,timestamp with time zone,text,bigint,text,jsonb)');
  if v_oid is null then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: private helper signature not found' using errcode='42704';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid=v_oid) then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: private helper must remain SECURITY DEFINER' using errcode='42501';
  end if;
  if (select pg_get_userbyid(p.proowner) from pg_proc p where p.oid=v_oid) <> 'postgres' then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: private helper owner must remain postgres' using errcode='42501';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid=v_oid and coalesce(p.proconfig,'{}'::text[]) @> array['search_path=""']::text[]
  ) then
    raise exception 'ATTENDANCE M1 FORWARD-FIX: private helper search_path must remain empty' using errcode='42501';
  end if;
  foreach v_role in array array['public','anon','authenticated','service_role']::text[] loop
    if has_function_privilege(v_role,v_oid,'EXECUTE') then
      raise exception 'ATTENDANCE M1 FORWARD-FIX: private helper leaked EXECUTE to role=%',v_role using errcode='42501';
    end if;
  end loop;
end;
$forward_fix_guard$;
