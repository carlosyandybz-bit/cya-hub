import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260822035000_attendance_m1_forward_fix.sql', import.meta.url), 'utf8');

const v2 = 'public.administratively_finish_class_v2(bigint,bigint[],text[],bigint[],integer)';
const wrappers = [
  'public.administratively_finish_class_v3(bigint,bigint[],text[],bigint[],integer,integer)',
  'public.administratively_finish_class_v4(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb)',
  'public.administratively_finish_class_v5(bigint,bigint[],bigint[],integer,integer,bigint,integer,jsonb,integer,bigint)',
  'public.administratively_finish_class_v6(bigint,bigint[],bigint[],integer,integer,jsonb,jsonb,integer,bigint)',
];
const helper = 'private.record_class_attendance_fact(bigint,bigint,text,text,timestamptz,text,bigint,text,jsonb)';

test('v2 is the only trusted SECURITY DEFINER boundary', () => {
  assert.match(migration, new RegExp(`alter function ${v2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+owner to postgres`, 'i'));
  assert.match(migration, new RegExp(`alter function ${v2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+security definer`, 'i'));
  assert.match(migration, new RegExp(`alter function ${v2.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+set search_path to ''`, 'i'));
  assert.match(migration, /position\('private\.is_staff\(\)' in pg_get_functiondef\(v_oid\)\) = 0/i);
});

test('v3-v6 remain SECURITY INVOKER', () => {
  for (const sig of wrappers) {
    assert.match(migration, new RegExp(`alter function ${sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+security invoker`, 'i'));
  }
});

test('v2-v6 ACL excludes PUBLIC and anon and permits authenticated/service_role', () => {
  for (const sig of [v2, ...wrappers]) {
    const escaped = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(migration, new RegExp(`revoke all on function ${escaped} from public,anon`, 'i'));
    assert.match(migration, new RegExp(`grant execute on function ${escaped} to authenticated,service_role`, 'i'));
  }
  assert.match(migration, /has_function_privilege\(v_role,v_oid,'EXECUTE'\)/i);
});

test('sealed private attendance helper receives no external grant', () => {
  const escaped = helper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(migration, new RegExp(`revoke execute on function ${escaped}\\s+from public,anon,authenticated,service_role`, 'i'));
  assert.doesNotMatch(migration, /grant\s+execute\s+on\s+function\s+private\.record_class_attendance_fact/i);
  assert.match(migration, /private helper leaked EXECUTE/i);
});

test('forward-fix changes security metadata only, not attendance business functions', () => {
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function/i);
  assert.doesNotMatch(migration, /record_class_attendance\s*\(/i);
  assert.doesNotMatch(migration, /correct_class_attendance\s*\(/i);
  assert.doesNotMatch(migration, /reopen_administratively_finished_class\s*\(/i);
  assert.doesNotMatch(migration, /insert\s+into|update\s+public\.|delete\s+from/i);
});
