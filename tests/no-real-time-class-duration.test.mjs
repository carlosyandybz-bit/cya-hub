import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const baseMigration = fs.readFileSync("supabase/v26-no-real-time-class-duration.sql", "utf8");
const manualMigration = fs.readFileSync("supabase/v26-manual-duration-override.sql", "utf8");
const finishStart = app.indexOf("function FinishClassModal(");
const finishEnd = app.indexOf("\nfunction LiveSession(", finishStart);
const finishFlow = finishStart >= 0 && finishEnd > finishStart ? app.slice(finishStart, finishEnd) : "";

test("Dar clase never calculates elapsed class duration", () => {
  assert.ok(finishFlow, "FinishClassModal must exist");
  assert.doesNotMatch(app, /observation-phase/);
  assert.doesNotMatch(app, /observationRemaining|observationClock|clockNow/);
  assert.doesNotMatch(finishFlow, /Date\.now\(\)|started_at/);
  assert.doesNotMatch(finishFlow, /inicio real|duraci[oó]n real|tiempo realmente impartido/i);
  assert.match(finishFlow, /Duraci[oó]n de la clase/);
  assert.match(finishFlow, /Programada · \{minutesLabel\(plannedDuration\)\}/);
});

test("finish flow defaults to the planned duration but permits an explicit manual edit", () => {
  assert.match(finishFlow, /useState\(item\.duration_minutes\)/);
  assert.match(finishFlow, /setDurationParts/);
  assert.match(finishFlow, /administratively_finish_class_v3/);
  assert.match(finishFlow, /p_actual_duration_minutes: manualDuration/);
  assert.match(finishFlow, /saldo, incidencias e historial/);
});

test("backend uses only scheduled or explicit manual duration, never elapsed time", () => {
  assert.doesNotMatch(baseMigration, /extract\s*\(\s*epoch/i);
  assert.doesNotMatch(manualMigration, /extract\s*\(\s*epoch/i);
  assert.match(manualMigration, /v_original_duration:=v_class\.duration_minutes/);
  assert.match(manualMigration, /v_duration:=p_actual_duration_minutes/);
  assert.match(manualMigration, /duration_minutes=v_duration/);
  assert.match(manualMigration, /billed_duration_minutes=v_duration/);
  assert.match(manualMigration, /actual_duration_minutes=null/);
  assert.match(manualMigration, /v_duration_source:=case when p_actual_duration_minutes=v_original_duration then 'scheduled' else 'manual' end/);
});
