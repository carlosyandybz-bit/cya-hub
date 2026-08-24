\set ON_ERROR_STOP on

create or replace function qa_transfer.expect_reverse_error(
  p_transfer_id bigint,
  p_request_key text,
  p_reason text,
  p_expected_state text,
  p_expected_message text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
  v_message text;
begin
  begin
    perform public.reverse_individual_credit_to_pair_transfer(
      p_transfer_id,p_request_key,p_reason
    );
    raise exception 'QA_EXPECTED_REVERSE_ERROR_NOT_RAISED';
  exception
    when others then
      get stacked diagnostics
        v_state=returned_sqlstate,
        v_message=message_text;
      if v_state is distinct from p_expected_state
         or v_message is distinct from p_expected_message then
        raise exception
          'QA reverse error mismatch: got [%] %, expected [%] %',
          v_state,v_message,p_expected_state,p_expected_message;
      end if;
  end;
end;
$$;

-- 003-A — another genuine negative use: refund.
select qa_transfer.seed_source(3101,25,200);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    3101,26,100,'qa-003-refund-transfer',null
  ) as r
) q
\gset a_
reset role;

insert into public.credit_movements(
  grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
)
values(
  :a_dest,'refund',-10,'QA genuine refund use',
  '11111111-1111-1111-1111-111111111111',clock_timestamp(),
  jsonb_build_object('qa','003-refund-negative-use')
);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select qa_transfer.expect_reverse_error(
  :a_t1,'qa-003-refund-reverse','must fail after refund',
  '55000','TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION'
);
reset role;

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:a_dest),90,
  '003-A refund destination balance remains consumed'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal' and reverses_transfer_id=:a_t1),0,
  '003-A no reversal created'
);

-- 003-B — malformed/incomplete transfer_out chain.
select qa_transfer.seed_source(3102,27,300);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    3102,28,100,'qa-003-malformed-t1',null
  ) as r
) q
\gset b1_

select (r->>'transfer_id')::bigint as t2
from (
  select public.transfer_individual_credit_to_pair_v2(
    3102,28,80,'qa-003-malformed-t2',null
  ) as r
) q
\gset b2_
reset role;

select
  private.credit_grant_balance_minutes_unchecked(3102) as source_before,
  private.credit_grant_balance_minutes_unchecked(:b1_dest) as dest_before
\gset bm_

select id as original_out_id
from public.credit_movements
where transfer_id=:b2_t2 and movement_type='transfer_out'
\gset bmout_

begin;
insert into public.credit_transfer_operations(
  operation_type,
  request_key,
  source_grant_id,
  destination_grant_id,
  source_person_id,
  partner_person_id,
  minutes,
  class_id,
  source_payment_status,
  source_starts_at,
  source_effective_expires_at,
  source_was_paused,
  source_provenance,
  source_balance_before,
  source_balance_after,
  destination_balance_before,
  destination_balance_after,
  actor_user_id,
  reason,
  reverses_transfer_id
)
select
  'reversal',
  'qa-003-malformed-reversal-op',
  op.source_grant_id,
  op.destination_grant_id,
  op.source_person_id,
  op.partner_person_id,
  op.minutes,
  op.class_id,
  op.source_payment_status,
  op.source_starts_at,
  op.source_effective_expires_at,
  op.source_was_paused,
  op.source_provenance,
  :bm_source_before,
  :bm_source_before + op.minutes,
  :bm_dest_before,
  :bm_dest_before - op.minutes,
  '11111111-1111-1111-1111-111111111111',
  'QA malformed reversal chain',
  op.id
from public.credit_transfer_operations op
where op.id=:b2_t2
returning id as malformed_reversal_id,minutes
\gset bmr_

insert into public.credit_movements(
  grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by,
  occurred_at,date_approximate,reverses_movement_id,provenance,
  source_operation_key,transfer_id
)
values(
  :b1_dest,null,null,'transfer_out',-:bmr_minutes,
  'QA malformed reversal outbound without reverses_movement_id',
  '11111111-1111-1111-1111-111111111111',clock_timestamp(),false,null,
  jsonb_build_object('qa','003-malformed-transfer-out'),
  'qa-003-malformed:out',:bmr_malformed_reversal_id
);

insert into public.credit_movements(
  grant_id,person_id,class_id,movement_type,delta_minutes,note,created_by,
  occurred_at,date_approximate,reverses_movement_id,provenance,
  source_operation_key,transfer_id
)
values(
  3102,27,null,'transfer_in',:bmr_minutes,
  'QA paired inbound for malformed reversal fixture',
  '11111111-1111-1111-1111-111111111111',clock_timestamp(),false,
  :bmout_original_out_id,
  jsonb_build_object('qa','003-malformed-transfer-in'),
  'qa-003-malformed:in',:bmr_malformed_reversal_id
);
commit;

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select qa_transfer.expect_reverse_error(
  :b1_t1,'qa-003-malformed-reverse-t1','must fail on incomplete canonical chain',
  '55000','TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION'
);
reset role;

select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal' and reverses_transfer_id=:b1_t1),0,
  '003-B malformed chain does not authorize T1 reversal'
);

-- 003-C — fake canonical reversal text/provenance must not be trusted.
select qa_transfer.seed_source(3103,29,200);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    3103,30,100,'qa-003-fake-text-transfer',null
  ) as r
) q
\gset c_
reset role;

insert into public.credit_movements(
  grant_id,movement_type,delta_minutes,note,created_by,occurred_at,provenance
)
values(
  :c_dest,'refund',-10,
  'Reversión canónica de transferencia individual a pareja',
  '11111111-1111-1111-1111-111111111111',clock_timestamp(),
  jsonb_build_object(
    'authority','BONUS-INDIVIDUAL-TO-PAIR-TRANSFER-01',
    'operation','individual_to_pair_transfer_reversal',
    'direction','out',
    'transfer_id',999999999,
    'reverses_transfer_id',:c_t1
  )
);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select qa_transfer.expect_reverse_error(
  :c_t1,'qa-003-fake-text-reverse','must ignore fake note/provenance',
  '55000','TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION'
);
reset role;

select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where operation_type='reversal' and reverses_transfer_id=:c_t1),0,
  '003-C fake text creates no reversal'
);

-- 003-D — same reversal request_key with incompatible reason/payload.
select qa_transfer.seed_source(3104,31,200);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as t1,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    3104,32,100,'qa-003-conflict-transfer',null
  ) as r
) q
\gset d_

select
  (r->>'reversal_id')::bigint as reversal_id
from (
  select public.reverse_individual_credit_to_pair_transfer(
    :d_t1,'qa-003-conflict-reversal','reason A'
  ) as r
) q
\gset dr_
reset role;

select
  private.credit_grant_balance_minutes_unchecked(3104) as source_before,
  private.credit_grant_balance_minutes_unchecked(:d_dest) as dest_before,
  (select count(*) from public.credit_transfer_operations
    where reverses_transfer_id=:d_t1) as reversal_count_before,
  (select count(*) from public.credit_movements
    where transfer_id=:dr_reversal_id) as movement_count_before
\gset dc_

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select qa_transfer.expect_reverse_error(
  :d_t1,'qa-003-conflict-reversal','reason B',
  '23505','IDEMPOTENCY_CONFLICT'
);
reset role;

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(3104),:dc_source_before,
  '003-D source unchanged after idempotency conflict'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:d_dest),:dc_dest_before,
  '003-D destination unchanged after idempotency conflict'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations
    where reverses_transfer_id=:d_t1),:dc_reversal_count_before,
  '003-D no second reversal operation'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_movements
    where transfer_id=:dr_reversal_id),:dc_movement_count_before,
  '003-D no extra reversal movements'
);
select qa_transfer.assert_text_eq(
  (select reason from public.credit_transfer_operations where id=:dr_reversal_id),
  'reason A',
  '003-D committed history reason not rewritten'
);

select 'QA-BONUS-TRANSFER-003 RUNTIME: PASS' as result;
