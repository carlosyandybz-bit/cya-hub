import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backup = readFileSync("db/migrations/v72a_p32_backup_inventory_final.sql", "utf8");

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

test("P32 settings backup also preserves final administrator configuration", () => {
  const settingsBlock = backup.match(/when 'settings' then array\[([\s\S]*?)\]::text\[\]/i)?.[1] ?? "";
  for (const table of finalTables) assert.ok(settingsBlock.includes(`'${table}'`), table);
});

test("backup inventory remains private and not executable from API roles", () => {
  assert.match(backup, /revoke all on function private\.backup_tables_for_domain\(text\) from public, anon, authenticated/i);
  assert.doesNotMatch(backup, /security definer/i);
});
