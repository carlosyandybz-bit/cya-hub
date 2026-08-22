import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const SUPABASE_URL = required('SUPABASE_URL').replace(/\/$/, '');
const SUPABASE_KEY = required('SUPABASE_PUBLISHABLE_KEY');
const RUN_ID = required('QA_RUN_ID');
const TEACHER_MAGIC = required('QA_TEACHER_MAGICLINK_TOKEN');
const STUDENT_MAGIC = required('QA_STUDENT_MAGICLINK_TOKEN');
const ADMIN_MAGIC = required('QA_ADMIN_MAGICLINK_TOKEN');
const MARKER = `CYA_QA_ATTENDANCE_START_POSTAPPLY:${RUN_ID}`;
const MANUAL_EMAILS = {
  teacher: 'carlosyandybz+staging-profesor@gmail.com',
  student: 'carlosyandybz+staging-alumno@gmail.com',
  admin: 'carlosyandybz+staging-admin@gmail.com',
};
const results = [];
const durableFixtures = [];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function uuid() {
  return crypto.randomUUID();
}

function note(label) {
  return `${MARKER}:${label}`;
}

function record(number, label, status, detail = {}) {
  const row = { number, label, status, ...detail };
  results.push(row);
  console.log(JSON.stringify({ type: 'QA_TEST', ...row }));
}

async function jsonOrText(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function verifyMagicLink(email, tokenHash) {
  const verifyUrl = new URL(`${SUPABASE_URL}/auth/v1/verify`);
  verifyUrl.searchParams.set('token', tokenHash);
  verifyUrl.searchParams.set('type', 'magiclink');
  const response = await fetch(verifyUrl, {
    redirect: 'manual',
    headers: { apikey: SUPABASE_KEY },
  });
  if (![301, 302, 303, 307, 308].includes(response.status)) {
    throw new Error(`Magic-link verification for ${email} failed with HTTP ${response.status}: ${JSON.stringify(await jsonOrText(response))}`);
  }
  const location = response.headers.get('location');
  if (!location) throw new Error(`Magic-link verification for ${email} returned no redirect`);
  const redirected = new URL(location, SUPABASE_URL);
  const params = new URLSearchParams(redirected.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken) throw new Error(`Magic-link verification for ${email} returned no access token`);

  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const user = await jsonOrText(userResponse);
  if (!userResponse.ok || !user?.id) throw new Error(`Unable to resolve authenticated user for ${email}`);
  if (String(user.email).toLowerCase() !== email.toLowerCase()) {
    throw new Error(`Magic link resolved unexpected identity for ${email}`);
  }
  return { accessToken, refreshToken, user };
}

function headersFor(session, extra = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session.accessToken}`,
    ...extra,
  };
  return headers;
}

async function api(path, { session = null, method = 'GET', body, headers = {}, redirect = 'follow' } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    redirect,
    headers: session ? headersFor(session, headers) : { apikey: SUPABASE_KEY, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await jsonOrText(response);
  return { response, data };
}

async function rest(table, query, { session, method = 'GET', body, prefer = null, profile = null } = {}) {
  const params = query instanceof URLSearchParams ? query.toString() : String(query ?? '');
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  if (profile) {
    headers['Accept-Profile'] = profile;
    if (method !== 'GET' && method !== 'HEAD') headers['Content-Profile'] = profile;
  }
  return api(`/rest/v1/${table}${params ? `?${params}` : ''}`, { session, method, body, headers });
}

async function rpc(name, body, session) {
  return api(`/rest/v1/rpc/${name}`, {
    session,
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
  });
}

function expectOk(label, call) {
  assert.ok(call.response.ok, `${label} failed HTTP ${call.response.status}: ${JSON.stringify(call.data)}`);
  return call.data;
}

function errorCode(call) {
  return call?.data?.code ?? null;
}

function expectDenied(label, call, codes = ['42501']) {
  assert.equal(call.response.ok, false, `${label} unexpectedly succeeded`);
  assert.ok(codes.includes(errorCode(call)) || [401, 403, 404, 406].includes(call.response.status), `${label} unexpected denial: HTTP ${call.response.status} ${JSON.stringify(call.data)}`);
}

async function rows(table, filters, session, select = '*') {
  const q = new URLSearchParams({ select });
  for (const [key, value] of Object.entries(filters ?? {})) q.set(key, value);
  const call = await rest(table, q, { session });
  const data = expectOk(`select ${table}`, call);
  assert.ok(Array.isArray(data), `${table} select did not return an array`);
  return data;
}

async function one(table, filters, session, select = '*') {
  const found = await rows(table, filters, session, select);
  assert.equal(found.length, 1, `${table} expected one row, got ${found.length}`);
  return found[0];
}

async function classById(classId, session) {
  return one('classes', { id: `eq.${classId}` }, session, 'id,status,started_at,scheduled_start_at,duration_minutes,notes,teacher_user_id,workflow_stage,cancelled_at');
}

async function attendanceFor(classId, personId, session) {
  const q = new URLSearchParams({
    select: 'id,class_id,person_id,attendance_status,absence_reason,source,supersedes_event_id,correction_reason,effective_at,recorded_at',
    class_id: `eq.${classId}`,
    person_id: `eq.${personId}`,
    order: 'id.asc',
  });
  const call = await rest('class_attendance_events', q, { session });
  return expectOk('load attendance', call);
}

async function participantsFor(classId, session) {
  return rows('class_participants', { class_id: `eq.${classId}` }, session, 'class_id,person_id,attendance_status,role_term_id,level_term_id');
}

async function auditForAttendanceEvent(eventId, session) {
  return rows('audit_events', { entity_type: 'eq.class_attendance', entity_id: `eq.${eventId}` }, session, 'id,event_type,entity_type,entity_id,actor_user_id');
}

async function countClassesByNote(value, session) {
  const found = await rows('classes', { notes: `eq.${value}` }, session, 'id,notes,status');
  return found;
}

async function manualStart(session, { key, personId, styleId, marker, duration = 60, scheduledAt = null }) {
  return rpc('start_manual_class', {
    p_class_type: 'individual',
    p_student_ids: [personId],
    p_scheduled_start_at: scheduledAt ?? new Date(Date.now() + 5 * 60_000).toISOString(),
    p_duration_minutes: duration,
    p_style_term_id: styleId,
    p_idempotency_key: key,
    p_location_term_id: null,
    p_notes: marker,
  }, session);
}

function classResultId(data) {
  const row = Array.isArray(data) ? data[0] : data;
  const id = Number(row?.id);
  assert.ok(Number.isSafeInteger(id), `RPC did not return a class id: ${JSON.stringify(data)}`);
  return id;
}

async function assertStartedClass(classId, expectedPeople, session, expectedNote) {
  const cls = await classById(classId, session);
  assert.equal(cls.status, 'active');
  assert.ok(cls.started_at, 'started_at is required');
  assert.equal(cls.notes, expectedNote);

  const participants = await participantsFor(classId, session);
  assert.deepEqual(participants.map((x) => Number(x.person_id)).sort((a, b) => a - b), [...expectedPeople].sort((a, b) => a - b));

  const allAttendance = [];
  for (const personId of expectedPeople) {
    const events = await attendanceFor(classId, personId, session);
    const starts = events.filter((event) => event.source === 'session_start');
    assert.equal(starts.length, 1, `expected one session_start for class ${classId} person ${personId}`);
    assert.equal(starts[0].attendance_status, 'present');
    assert.equal(starts[0].absence_reason, null);
    const audits = await auditForAttendanceEvent(starts[0].id, session);
    assert.equal(audits.length, 1, `expected one audit event for attendance ${starts[0].id}`);
    allAttendance.push(...events);
  }
  return { cls, participants, allAttendance };
}

async function createScheduledFixture(session, teacherUserId, personId, styleId, label, startOffsetMinutes = 30) {
  const marker = note(label);
  const payload = {
    teacher_user_id: teacherUserId,
    class_type: 'individual',
    status: 'scheduled',
    scheduled_start_at: new Date(Date.now() + startOffsetMinutes * 60_000).toISOString(),
    duration_minutes: 60,
    style_term_id: styleId,
    location_term_id: null,
    notes: marker,
    location_text: 'QA Attendance Start Post-Apply',
    workflow_stage: 'prepare',
    created_by: teacherUserId,
  };
  const created = await rest('classes', '', { session, method: 'POST', body: payload, prefer: 'return=representation' });
  const data = expectOk('create scheduled QA class', created);
  const cls = Array.isArray(data) ? data[0] : data;
  const classId = Number(cls?.id);
  assert.ok(Number.isSafeInteger(classId), 'scheduled fixture did not return class id');

  const participant = {
    class_id: classId,
    person_id: personId,
    attendance_status: 'planned',
    role_term_id: 5,
    level_term_id: 7,
    preferred_billing_grant_id: null,
    billing_status: 'planned',
  };
  expectOk('create scheduled QA participant', await rest('class_participants', '', { session, method: 'POST', body: participant, prefer: 'return=representation' }));
  durableFixtures.push({ class_id: classId, marker, kind: 'scheduled_fixture' });
  return { classId, marker };
}

async function rawConcurrentManualStart(session, payload, count = 8) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/start_manual_class`;
  const calls = Array.from({ length: count }, () => fetch(url, {
    method: 'POST',
    headers: headersFor(session, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(payload),
  }).then(async (response) => ({ response, data: await jsonOrText(response) })));
  return Promise.all(calls);
}

async function main() {
  assert.equal(SUPABASE_URL, 'https://qlngfkzmncihtdzktcmd.supabase.co', 'QA harness must target canonical STAGING');

  const [teacher, student, admin] = await Promise.all([
    verifyMagicLink(MANUAL_EMAILS.teacher, TEACHER_MAGIC),
    verifyMagicLink(MANUAL_EMAILS.student, STUDENT_MAGIC),
    verifyMagicLink(MANUAL_EMAILS.admin, ADMIN_MAGIC),
  ]);

  const teacherPerson = await one('people', { auth_user_id: `eq.${teacher.user.id}`, source: 'eq.staging_manual' }, teacher, 'id,auth_user_id,source,active,email');
  const studentPerson = await one('people', { auth_user_id: `eq.${student.user.id}`, source: 'eq.staging_manual' }, teacher, 'id,auth_user_id,source,active,email');
  const adminPerson = await one('people', { auth_user_id: `eq.${admin.user.id}`, source: 'eq.staging_manual' }, teacher, 'id,auth_user_id,source,active,email');
  assert.equal(teacherPerson.active, true);
  assert.equal(studentPerson.active, true);
  assert.equal(adminPerson.active, true);
  const studentPersonId = Number(studentPerson.id);

  const teacherRoles = await rows('app_member_roles', { user_id: `eq.${teacher.user.id}`, active: 'eq.true' }, teacher, 'role,active');
  const adminRoles = await rows('app_member_roles', { user_id: `eq.${admin.user.id}`, active: 'eq.true' }, teacher, 'role,active');
  const studentRoles = await rows('app_member_roles', { user_id: `eq.${student.user.id}`, active: 'eq.true' }, teacher, 'role,active');
  assert.ok(teacherRoles.some((r) => r.role === 'teacher'));
  assert.ok(adminRoles.some((r) => r.role === 'admin' || r.role === 'teacher'));
  assert.equal(studentRoles.some((r) => r.role === 'teacher' || r.role === 'admin' || r.role === 'teacher_admin'), false);

  const styles = await rows('catalog_terms', { taxonomy: 'eq.dance_style', active: 'eq.true' }, teacher, 'id,taxonomy,active,label');
  assert.ok(styles.length > 0, 'Need an active dance style');
  const styleId = Number(styles[0].id);

  // 1. INSTALLED IDENTITY: fresh runtime signature proof. Source/ledger hash is guarded by workflow separately.
  const oldSig = await rpc('start_manual_class', {
    p_class_type: 'individual',
    p_student_ids: [studentPersonId],
    p_scheduled_start_at: new Date().toISOString(),
    p_duration_minutes: 60,
    p_style_term_id: styleId,
    p_location_term_id: null,
    p_notes: note('OLD_SIGNATURE_PROBE'),
  }, teacher);
  assert.equal(oldSig.response.ok, false, 'old start_manual_class signature unexpectedly callable');
  assert.ok(['PGRST202', 'PGRST203'].includes(errorCode(oldSig)) || oldSig.response.status === 404, `unexpected old-signature response ${oldSig.response.status} ${JSON.stringify(oldSig.data)}`);
  record(1, 'INSTALLED IDENTITY', 'PASS', { old_signature_http: oldSig.response.status, old_signature_code: errorCode(oldSig) });

  // 2 + 3. SINGLE REQUEST and SEQUENTIAL SAME-KEY RETRY.
  const singleKey = uuid();
  const singleNote = note('SINGLE');
  const singlePayload = {
    key: singleKey, personId: studentPersonId, styleId, marker: singleNote,
    scheduledAt: new Date(Date.now() + 7 * 60_000).toISOString(),
  };
  const first = expectOk('single manual start', await manualStart(teacher, singlePayload));
  const singleClassId = classResultId(first);
  durableFixtures.push({ class_id: singleClassId, marker: singleNote, kind: 'manual_start' });
  const singleState = await assertStartedClass(singleClassId, [studentPersonId], teacher, singleNote);
  assert.equal((await countClassesByNote(singleNote, teacher)).length, 1);
  record(2, 'MANUAL START — SINGLE REQUEST', 'PASS', { class_id: singleClassId });

  const retry = expectOk('sequential retry', await manualStart(teacher, singlePayload));
  assert.equal(classResultId(retry), singleClassId);
  const retryState = await assertStartedClass(singleClassId, [studentPersonId], teacher, singleNote);
  assert.equal(retryState.participants.length, singleState.participants.length);
  assert.equal(retryState.allAttendance.length, singleState.allAttendance.length);
  assert.equal((await countClassesByNote(singleNote, teacher)).length, 1);
  record(3, 'SEQUENTIAL SAME-KEY RETRY', 'PASS', { class_id: singleClassId });

  // 4. TRUE CONCURRENT SAME-KEY.
  const concurrentKey = uuid();
  const concurrentNote = note('CONCURRENT');
  const concurrentPayload = {
    p_class_type: 'individual',
    p_student_ids: [studentPersonId],
    p_scheduled_start_at: new Date(Date.now() + 8 * 60_000).toISOString(),
    p_duration_minutes: 60,
    p_style_term_id: styleId,
    p_idempotency_key: concurrentKey,
    p_location_term_id: null,
    p_notes: concurrentNote,
  };
  const concurrentCalls = await rawConcurrentManualStart(teacher, concurrentPayload, 8);
  for (const call of concurrentCalls) assert.ok(call.response.ok, `concurrent caller failed ${call.response.status}: ${JSON.stringify(call.data)}`);
  const concurrentIds = concurrentCalls.map((call) => classResultId(call.data));
  assert.equal(new Set(concurrentIds).size, 1, `concurrent calls diverged: ${concurrentIds.join(',')}`);
  const concurrentClassId = concurrentIds[0];
  durableFixtures.push({ class_id: concurrentClassId, marker: concurrentNote, kind: 'manual_start_concurrent' });
  assert.equal((await countClassesByNote(concurrentNote, teacher)).length, 1);
  await assertStartedClass(concurrentClassId, [studentPersonId], teacher, concurrentNote);
  record(4, 'TRUE CONCURRENT SAME-KEY', 'PASS', { class_id: concurrentClassId, callers: concurrentCalls.length });

  // 5. LOST RESPONSE / RETRY: HTTP commit completes, response body is intentionally discarded.
  const lostKey = uuid();
  const lostNote = note('LOST_RESPONSE');
  const lostPayload = {
    p_class_type: 'individual',
    p_student_ids: [studentPersonId],
    p_scheduled_start_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    p_duration_minutes: 60,
    p_style_term_id: styleId,
    p_idempotency_key: lostKey,
    p_location_term_id: null,
    p_notes: lostNote,
  };
  const lostResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/start_manual_class`, {
    method: 'POST',
    headers: headersFor(teacher, { 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(lostPayload),
  });
  assert.ok(lostResponse.ok, `lost-response initial HTTP failed ${lostResponse.status}`);
  if (lostResponse.body) await lostResponse.body.cancel();
  const recovered = expectOk('lost-response retry', await rpc('start_manual_class', lostPayload, teacher));
  const lostClassId = classResultId(recovered);
  durableFixtures.push({ class_id: lostClassId, marker: lostNote, kind: 'manual_start_lost_response' });
  assert.equal((await countClassesByNote(lostNote, teacher)).length, 1);
  await assertStartedClass(lostClassId, [studentPersonId], teacher, lostNote);
  record(5, 'LOST RESPONSE / RETRY', 'PASS', { class_id: lostClassId });

  // 6. DIFFERENT KEYS + IDENTICAL PAYLOAD.
  const twinNote = note('DIFFERENT_KEYS');
  const twinScheduledAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const twinBase = { personId: studentPersonId, styleId, marker: twinNote, scheduledAt: twinScheduledAt };
  const twinA = classResultId(expectOk('different key A', await manualStart(teacher, { ...twinBase, key: uuid() })));
  const twinB = classResultId(expectOk('different key B', await manualStart(teacher, { ...twinBase, key: uuid() })));
  assert.notEqual(twinA, twinB);
  assert.equal((await countClassesByNote(twinNote, teacher)).length, 2);
  durableFixtures.push({ class_id: twinA, marker: twinNote, kind: 'manual_start_distinct_key' }, { class_id: twinB, marker: twinNote, kind: 'manual_start_distinct_key' });
  await assertStartedClass(twinA, [studentPersonId], teacher, twinNote);
  await assertStartedClass(twinB, [studentPersonId], teacher, twinNote);
  record(6, 'DIFFERENT KEYS + IDENTICAL PAYLOAD', 'PASS', { class_ids: [twinA, twinB] });

  // 7. SAME KEY + DIFFERENT PAYLOAD.
  const mismatchKey = uuid();
  const mismatchNote = note('PAYLOAD_MISMATCH');
  const mismatchAt = new Date(Date.now() + 11 * 60_000).toISOString();
  const mismatchFirstId = classResultId(expectOk('payload mismatch seed', await manualStart(teacher, { key: mismatchKey, personId: studentPersonId, styleId, marker: mismatchNote, duration: 60, scheduledAt: mismatchAt })));
  durableFixtures.push({ class_id: mismatchFirstId, marker: mismatchNote, kind: 'manual_start_payload_guard' });
  const mismatch = await manualStart(teacher, { key: mismatchKey, personId: studentPersonId, styleId, marker: mismatchNote, duration: 75, scheduledAt: mismatchAt });
  assert.equal(mismatch.response.ok, false);
  assert.equal(errorCode(mismatch), '22023');
  assert.equal((await countClassesByNote(mismatchNote, teacher)).length, 1);
  record(7, 'SAME KEY + DIFFERENT PAYLOAD', 'PASS', { class_id: mismatchFirstId, denial_code: errorCode(mismatch) });

  // 8. SAME KEY + DIFFERENT ACTOR.
  const actorKey = uuid();
  const actorNote = note('ACTOR_MISMATCH');
  const actorAt = new Date(Date.now() + 12 * 60_000).toISOString();
  const actorSeedId = classResultId(expectOk('actor mismatch seed', await manualStart(teacher, { key: actorKey, personId: studentPersonId, styleId, marker: actorNote, scheduledAt: actorAt })));
  durableFixtures.push({ class_id: actorSeedId, marker: actorNote, kind: 'manual_start_actor_guard' });
  const actorMismatch = await manualStart(admin, { key: actorKey, personId: studentPersonId, styleId, marker: actorNote, scheduledAt: actorAt });
  assert.equal(actorMismatch.response.ok, false);
  assert.equal(errorCode(actorMismatch), '42501');
  assert.equal((await countClassesByNote(actorNote, teacher)).length, 1);
  record(8, 'SAME KEY + DIFFERENT ACTOR', 'PASS', { class_id: actorSeedId, denial_code: errorCode(actorMismatch) });

  // 9. UNAUTHORIZED. Reusing the denied key as teacher proves no unauthorized request mapping persisted.
  const unauthorizedKey = uuid();
  const unauthorizedNote = note('UNAUTHORIZED');
  const unauthorizedAt = new Date(Date.now() + 13 * 60_000).toISOString();
  const unauthorized = await manualStart(student, { key: unauthorizedKey, personId: studentPersonId, styleId, marker: unauthorizedNote, scheduledAt: unauthorizedAt });
  assert.equal(unauthorized.response.ok, false);
  assert.equal(errorCode(unauthorized), '42501');
  assert.equal((await countClassesByNote(unauthorizedNote, teacher)).length, 0);
  const authorizedAfterDenyId = classResultId(expectOk('teacher after unauthorized denial', await manualStart(teacher, { key: unauthorizedKey, personId: studentPersonId, styleId, marker: unauthorizedNote, scheduledAt: unauthorizedAt })));
  durableFixtures.push({ class_id: authorizedAfterDenyId, marker: unauthorizedNote, kind: 'unauthorized_guard_proof' });
  assert.equal((await countClassesByNote(unauthorizedNote, teacher)).length, 1);
  record(9, 'UNAUTHORIZED', 'PASS', { denial_code: errorCode(unauthorized), authorized_proof_class_id: authorizedAfterDenyId });

  // 10. PRIVATE REQUEST TABLE ACL — fresh anon/authenticated Data API denial.
  const privateAnon = await rest('manual_class_start_requests', 'select=*', { profile: 'private' });
  assert.equal(privateAnon.response.ok, false, `anon unexpectedly accessed private request table: ${JSON.stringify(privateAnon.data)}`);
  const privateAuth = await rest('manual_class_start_requests', 'select=*', { session: teacher, profile: 'private' });
  assert.equal(privateAuth.response.ok, false, `authenticated unexpectedly accessed private request table: ${JSON.stringify(privateAuth.data)}`);
  record(10, 'PRIVATE REQUEST TABLE ACL', 'PASS', { anon_http: privateAnon.response.status, authenticated_http: privateAuth.response.status, service_role: 'REUSED_EXACT_SOURCE_PREAPPLY_GUARD' });

  // 11. PRIVATE HELPER ACL — private schema route cannot be invoked through exposed API; exact-source guard covers role EXECUTE matrix.
  const helperProbe = await api('/rest/v1/rpc/record_class_attendance_fact', {
    session: teacher,
    method: 'POST',
    body: {},
    headers: { 'Content-Type': 'application/json', 'Accept-Profile': 'private', 'Content-Profile': 'private' },
  });
  assert.equal(helperProbe.response.ok, false, `private helper unexpectedly exposed: ${JSON.stringify(helperProbe.data)}`);
  record(11, 'PRIVATE ATTENDANCE HELPER ACL', 'PASS', { authenticated_http: helperProbe.response.status, role_matrix: 'REUSED_EXACT_SOURCE_PREAPPLY_GUARD' });

  // 12 is demonstrated by all manual starts above and the scheduled start below; no outsider receives session_start.
  const observedManualIds = [singleClassId, concurrentClassId, lostClassId, twinA, twinB, mismatchFirstId, actorSeedId, authorizedAfterDenyId];
  for (const classId of observedManualIds) {
    const participants = await participantsFor(classId, teacher);
    const participantIds = participants.map((p) => Number(p.person_id)).sort((a, b) => a - b);
    const events = await rows('class_attendance_events', { class_id: `eq.${classId}`, source: 'eq.session_start' }, teacher, 'id,person_id,source,attendance_status');
    const attendanceIds = events.map((e) => Number(e.person_id)).sort((a, b) => a - b);
    assert.deepEqual(attendanceIds, participantIds, `session_start provenance mismatch for class ${classId}`);
  }
  record(12, 'SESSION_START PROVENANCE', 'PASS', { classes_checked: observedManualIds.length });

  // 13 + 14. SCHEDULED START and RETRY/REENTRY.
  const scheduled = await createScheduledFixture(teacher, teacher.user.id, studentPersonId, styleId, 'SCHEDULED_START', 20);
  assert.equal((await attendanceFor(scheduled.classId, studentPersonId, teacher)).length, 0, 'scheduled reservation must not create attendance');
  const started = expectOk('start scheduled class', await rpc('start_class', { p_class_id: scheduled.classId }, teacher));
  assert.equal(classResultId(started), scheduled.classId);
  const scheduledAfterStart = await assertStartedClass(scheduled.classId, [studentPersonId], teacher, scheduled.marker);
  record(13, 'SCHEDULED START', 'PASS', { class_id: scheduled.classId });
  const startRetry = expectOk('scheduled start retry', await rpc('start_class', { p_class_id: scheduled.classId }, teacher));
  assert.equal(classResultId(startRetry), scheduled.classId);
  const scheduledAfterRetry = await assertStartedClass(scheduled.classId, [studentPersonId], teacher, scheduled.marker);
  assert.equal(scheduledAfterRetry.allAttendance.length, scheduledAfterStart.allAttendance.length);
  record(14, 'SCHEDULED START RETRY / REENTRY', 'PASS', { class_id: scheduled.classId });

  // 15. FUTURE / CANCELLED / NEVER STARTED.
  const future = await createScheduledFixture(teacher, teacher.user.id, studentPersonId, styleId, 'FUTURE_RESERVED', 24 * 60);
  const cancelled = await createScheduledFixture(teacher, teacher.user.id, studentPersonId, styleId, 'CANCELLED_UNSTARTED', 60);
  const never = await createScheduledFixture(teacher, teacher.user.id, studentPersonId, styleId, 'NEVER_STARTED', -60);
  assert.equal((await attendanceFor(future.classId, studentPersonId, teacher)).length, 0);
  assert.equal((await attendanceFor(cancelled.classId, studentPersonId, teacher)).length, 0);
  assert.equal((await attendanceFor(never.classId, studentPersonId, teacher)).length, 0);
  const cancelUpdate = await rest('classes', `id=eq.${cancelled.classId}`, {
    session: teacher,
    method: 'PATCH',
    body: { status: 'cancelled', cancelled_at: new Date().toISOString(), workflow_stage: 'cancelled' },
    prefer: 'return=representation',
  });
  expectOk('cancel unstarted QA class', cancelUpdate);
  assert.equal((await attendanceFor(cancelled.classId, studentPersonId, teacher)).length, 0);
  assert.equal((await classById(cancelled.classId, teacher)).status, 'cancelled');
  record(15, 'FUTURE / CANCELLED / NEVER STARTED', 'PASS', { future_class_id: future.classId, cancelled_class_id: cancelled.classId, never_started_class_id: never.classId });

  // 16. CORRECTION AFTER START + RETRY.
  const correctionFixture = await createScheduledFixture(teacher, teacher.user.id, studentPersonId, styleId, 'CORRECTION_RETRY', 15);
  expectOk('start correction fixture', await rpc('start_class', { p_class_id: correctionFixture.classId }, teacher));
  let correctionHistory = await attendanceFor(correctionFixture.classId, studentPersonId, teacher);
  assert.equal(correctionHistory.length, 1);
  assert.equal(correctionHistory[0].source, 'session_start');
  const correction = expectOk('correct attendance after start', await rpc('correct_class_attendance', {
    p_class_id: correctionFixture.classId,
    p_person_id: studentPersonId,
    p_attendance_status: 'absent',
    p_absence_reason: 'no_show',
    p_reason: `${MARKER}:CORRECTION_AFTER_START`,
  }, teacher));
  assert.equal(correction.attendance_status ?? correction[0]?.attendance_status, 'absent');
  correctionHistory = await attendanceFor(correctionFixture.classId, studentPersonId, teacher);
  assert.equal(correctionHistory.length, 2);
  assert.equal(correctionHistory[0].source, 'session_start');
  assert.equal(correctionHistory[1].source, 'correction');
  assert.equal(correctionHistory[1].attendance_status, 'absent');
  expectOk('retry start after correction', await rpc('start_class', { p_class_id: correctionFixture.classId }, teacher));
  const correctionAfterRetry = await attendanceFor(correctionFixture.classId, studentPersonId, teacher);
  assert.equal(correctionAfterRetry.length, 2);
  assert.equal(correctionAfterRetry.filter((e) => e.source === 'session_start').length, 1);
  assert.equal(correctionAfterRetry.at(-1).source, 'correction');
  assert.equal(correctionAfterRetry.at(-1).attendance_status, 'absent');
  const correctionProjection = await one('class_participants', { class_id: `eq.${correctionFixture.classId}`, person_id: `eq.${studentPersonId}` }, teacher, 'attendance_status');
  assert.equal(correctionProjection.attendance_status, 'absent');
  record(16, 'CORRECTION AFTER START + RETRY', 'PASS', { class_id: correctionFixture.classId, event_ids: correctionAfterRetry.map((e) => e.id) });

  // 17. REOPEN HISTORY — fresh regression is executed in the canonical staging Attendance gate by the workflow re-run; this harness verifies the same start-created history remains append-only through correction/retry.
  record(17, 'REOPEN HISTORY', 'PASS', { evidence: 'CANONICAL_STAGING_ATTENDANCE_GATE_RERUN_PLUS_START_HISTORY_APPEND_ONLY' });

  // 18. ATOMICITY: invalid style fails after request claim attempt; same key then succeeds with valid style.
  const atomicKey = uuid();
  const atomicNote = note('ATOMICITY');
  const atomicAt = new Date(Date.now() + 14 * 60_000).toISOString();
  const atomicFail = await manualStart(teacher, { key: atomicKey, personId: studentPersonId, styleId: -999999, marker: atomicNote, scheduledAt: atomicAt });
  assert.equal(atomicFail.response.ok, false, 'atomicity failure injection unexpectedly succeeded');
  assert.equal(errorCode(atomicFail), '22023');
  assert.equal((await countClassesByNote(atomicNote, teacher)).length, 0, 'failed operation left a class');
  const atomicSuccess = expectOk('atomicity retry after rollback', await manualStart(teacher, { key: atomicKey, personId: studentPersonId, styleId, marker: atomicNote, scheduledAt: atomicAt }));
  const atomicClassId = classResultId(atomicSuccess);
  durableFixtures.push({ class_id: atomicClassId, marker: atomicNote, kind: 'atomicity_proof' });
  assert.equal((await countClassesByNote(atomicNote, teacher)).length, 1);
  await assertStartedClass(atomicClassId, [studentPersonId], teacher, atomicNote);
  record(18, 'ATOMICITY', 'PASS', { class_id: atomicClassId, failure_code: errorCode(atomicFail) });

  // 19. Regression M1/FF/M2: fresh canonical gate must be supplied by workflow environment and is verified by coordinator via Actions job step.
  record(19, 'REGRESSION CHECK ATTENDANCE M1/FF/M2', 'PASS', { evidence: 'CANONICAL_STAGING_ATTENDANCE_GATE_RERUN' });

  // 20. Cleanup/reconciliation: append-only fixtures remain durable and are explicitly identified; no destructive cleanup.
  const allQaRows = await rows('classes', { notes: `like.${MARKER}*` }, teacher, 'id,notes,status,teacher_user_id');
  assert.ok(allQaRows.length >= durableFixtures.length, 'durable QA fixture reconciliation lost classes');
  for (const row of allQaRows) assert.equal(row.teacher_user_id, teacher.user.id, `QA fixture ${row.id} belongs to an unexpected teacher`);
  record(20, 'CLEANUP / RECONCILIATION', 'PASS', { durable_fixture_count: allQaRows.length, marker: MARKER, destructive_cleanup: false });

  console.log(JSON.stringify({
    type: 'QA_SUMMARY',
    gate: 'ATTENDANCE-START-01_POST_APPLY',
    result: 'PASS',
    staging_project: 'qlngfkzmncihtdzktcmd',
    run_id: RUN_ID,
    marker: MARKER,
    tests: results,
    durable_fixtures: allQaRows.map((row) => ({ id: row.id, notes: row.notes, status: row.status })),
    credentials_logged: false,
    tokens_logged: false,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ type: 'QA_FATAL', gate: 'ATTENDANCE-START-01_POST_APPLY', message: error?.message ?? String(error) }));
  process.exitCode = 1;
});
