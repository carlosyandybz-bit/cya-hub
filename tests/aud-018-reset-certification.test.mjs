import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const bz = read("db/migrations/v79_bz_backup_reset_integration.sql");
const feedback = read("db/migrations/v81_feedback_backup_reset_integration.sql");
const academy = read("db/migrations/v83_academia_backup_reset_integration.sql");
const statistics = read("db/migrations/v72b_p32_full_reset_statistics.sql");
const dailyQuotes = read("db/migrations/v67b_reset_daily_quote_assignments_fk.sql");

const indexBefore = (source, earlier, later, message) => {
  const a = source.indexOf(earlier);
  const b = source.indexOf(later);
  assert.notEqual(a, -1, `${message}: missing earlier operation`);
  assert.notEqual(b, -1, `${message}: missing delegated reset`);
  assert.ok(a < b, message);
};

test("AUD-018 · BZ dynamic records are removed before delegating to the proven reset chain", () => {
  assert.match(bz, /execute_admin_data_reset_pre_bz/);
  indexBefore(
    bz,
    "delete from public.bz_reward_redemptions",
    "private.execute_admin_data_reset_pre_bz(p_scope,p_target_id)",
    "BZ redemptions must be detached before legacy rows are deleted",
  );
  indexBefore(
    bz,
    "delete from public.bz_point_ledger",
    "private.execute_admin_data_reset_pre_bz(p_scope,p_target_id)",
    "BZ ledger must be cleared before legacy rows are deleted",
  );
  indexBefore(
    bz,
    "delete from public.bz_action_events",
    "private.execute_admin_data_reset_pre_bz(p_scope,p_target_id)",
    "BZ events must be cleared before legacy rows are deleted",
  );
});

test("AUD-018 · Feedback Online child rows are removed before requests and before delegation", () => {
  assert.match(feedback, /execute_admin_data_reset_pre_feedback/);
  indexBefore(
    feedback,
    "delete from public.feedback_request_contents",
    "delete from public.feedback_requests",
    "Feedback request contents must be removed before requests",
  );
  indexBefore(
    feedback,
    "delete from public.feedback_requests",
    "private.execute_admin_data_reset_pre_feedback(p_scope,p_target_id)",
    "Feedback requests must be cleared before legacy person/student/content reset",
  );
});

test("AUD-018 · Academia progress/enrolments are cleared before program data and delegation", () => {
  assert.match(academy, /execute_admin_data_reset_pre_academy/);
  indexBefore(
    academy,
    "delete from public.academy_progress",
    "delete from public.academy_enrollments",
    "Academy progress must be removed before enrolments",
  );
  indexBefore(
    academy,
    "delete from public.academy_enrollments",
    "private.execute_admin_data_reset_pre_academy(p_scope,p_target_id)",
    "Academy enrolments must be removed before the legacy reset chain",
  );
});

test("AUD-018 · P32 statistics wrapper delegates legacy reset and then resets statistics only for full scope", () => {
  assert.match(statistics, /execute_admin_data_reset_pre_p32/);
  assert.match(statistics, /if p_scope='full' then/);
  indexBefore(
    statistics,
    "private.execute_admin_data_reset_pre_p32(p_scope,p_target_id)",
    "delete from public.statistics_dashboard_assignments",
    "P32 must preserve the proven destructive reset before resetting statistics configuration",
  );
});

test("AUD-018 · daily quote assignments cannot block quote reset", () => {
  assert.match(dailyQuotes, /daily_quote_assignments/i);
  assert.match(dailyQuotes, /on delete cascade/i);
});
