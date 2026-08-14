import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v64_p27_notification_engine.sql", "utf8");
const notifications = readFileSync("app/notifications-view.tsx", "utf8");
const admin = readFileSync("app/p27-notifications-admin.tsx", "utf8");
const adminView = readFileSync("app/admin-view.tsx", "utf8");

test("P27 personal inbox never aggregates other staff notifications", () => {
  assert.match(migration, /create policy internal_notifications_own_select/);
  assert.match(migration, /target_user_id=\(select auth\.uid\(\)\)/);
  assert.doesNotMatch(migration, /internal_notifications_own_select[\s\S]{0,250}private\.is_admin/);
});

test("P27 resolves every canonical terminal mission state", () => {
  for (const state of ["completed", "completed_automatically", "not_done", "not_applicable", "cancelled", "expired"]) {
    assert.match(migration, new RegExp(`'${state}'`));
    assert.match(notifications, new RegExp(`"${state}"`));
  }
  assert.match(migration, /set read_at=coalesce\(read_at,now\(\)\)/);
});

test("P27 uses an idempotent delivery ledger and recovery worker", () => {
  assert.match(migration, /notification_deliveries_idempotency_uq/);
  assert.match(migration, /create or replace function private\.enqueue_notification/);
  assert.match(migration, /create or replace function private\.process_notification_deliveries/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /cya-notification-engine/);
  assert.match(migration, /\*\/5 \* \* \* \*/);
});

test("P27 does not fake external delivery", () => {
  assert.match(migration, /Canal externo no conectado o sin dispatcher verificado/);
  assert.match(migration, /No existe un dispatcher externo P27 verificado/);
  assert.match(admin, /Sin conexión verificada/);
  assert.match(admin, /Este canal permanecerá desactivado hasta que exista una conexión lista para enviar/);
  assert.match(admin, /dispatch_ready/);
});

test("P27 administration exposes notification status, rules and quiet hours", () => {
  assert.match(adminView, /P27NotificationsAdmin/);
  assert.match(admin, /NOTIFICACIONES AUTOMÁTICAS/);
  assert.match(admin, /Bandeja interna operativa/);
  assert.match(admin, /Estado de entregas/);
  assert.match(admin, /quiet_hours_start/);
  assert.match(admin, /quiet_hours_end/);
});
