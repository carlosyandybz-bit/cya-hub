import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  "supabase/migrations/20260824115943_bonus_individual_to_pair_transfer_foundation_01.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

function countMatches(pattern) {
  return [...sql.matchAll(pattern)].length;
}

test("foundation creates an append-only canonical operation and transfer-derived pool", () => {
  assert.match(sql, /create table public\.credit_transfer_operations/i);
  assert.match(sql, /create table public\.credit_pair_transfer_pools/i);
  assert.match(sql, /credit_transfer_operations_append_only/i);
  assert.match(sql, /credit_pair_transfer_pools_append_only/i);
  assert.match(sql, /credit_transfer_movements_append_only/i);
  assert.match(sql, /reverses_transfer_id bigint/i);
  assert.match(sql, /credit_transfer_operations_one_reversal_uidx/i);
});

test("ledger uses explicit transfer_out and transfer_in with conservation guards", () => {
  assert.match(sql, /'transfer_out'/);
  assert.match(sql, /'transfer_in'/);
  assert.match(sql, /credit_movements_transfer_out_uidx/i);
  assert.match(sql, /credit_movements_transfer_in_uidx/i);
  assert.match(sql, /TRANSFER_LEDGER_INVARIANT_VIOLATION/);
  assert.match(sql, /v_out_count<>1/);
  assert.match(sql, /v_in_count<>1/);
  assert.match(sql, /v_out_sum<>-v_minutes/);
  assert.match(sql, /v_in_sum<>v_minutes/);
  assert.match(sql, /\(v_out_sum\+v_in_sum\)<>0/);
  assert.equal(countMatches(/movement_type,\s*delta_minutes/gi) >= 2, true);
});

test("transfer is standalone and class context is optional, not an eligibility authority", () => {
  assert.match(
    sql,
    /public\.transfer_individual_credit_to_pair_v2\([\s\S]*p_class_id bigint default null/i
  );
  assert.match(sql, /public\.preview_individual_credit_to_pair_transfer/i);
  assert.doesNotMatch(sql, /class_financial_items/i);
  assert.doesNotMatch(sql, /class_financial_accounts/i);
  assert.doesNotMatch(sql, /class_participants/i);
  assert.doesNotMatch(sql, /attendance/i);
  assert.doesNotMatch(sql, /fee_cents/i);
  assert.doesNotMatch(sql, /(?:insert\s+into|update|delete\s+from)\s+public\.[a-z0-9_]*debt[a-z0-9_]*/i);
  assert.match(sql, /'debt_created_cents',0/);
});

test("source transfer eligibility is ledger-based while pending, paused and future-start states remain transferable", () => {
  assert.match(sql, /v_source\.payment_status not in \('paid','pending'\)/i);
  assert.match(sql, /private\.credit_grant_balance_minutes_unchecked\(v_source\.id\)/i);
  assert.match(sql, /private\.credit_grant_effective_expires_at_unchecked\(v_source\.id,v_now\)/i);
  assert.match(sql, /private\.credit_grant_is_paused_unchecked\(v_source\.id,v_now\)/i);
  assert.doesNotMatch(
    sql,
    /private\.credit_grant_is_usable_unchecked\(v_source\.id/i
  );
  assert.doesNotMatch(sql, /v_source\.starts_at\s*>\s*v_now/i);
  assert.doesNotMatch(sql, /v_source\.starts_at\s*<=\s*v_now/i);
});

test("destination preserves payment, starts_at, effective expiry and pause without monetary creation", () => {
  assert.match(sql, /v_source\.payment_status,[\s\S]*v_effective_expires_at,[\s\S]*v_source\.starts_at/i);
  assert.match(sql, /'Transferencia: pausa heredada del bono origen'/);
  assert.match(sql, /price_cents,[\s\S]*payment_status/);
  assert.match(sql, /'pair',[\s\S]*p_minutes,[\s\S]*0,[\s\S]*v_source\.payment_status/i);
  assert.match(sql, /'revenue_created_cents',0/);
  assert.match(sql, /'debt_created_cents',0/);
  assert.doesNotMatch(sql, /'paid'\s*\)/i);
});

test("purchased pair grants cannot be reused as transfer pools", () => {
  assert.match(sql, /from public\.credit_pair_transfer_pools tp/i);
  assert.match(sql, /g\.price_cents=0/i);
  assert.match(sql, /not exists \([\s\S]*cm\.movement_type='grant'/i);
  assert.match(sql, /member_person_id_low/);
  assert.match(sql, /member_person_id_high/);
  assert.match(sql, /order by g\.id[\s\S]*limit 1/i);
});

test("idempotency is request-key authoritative and supports reconciliation", () => {
  assert.match(sql, /credit_transfer_operations_request_key_uidx/i);
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(sql, /IDEMPOTENCY_CONFLICT/g);
  assert.match(sql, /public\.reconcile_individual_credit_to_pair_transfer/i);
  assert.match(sql, /'retry_with_same_key',true/);
  assert.match(sql, /'blind_retry_with_new_key',false/);
  assert.match(sql, /v_existing\.actor_user_id=v_actor/i);
});

test("locking order and locked balance recomputation protect overspend and destination races", () => {
  assert.match(
    sql,
    /from public\.credit_grants g\s+where g\.id=p_source_grant_id\s+for update/i
  );
  assert.match(sql, /v_source_balance_before\s*:=\s*private\.credit_grant_balance_minutes_unchecked/i);
  assert.match(sql, /p_minutes>v_source_balance_before/i);
  assert.match(sql, /cya:bonus-pair-transfer:pool:/);
  assert.match(sql, /for update of g/i);
});

test("reversal is append-only and fails closed after incompatible destination use", () => {
  assert.match(sql, /public\.reverse_individual_credit_to_pair_transfer/i);
  assert.match(sql, /operation_type='reversal'/i);
  assert.match(sql, /TRANSFER_REVERSAL_REQUIRES_ADMIN_CORRECTION/g);
  assert.match(sql, /cm\.delta_minutes<0/i);
  assert.match(sql, /reverses_movement_id/i);
  assert.doesNotMatch(sql, /delete from public\.credit_transfer_operations/i);
  assert.doesNotMatch(sql, /delete from public\.credit_movements/i);
});

test("new authority is server-authorized and has minimum external ACL", () => {
  for (const signature of [
    "preview_individual_credit_to_pair_transfer",
    "transfer_individual_credit_to_pair_v2",
    "reconcile_individual_credit_to_pair_transfer",
    "reverse_individual_credit_to_pair_transfer",
  ]) {
    assert.match(sql, new RegExp(`public\\.${signature}`));
  }
  assert.equal(countMatches(/security definer/gi) >= 7, true);
  assert.equal(countMatches(/set search_path = ''/gi) >= 8, true);
  assert.match(sql, /if not \(select private\.is_staff\(\)\)/i);
  assert.match(sql, /grant execute on function public\.transfer_individual_credit_to_pair_v2[\s\S]*to authenticated/i);
  assert.match(sql, /revoke execute on function public\.transfer_individual_credit_to_pair_v2[\s\S]*from anon/i);
  assert.match(sql, /revoke execute on function public\.transfer_individual_credit_to_pair_v2[\s\S]*from service_role/i);
});

test("transitional direct DML cannot forge canonical transfer movements", () => {
  assert.match(sql, /alter policy credit_movements_staff_insert/i);
  assert.match(sql, /source_operation_key is null/i);
  assert.match(sql, /transfer_id is null/i);
  assert.match(sql, /movement_type not in \('transfer_out','transfer_in'\)/i);
});

test("legacy RPC is documented but not replaced, revoked, dropped or altered in Foundation", () => {
  assert.doesNotMatch(sql, /drop function\s+public\.transfer_individual_credit_to_pair/i);
  assert.doesNotMatch(sql, /alter function\s+public\.transfer_individual_credit_to_pair\(/i);
  assert.doesNotMatch(sql, /revoke[^;]*public\.transfer_individual_credit_to_pair\(/i);
  assert.match(sql, /Legacy public\.transfer_individual_credit_to_pair/);
});

test("migration does not simulate transfer with adjustment, class consumption or refund movement values", () => {
  const transferInsertRegion = sql.slice(
    sql.indexOf("create or replace function public.transfer_individual_credit_to_pair_v2"),
    sql.indexOf("create or replace function public.reconcile_individual_credit_to_pair_transfer")
  );
  assert.match(transferInsertRegion, /'transfer_out'/);
  assert.match(transferInsertRegion, /'transfer_in'/);
  assert.doesNotMatch(transferInsertRegion, /'adjustment'/);
  assert.doesNotMatch(transferInsertRegion, /'class'\s*,\s*-p_minutes/);
  assert.doesNotMatch(transferInsertRegion, /'refund'/);
});
