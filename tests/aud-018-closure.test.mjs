import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const base = read("supabase/v44_admin_data_reset.sql");
const guard = read("supabase/v44b_admin_data_reset_backup_guard.sql");
const status = read("supabase/v44e_admin_reset_backup_status.sql");
const closure = read("db/migrations/v89a_aud018_complete_backup_transfer_history.sql");
const ui = read("app/admin-data-reset.tsx");

test("AUD-018 · complete backup cannot lose transfer history erased by full reset", () => {
  assert.match(base, /delete from public\.data_transfer_jobs/);
  assert.match(closure, /p_domain='complete'/);
  assert.match(closure, /data_transfer_jobs/);
  assert.match(closure, /array_append\(v_tables,'data_transfer_jobs'\)/);
});

test("AUD-018 · closure wraps the final backup inventory instead of replacing later module coverage", () => {
  assert.match(closure, /backup_tables_for_domain_pre_aud018/);
  assert.match(closure, /v_tables := private\.backup_tables_for_domain_pre_aud018\(p_domain\)/);
  assert.match(closure, /if v_tables is null then return null/);
  assert.match(closure, /revoke all on function private\.backup_tables_for_domain\(text\)/);
});

test("AUD-018 · mass reset remains blocked without a recent complete backup from the same admin", () => {
  assert.match(guard, /v_job\.scope in \('operational','full'\)/);
  assert.match(guard, /entity_id='complete'/);
  assert.match(guard, /actor_user_id=\(select auth\.uid\(\)\)/);
  assert.match(guard, /created_at>=now\(\)-interval '30 minutes'/);
  assert.match(status, /seconds_remaining/);
  assert.match(ui, /backupStatus\.ready/);
});

test("AUD-018 · destructive UI retains preview, typed confirmation and final confirmation", () => {
  assert.match(ui, /Previsualización obligatoria/);
  assert.match(ui, /Primera confirmación/);
  assert.match(ui, /confirmation === preview\.confirmation_phrase/);
  assert.match(ui, /Confirmación final/);
  assert.match(ui, /Sí, borrar definitivamente/);
});

test("AUD-018 · reset stays atomic, serialized, audited and staff-protected", () => {
  assert.match(base, /pg_advisory_xact_lock/);
  assert.match(base, /insert into public\.audit_events/);
  assert.match(base, /is_staff_identity_person/);
  assert.match(base, /No se puede borrar una identidad activa del equipo/);
  assert.doesNotMatch(base, /delete\s+from\s+auth\.users/i);
  assert.doesNotMatch(base, /truncate\s+/i);
});
