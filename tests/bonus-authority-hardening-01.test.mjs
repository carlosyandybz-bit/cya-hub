import assert from "node:assert/strict";
import fs from "node:fs";

const migrationPath =
  "supabase/migrations/20260822235000_bonus_authority_hardening_01.sql";
const sql = fs.readFileSync(migrationPath, "utf8");

const checks = [
  ["adds server idempotency key", /add column if not exists source_operation_key text/i],
  ["enforces nonblank idempotency keys", /credit_movements_source_operation_key_nonblank/i],
  ["enforces unique non-null operation keys", /create unique index if not exists credit_movements_source_operation_key_uidx/i],
  ["legacy direct movement writers cannot mint canonical operation keys", /alter policy movements_staff_insert[\s\S]*?with check \(\(select private\.is_staff\(\)\) and source_operation_key is null\)/i],
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
  /\bdrop\s+policy\s+(if\s+exists\s+)?(grants_staff_insert|grants_staff_update|movements_staff_insert|grant_members_staff_insert)/i,
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

console.log(`BONUS-AUTHORITY-HARDENING-01 structural checks passed: ${checks.length + 5}`);
