import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backup = readFileSync("db/migrations/v72a_p32_backup_inventory_final.sql", "utf8");
const fullReset = readFileSync("db/migrations/v72b_p32_full_reset_statistics.sql", "utf8");
const privateGrants = readFileSync("db/migrations/v72c_p32_private_definer_grants.sql", "utf8");
const experienceContext = readFileSync("db/migrations/v72d_p32_experience_context_invoker.sql", "utf8");
const performance = readFileSync("db/migrations/v72e_p32_performance_indexes.sql", "utf8");
const duplicateIndex = readFileSync("db/migrations/v72f_p32_duplicate_sequence_index.sql", "utf8");

const finalTables = [
  "statistics_dashboards",
  "statistics_dashboard_cards",
  "statistics_settings",
  "statistics_metric_settings",
  "statistics_dashboard_assignments",
  "app_appearance_settings",
  "app_operational_defaults",
];

test("P32 complete backup covers P30 and P31 canonical tables", () => {
  assert.match(backup, /when 'complete' then array/i);
  for (const table of finalTables) assert.match(backup, new RegExp(`'${table}'`), table);
});

test("P32 settings backup preserves final administrator configuration", () => {
  const settingsBlock = backup.match(/when 'settings' then array\[([\s\S]*?)\]::text\[\]/i)?.[1] ?? "";
  for (const table of finalTables) assert.ok(settingsBlock.includes(`'${table}'`), table);
});

test("backup inventory remains private", () => {
  assert.match(backup, /revoke all on function private\.backup_tables_for_domain\(text\) from public, anon, authenticated/i);
  assert.doesNotMatch(backup, /security definer/i);
});

test("full reset covers P30 statistics and preserves P31 configuration", () => {
  for (const table of ["statistics_dashboard_assignments", "statistics_dashboard_cards", "statistics_dashboards", "statistics_metric_settings"]) {
    assert.match(fullReset, new RegExp(`delete from public\\.${table}`, "i"), table);
  }
  assert.match(fullReset, /jsonb_build_object\('estadisticas',v_statistics\)/i);
  assert.match(fullReset, /array\[7,30,90,365\]::integer\[\]/i);
  assert.doesNotMatch(fullReset, /delete from public\.app_appearance_settings|delete from public\.app_operational_defaults/i);
});

test("P32 seals the legacy reset helpers from API roles", () => {
  assert.match(fullReset, /rename to admin_reset_preview_counts_pre_p32/i);
  assert.match(fullReset, /rename to execute_admin_data_reset_pre_p32/i);
  assert.match(fullReset, /revoke all on function private\.admin_reset_preview_counts_pre_p32\(text,bigint\)/i);
  assert.match(fullReset, /revoke all on function private\.execute_admin_data_reset_pre_p32\(text,bigint\)/i);
});

test("P32 removes anonymous access to unchecked private definers", () => {
  assert.match(privateGrants, /revoke all on function private\.guard_last_admin_role\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(privateGrants, /revoke all on function private\.person_lifecycle_status_unchecked\(bigint\)[\s\S]*from public, anon, authenticated/i);
  assert.match(privateGrants, /revoke all on function private\.match_person_identity\(text,text,bigint\)[\s\S]*from public, anon, authenticated/i);
  assert.match(privateGrants, /grant execute on function private\.match_person_identity\(text,text,bigint\)[\s\S]*to authenticated/i);
});

test("experience context uses RLS instead of SECURITY DEFINER", () => {
  assert.match(experienceContext, /alter function public\.set_experience_context\(text\) security invoker/i);
  assert.match(experienceContext, /revoke all on function public\.set_experience_context\(text\) from public, anon/i);
  assert.match(experienceContext, /grant execute on function public\.set_experience_context\(text\) to authenticated/i);
});

test("P32 performance closure is evidence based", () => {
  for (const index of ["app_appearance_settings_updated_by_idx", "app_operational_defaults_location_idx", "app_operational_defaults_updated_by_idx"]) {
    assert.match(performance, new RegExp(`create index if not exists ${index}`, "i"), index);
  }
  assert.doesNotMatch(performance, /drop index/i);
  assert.match(duplicateIndex, /drop index if exists public\.teaching_content_relations_sequence_position_uidx/i);
  assert.doesNotMatch(duplicateIndex, /people_created_by_idx|classes_teacher_schedule_idx/i);
});
