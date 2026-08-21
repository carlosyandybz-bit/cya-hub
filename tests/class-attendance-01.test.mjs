import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../supabase/migrations/20260821170000_class_attendance_real_history.sql', import.meta.url);
const sql = await readFile(migrationPath, 'utf8');

test('CLASS-ATTENDANCE-01 creates an append-only durable attendance ledger without legacy backfill', () => {
  assert.match(sql, /create table if not exists public\.class_attendance_events/i);
  assert.match(sql, /attendance_status text not null check \(attendance_status in \('present','absent'\)\)/i);
  assert.match(sql, /class_attendance_events_append_only/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.class_attendance_events[\s\S]{0,500}select[\s\S]{0,300}class_participants/i);
});

test('administrative finish no longer manufactures blanket present', () => {
  assert.doesNotMatch(sql, /v_attendance\s*:=\s*array_fill\s*\(\s*'present'/i);
  assert.match(sql, /array_agg\(cp\.attendance_status order by u\.ord\)/i);
  assert.match(sql, /Confirma la asistencia real \(presente o ausente\) de todos los alumnos/i);
});

test('administrative reopen preserves attendance while reversing billing state', () => {
  const reopenStart = sql.indexOf('create or replace function public.reopen_administratively_finished_class');
  assert.ok(reopenStart >= 0);
  const reopen = sql.slice(reopenStart);
  assert.match(reopen, /attendance_history_preserved',true/i);
  assert.doesNotMatch(reopen, /attendance_status\s*=\s*'planned'/i);
  assert.match(reopen, /billing_status='planned'/i);
});

test('attendance correction is separate, server-side, append-only and audited', () => {
  assert.match(sql, /create or replace function public\.correct_class_attendance/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /class_attendance_corrected/i);
  assert.match(sql, /supersedes_event_id/i);
  assert.match(sql, /La corrección requiere motivo/i);
  assert.match(sql, /Reabre primero el cierre administrativo antes de corregir asistencia/i);
});

test('first, last and existence of real attendance derive only from latest durable facts', () => {
  for (const fn of [
    'person_has_real_attendance_unchecked',
    'person_first_real_attendance_unchecked',
    'person_last_real_attendance_unchecked',
    'has_real_attendance',
    'first_real_attendance',
    'last_real_attendance',
  ]) {
    assert.match(sql, new RegExp(`function (?:private|public)\\.${fn}\\b`, 'i'));
  }
  assert.match(sql, /distinct on \(e\.class_id\)/i);
  assert.match(sql, /where x\.attendance_status='present'/i);
});

test('valid future class is server-side and excludes cancelled, active and replaced occurrences', () => {
  assert.match(sql, /function private\.person_has_valid_future_class_unchecked/i);
  assert.match(sql, /c\.status='scheduled'/i);
  assert.match(sql, /c\.cancelled_at is null/i);
  assert.match(sql, /c\.scheduled_start_at>now\(\)/i);
  assert.match(sql, /cp\.attendance_status='planned'/i);
  assert.match(sql, /replacement\.rescheduled_from_id=c\.id/i);
  assert.match(sql, /function public\.has_valid_future_class/i);
});

test('attendance ledger has RLS and no direct authenticated mutation grants', () => {
  assert.match(sql, /alter table public\.class_attendance_events enable row level security/i);
  assert.match(sql, /revoke insert,update,delete,truncate,references,trigger on public\.class_attendance_events from anon,authenticated/i);
  assert.match(sql, /create policy class_attendance_events_read/i);
  assert.match(sql, /private\.is_staff\(\)/i);
  assert.match(sql, /private\.current_person_id\(\)/i);
});

test('durable attendance protects class_participants projection from silent rewrites', () => {
  assert.match(sql, /class_participants_protect_durable_attendance/i);
  assert.match(sql, /La asistencia ya tiene historia durable; utiliza correct_class_attendance\(\)/i);
  assert.match(sql, /class_attendance_events_sync_projection/i);
});
