import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v64_p27_notification_engine.sql", "utf8");
const audienceMigration = readFileSync("db/migrations/v90_aud017_notification_audience.sql", "utf8");
const studentMigration = readFileSync("db/migrations/v91_aud017b_student_notification_producers.sql", "utf8");
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

test("AUD-017 accepts scoped action targets without leaking subroutes into navigation", () => {
  assert.match(notifications, /function targetBase/);
  assert.match(notifications, /target\.split\(":"/);
  assert.match(notifications, /if \(base === "student"\) return target/);
  assert.match(notifications, /openTarget\(base, contextFor\(updated, target\)\)/);
  assert.match(notifications, /personId: base === "live" \? undefined/);
});

test("AUD-017 persists a distinct audience for staff and student deliveries", () => {
  assert.match(audienceMigration, /add column if not exists audience text not null default 'staff'/);
  assert.match(audienceMigration, /audience in \('staff','student'\)/);
  assert.match(audienceMigration, /v_rule\.recipients \? 'student'/);
  assert.match(audienceMigration, /event_key,target_user_id,audience,source_type,source_id/);
  assert.match(audienceMigration, /p_event_key,v_channel,p_target_user_id::text,v_audience/);
});

test("AUD-017 filters the shared inbox by the active experience", () => {
  assert.match(notifications, /preferred_context/);
  assert.match(notifications, /NotificationAudience = "staff" \| "student"/);
  assert.match(notifications, /\.eq\("audience", nextAudience\)/);
  assert.match(notifications, /\.eq\("audience", audience\)\.is\("read_at", null\)/);
  assert.match(notifications, /audience === "student" \? "Tus avisos" : "Avisos de trabajo"/);
});

test("AUD-017B declares student-only product events", () => {
  for (const event of [
    "student.class.upcoming",
    "student.class.changed",
    "student.training.available",
    "student.credit.low",
    "student.credit.exhausted",
    "student.credit.expiring",
  ]) assert.match(studentMigration, new RegExp(event.replaceAll(".", "\\.")));
  assert.match(studentMigration, /'\["student"\]'::jsonb/);
});

test("AUD-017B wires real class, training and credit producers into P27", () => {
  assert.match(studentMigration, /after insert on public\.class_participants/);
  assert.match(studentMigration, /after update of scheduled_start_at,status,location_text,cancelled_at on public\.classes/);
  assert.match(studentMigration, /after insert or update of student_visible_at on public\.student_content_assignments/);
  assert.match(studentMigration, /after insert on public\.credit_movements/);
  assert.match(studentMigration, /private\.run_student_notification_engine/);
  assert.match(studentMigration, /student_queued_or_existing/);
});

test("AUD-017B keeps generated student notices inside student routes", () => {
  assert.match(studentMigration, /'student:home'/);
  assert.match(studentMigration, /'student:formation'/);
  assert.doesNotMatch(studentMigration, /'student:admin'/);
  assert.doesNotMatch(studentMigration, /'student:students'/);
});
