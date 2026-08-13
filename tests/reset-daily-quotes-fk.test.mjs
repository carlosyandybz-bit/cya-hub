import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v67b_reset_daily_quote_assignments_fk.sql", "utf8");
const reset = readFileSync("app/admin-data-reset.tsx", "utf8");

test("daily quote assignments follow deliberate quote deletion", () => {
  assert.match(migration, /daily_quote_assignments_quote_id_fkey/);
  assert.match(migration, /references public\.daily_quotes\(id\)/);
  assert.match(migration, /on delete cascade/);
});

test("full reset still requires backup and two confirmations", () => {
  assert.match(reset, /downloadSafetyBackup/);
  assert.match(reset, /exactConfirmation/);
  assert.match(reset, /finalArmed/);
  assert.match(reset, /apply_admin_data_reset/);
});
