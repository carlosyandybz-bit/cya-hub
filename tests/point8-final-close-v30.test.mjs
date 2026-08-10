import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");
const sql = fs.readFileSync("supabase/v30-point8-final-close.sql", "utf8");
const start = app.indexOf("function FinishClassModal(");
const end = app.indexOf("\nfunction LiveSession(", start);
const finish = app.slice(start, end);

test("duration fields allow empty natural numeric input", () => {
  assert.match(finish, /durationHoursText/);
  assert.match(finish, /durationMinutesText/);
  assert.match(finish, /inputMode="numeric"/);
  assert.match(finish, /numericText\(event\.target\.value, 59\)/);
  assert.doesNotMatch(finish, /Number\(event\.target\.value \|\| 0\), durationMinutes/);
});

test("pair credit is rendered once and still applies to both participants", () => {
  assert.match(finish, /Bono de pareja/);
  assert.match(finish, /finish-pair-credit/);
  assert.match(finish, /item\.class_participants\.forEach\(\(participant\) => \{ next\[participant\.person_id\] = value;/);
});

test("shortfall can be regularized atomically at close", () => {
  assert.match(finish, /Regularizar \{minutesLabel\(row\.shortfall\)\} ahora/);
  assert.match(finish, /p_regularizations: regularizationPayload/);
  assert.match(finish, /administratively_finish_class_v6/);
  assert.match(sql, /item_type in \('supplement','pair_transfer','regularization'\)/);
  assert.match(sql, /Regularización de clase/);
  assert.match(sql, /Regularización consumida en la clase/);
});

test("pair transfer happens before final submit with arbitrary minutes", () => {
  assert.match(finish, /transfer_individual_credit_to_pair/);
  assert.match(finish, /Minutos a transferir/);
  assert.match(finish, /Hacer transferencia/);
  assert.match(sql, /p_minutes integer/);
  assert.match(sql, /'pair_transfer'/);
});

test("supplements start expanded and collapse into compact editable rows", () => {
  assert.match(finish, /expanded: true/);
  assert.match(finish, /supplement-compact/);
  assert.match(finish, /saveSupplement/);
  assert.match(css, /\.supplement-compact/);
});

test("multiple class videos support both pair students by default", () => {
  assert.match(finish, /multiple/);
  assert.match(finish, /audience: item\.class_type === "pair" \? "both"/);
  assert.match(finish, /<option value="both">Ambos<\/option>/);
  assert.match(finish, /const recipients = video\.mode === "private" \? \(video\.audience === "both" \? classPersonIds/);
  assert.match(sql, /drop constraint if exists class_video_resources_external_file_id_key/);
  assert.match(sql, /class_video_resources_external_scope_person_uidx/);
});

test("finished classes can be safely reopened and financial close is reversed", () => {
  assert.match(app, /reopen_administratively_finished_class/);
  assert.match(app, /className="btn ghost class-reopen"[\s\S]*?>Reabrir<\/button>/);
  assert.match(sql, /Reapertura de clase · devolución de consumo/);
  assert.match(sql, /delete from public\.class_financial_accounts/);
  assert.match(sql, /delete from public\.student_incidents/);
  assert.match(sql, /status='active'/);
  assert.match(sql, /class_administrative_reopened/);
});

test("new close artifacts remain backed up", () => {
  assert.match(sql, /class_close_grant_artifacts/);
  assert.match(sql, /'class_video_resources','class_close_grant_artifacts'/);
});
