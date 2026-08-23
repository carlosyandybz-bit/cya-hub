import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  "supabase/migrations/20260822235000_bonus_authority_hardening_01.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

const checks = [
  ["adds server idempotency key", /add column if not exists source_operation_key text/i],
  ["enforces nonblank idempotency keys", /credit_movements_source_operation_key_nonblank/i],
  ["enforces unique non-null operation keys", /create unique index if not exists credit_movements_source_operation_key_uidx/i],
  ["uses the real transitional movement policy", /policyname = 'credit_movements_staff_insert'[\s\S]*?alter policy credit_movements_staff_insert/i],
  ["legacy direct movement writers cannot mint canonical operation keys while preserving author guard", /alter policy credit_movements_staff_insert[\s\S]*?with check \([\s\S]*?private\.is_staff\(\)[\s\S]*?created_by = \(select auth\.uid\(\)\)[\s\S]*?source_operation_key is null[\s\S]*?\);/i],
  ["creates canonical class consumption RPC", /create or replace function public\.consume_credit_grant_for_class\(/i],
  ["creates canonical class reversal RPC", /create or replace function public\.reverse_credit_consumption_for_class\(/i],
  ["creates canonical person summary RPC", /create or replace function public\.billing_person_bonus_summary\(/i],
  ["mutators are security definer", /consume_credit_grant_for_class[\s\S]*?security definer/i],
  ["reversal is security definer", /reverse_credit_consumption_for_class[\s\S]*?security definer/i],
  ["summary is security definer", /billing_person_bonus_summary[\s\S]*?security definer/i],
  ["server authz is explicit", /if not \(select private\.is_staff\(\)\)/i],
  ["consumption reuses canonical usability", /private\.credit_grant_is_usable_unchecked\(p_grant_id, now\(\)\)/i],
  ["consumption serializes grant", /from public\.credit_grants[\s\S]*?where id = p_grant_id[\s\S]*?for update/i],
  ["consumption preserves membership guard", /from public\.credit_grant_members[\s\S]*?gm\.person_id = p_person_id/i],
  ["consumption preserves balance floor", /if p_minutes > v_balance_before then/i],
  ["canonical movement carries provenance", /'authority', 'BONUS-AUTHORITY-HARDENING-01'/i],
  ["canonical movement carries operation key", /source_operation_key/i],
  ["reversal rejects terminal refund or cancel", /v_grant\.payment_status = 'refunded' or v_grant\.status = 'cancelled'/i],
  ["reversal is append-only", /reverses_movement_id/i],
  ["reversal follows movement then grant lock order", /reverse_credit_consumption_for_class[\s\S]*?from public\.credit_movements[\s\S]*?where id = p_original_movement_id[\s\S]*?for update;[\s\S]*?from public\.credit_grants[\s\S]*?where id = v_original\.grant_id[\s\S]*?for update;/i],
  ["operations create explicit audit events", /credit_consumed_canonical[\s\S]*credit_consumption_reversed_canonical/i],
  ["person summary reuses usable fact", /private\.person_has_usable_presential_bonus_unchecked\(p_person_id, p_at\)/i],
  ["person summary reuses intent fact", /private\.person_has_qualifying_presential_billing_intent_unchecked\(p_person_id, p_at\)/i],
  ["new public functions deny anon", /revoke all on function public\.consume_credit_grant_for_class[\s\S]*from public, anon/i],
  ["new public functions allow authenticated execution", /grant execute on function public\.consume_credit_grant_for_class[\s\S]*to authenticated, service_role/i],
  ["final DML hardening is explicitly gated", /intentionally NOT revoked in Phase 2A/i],
];

for (const [name, pattern] of checks) {
  assert.match(sql, pattern, name);
}

const reverseStart = sql.indexOf("create or replace function public.reverse_credit_consumption_for_class(");
const summaryStart = sql.indexOf("create or replace function public.billing_person_bonus_summary(");
assert.ok(reverseStart >= 0 && summaryStart > reverseStart, "reverse RPC boundaries must be present");
const reverseSql = sql.slice(reverseStart, summaryStart);

const reasonReplayPredicate = /v_existing\.note is not distinct from v_reason[\s\S]*?coalesce\(v_existing\.provenance->>'reason', ''\) = v_reason/gi;
const reasonReplayMatches = reverseSql.match(reasonReplayPredicate) ?? [];
assert.equal(reasonReplayMatches.length, 2, "both replay paths must include canonical p_reason equivalence");

const firstKeyLookup = reverseSql.indexOf("where source_operation_key = v_operation_key;");
const firstMovementInsert = reverseSql.indexOf("insert into public.credit_movements(");
const firstAuditInsert = reverseSql.indexOf("insert into public.audit_events(");
const firstGrantUpdate = reverseSql.indexOf("update public.credit_grants");
assert.ok(firstKeyLookup >= 0 && firstKeyLookup < firstMovementInsert, "existing-key replay must be checked before creating a reversal movement");
const firstReplayBlock = reverseSql.slice(firstKeyLookup, firstMovementInsert);
assert.match(firstReplayBlock, /v_existing\.reverses_movement_id = v_original\.id/i, "same key must match original movement");
assert.match(firstReplayBlock, /v_existing\.note is not distinct from v_reason/i, "same key must match normalized reason");
assert.match(firstReplayBlock, /coalesce\(v_existing\.provenance->>'reason', ''\) = v_reason/i, "same key must match provenance reason");
assert.match(firstReplayBlock, /'idempotent_replay', true/i, "same key + same canonical payload + same reason returns replay");
assert.match(firstReplayBlock, /raise exception 'La clave de idempotencia ya pertenece a otra operación\.'[\s\S]*?errcode = '23505'/i, "same key + different reason fails closed");
assert.ok(firstMovementInsert > firstKeyLookup, "mismatch gate precedes movement insert");
assert.ok(firstGrantUpdate > firstKeyLookup, "mismatch gate precedes grant update");
assert.ok(firstAuditInsert > firstKeyLookup, "mismatch gate precedes audit insert");

const conflictReplayStart = reverseSql.indexOf("if v_inserted.id is null then");
assert.ok(conflictReplayStart > firstMovementInsert, "concurrent conflict replay branch must exist");
const conflictReplayBlock = reverseSql.slice(conflictReplayStart);
assert.match(conflictReplayBlock, /v_existing\.note is not distinct from v_reason/i, "concurrent same-key replay also matches reason");
assert.match(conflictReplayBlock, /coalesce\(v_existing\.provenance->>'reason', ''\) = v_reason/i, "concurrent same-key replay also matches provenance reason");
assert.match(conflictReplayBlock, /raise exception 'La clave de idempotencia ya pertenece a otra operación\.'[\s\S]*?errcode = '23505'/i, "concurrent incompatible key reuse fails closed");

assert.doesNotMatch(
  sql,
  /\b(update|delete\s+from)\s+public\.credit_movements\b/i,
  "historical credit_movements must not be rewritten or deleted",
);

assert.doesNotMatch(
  sql,
  /\brevoke\s+(insert|update|delete|all)\s+on\s+(table\s+)?public\.(credit_grants|credit_movements|credit_grant_members)/i,
  "Phase 2A must not prematurely revoke table DML before cross-domain convergence",
);

assert.doesNotMatch(
  sql,
  /\bdrop\s+policy\s+(if\s+exists\s+)?(grants_staff_insert|grants_staff_update|credit_movements_staff_insert|grant_members_staff_insert)/i,
  "Phase 2A must not prematurely drop legacy write policies",
);

assert.doesNotMatch(
  sql,
  /\bquick_bonus\b/i,
  "quick_bonus must not become a second Billing business type",
);

assert.doesNotMatch(
  sql,
  /\b(debt|regularization|oldest[-_ ]first)\b/i,
  "BILLING-DEBT / REGULARIZATION is outside this package",
);

console.log(`BONUS-AUTHORITY-HARDENING-01 structural checks passed: ${checks.length + 20}`);
