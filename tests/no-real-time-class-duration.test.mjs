import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const baseMigration = fs.readFileSync("supabase/v26-no-real-time-class-duration.sql", "utf8");
const manualMigration = fs.readFileSync("supabase/v26-manual-duration-override.sql", "utf8");

test("Dar clase never calculates elapsed class duration", () => {
  assert.doesNotMatch(app, /observation-phase/);
  assert.doesNotMatch(app, /observationRemaining|observationClock|clockNow/);
  assert.doesNotMatch(app, /Date\.now\(\).*started_at|started_at.*Date\.now\(\)/s);
  assert.doesNotMatch(app, /inicio real|duraci[oó]n real|tiempo realmente impartido/i);
  assert.match(app, /Duraci[oó]n de la clase/);
  assert.match(app, /Programada · \{minutesLabel\(plannedDuration\)\}/);
});

test("finish flow defaults to the planned duration but permits an explicit manual edit", () => {
  assert.match(app, /useState\(item\.duration_minutes\)/);
  assert.match(app, /setDurationParts/);
  assert.match(app, /administratively_finish_class_v2/);
  assert.match(app, /p_actual_duration_minutes: manualDuration/);
  assert.match(app, /saldo, incidencias e historial/);
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
