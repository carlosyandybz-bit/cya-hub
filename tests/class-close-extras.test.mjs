import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const sql = fs.readFileSync("supabase/v28-class-close-extras.sql", "utf8");
const sql30 = fs.readFileSync("supabase/v30-point8-final-close.sql", "utf8");
const start = app.indexOf("function FinishClassModal(");
const end = app.indexOf("\nfunction LiveSession(", start);
const finish = app.slice(start, end);

test("class close no longer asks for attendance", () => {
  assert.ok(finish);
  assert.doesNotMatch(finish, /Asistencia|Ha venido|No ha venido/);
  assert.doesNotMatch(finish, /p_attendance/);
  assert.match(finish, /administratively_finish_class_v6/);
  assert.match(sql, new RegExp("administratively_finish_class_v" + "4"));
  assert.doesNotMatch(sql.match(new RegExp("administratively_finish_class_v" + "4\\([\\s\\S]*?\\)\\nreturns"))?.[0] ?? "", /p_attendance/);
  assert.match(sql, /array_fill\('present'::text/);
});

test("multiple supplements are editable, removable, compact and persisted as structured rows", () => {
  assert.match(finish, /Suplementos/);
  assert.match(finish, /Añadir/);
  assert.match(finish, /Parking, desplazamiento/);
  assert.match(finish, /removeSupplement/);
  assert.match(finish, /saveSupplement/);
  assert.match(finish, /supplement-compact/);
  assert.match(finish, /p_supplements: supplementPayload/);
  assert.match(sql, /class_financial_items/);
  assert.match(sql, /item_type in \('supplement','pair_transfer'\)/);
  assert.match(sql, /jsonb_array_elements\(p_supplements\)/);
});

test("pair classes can transfer arbitrary individual credit before close with an extra fee and traceability", () => {
  assert.match(app, /transferableIndividualCreditsForPair/);
  assert.match(finish, /Transferir saldo individual/);
  assert.match(finish, /Minutos a transferir/);
  assert.match(finish, /Coste adicional/);
  assert.match(finish, /transfer_individual_credit_to_pair/);
  assert.match(sql30, /p_source_grant_id bigint/);
  assert.match(sql30, /p_minutes integer/);
  assert.match(sql30, /'adjustment',-p_minutes/);
  assert.match(sql30, /'pair',p_minutes,0,'Transferencia a pareja','paid'/);
  assert.match(sql30, /source_grant_id,target_grant_id/);
});

test("final summary includes duration, payment path, transfers, regularization and extras", () => {
  assert.match(finish, /Total de este cierre/);
  assert.match(finish, /supplementTotalCents/);
  assert.match(finish, /transferTotalCents/);
  assert.match(finish, /regularizationTotalCents/);
  assert.match(finish, /directPriceCents/);
  assert.match(finish, /quickCreatedChargeCents/);
});