import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v68_p29_marketing_crm_closure.sql", "utf8");
const legacyUi = readFileSync("app/marketing-view-legacy.tsx", "utf8");
const wrapperUi = readFileSync("app/marketing-view.tsx", "utf8");
const css = readFileSync("app/marketing-p29.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");

test("CRM bonus is derived from the canonical credit ledger", () => {
  assert.match(migration, /crm_bonus_summary/);
  assert.match(migration, /credit_grants/);
  assert.match(migration, /credit_movements/);
  assert.match(migration, /credit_grant_members/);
  assert.match(wrapperUi, /crm_bonus_summary/);
  assert.match(wrapperUi, /Bonos vinculados al CRM/);
  assert.match(wrapperUi, /active_balance_minutes/);
});

test("P29 styles are loaded and general analytics remain deferred to P30", () => {
  assert.match(layout, /marketing-p29\.css/);
  assert.match(css, /marketing-tabs > button:last-child/);
  assert.match(css, /display:\s*none/);
  assert.match(legacyUi, /Registrar resultados/);
  assert.match(legacyUi, /save_marketing_campaign_metrics/);
});

test("campaign messaging remains explicit and manual", () => {
  assert.match(legacyUi, /Sin envíos accidentales/);
  assert.match(legacyUi, /validate_communication_dispatch/);
  assert.match(legacyUi, /mark_communication_sent/);
  assert.match(legacyUi, /WhatsApp o tu correo hacen el envío final/);
});

test("approved social scope excludes unrequested platforms", () => {
  assert.match(legacyUi, /instagram/);
  assert.match(legacyUi, /facebook/);
  assert.doesNotMatch(legacyUi, /youtube/i);
  assert.doesNotMatch(legacyUi, /tiktok/i);
});

test("P29 closure keeps CRM bonus and dispatch helpers authenticated-only", () => {
  assert.match(migration, /crm_bonus_summary/);
  assert.match(migration, /from public, anon/);
  assert.match(migration, /to authenticated/);
  assert.match(migration, /validate_communication_dispatch/);
});
