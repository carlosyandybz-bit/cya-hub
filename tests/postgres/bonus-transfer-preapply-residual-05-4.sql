\set ON_ERROR_STOP on

-- QA 05.4 residual #4 — future starts_at remains not usable before starts_at.
select qa_transfer.seed_source(
  6101,19,100,'paid',now()+interval '3 days',now()+interval '30 days'
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    6101,20,40,'qa-054-future-not-usable',null
  ) as r
) q
\gset f_
reset role;

select qa_transfer.assert_true(
  (select starts_at>now() from public.credit_grants where id=:f_dest),
  '05.4 future destination starts_at is still future'
);
select qa_transfer.assert_text_eq(
  (select status from public.credit_grants where id=:f_dest),
  'active',
  '05.4 future destination status preserved'
);
select qa_transfer.assert_text_eq(
  (select payment_status from public.credit_grants where id=:f_dest),
  'paid',
  '05.4 future destination payment status preserved'
);
select qa_transfer.assert_ts_eq(
  (select starts_at from public.credit_grants where id=:f_dest),
  (select source_starts_at from public.credit_transfer_operations where id=:f_transfer_id),
  '05.4 future destination starts_at matches canonical operation snapshot'
);
select qa_transfer.assert_true(
  not private.credit_grant_is_usable_unchecked(:f_dest,now()),
  '05.4 canonical usability predicate denies future destination'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:f_dest),
  40,
  '05.4 future destination balance exists but is not yet usable'
);
select qa_transfer.assert_text_eq(
  (
    select source_provenance->>'source_grant_id'
    from public.credit_transfer_operations
    where id=:f_transfer_id
  ),
  '6101',
  '05.4 future destination economic provenance preserved'
);

-- QA 05.4 residual #5 — same pair and semantic state, different economic
-- source grants must never converge into one transfer-derived pool.
select qa_transfer.seed_source(
  6102,21,200,'paid',
  '2026-08-01T00:00:00Z'::timestamptz,
  '2026-12-01T00:00:00Z'::timestamptz
);
select qa_transfer.seed_source(
  6103,21,200,'paid',
  '2026-08-01T00:00:00Z'::timestamptz,
  '2026-12-01T00:00:00Z'::timestamptz
);

select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-1111-1111-111111111111',
  false
);
set role authenticated;

select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    6102,22,30,'qa-054-economic-a-1',null
  ) as r
) q
\gset ea1_

select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    6103,22,30,'qa-054-economic-b-1',null
  ) as r
) q
\gset eb1_

select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    6102,22,20,'qa-054-economic-a-2',null
  ) as r
) q
\gset ea2_

reset role;

select qa_transfer.assert_true(
  :ea1_dest<>:eb1_dest,
  '05.4 different economic sources do not share destination pool'
);
select qa_transfer.assert_eq(
  :ea1_dest,:ea2_dest,
  '05.4 same economic source reuses compatible pool'
);
select qa_transfer.assert_eq(
  (
    select economic_source_grant_id
    from public.credit_pair_transfer_pools
    where destination_grant_id=:ea1_dest
  ),
  6102,
  '05.4 source A pool marker'
);
select qa_transfer.assert_eq(
  (
    select economic_source_grant_id
    from public.credit_pair_transfer_pools
    where destination_grant_id=:eb1_dest
  ),
  6103,
  '05.4 source B pool marker'
);
select qa_transfer.assert_eq(
  (
    select count(*)
    from public.credit_pair_transfer_pools
    where economic_source_grant_id in (6102,6103)
  ),
  2,
  '05.4 exactly one isolated pool per economic source'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(6102),
  150,
  '05.4 source A exact remaining balance'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(6103),
  170,
  '05.4 source B exact remaining balance'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:ea1_dest),
  50,
  '05.4 source A destination exact balance after reuse'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:eb1_dest),
  30,
  '05.4 source B destination exact balance'
);
select qa_transfer.assert_text_eq(
  (
    select source_provenance->>'source_grant_id'
    from public.credit_transfer_operations
    where id=:ea1_transfer_id
  ),
  '6102',
  '05.4 source A provenance exact'
);
select qa_transfer.assert_text_eq(
  (
    select source_provenance->>'source_grant_id'
    from public.credit_transfer_operations
    where id=:eb1_transfer_id
  ),
  '6103',
  '05.4 source B provenance exact'
);
select qa_transfer.assert_text_eq(
  (
    select source_provenance->>'source_grant_id'
    from public.credit_transfer_operations
    where id=:ea2_transfer_id
  ),
  '6102',
  '05.4 reused source A provenance remains exact'
);

select 'QA 05.4 RESIDUAL FUTURE-USABILITY + ECONOMIC-ISOLATION: PASS' as result;
