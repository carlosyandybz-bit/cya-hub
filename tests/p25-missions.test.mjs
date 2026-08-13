import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('db/migrations/v60_p25_mission_expiry_engine.sql', 'utf8');
const repeatMigration = fs.readFileSync('db/migrations/v61_p25_repeat_successor.sql', 'utf8');
const terminalMigration = fs.readFileSync('db/migrations/v62_p25_expired_terminal_guard.sql', 'utf8');
const admin = fs.readFileSync('app/admin-view.tsx', 'utf8');
const home = fs.readFileSync('db/migrations/v58_p24_contextual_home.sql', 'utf8');

test('P25 adds terminal expired state and operational timezone', () => {
  assert.match(migration, /'completed_automatically','expired'/);
  assert.match(migration, /add column if not exists expired_at timestamptz/);
  assert.match(migration, /add column if not exists timezone text not null default 'Europe\/Madrid'/);
  assert.match(migration, /pg_catalog\.pg_timezone_names/);
});

test('P25 has a server-side engine independent from auth uid for postgres cron', () => {
  assert.match(migration, /function private\.run_mission_engine\(p_now timestamptz default now\(\)\)/);
  assert.match(migration, /current_user <> 'postgres'/);
  assert.match(migration, /private\.is_staff\(\)/);
  assert.match(repeatMigration, /function private\.run_mission_engine_p25/);
  assert.match(repeatMigration, /v_result:=private\.run_mission_engine\(p_now\)/);
});

test('P25 implements mark_not_done, expire and repeat as distinct expiry behaviors', () => {
  assert.match(migration, /set state='not_done'[\s\S]*?r\.failure_behavior='mark_not_done'/);
  assert.match(migration, /set state='expired'[\s\S]*?r\.failure_behavior='expire'/);
  const repeatBlock = migration.match(/update public\.missions m\s+set state='expired'[\s\S]*?r\.failure_behavior='repeat'[\s\S]*?get diagnostics v_repeat_expired = row_count;/);
  assert.ok(repeatBlock, 'repeat must expire the overdue instance explicitly');
  assert.match(migration, /expired_at=coalesce\(m\.expired_at,p_now\)/);
});

test('P25 repeat materializes exactly one future valid occurrence as upcoming', () => {
  assert.match(repeatMigration, /function private\.next_repeat_mission_date/);
  assert.match(repeatMigration, /r\.failure_behavior='repeat'/);
  assert.match(repeatMigration, /v_row\.rule_key\|\|':'\|\|v_next_date/);
  assert.match(repeatMigration, /v_row\.mission_type,'upcoming'/);
  assert.match(repeatMigration, /on conflict\(dedupe_key\) where dedupe_key is not null do nothing/);
  assert.match(repeatMigration, /where state='upcoming' and available_at<=p_now/);
});

test('P25 expired history cannot be restarted, completed, postponed or cancelled', () => {
  assert.match(terminalMigration, /v_mission\.state='expired' and p_action not in \('open','comment'\)/);
  assert.match(terminalMigration, /se conserva únicamente como histórico/);
  assert.match(terminalMigration, /p_action='comment'/);
  assert.match(terminalMigration, /p_action='start'/);
});

test('P25 treats postpone as snooze before applying expiry behavior', () => {
  const wake = migration.indexOf("where state='postponed'");
  const markNotDone = migration.indexOf("r.failure_behavior='mark_not_done'");
  assert.ok(wake > 0 && markNotDone > wake, 'postponed missions must wake before due-state processing');
  assert.match(migration, /set state='available',postponed_until=null,updated_at=p_now/);
  assert.doesNotMatch(migration, /set[^;]*due_at[^;]*postponed_until/);
});

test('P25 schedules the final database engine every 15 minutes through cron.schedule', () => {
  assert.match(repeatMigration, /cron\.schedule\(\s*'cya-mission-engine',\s*'\*\/15 \* \* \* \*'/);
  assert.match(repeatMigration, /'select private\.run_mission_engine_p25\(\);'/);
  assert.doesNotMatch(migration + repeatMigration, /(?:insert\s+into|update)\s+cron\.job/i);
});

test('P25 backfill is semantic and never hardcodes generated mission ids', () => {
  assert.match(migration, /r\.failure_behavior in \('expire','repeat'\)/);
  assert.match(migration, /m\.due_at<now\(\)/);
  assert.doesNotMatch(migration + repeatMigration + terminalMigration, /\bid\s+in\s*\(\s*99\s*,\s*694\s*,\s*963\s*,\s*964\s*\)/i);
});

test('P25 Admin exposes understandable expiry labels and engine timezone', () => {
  assert.match(admin, /Marcar no realizada/);
  assert.match(admin, /Caducar/);
  assert.match(admin, /Repetir/);
  assert.match(admin, /Zona horaria/);
  assert.match(admin, /Ejecución automática/);
});

test('P24 Home remains actionable-only and does not include expired missions', () => {
  assert.match(home, /state in \('available','in_progress','postponed','not_done'\)/);
  const missionSelection = home.match(/from \(select \* from public\.missions where state in \([\s\S]*?limit 6\) m/);
  assert.ok(missionSelection, 'home mission selection must stay explicit');
  assert.doesNotMatch(missionSelection[0], /expired/);
});
