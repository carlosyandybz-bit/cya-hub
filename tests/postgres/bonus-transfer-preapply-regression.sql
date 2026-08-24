\set ON_ERROR_STOP on

do $qa$
declare
  v jsonb;
  v_t1 bigint;
  v_t2 bigint;
  v_r1 bigint;
  v_r2 bigint;
  v_dest bigint;
  v_before bigint;
  v_after bigint;
begin
  -- CASE A: T1 +100, T2 +80, reverse T2, reverse T1.
  perform qa_transfer.seed_source(1001,1,300);

  v:=public.transfer_individual_credit_to_pair_v2(1001,2,100,'qa-a-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;

  v:=public.transfer_individual_credit_to_pair_v2(1001,2,80,'qa-a-t2',null);
  v_t2:=(v->>'transfer_id')::bigint;

  v:=public.reverse_individual_credit_to_pair_transfer(v_t2,'qa-a-r2','QA reverse T2');
  v_r2:=(v->>'reversal_id')::bigint;

  v:=public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-a-r1','QA reverse T1');
  v_r1:=(v->>'reversal_id')::bigint;

  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(1001),300,'case A source balance'
  );
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(v_dest),0,'case A destination balance'
  );
  perform qa_transfer.assert_eq(
    (select count(*) from public.credit_transfer_operations
      where id in (v_t1,v_t2,v_r1,v_r2)),4,'case A operation history'
  );
  perform qa_transfer.assert_eq(
    (select count(*) from public.credit_movements
      where transfer_id in (v_t1,v_t2,v_r1,v_r2)),8,'case A movement history'
  );
  perform qa_transfer.assert_eq(
    (select count(*) from public.credit_transfer_operations
      where operation_type='reversal'
        and reverses_transfer_id in (v_t1,v_t2)),2,'case A reversal links'
  );

  begin
    update public.credit_transfer_operations
    set reason='destructive rewrite probe'
    where id=v_t1;
    raise exception 'QA expected append-only operation update to fail';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.credit_movements where transfer_id=v_t1;
    raise exception 'QA expected append-only movement delete to fail';
  exception
    when sqlstate '55000' then null;
  end;

  -- CASE B: reverse older T1 before newer T2; neither reversal depends on LIFO.
  perform qa_transfer.seed_source(1002,3,300);

  v:=public.transfer_individual_credit_to_pair_v2(1002,4,100,'qa-b-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;

  v:=public.transfer_individual_credit_to_pair_v2(1002,4,80,'qa-b-t2',null);
  v_t2:=(v->>'transfer_id')::bigint;

  perform public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-b-r1','QA reverse older T1 first');
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(v_dest),80,'case B destination after reverse T1'
  );

  perform public.reverse_individual_credit_to_pair_transfer(v_t2,'qa-b-r2','QA reverse newer T2 second');
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(1002),300,'case B source final'
  );
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(v_dest),0,'case B destination final'
  );

  -- CASE C: genuine class consumption after T1 must remain fail-closed.
  perform qa_transfer.seed_source(1003,5,200);
  v:=public.transfer_individual_credit_to_pair_v2(1003,6,100,'qa-c-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;

  insert into public.credit_movements(
    grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
  )
  values(
    v_dest,'class',-10,'QA genuine class consumption',(select auth.uid()),clock_timestamp(),
    jsonb_build_object('qa','genuine-negative-use')
  );

  begin
    perform public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-c-r1','must fail after class consumption');
    raise exception 'QA expected genuine class consumption to block reversal';
  exception
    when sqlstate '55000' then
      if sqlerrm<>'TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION' then
        raise;
      end if;
  end;

  -- CASE D: non-canonical negative adjustment must remain fail-closed.
  perform qa_transfer.seed_source(1004,7,200);
  v:=public.transfer_individual_credit_to_pair_v2(1004,8,100,'qa-d-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;

  insert into public.credit_movements(
    grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
  )
  values(
    v_dest,'adjustment',-10,'QA arbitrary negative adjustment',(select auth.uid()),clock_timestamp(),
    jsonb_build_object('qa','arbitrary-negative-adjustment')
  );

  begin
    perform public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-d-r1','must fail after adjustment');
    raise exception 'QA expected negative adjustment to block reversal';
  exception
    when sqlstate '55000' then
      if sqlerrm<>'TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION' then
        raise;
      end if;
  end;

  -- CASE E: committed reversal replay is idempotent.
  perform qa_transfer.seed_source(1005,9,200);
  v:=public.transfer_individual_credit_to_pair_v2(1005,10,100,'qa-e-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;

  v:=public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-e-r1','QA replay reversal');
  v_r1:=(v->>'reversal_id')::bigint;
  v:=public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-e-r1','QA replay reversal');

  if coalesce((v->>'idempotent_replay')::boolean,false) is not true then
    raise exception 'QA reversal replay did not return idempotent_replay=true';
  end if;
  perform qa_transfer.assert_eq(
    (select count(*) from public.credit_transfer_operations
      where operation_type='reversal' and reverses_transfer_id=v_t1),1,'case E one reversal operation'
  );
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(1005),200,'case E source final'
  );
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(v_dest),0,'case E destination final'
  );

  -- CASE F: a second request key cannot reverse the same transfer twice.
  perform qa_transfer.seed_source(1006,11,200);
  v:=public.transfer_individual_credit_to_pair_v2(1006,12,100,'qa-f-t1',null);
  v_t1:=(v->>'transfer_id')::bigint;
  v_dest:=(v#>>'{destination,grant_id}')::bigint;
  perform public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-f-r1','QA first reversal');

  v_before:=private.credit_grant_balance_minutes_unchecked(1006);
  begin
    perform public.reverse_individual_credit_to_pair_transfer(v_t1,'qa-f-r2','QA forbidden second reversal');
    raise exception 'QA expected second distinct reversal request to fail';
  exception
    when unique_violation then
      if sqlerrm<>'TRANSFER_ALREADY_REVERSED' then
        raise;
      end if;
  end;
  v_after:=private.credit_grant_balance_minutes_unchecked(1006);

  perform qa_transfer.assert_eq(v_after,v_before,'case F source unchanged after rejected double reversal');
  perform qa_transfer.assert_eq(
    (select count(*) from public.credit_transfer_operations
      where operation_type='reversal' and reverses_transfer_id=v_t1),1,'case F still one reversal'
  );
  perform qa_transfer.assert_eq(
    private.credit_grant_balance_minutes_unchecked(v_dest),0,'case F destination unchanged'
  );
end;
$qa$;

-- Global ledger conservation over every canonical operation created above.
do $qa_invariants$
declare
  v_bad bigint;
begin
  select count(*) into v_bad
  from (
    select
      op.id,
      count(*) filter (where cm.movement_type='transfer_out') as out_count,
      count(*) filter (where cm.movement_type='transfer_in') as in_count,
      coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_out'),0) as out_sum,
      coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_in'),0) as in_sum
    from public.credit_transfer_operations op
    left join public.credit_movements cm on cm.transfer_id=op.id
    group by op.id,op.minutes
    having count(*) filter (where cm.movement_type='transfer_out')<>1
       or count(*) filter (where cm.movement_type='transfer_in')<>1
       or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_out'),0)<>-op.minutes
       or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_in'),0)<>op.minutes
       or coalesce(sum(cm.delta_minutes),0)<>0
  ) invalid;

  if v_bad<>0 then
    raise exception 'QA found % canonical operations violating -X/+X conservation',v_bad;
  end if;
end;
$qa_invariants$;
