import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  process.env.P16_SQL_FILE
    ?? 'supabase/v42-rls-student-class-correlation.sql',
  'utf8',
);
const compact = sql.replace(/\s+/g, ' ').trim();

function policy(name) {
  const match = compact.match(
    new RegExp(`create policy ${name} .*?;`, 'i'),
  );
  assert.ok(match, `missing policy ${name}`);
  return match[0];
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('P16.0 is an atomic, policy-only migration', () => {
  assert.match(compact, /^-- .* begin;/i);
  assert.match(compact, /commit;$/i);
  assert.doesNotMatch(
    compact,
    /\b(?:create|alter|drop) table\b|\b(?:grant|revoke)\b|\bcreate (?:or replace )?function\b/i,
  );
  assert.doesNotMatch(compact, /drop policy if exists \S+_staff_/i);
});

test('student summaries are correlated to the outer summary class', () => {
  const body = policy('class_pedagogy_summaries_student_select');

  assert.match(
    body,
    /c\.id = class_pedagogy_summaries\.class_id/i,
  );
  assert.match(
    body,
    /cp\.person_id = \(select private\.current_person_id\(\)\)/i,
  );
  assert.match(body, /c\.pedagogy_closed_at is not null/i);
  assert.doesNotMatch(body, /where c\.id = cp\.class_id/i);
});

test('student inserts require own identity and participation in that class', () => {
  const body = policy('class_preparation_requests_student_insert');

  assert.match(
    body,
    /class_preparation_requests\.person_id = \(select private\.current_person_id\(\)\)/i,
  );
  assert.match(body, /c\.id = class_preparation_requests\.class_id/i);
  assert.match(
    body,
    /cp\.person_id = class_preparation_requests\.person_id/i,
  );
  assert.match(body, /c\.status = 'scheduled'/i);
});

test('student updates enforce the same boundary before and after mutation', () => {
  const body = policy('class_preparation_requests_student_update');

  assert.equal(
    count(
      body,
      /class_preparation_requests\.person_id = \(select private\.current_person_id\(\)\)/gi,
    ),
    2,
  );
  assert.equal(
    count(body, /c\.id = class_preparation_requests\.class_id/gi),
    2,
  );
  assert.equal(
    count(
      body,
      /cp\.person_id = class_preparation_requests\.person_id/gi,
    ),
    2,
  );
  assert.match(body, /using \(.*\) with check \(/i);
});

test('no self-comparison can turn class membership into a tautology', () => {
  assert.doesNotMatch(
    compact,
    /\b([a-z_][a-z0-9_]*)\.person_id\s*=\s*\1\.person_id\b/i,
  );
  assert.doesNotMatch(
    compact,
    /\b([a-z_][a-z0-9_]*)\.class_id\s*=\s*\1\.class_id\b/i,
  );
});
