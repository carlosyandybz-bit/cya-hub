import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const [name, value] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL })) {
  assert.ok(value, `missing local Supabase environment variable ${name}`);
}

const pass = (n, label, detail = '') => console.log(`PASS ${n} — ${label}${detail ? ` — ${detail}` : ''}`);
const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const q = (sql) => execFileSync('psql', [DB_URL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
const n = (sql) => Number(q(sql));
const b = (sql) => q(sql) === 't';

async function createAuthUser(label) {
  const email = `qa-${label}-${randomUUID()}@example.invalid`;
  const password = `Qa!${randomUUID()}Aa9`;
  const createdRes = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: `QA ${label}` } }),
  });
  const createdText = await createdRes.text();
  assert.equal(createdRes.ok, true, `Auth admin create failed ${createdRes.status}: ${createdText}`);
  const created = JSON.parse(createdText);
  assert.ok(created.id, 'Auth admin create did not return a user id');

  const tokenRes = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const tokenText = await tokenRes.text();
  assert.equal(tokenRes.ok, true, `Auth password sign-in failed ${tokenRes.status}: ${tokenText}`);
  const token = JSON.parse(tokenText).access_token;
  assert.ok(token, 'Auth sign-in did not return access_token');
  return { id: created.id, email, token };
}

async function rpcRaw(name, token, params) {
  const res = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function extractRow(text) {
  const parsed = JSON.parse(text);
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  assert.ok(row && typeof row === 'object', `RPC did not return a row: ${text}`);
  return row;
}

async function rpcOk(name, token, params) {
  const out = await rpcRaw(name, token, params);
  assert.equal(out.ok, true, `${name} expected success, got ${out.status}: ${out.text}`);
  return extractRow(out.text);
}

async function rpcFail(name, token, params) {
  const out = await rpcRaw(name, token, params);
  assert.equal(out.ok, false, `${name} expected failure but succeeded: ${out.text}`);
  return out;
}

function manualPayload({ key, studentIds, notes, duration = 60, styleId, classType = studentIds.length === 2 ? 'pair' : 'individual' }) {
  return {
    p_class_type: classType,
    p_student_ids: studentIds,
    p_scheduled_start_at: '2026-08-23T12:00:00Z',
    p_duration_minutes: duration,
    p_style_term_id: styleId,
    p_idempotency_key: key,
    p_location_term_id: null,
    p_notes: notes,
  };
}

function assertClassShape(classId, expectedParticipants, expectedSource = 'session_start') {
  assert.equal(n(`select count(*) from public.classes where id=${classId}`), 1, 'expected exactly one class row');
  assert.equal(n(`select count(*) from public.class_participants where class_id=${classId}`), expectedParticipants, 'participant count mismatch');
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId}`), expectedParticipants, 'attendance count mismatch');
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId} and attendance_status='present' and source=${sqlQuote(expectedSource)}`), expectedParticipants, 'PRESENT/session_start count mismatch');
  assert.equal(n(`select count(*) from public.audit_events where entity_type='class_attendance' and detail->>'class_id'=${sqlQuote(String(classId))}`), expectedParticipants, 'attendance audit side-effect count mismatch');
}

console.log('QA-HARNESS-ATTENDANCE-START-01: creating real local Auth identities');
const staffA = await createAuthUser('staff-a');
const staffB = await createAuthUser('staff-b');
const studentActor = await createAuthUser('student-actor');

q(`insert into public.app_member_roles(user_id,role,active) values (${sqlQuote(staffA.id)}::uuid,'teacher',true),(${sqlQuote(staffB.id)}::uuid,'teacher',true),(${sqlQuote(studentActor.id)}::uuid,'student',true)`);

const student1 = Number(q(`with p as (
  insert into public.people(display_name,crm_stage,active,created_by)
  values ('QA Student 1','student',true,${sqlQuote(staffA.id)}::uuid) returning id
) insert into public.student_profiles(person_id,student_since,active,created_by)
  select id,current_date,true,${sqlQuote(staffA.id)}::uuid from p returning person_id`));
const student2 = Number(q(`with p as (
  insert into public.people(display_name,crm_stage,active,created_by)
  values ('QA Student 2','student',true,${sqlQuote(staffA.id)}::uuid) returning id
) insert into public.student_profiles(person_id,student_since,active,created_by)
  select id,current_date,true,${sqlQuote(staffA.id)}::uuid from p returning person_id`));
const styleId = Number(q(`select id from public.catalog_terms where taxonomy='dance_style' and term_key='bachata' and active limit 1`));
assert.ok(student1 > 0 && student2 > 0 && styleId > 0, 'fixture creation failed');

// 1. SINGLE REQUEST
{
  const key = randomUUID();
  const notes = `qa-single-${key}`;
  const payload = manualPayload({ key, studentIds: [student2, student1], notes, styleId });
  const row = await rpcOk('start_manual_class', staffA.token, payload);
  const classId = Number(row.id);
  assert.ok(classId > 0);
  assertClassShape(classId, 2);
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid and requested_by=${sqlQuote(staffA.id)}::uuid and class_id=${classId} and completed_at is not null`), 1);
  const canonicalIds = q(`select payload->'student_ids' from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid`);
  assert.equal(canonicalIds, `[${Math.min(student1, student2)}, ${Math.max(student1, student2)}]`, 'participant ids were not canonicalized');
  pass(1, 'SINGLE REQUEST', `class_id=${classId}`);

  // 2. SEQUENTIAL SAME-KEY RETRY
  const retry = await rpcOk('start_manual_class', staffA.token, payload);
  assert.equal(Number(retry.id), classId);
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 1);
  assertClassShape(classId, 2);
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid`), 1);
  pass(2, 'SEQUENTIAL SAME-KEY RETRY', `same class_id=${classId}`);
}

// 3. CONCURRENT SAME-KEY — genuine parallel PostgREST requests/transactions.
{
  const key = randomUUID();
  const notes = `qa-concurrent-${key}`;
  const payload = manualPayload({ key, studentIds: [student1], notes, styleId });
  const calls = Array.from({ length: 8 }, () => rpcRaw('start_manual_class', staffA.token, payload));
  const results = await Promise.all(calls);
  for (const out of results) assert.equal(out.ok, true, `concurrent call failed ${out.status}: ${out.text}`);
  const ids = results.map((out) => Number(extractRow(out.text).id));
  assert.equal(new Set(ids).size, 1, `concurrent calls diverged: ${ids.join(',')}`);
  const classId = ids[0];
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 1, 'concurrency created more than one class');
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid and class_id=${classId}`), 1, 'durable request mapping inconsistent');
  assertClassShape(classId, 1);
  pass(3, 'CONCURRENT SAME-KEY', `8 requests -> class_id=${classId}`);
}

// 4. LOST RESPONSE AFTER COMMIT — discard the first committed response body, then retry.
{
  const key = randomUUID();
  const notes = `qa-lost-${key}`;
  const payload = manualPayload({ key, studentIds: [student1], notes, styleId });
  const first = await fetch(`${API_URL}/rest/v1/rpc/start_manual_class`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, authorization: `Bearer ${staffA.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(first.ok, true, `lost-response initial request failed ${first.status}`);
  await first.body?.cancel();
  const retry = await rpcOk('start_manual_class', staffA.token, payload);
  const classId = Number(retry.id);
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 1);
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid and class_id=${classId}`), 1);
  assertClassShape(classId, 1);
  pass(4, 'LOST RESPONSE AFTER COMMIT', `retry recovered class_id=${classId}`);
}

// 5. DIFFERENT KEYS + IDENTICAL PAYLOAD
{
  const keyA = randomUUID();
  const keyB = randomUUID();
  const notes = `qa-distinct-${randomUUID()}`;
  const common = { studentIds: [student1], notes, styleId };
  const a = await rpcOk('start_manual_class', staffA.token, manualPayload({ key: keyA, ...common }));
  const bRow = await rpcOk('start_manual_class', staffA.token, manualPayload({ key: keyB, ...common }));
  assert.notEqual(Number(a.id), Number(bRow.id), 'different keys were heuristically deduplicated');
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 2);
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key in (${sqlQuote(keyA)}::uuid,${sqlQuote(keyB)}::uuid)`), 2);
  pass(5, 'DIFFERENT KEYS + IDENTICAL PAYLOAD', `${a.id} != ${bRow.id}`);
}

// 6. SAME KEY + DIFFERENT PAYLOAD
{
  const key = randomUUID();
  const notes = `qa-payload-mismatch-${key}`;
  const base = manualPayload({ key, studentIds: [student1], notes, styleId, duration: 60 });
  const first = await rpcOk('start_manual_class', staffA.token, base);
  const second = await rpcFail('start_manual_class', staffA.token, { ...base, p_duration_minutes: 90 });
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 1);
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid and class_id=${Number(first.id)}`), 1);
  assert.equal(second.text.includes(String(first.id)), false, 'payload mismatch response leaked/reused class_id');
  pass(6, 'SAME KEY + DIFFERENT PAYLOAD', `fail-closed status=${second.status}`);
}

// 7. SAME KEY + DIFFERENT ACTOR
{
  const key = randomUUID();
  const notes = `qa-actor-mismatch-${key}`;
  const payload = manualPayload({ key, studentIds: [student1], notes, styleId });
  const first = await rpcOk('start_manual_class', staffA.token, payload);
  const second = await rpcFail('start_manual_class', staffB.token, payload);
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 1);
  assert.equal(q(`select requested_by::text from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid`), staffA.id);
  assert.equal(second.text.includes(String(first.id)), false, 'actor mismatch response leaked original class_id');
  pass(7, 'SAME KEY + DIFFERENT ACTOR', `fail-closed status=${second.status}`);
}

// 8. ROLLBACK INTEGRAL — QA-only trigger forces failure after claim/class/participants, at attendance write.
{
  const key = randomUUID();
  const notes = `qa-rollback-${key}`;
  q(`create schema if not exists qa_runtime;
     create or replace function qa_runtime.fail_candidate_attendance() returns trigger language plpgsql as $$
     begin
       if new.detail->>'idempotency_key'=${sqlQuote(key)} then
         raise exception 'QA controlled attendance failure';
       end if;
       return new;
     end $$;
     create trigger qa_runtime_fail_attendance before insert on public.class_attendance_events
       for each row execute function qa_runtime.fail_candidate_attendance();`);
  const out = await rpcFail('start_manual_class', staffA.token, manualPayload({ key, studentIds: [student1], notes, styleId }));
  assert.equal(n(`select count(*) from private.manual_class_start_requests where request_key=${sqlQuote(key)}::uuid`), 0, 'request claim survived rollback');
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 0, 'class survived rollback');
  assert.equal(n(`select count(*) from public.class_attendance_events where detail->>'idempotency_key'=${sqlQuote(key)}`), 0, 'attendance survived rollback');
  assert.equal(n(`select count(*) from public.audit_events where detail->>'idempotency_key'=${sqlQuote(key)}`), 0, 'audit side effect survived rollback');
  q(`drop trigger qa_runtime_fail_attendance on public.class_attendance_events; drop function qa_runtime.fail_candidate_attendance();`);
  pass(8, 'ROLLBACK INTEGRAL', `controlled failure status=${out.status}, zero persisted effects`);
}

// 9. UNAUTHORIZED — real authenticated user with only student role.
{
  const beforeClasses = n(`select count(*) from public.classes`);
  const beforeRequests = n(`select count(*) from private.manual_class_start_requests`);
  const key = randomUUID();
  const notes = `qa-unauthorized-${key}`;
  const out = await rpcFail('start_manual_class', studentActor.token, manualPayload({ key, studentIds: [student1], notes, styleId }));
  assert.equal(n(`select count(*) from public.classes`), beforeClasses);
  assert.equal(n(`select count(*) from private.manual_class_start_requests`), beforeRequests);
  assert.equal(n(`select count(*) from public.classes where notes=${sqlQuote(notes)}`), 0);
  pass(9, 'UNAUTHORIZED', `server denied status=${out.status}, zero effects`);
}

// 10. PRIVATE TABLE ACL
{
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal(b(`select has_table_privilege(${sqlQuote(role)},'private.manual_class_start_requests',${sqlQuote(privilege)})`), false, `${role} unexpectedly has ${privilege}`);
    }
  }
  pass(10, 'PRIVATE TABLE ACL', 'no external DML privileges');
}

// 11. PRIVATE HELPER ACL
{
  const sig = 'private.record_class_attendance_fact(bigint,bigint,text,text,timestamp with time zone,text,bigint,text,jsonb)';
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(b(`select has_function_privilege(${sqlQuote(role)},${sqlQuote(sig)},'EXECUTE')`), false, `${role} unexpectedly has helper EXECUTE`);
  }
  assert.equal(q(`select pg_get_userbyid(p.proowner) from pg_proc p where p.oid=${sqlQuote(sig)}::regprocedure`), 'postgres');
  assert.equal(b(`select p.prosecdef from pg_proc p where p.oid=${sqlQuote(sig)}::regprocedure`), true);
  assert.equal(q(`select coalesce(array_to_string(p.proconfig,','),'') from pg_proc p where p.oid=${sqlQuote(sig)}::regprocedure`), 'search_path=""');
  pass(11, 'PRIVATE HELPER ACL', 'owner=postgres, SECURITY DEFINER, search_path="", no external EXECUTE');
}

// 12. SESSION_START PROVENANCE — independent pair case proves exact participant set.
{
  const key = randomUUID();
  const notes = `qa-provenance-${key}`;
  const row = await rpcOk('start_manual_class', staffA.token, manualPayload({ key, studentIds: [student1, student2], notes, styleId }));
  const classId = Number(row.id);
  const participantSet = q(`select string_agg(person_id::text,',' order by person_id) from public.class_participants where class_id=${classId}`);
  const attendanceSet = q(`select string_agg(person_id::text,',' order by person_id) from public.class_attendance_events where class_id=${classId} and source='session_start'`);
  assert.equal(attendanceSet, participantSet);
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId} and source<>'session_start'`), 0);
  pass(12, 'SESSION_START PROVENANCE', `exact participant set ${participantSet}`);
}

// 13. RETRY AFTER CORRECTION
{
  const key = randomUUID();
  const notes = `qa-correction-${key}`;
  const payload = manualPayload({ key, studentIds: [student1], notes, styleId });
  const started = await rpcOk('start_manual_class', staffA.token, payload);
  const classId = Number(started.id);
  await rpcOk('correct_class_attendance', staffA.token, {
    p_class_id: classId,
    p_person_id: student1,
    p_attendance_status: 'absent',
    p_absence_reason: 'no_show',
    p_reason: 'QA explicit correction after start',
  });
  const retry = await rpcOk('start_manual_class', staffA.token, payload);
  assert.equal(Number(retry.id), classId);
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId} and person_id=${student1}`), 2, 'retry appended/restored attendance unexpectedly');
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId} and person_id=${student1} and source='session_start' and attendance_status='present'`), 1);
  assert.equal(n(`select count(*) from public.class_attendance_events where class_id=${classId} and person_id=${student1} and source='correction' and attendance_status='absent' and absence_reason='no_show'`), 1);
  assert.equal(q(`select source||':'||attendance_status from public.class_attendance_events where class_id=${classId} and person_id=${student1} order by recorded_at desc,id desc limit 1`), 'correction:absent');
  pass(13, 'RETRY AFTER CORRECTION', `latest remains correction:absent for class_id=${classId}`);
}

// 14. OLD SIGNATURE REMOVED / KEYED SIGNATURE PRESENT
{
  const oldSig = `public.start_manual_class(text,bigint[],timestamp with time zone,integer,bigint,bigint,text)`;
  const newSig = `public.start_manual_class(text,bigint[],timestamp with time zone,integer,bigint,uuid,bigint,text)`;
  assert.equal(q(`select to_regprocedure(${sqlQuote(oldSig)}) is null`), 't');
  assert.equal(q(`select to_regprocedure(${sqlQuote(newSig)}) is not null`), 't');
  const oldStyleCall = await rpcFail('start_manual_class', staffA.token, {
    p_class_type: 'individual', p_student_ids: [student1], p_scheduled_start_at: '2026-08-23T12:00:00Z',
    p_duration_minutes: 60, p_style_term_id: styleId, p_location_term_id: null, p_notes: 'qa-old-signature'
  });
  pass(14, 'OLD SIGNATURE', `retired; unkeyed RPC rejected status=${oldStyleCall.status}`);
}

console.log(JSON.stringify({
  harness: 'PASS',
  environment: 'GitHub Actions ephemeral Supabase local stack',
  candidate_sha: '9e2ba6cc5726c498fda1275a5190736f7ea44653',
  candidate_blob: '4f0d454ec0d8e2cf7697debc1eee95ab0920cb40',
  tests: 14,
  canonical_staging_writes: 0,
}, null, 2));
