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

function helperDefinition() {
  const marker =
    'create or replace function private.can_manage_own_scheduled_class_preparation';
  const start = compact.toLowerCase().indexOf(marker);
  assert.ok(start >= 0, 'missing private preparation authorization helper');
  const end = compact.indexOf('$function$;', start);
  assert.ok(end > start, 'unterminated preparation authorization helper');
  return compact.slice(start, end + '$function$;'.length);
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('P16.0 is atomic and narrowly scoped', () => {
  assert.match(compact, /^-- .* begin;/i);
  assert.match(compact, /commit;$/i);
  assert.doesNotMatch(
    compact,
    /\b(?:create|alter|drop) table\b|\bcreate (?:or replace )?(?:view|trigger)\b/i,
  );
  assert.doesNotMatch(compact, /drop policy if exists \S+_staff_/i);
  assert.equal(count(compact, /create policy /gi), 2);
  assert.equal(count(compact, /drop policy if exists /gi), 3);
  assert.equal(count(compact, /create or replace function /gi), 1);
});

test('private helper bypasses staff-only source RLS without bypassing identity', () => {
  const body = helperDefinition();

  assert.match(body, /returns boolean language sql stable security definer/i);
  assert.match(body, /set search_path = ''/i);
  assert.match(body, /\(select auth\.uid\(\)\) is not null/i);
  assert.match(
    body,
    /p_person_id = \(select private\.current_person_id\(\)\)/i,
  );
  assert.match(body, /join public\.class_participants cp on cp\.class_id = c\.id/i);
  assert.match(body, /where c\.id = p_class_id/i);
  assert.match(body, /cp\.person_id = p_person_id/i);
  assert.match(body, /c\.status = 'scheduled'/i);
});

test('helper execute privilege is restricted to authenticated callers', () => {
  const signature =
    'private\\.can_manage_own_scheduled_class_preparation\\(bigint,bigint\\)';

  assert.match(
    compact,
    new RegExp(`revoke all on function ${signature} from public;`, 'i'),
  );
  assert.match(
    compact,
    new RegExp(`grant execute on function ${signature} to authenticated;`, 'i'),
  );
  assert.doesNotMatch(
    compact,
    new RegExp(`grant execute on function ${signature} to (?:anon|public);`, 'i'),
  );
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

test('student inserts require the private per-row authorization helper', () => {
  const body = policy('class_preparation_requests_student_insert');

  assert.equal(
    count(
      body,
      /private\.can_manage_own_scheduled_class_preparation\(/gi,
    ),
    1,
  );
  assert.match(
    body,
    /class_preparation_requests\.class_id, class_preparation_requests\.person_id/i,
  );
  assert.doesNotMatch(body, /from public\.classes|join public\.class_participants/i);
});

test('student updates enforce the same helper before and after mutation', () => {
  const body = policy('class_preparation_requests_student_update');

  assert.equal(
    count(
      body,
      /private\.can_manage_own_scheduled_class_preparation\(/gi,
    ),
    2,
  );
  assert.equal(
    count(
      body,
      /class_preparation_requests\.class_id, class_preparation_requests\.person_id/gi,
    ),
    2,
  );
  assert.match(body, /using \(.*\) with check \(/i);
  assert.doesNotMatch(body, /from public\.classes|join public\.class_participants/i);
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
