import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260820195300_person_lifecycle_student_predicate.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

const canonicalEvidenceTables = [
  'class_participants',
  'credit_grant_members',
  'feedback_requests',
  'student_content_assignments',
  'academy_enrollments',
];

test('PERSON-01 defines one private canonical student predicate', () => {
  assert.match(
    migration,
    /create or replace function private\.person_is_student_unchecked\(p_person_id bigint\)[\s\S]*returns boolean/i,
  );

  for (const table of canonicalEvidenceTables) {
    assert.match(migration, new RegExp(`from public\\.${table}\\b[\\s\\S]*person_id = p_person_id`, 'i'));
  }
});

test('PERSON-01 preserves imported historical class and bonus evidence without treating a bare profile as evidence', () => {
  assert.match(migration, /coalesce\(sp\.historical_classes, 0\) > 0/i);
  assert.match(migration, /coalesce\(sp\.historical_consumed_classes, 0\) > 0/i);
  assert.match(migration, /coalesce\(sp\.bought_bonus, false\)/i);

  const helper = migration.match(
    /create or replace function private\.person_is_student_unchecked[\s\S]*?\$function\$;/i,
  )?.[0] ?? '';
  assert.doesNotMatch(helper, /auth_user_id\s+is\s+not\s+null/i);
  assert.match(helper, /student_profiles[\s\S]*historical_classes[\s\S]*historical_consumed_classes[\s\S]*bought_bonus/i);
});

test('PERSON-01 lifecycle delegates classification to the canonical predicate', () => {
  const lifecycle = migration.match(
    /create or replace function private\.person_lifecycle_status_unchecked[\s\S]*?\$function\$;/i,
  )?.[0] ?? '';

  assert.match(lifecycle, /private\.person_is_student_unchecked\(p_person_id\)/i);
  assert.match(lifecycle, /if not v_is_student then[\s\S]*return 'potential'/i);
  assert.match(lifecycle, /auth_user_id is not null[\s\S]*return 'registered'/i);
  assert.match(lifecycle, /return 'provisional'/i);
  assert.doesNotMatch(lifecycle, /from public\.student_profiles/i);
});

test('PERSON-01 returns not-found through the existing lifecycle contract instead of classifying a missing people.id', () => {
  assert.match(
    migration,
    /when not exists \([\s\S]*from public\.people p[\s\S]*where p\.id = p_person_id[\s\S]*\) then null/i,
  );
});

test('PERSON-01 exposes a permission-checked public predicate without broad PUBLIC execution', () => {
  const publicPredicate = migration.match(
    /create or replace function public\.person_is_student[\s\S]*?\$function\$;/i,
  )?.[0] ?? '';

  assert.match(publicPredicate, /private\.is_staff\(\)/i);
  assert.match(publicPredicate, /private\.current_person_id\(\)/i);
  assert.match(publicPredicate, /errcode = '42501'/i);
  assert.match(publicPredicate, /errcode = 'P0002'/i);
  assert.match(migration, /revoke all on function public\.person_is_student\(bigint\) from public/i);
  assert.match(migration, /grant execute on function public\.person_is_student\(bigint\) to authenticated, service_role/i);
});

test('PERSON-01 is idempotent and contains no persistent data backfill', () => {
  const functionCount = (migration.match(/create or replace function/gi) ?? []).length;
  assert.equal(functionCount, 3);
  assert.doesNotMatch(migration, /\binsert\s+into\b/i);
  assert.doesNotMatch(migration, /\bupdate\s+public\./i);
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+table\b/i);
  assert.doesNotMatch(migration, /\balter\s+table\b/i);
});

test('PERSON-01 does not cross locked ownership boundaries', () => {
  for (const forbidden of [
    /person_merge_cases/i,
    /merge_fresh_registered_person/i,
    /quick_bonus/i,
    /app_member_roles/i,
    /app_members/i,
  ]) {
    assert.doesNotMatch(migration, forbidden);
  }
});
