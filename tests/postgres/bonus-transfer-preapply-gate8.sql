\set ON_ERROR_STOP on

create or replace function qa_transfer.expect_transfer_error(
  p_source_grant_id bigint,
  p_partner_person_id bigint,
  p_minutes integer,
  p_request_key text,
  p_class_id bigint,
  p_expected_state text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_state text;
begin
  begin
    perform public.transfer_individual_credit_to_pair_v2(
      p_source_grant_id,p_partner_person_id,p_minutes,p_request_key,p_class_id
    );
    raise exception 'QA_EXPECTED_TRANSFER_ERROR_NOT_RAISED';
  exception
    when others then
      get stacked diagnostics v_state=returned_sqlstate;
      if v_state is distinct from p_expected_state then
        raise exception 'QA transfer error mismatch: got %, expected %',
          v_state,p_expected_state;
      end if;
  end;
end;
$$;

-- Gate 8 — total transfer.
select qa_transfer.seed_source(4101,33,120);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4101,34,120,'qa-g8-total',null
  ) as r
) q
\gset gtotal_
reset role;

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(4101),0,'Gate8 total source zero'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:gtotal_dest),120,'Gate8 total destination exact'
);
select qa_transfer.assert_text_eq(
  (select status from public.credit_grants where id=4101),'exhausted','Gate8 total source exhausted'
);
select qa_transfer.assert_eq(
  (select source_balance_after from public.credit_transfer_operations where id=:gtotal_transfer_id),
  0,'Gate8 total operation source after'
);

-- Gate 8 — X=0, X<0 and X>balance deterministic rejection.
select qa_transfer.seed_source(4102,33,100);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select qa_transfer.expect_transfer_error(4102,34,0,'qa-g8-zero',null,'22023');
select qa_transfer.expect_transfer_error(4102,34,-5,'qa-g8-negative',null,'22023');
select qa_transfer.expect_transfer_error(4102,34,101,'qa-g8-over-balance',null,'22023');
reset role;

select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(4102),100,'Gate8 invalid X preserves balance'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations where source_grant_id=4102),
  0,'Gate8 invalid X creates no operation'
);

-- Gate 8 — pending is transferable and preserved.
select qa_transfer.seed_source(4103,35,100,'pending');
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4103,36,40,'qa-g8-pending',null
  ) as r
) q
\gset gpending_
reset role;

select qa_transfer.assert_text_eq(
  (select payment_status from public.credit_grants where id=:gpending_dest),
  'pending','Gate8 pending destination status'
);
select qa_transfer.assert_text_eq(
  (select source_payment_status from public.credit_transfer_operations where id=:gpending_transfer_id),
  'pending','Gate8 pending operation snapshot'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(4103),60,'Gate8 pending source balance'
);

-- Gate 8 — paused is transferable and destination pause is preserved.
select qa_transfer.seed_source(
  4104,37,100,'paid',now(),now()+interval '10 days'
);
insert into public.credit_grant_pause_periods(
  grant_id,paused_at,pause_reason,paused_by
)
values(
  4104,clock_timestamp()-interval '2 days','QA source pause',
  '11111111-1111-1111-1111-111111111111'
);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4104,38,40,'qa-g8-paused',null
  ) as r
) q
\gset gpaused_
reset role;

select qa_transfer.assert_true(
  (select source_was_paused from public.credit_transfer_operations where id=:gpaused_transfer_id),
  'Gate8 paused source snapshot'
);
select qa_transfer.assert_true(
  private.credit_grant_is_paused_unchecked(:gpaused_dest,now()),
  'Gate8 paused destination is paused'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_grant_pause_periods
    where grant_id=:gpaused_dest and resumed_at is null),
  1,'Gate8 destination has one open inherited pause'
);
select qa_transfer.assert_ts_eq(
  (select expires_at from public.credit_grants where id=:gpaused_dest),
  (select source_effective_expires_at from public.credit_transfer_operations where id=:gpaused_transfer_id),
  'Gate8 paused destination raw expiry equals source effective snapshot'
);

-- Gate 8 — future starts_at is preserved and does not block transfer.
select qa_transfer.seed_source(
  4105,39,100,'paid',now()+interval '3 days',now()+interval '30 days'
);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4105,40,40,'qa-g8-future-start',null
  ) as r
) q
\gset gfuture_
reset role;

select qa_transfer.assert_ts_eq(
  (select starts_at from public.credit_grants where id=:gfuture_dest),
  (select starts_at from public.credit_grants where id=4105),
  'Gate8 future starts_at preserved'
);
select qa_transfer.assert_true(
  (select starts_at>now() from public.credit_grants where id=:gfuture_dest),
  'Gate8 destination remains future'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(4105),60,
  'Gate8 future source transferred despite not yet usable'
);

-- Gate 8 — effective expiry, including a closed pause extension, is preserved.
select qa_transfer.seed_source(
  4106,33,100,'paid',now(),now()+interval '10 days'
);
insert into public.credit_grant_pause_periods(
  grant_id,paused_at,resumed_at,pause_reason,resume_reason,paused_by,resumed_by
)
values(
  4106,clock_timestamp()-interval '5 days',clock_timestamp()-interval '3 days',
  'QA closed pause','QA resumed',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111'
);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4106,34,40,'qa-g8-effective-expiry',null
  ) as r
) q
\gset gexpiry_
reset role;

select qa_transfer.assert_ts_eq(
  (select source_effective_expires_at from public.credit_transfer_operations where id=:gexpiry_transfer_id),
  private.credit_grant_effective_expires_at_unchecked(4106,now()),
  'Gate8 operation effective expiry matches canonical helper'
);
select qa_transfer.assert_ts_eq(
  (select expires_at from public.credit_grants where id=:gexpiry_dest),
  (select source_effective_expires_at from public.credit_transfer_operations where id=:gexpiry_transfer_id),
  'Gate8 destination inherits effective expiry'
);
select qa_transfer.assert_ts_eq(
  (select expires_at from public.credit_grants where id=:gexpiry_dest),
  (select expires_at+interval '2 days' from public.credit_grants where id=4106),
  'Gate8 closed pause contributes exact two-day extension'
);

-- Gate 8 — compatible transfer-derived destination is reused deterministically.
select qa_transfer.seed_source(4107,35,200);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4107,36,50,'qa-g8-compatible-1',null
  ) as r
) q
\gset gcompat1_

select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4107,36,30,'qa-g8-compatible-2',null
  ) as r
) q
\gset gcompat2_
reset role;

select qa_transfer.assert_eq(:gcompat1_dest,:gcompat2_dest,'Gate8 compatible pool reused');
select qa_transfer.assert_eq(
  (select count(*) from public.credit_pair_transfer_pools where economic_source_grant_id=4107),
  1,'Gate8 exactly one compatible pool'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:gcompat1_dest),80,
  'Gate8 compatible destination aggregate balance'
);

-- Gate 8 — independently purchased pair is never mixed with transfer-derived pool.
select qa_transfer.seed_source(4108,39,100);
insert into public.credit_grants(
  id,modality,label,total_minutes,price_cents,payment_status,status,
  purchased_at,expires_at,created_by,starts_at,purchased_at_approximate,historical_provenance
)
select
  8201,'pair','QA purchased pair',100,5000,'paid','active',
  purchased_at,expires_at,'11111111-1111-1111-1111-111111111111',
  starts_at,false,'qa-purchased-pair'
from public.credit_grants
where id=4108;

insert into public.credit_grant_members(grant_id,person_id)
values(8201,39),(8201,40);

insert into public.credit_movements(
  grant_id,movement_type,delta_minutes,note,created_by,provenance
)
values(
  8201,'grant',100,'QA independent purchased pair',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('qa','purchased-pair')
);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4108,40,40,'qa-g8-no-purchased-mix',null
  ) as r
) q
\gset gmix_
reset role;

select qa_transfer.assert_true(:gmix_dest<>8201,'Gate8 purchased pair not reused');
select qa_transfer.assert_eq(
  (select count(*) from public.credit_pair_transfer_pools where destination_grant_id=8201),
  0,'Gate8 purchased pair has no transfer-pool marker'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(8201),100,
  'Gate8 purchased pair balance unchanged'
);

-- Gate 8 — economic provenance is preserved explicitly.
select qa_transfer.seed_source(4109,33,100);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4109,34,40,'qa-g8-provenance',null
  ) as r
) q
\gset gprov_
reset role;

select qa_transfer.assert_text_eq(
  (select source_provenance->>'source_grant_id'
   from public.credit_transfer_operations where id=:gprov_transfer_id),
  '4109','Gate8 provenance source grant'
);
select qa_transfer.assert_text_eq(
  (select source_provenance->>'historical_provenance'
   from public.credit_transfer_operations where id=:gprov_transfer_id),
  'qa-disposable','Gate8 historical provenance'
);
select qa_transfer.assert_eq(
  (select jsonb_array_length(source_provenance->'grant_movements')
   from public.credit_transfer_operations where id=:gprov_transfer_id),
  1,'Gate8 original grant movement provenance captured'
);
select qa_transfer.assert_true(
  (
    select (cm.provenance->'economic_provenance')
           = op.source_provenance
    from public.credit_movements cm
    join public.credit_transfer_operations op on op.id=cm.transfer_id
    where cm.transfer_id=:gprov_transfer_id
      and cm.movement_type='transfer_in'
  ),
  'Gate8 inbound movement carries exact economic provenance'
);

-- Gate 8 — class_id is context only; no financial/debt/attendance side effects.
insert into public.classes(id) values(9001);
select qa_transfer.seed_source(4110,35,100);

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4110,36,40,'qa-g8-class-context',9001
  ) as r
) q
\gset gclass_
reset role;

select qa_transfer.assert_eq(
  (select class_id from public.credit_transfer_operations where id=:gclass_transfer_id),
  9001,'Gate8 class_id operation context'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_movements
   where transfer_id=:gclass_transfer_id and class_id=9001),
  2,'Gate8 class_id carried only on canonical transfer movements'
);
select qa_transfer.assert_eq(
  (select count(*) from public.credit_movements
   where transfer_id=:gclass_transfer_id and movement_type='class'),
  0,'Gate8 no class consumption movement'
);
select qa_transfer.assert_eq(
  (select count(*) from public.class_attendance_events),0,'Gate8 zero Attendance'
);
select qa_transfer.assert_eq(
  (select count(*) from public.class_financial_accounts),0,'Gate8 zero financial accounts'
);
select qa_transfer.assert_eq(
  (select count(*) from public.class_financial_items),0,'Gate8 zero revenue items'
);
select qa_transfer.assert_eq(
  (select count(*) from public.class_payment_movements),0,'Gate8 zero payment movements'
);
select qa_transfer.assert_eq(
  (
    select (detail->>'revenue_created_cents')::bigint
    from public.audit_events
    where event_type='credit_individual_to_pair_transferred'
      and entity_id=:gclass_transfer_id::text
  ),
  0,'Gate8 audit revenue zero'
);
select qa_transfer.assert_eq(
  (
    select (detail->>'debt_created_cents')::bigint
    from public.audit_events
    where event_type='credit_individual_to_pair_transferred'
      and entity_id=:gclass_transfer_id::text
  ),
  0,'Gate8 audit debt zero'
);

-- Gate 8 — preview is authoritative point-in-time but non-mutating.
select qa_transfer.seed_source(4111,37,100);
select
  (select count(*) from public.credit_grants) as grants_before,
  (select count(*) from public.credit_movements) as movements_before,
  (select count(*) from public.credit_transfer_operations) as operations_before,
  (select count(*) from public.credit_pair_transfer_pools) as pools_before
\gset gp_

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
do $qa_preview$
declare
  v_preview jsonb;
begin
  v_preview:=public.preview_individual_credit_to_pair_transfer(4111,38,30,null);
  if v_preview->>'status'<>'preview'
     or coalesce((v_preview->>'confirmation_required')::boolean,false) is not true
     or (v_preview#>>'{source,balance_before}')::integer<>100
     or (v_preview#>>'{source,balance_after}')::integer<>70
     or (v_preview#>>'{destination,balance_after}')::integer<>30 then
    raise exception 'Gate8 preview contract mismatch: %',v_preview;
  end if;
end;
$qa_preview$;
reset role;

select qa_transfer.assert_eq((select count(*) from public.credit_grants),:gp_grants_before,'Gate8 preview grants non-mutating');
select qa_transfer.assert_eq((select count(*) from public.credit_movements),:gp_movements_before,'Gate8 preview movements non-mutating');
select qa_transfer.assert_eq((select count(*) from public.credit_transfer_operations),:gp_operations_before,'Gate8 preview operations non-mutating');
select qa_transfer.assert_eq((select count(*) from public.credit_pair_transfer_pools),:gp_pools_before,'Gate8 preview pools non-mutating');
select qa_transfer.assert_eq(private.credit_grant_balance_minutes_unchecked(4111),100,'Gate8 preview source balance unchanged');

-- Gate 8 — reconciliation returns the committed operation and does not duplicate.
select qa_transfer.seed_source(4112,39,100);
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
set role authenticated;
select
  (r->>'transfer_id')::bigint as transfer_id,
  (r#>>'{destination,grant_id}')::bigint as dest
from (
  select public.transfer_individual_credit_to_pair_v2(
    4112,40,40,'qa-g8-reconcile',null
  ) as r
) q
\gset grec_

do $qa_reconcile$
declare
  v_result jsonb;
begin
  v_result:=public.reconcile_individual_credit_to_pair_transfer('qa-g8-reconcile');
  if v_result->>'status'<>'committed'
     or (v_result->>'operation_id')::bigint<>:grec_transfer_id
     or coalesce((v_result->>'reconciled')::boolean,false) is not true
     or coalesce((v_result#>>'{reconciliation,retry_with_same_key}')::boolean,false) is not true
     or coalesce((v_result#>>'{reconciliation,blind_retry_with_new_key}')::boolean,true) is not false then
    raise exception 'Gate8 reconciliation contract mismatch: %',v_result;
  end if;
end;
$qa_reconcile$;
reset role;

select qa_transfer.assert_eq(
  (select count(*) from public.credit_transfer_operations where request_key='qa-g8-reconcile'),
  1,'Gate8 reconciliation creates no duplicate operation'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(4112),60,
  'Gate8 reconciliation source charged once'
);
select qa_transfer.assert_eq(
  private.credit_grant_balance_minutes_unchecked(:grec_dest),40,
  'Gate8 reconciliation destination credited once'
);

select 'QA-BONUS-TRANSFER-004 CONTRACT RUNTIME: PASS' as result;
