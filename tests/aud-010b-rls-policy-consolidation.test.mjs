import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL('../db/migrations/v88_aud010b_rls_policy_consolidation.sql', import.meta.url);
const migration = await readFile(migrationPath, 'utf8');

const affectedTables = [
  'class_content_events',
  'class_financial_accounts',
  'class_media_resources',
  'class_notes',
  'class_payment_movements',
  'class_preparation_requests',
  'class_video_resources',
  'evaluation_sessions',
];

const consolidatedReadPolicies = [
  'class_content_events_read',
  'class_financial_accounts_read',
  'class_media_resources_read',
  'class_notes_read',
  'class_payment_movements_read',
  'class_preparation_requests_read',
  'class_video_resources_read',
  'evaluation_sessions_read',
];

test('AUD-010B touches exactly the eight advisor-reported tables', () => {
  for (const table of affectedTables) {
    assert.match(migration, new RegExp(`public\\.${table}\\b`, 'i'));
  }
  assert.doesNotMatch(migration, /statistics_dashboard_assignments/i);
});

test('AUD-010B replaces overlapping reads with one staff OR student policy per table', () => {
  for (const policy of consolidatedReadPolicies) {
    assert.match(migration, new RegExp(`create policy ${policy}\\b`, 'i'));
  }
  const readCount = (migration.match(/create policy [a-z0-9_]+_read\b/gi) ?? []).length;
  assert.equal(readCount, consolidatedReadPolicies.length);
  assert.match(migration, /private\.is_staff\(\)[\s\S]*\bor\b/i);
});

test('AUD-010B consolidates all four preparation-request operations', () => {
  for (const operation of ['read', 'insert', 'update', 'delete']) {
    assert.match(migration, new RegExp(`create policy class_preparation_requests_${operation}\\b`, 'i'));
  }
  assert.match(migration, /class_preparation_requests_update[\s\S]*for update to authenticated[\s\S]*using[\s\S]*with check/i);
  assert.match(migration, /can_manage_own_scheduled_class_preparation/i);
  assert.match(migration, /c\.status='scheduled'/i);
});

test('AUD-010B preserves historical public policy scope where it existed', () => {
  for (const table of ['class_financial_accounts', 'class_payment_movements', 'class_video_resources']) {
    assert.match(migration, new RegExp(`create policy ${table}_read[\\s\\S]*?on public\\.${table}[\\s\\S]*?for select to public`, 'i'));
  }
});

test('AUD-010B does not alter grants, data, functions, indexes or RLS enablement', () => {
  assert.doesNotMatch(migration, /\bgrant\b/i);
  assert.doesNotMatch(migration, /\brevoke\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+(?:unique\s+)?index\b/i);
  assert.doesNotMatch(migration, /\bdrop\s+index\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  assert.doesNotMatch(migration, /\balter\s+table[\s\S]*row level security/i);
});
