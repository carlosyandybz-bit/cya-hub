import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260822200930_attendance_start_01.sql';
const sql = readFileSync(migrationPath, 'utf8');

const functionBody = (name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escaped}\\b[\\s\\S]*?\\$function\\$;`, 'i');
  const match = sql.match(re);
  assert.ok(match, `missing function ${name}`);
  return match[0];
};

test('session_start is a first-class durable provenance with original-fact uniqueness', () => {
  assert.match(sql, /class_attendance_events_source_check[\s\S]*'session_start'/i);
  assert.match(sql, /create\s+unique\s+index\s+if\s+not\s+exists\s+class_attendance_events_session_start_once_uidx[\s\S]*\(class_id,\s*person_id\)[\s\S]*where\s+source\s*=\s*'session_start'/i);
});

test('scheduled start atomically records present for every participant only on real transition', () => {
  const body = functionBody('public.start_class');
  assert.match(body, /security\s+definer/i);
  assert.match(body, /private\.is_staff\(\)/i);
  assert.match(body, /select\s+\*\s+into\s+v_class[\s\S]*for\s+update/i);
  assert.match(body, /if\s+v_class\.status='active'[\s\S]*return\s+v_class/i);
  assert.match(body, /set\s+status='active'[\s\S]*started_at=coalesce\(started_at,now\(\)\)/i);
  assert.match(body, /from\s+public\.class_participants\s+cp[\s\S]*where\s+cp\.class_id=p_class_id/i);
  assert.match(body, /private\.record_class_attendance_fact\([\s\S]*'present'[\s\S]*v_class\.started_at[\s\S]*'session_start'/i);
});

test('manual start records the same session_start attendance inside the RPC transaction', () => {
  const body = functionBody('public.start_manual_class');
  assert.match(body, /security\s+definer/i);
  assert.match(body, /private\.is_staff\(\)/i);
  assert.match(body, /insert\s+into\s+public\.classes[\s\S]*'active'/i);
  assert.match(body, /insert\s+into\s+public\.class_participants/i);
  assert.match(body, /private\.record_class_attendance_fact\([\s\S]*new_class\.id[\s\S]*'present'[\s\S]*new_class\.started_at[\s\S]*'session_start'/i);
});

test('late retry cannot restore present after a correction', () => {
  const start = functionBody('public.start_class');
  const activeBranch = start.indexOf("if v_class.status='active'");
  const factCall = start.indexOf('private.record_class_attendance_fact');
  assert.ok(activeBranch >= 0 && factCall > activeBranch, 'active retry branch must precede fact creation');
  assert.match(start.slice(activeBranch, factCall), /return\s+v_class/i);

  const helper = functionBody('private.record_class_attendance_fact');
  assert.match(helper, /if\s+p_source='session_start'[\s\S]*e\.source='session_start'[\s\S]*return\s+v_start_existing/i);
});

test('private helper remains sealed while public start RPCs use least external ACL', () => {
  assert.match(sql, /revoke\s+execute\s+on\s+function\s+private\.record_class_attendance_fact\([^;]+\)\s+from\s+public/i);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.match(sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+private\\.record_class_attendance_fact\\([^;]+\\)\\s+from\\s+${role}`, 'i'));
  }
  for (const fn of ['start_class\\(bigint\\)', 'start_manual_class\\(text,bigint\\[\\],timestamptz,integer,bigint,bigint,text\\)']) {
    assert.match(sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s+from\\s+public`, 'i'));
    assert.match(sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s+from\\s+anon`, 'i'));
  }
});

test('attendance history stays append-only and unrelated domains are not mutated', () => {
  assert.doesNotMatch(sql, /update\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /alter\s+table\s+public\.(people|student_profiles|credit_grants|credit_movements)/i);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.(correct_class_attendance|record_class_attendance|reopen_administratively_finished_class)/i);
});

test('migration is prospective only and contains no historical backfill', () => {
  assert.doesNotMatch(sql, /insert\s+into\s+public\.class_attendance_events[\s\S]*select[\s\S]*from\s+public\.classes/i);
  assert.doesNotMatch(sql, /backfill/i);
});
