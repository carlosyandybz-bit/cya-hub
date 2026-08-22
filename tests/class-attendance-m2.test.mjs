import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sql = await readFile(new URL('../supabase/migrations/20260821171000_class_attendance_finalize_compat.sql', import.meta.url), 'utf8');

test('M2 preserves existing absence reason when finish omits it', () => {
  assert.match(sql, /v_existing\.attendance_status\s*=\s*p_attendance_status/i);
  assert.match(sql, /p_absence_reason\s+is\s+null\s+or\s+v_existing\.absence_reason\s+is\s+not\s+distinct\s+from\s+p_absence_reason/i);
  assert.match(sql, /return\s+v_existing/i);
});

test('M2 keeps correction requirement for a real status mismatch', () => {
  assert.match(sql, /La asistencia ya fue registrada; utiliza correct_class_attendance\(\)/i);
  assert.match(sql, /p_source\s*<>\s*'correction'/i);
});

test('M2 keeps helper trusted and staff-gated', () => {
  assert.match(sql, /create\s+or\s+replace\s+function\s+private\.record_class_attendance_fact/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.match(sql, /private\.is_staff\(\)/i);
});

test('M2 is append-only and does not touch reopen or public record/correct definitions', () => {
  assert.match(sql, /insert\s+into\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /update\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.record_class_attendance/i);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.correct_class_attendance/i);
  assert.doesNotMatch(sql, /reopen_administratively_finished_class/i);
});

test('M2 contains no backfill', () => {
  assert.doesNotMatch(sql, /insert\s+into\s+public\.class_attendance_events\s*\([^)]*\)\s*select/i);
});
