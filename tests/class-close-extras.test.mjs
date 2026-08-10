import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const sql = fs.readFileSync("supabase/v28-class-close-extras.sql", "utf8");
const start = app.indexOf("function FinishClassModal(");
const end = app.indexOf("\nfunction LiveSession(", start);
const finish = app.slice(start, end);

test("class close no longer asks for attendance", () => {
  assert.ok(finish);
  assert.doesNotMatch(finish, /Asistencia|Ha venido|No ha venido/);
  assert.doesNotMatch(finish, /p_attendance/);
  assert.match(finish, /administratively_finish_class_v4/);
  assert.match(sql, /administratively_finish_class_v4/);
  assert.doesNotMatch(sql.match(/administratively_finish_class_v4\([\s\S]*?\)\nreturns/)?.[0] ?? "", /p_attendance/);
  assert.match(sql, /array_fill\('present'::text/);
});

test("multiple supplements are editable, removable and persisted as structured rows", () => {
  assert.match(finish, /Suplementos/);
  assert.match(finish, /Añadir/);
  assert.match(finish, /Parking, desplazamiento/);
  assert.match(finish, /removeSupplement/);
  assert.match(finish, /p_supplements: supplementPayload/);
  assert.match(sql, /class_financial_items/);
  assert.match(sql, /item_type in \('supplement','pair_transfer'\)/);
  assert.match(sql, /jsonb_array_elements\(p_supplements\)/);
});

test("pair classes can transfer individual credit with an extra fee and full traceability", () => {
  assert.match(app, /transferableIndividualCreditsForPair/);
  assert.match(finish, /Transferir saldo individual/);
  assert.match(finish, /Coste adicional/);
  assert.match(finish, /p_pair_transfer_source_grant_id/);
  assert.match(finish, /p_pair_transfer_fee_cents/);
  assert.match(sql, /modality='individual'/);
  assert.match(sql, /v_transfer_minutes:=least\(v_source_balance,v_duration\)/);
  assert.match(sql, /'adjustment',-v_transfer_minutes/);
  assert.match(sql, /'pair',v_transfer_minutes,0,'Transferencia a pareja','paid'/);
  assert.match(sql, /source_grant_id,target_grant_id/);
});

test("final summary includes duration, payment path, extras and current economic total", () => {
  assert.match(finish, /Total económico registrado ahora/);
  assert.match(finish, /supplementTotalCents/);
  assert.match(finish, /transferFeeCents/);
  assert.match(finish, /directPriceCents/);
  assert.match(finish, /quickCreatedChargeCents/);
});
