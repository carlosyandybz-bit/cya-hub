import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v68_p29_marketing_crm_closure.sql", "utf8");
const ui = readFileSync("app/marketing-view-legacy.tsx", "utf8");

test("CRM bonus is derived from the canonical credit ledger", () => {
  assert.match(migration, /crm_bonus_summary/);
  assert.match(migration, /credit_grants/);
  assert.match(migration, /credit_movements/);
});

test("campaign messaging remains explicit and manual", () => {
  assert.match(ui, /Sin envíos accidentales/);
  assert.match(ui, /validate_communication_dispatch/);
  assert.match(ui, /mark_communication_sent/);
});

test("approved social scope excludes unrequested platforms", () => {
  assert.match(ui, /instagram/);
  assert.match(ui, /facebook/);
  assert.doesNotMatch(ui, /youtube/i);
  assert.doesNotMatch(ui, /tiktok/i);
});
