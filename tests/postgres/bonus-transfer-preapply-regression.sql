\set ON_ERROR_STOP on

create or replace function qa_transfer.assert_reverse_requires_admin(
  p_transfer_id bigint,
  p_request_key text,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.reverse_individual_credit_to_pair_transfer(
      p_transfer_id,p_request_key,p_reason
    );
    raise exception 'QA expected reversal to require administrative correction';
  exception
    when sqlstate '55000' then
      if sqlerrm<>'TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION' then
        raise;
      end if;
  end;
end;
$$;

create or replace function qa_transfer.assert_second_reversal_rejected(
  p_transfer_id bigint,
  p_request_key text,
  p_reason text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform public.reverse_individual_credit_to_pair_transfer(
      p_transfer_id,p_request_key,p_reason
    );
    raise exception 'QA expected a second distinct reversal to fail';
  exception
    when unique_violation then
      if sqlerrm<>'TRANSFER_ALREADY_REVERSED' then
        raise;
      end if;
  end;
end;
$$;

create or replace function qa_transfer.assert_append_only(
  p_operation_id bigint,
  p_transfer_id bigint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    update public.credit_transfer_operations
    set reason='destructive rewrite probe'
    where id=p_operation_id;
    raise exception 'QA expected append-only operation update to fail';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.credit_movements where transfer_id=p_transfer_id;
    raise exception 'QA expected append-only movement delete to fail';
  exception
    when sqlstate '55000' then null;
  end;
end;
$$;

-- CASE A: T1 +100, T2 +80, reverse T2, reverse T1.
select qa_transfer.seed_source(1001,1,300);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1001,2,100,'qa-a-t1',null
  ) as r
) q
\gset a1_

select (r->>'transfer_id')::bigint as t2
from (
  select public.transfer_individual_credit_to_pair_v2(
    1001,2,80,'qa-a-t2',null
  ) as r
) q
\gset a2_

select (r->>'reversal_id')::bigint as r2
from (
  select public.reverse_individual_credit_to_pair_transfer(
    :a2_t2,'qa-a-r2','QA reverse T2'
  ) as r
) q
\gset ar2_

select (r->>'reversal_id')::bigint as r1
from (
  select public.reverse_individual_credit_to_pair_transfer(
    :a1_t1,'qa-a-r1','QA reverse T1'
  ) as r
) q
\gset ar1_

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(1001),300,'case A source balance'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:a1_dest),0,'case A destination balance'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where id in (:a1_t1,:a2_t2,:ar1_r1,:ar2_r2)),4,'case A operation history'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_movements
    where transfer_id in (:a1_t1,:a2_t2,:ar1_r1,:ar2_r2)),8,'case A movement history'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal'
      and reverses_transfer_id in (:a1_t1,:a2_t2)),2,'case A reversal links'
);
select qa_transfer.assert_append_only(:a1_t1,:a1_t1);

-- CASE B: reverse older T1 before newer T2; no LIFO-only dependency.
select qa_transfer.seed_source(1002,3,300);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1002,4,100,'qa-b-t1',null
  ) as r
) q
\gset b1_

select (r->>'transfer_id')::bigint as t2
from (
  select public.transfer_individual_credit_to_pair_v2(
    1002,4,80,'qa-b-t2',null
  ) as r
) q
\gset b2_

select public.reverse_individual_credit_to_pair_transfer(
  :b1_t1,'qa-b-r1','QA reverse older T1 first'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:b1_dest),80,'case B destination after reverse T1'
);

select public.reverse_individual_credit_to_pair_transfer(
  :b2_t2,'qa-b-r2','QA reverse newer T2 second'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(1002),300,'case B source final'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:b1_dest),0,'case B destination final'
);

-- CASE C: genuine class consumption after T1 remains fail-closed.
select qa_transfer.seed_source(1003,5,200);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1003,6,100,'qa-c-t1',null
  ) as r
) q
\gset c1_

insert into public.credit_movements(
  grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
)
values(
  :c1_dest,'class',-10,'QA genuine class consumption',(select auth.uid()),clock_timestamp(),
  jsonb_build_object('qa','genuine-negative-use')
);

select qa_transfer.assert_reverse_requires_admin(
  :c1_t1,'qa-c-r1','must fail after class consumption'
);

-- CASE D: non-canonical negative adjustment remains fail-closed.
select qa_transfer.seed_source(1004,7,200);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1004,8,100,'qa-d-t1',null
  ) as r
) q
\gset d1_

insert into public.credit_movements(
  grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
)
values(
  :d1_dest,'adjustment',-10,'QA arbitrary negative adjustment',(select auth.uid()),clock_timestamp(),
  jsonb_build_object('qa','arbitrary-negative-adjustment')
);

select qa_transfer.assert_reverse_requires_admin(
  :d1_t1,'qa-d-r1','must fail after adjustment'
);

-- CASE E: committed reversal replay is idempotent.
select qa_transfer.seed_source(1005,9,200);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1005,10,100,'qa-e-t1',null
  ) as r
) q
\gset e1_

select
  (r->>'reversal_id')::bigint as reversal_id,
  (r->>'idempotent_replay')::boolean as first_replay
from (
  select public.reverse_individual_credit_to_pair_transfer(
    :e1_t1,'qa-e-r1','QA replay reversal'
  ) as r
) q
\gset er1_

select
  (r->>'reversal_id')::bigint as reversal_id,
  (r->>'idempotent_replay')::boolean as second_replay
from (
  select public.reverse_individual_credit_to_pair_transfer(
    :e1_t1,'qa-e-r1','QA replay reversal'
  ) as r
) q
\gset er2_

select qa_transfer.assert_eq(:er2_second_replay::integer,1,'case E replay flag');
select qa_transfer.assert_eq(:er1_reversal_id,:er2_reversal_id,'case E same reversal id');
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal' and reverses_transfer_id=:e1_t1),1,'case E one reversal operation'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(1005),200,'case E source final'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:e1_dest),0,'case E destination final'
);

-- CASE F: a second request key cannot reverse the same transfer twice.
select qa_transfer.seed_source(1006,11,200);

select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    1006,12,100,'qa-f-t1',null
  ) as r
) q
\gset f1_

select public.reverse_individual_credit_to_pair_transfer(
  :f1_t1,'qa-f-r1','QA first reversal'
);
select private.credit_grant_balance_minutes_unchecked(1006) as before_balance
\gset f_

select qa_transfer.assert_second_reversal_rejected(
  :f1_t1,'qa-f-r2','QA forbidden second reversal'
);

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(1006),:f_before_balance,'case F source unchanged'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal' and reverses_transfer_id=:f1_t1),1,'case F still one reversal'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:f1_dest),0,'case F destination unchanged'
);

-- Global ledger conservation over every canonical operation created above.
select qa_transfer.assert_eq(
  (
    select count(*)
    from (
      select op.id
      from public.credit_transfer_operations op
      left join public.credit_movements cm on cm.transfer_id=op.id
      group by op.id,op.minutes
      having count(*) filter (where cm.movement_type='transfer_out')<>1
         or count(*) filter (where cm.movement_type='transfer_in')<>1
         or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_out'),0)<>-op.minutes
         or coalesce(sum(cm.delta_minutes) filter (where cm.movement_type='transfer_in'),0)<>op.minutes
         or coalesce(sum(cm.delta_minutes),0)<>0
    ) invalid
  ),
  0,
  'global -X/+X conservation'
);
