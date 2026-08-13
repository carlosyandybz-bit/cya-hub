import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v65_p27_notification_reactivation.sql", "utf8");

test("P27 only reopens an internal notification on a real mission event", () => {
  assert.match(migration, /v_reactivate:=\(tg_op='UPDATE'\)/);
  assert.match(migration, /set read_at=null/);
  assert.match(migration, /old\.state is distinct from new\.state/);
  assert.match(migration, /old\.priority is distinct from 'urgent'/);
  assert.doesNotMatch(migration, /run_notification_engine/);
});

test("P27 reactivation keeps the delivery idempotent", () => {
  assert.match(migration, /private\.enqueue_notification/);
  assert.match(migration, /private\.process_notification_deliveries/);
  assert.match(migration, /'reactivated',v_reactivate/);
  assert.match(migration, /revoke all on function private\.sync_mission_notification\(\)/);
});
