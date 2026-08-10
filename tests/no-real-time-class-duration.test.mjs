import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const migration = fs.readFileSync("supabase/v26-no-real-time-class-duration.sql", "utf8");

test("Dar clase does not calculate or display elapsed class duration", () => {
  assert.doesNotMatch(app, /actualDuration/);
  assert.doesNotMatch(app, /actual_duration_minutes/);
  assert.doesNotMatch(app, /observation-phase/);
  assert.doesNotMatch(app, /observationRemaining|observationClock|clockNow/);
  assert.doesNotMatch(app, /inicio real|duraci[oó]n real|tiempo realmente impartido/i);
  assert.match(app, /db\.rpc\("administratively_finish_class"/);
  assert.match(app, /Duraci[oó]n prevista/);
});

test("class closing backend always bills the scheduled duration", () => {
  assert.match(migration, /v_duration:=v_class\.duration_minutes/);
  assert.match(migration, /billed_duration_minutes=v_duration/);
  assert.match(migration, /duration_source='scheduled'/);
  assert.match(migration, /actual_duration_minutes=null/);
  assert.doesNotMatch(migration, /extract\s*\(\s*epoch/i);
  assert.doesNotMatch(migration, /v_duration:=p_actual_duration_minutes/);
});
