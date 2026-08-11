import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(
  process.env.P16_SQL_FILE
    ?? 'supabase/v42-rls-student-class-correlation.sql',
  'utf8',
);
const app = fs.readFileSync('app/cya-app.tsx', 'utf8');
const classWorkflow = fs.readFileSync(
  'supabase/v31-class-workflow-realtime.sql',
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

test('student summaries use the filtered portal instead of direct table SELECT', () => {
  assert.match(
    compact,
    /drop policy if exists class_pedagogy_summaries_student_select/i,
  );
  assert.doesNotMatch(
    compact,
    /create policy class_pedagogy_summaries_student_select/i,
  );

  assert.match(app, /db\.rpc\("student_portal_snapshot"\)/);
  assert.doesNotMatch(app, /\.from\("class_pedagogy_summaries"\)/);

  const start = classWorkflow.indexOf("'class_summaries'");
  const end = classWorkflow.indexOf("'class_media'", start);
  assert.ok(start >= 0 && end > start, 'missing portal summary projection');
  const projection = classWorkflow.slice(start, end);
  assert.match(projection, /'student_message',s\.student_message/);
  assert.match(projection, /join public\.class_participants cp on cp\.class_id=s\.class_id/);
  assert.match(projection, /where cp\.person_id=p_person_id/);
  assert.match(projection, /c\.pedagogy_closed_at is not null/);
  assert.doesNotMatch(projection, /internal_note/);
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
