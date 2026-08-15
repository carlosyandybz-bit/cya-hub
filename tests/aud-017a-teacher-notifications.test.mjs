import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v64_p27_notification_engine.sql", "utf8");
const notifications = readFileSync("app/notifications-view.tsx", "utf8");
const feedback = readFileSync("db/migrations/v80_feedback_online_core.sql", "utf8");

test("AUD-017A keeps the teacher inbox private to each staff account", () => {
  assert.match(migration, /create policy internal_notifications_own_select/);
  assert.match(migration, /target_user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /role in \('admin','teacher_admin','teacher'\)/);
});

test("AUD-017A routes mission-driven operational work to staff", () => {
  assert.match(migration, /mission\.attention/);
  assert.match(migration, /new\.action_target/);
  assert.match(migration, /jsonb_build_object\('mission_rule',new\.rule_key/);
  assert.match(notifications, /classes\.pending_close/);
  assert.match(notifications, /bonuses\.low_or_expiring/);
  assert.match(notifications, /students\.incomplete_profile/);
  assert.match(notifications, /corrections\.missing_explanation/);
});

test("AUD-017A includes direct staff-only Feedback Online notices", () => {
  assert.match(feedback, /feedback\.online\.pending/);
  assert.match(feedback, /'\["staff"\]'::jsonb/);
  assert.match(feedback, /private\.enqueue_notification\('feedback\.online\.pending'/);
  assert.match(notifications, /Feedback Online/);
});

test("AUD-017A accepts scoped action targets without leaking subroutes into navigation", () => {
  assert.match(notifications, /function targetBase/);
  assert.match(notifications, /target\.split\(":"/);
  assert.match(notifications, /openTarget\(base, contextFor\(updated, target\)\)/);
  assert.match(notifications, /personId: base === "live" \? undefined/);
});

test("AUD-017A presents a teacher-oriented work inbox", () => {
  assert.match(notifications, /Avisos de trabajo/);
  assert.match(notifications, /Clases, alumnos, bonos, enseñanza, misiones/);
});
