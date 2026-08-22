import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const migrationPath = 'supabase/migrations/20260822200930_attendance_start_01.sql';
const legacySchemaPath = 'supabase/live-class.sql';
const docPath = 'docs/attendance-start-01.md';
const provenancePath = 'docs/CORE_01_MIGRATION_PROVENANCE.json';
const testPath = 'tests/attendance-start-01.test.mjs';
const sql = readFileSync(migrationPath, 'utf8');
const docs = readFileSync(docPath, 'utf8');
const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));

const functionBody = (name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+${escaped}\\b[\\s\\S]*?\\$function\\$;`, 'i');
  const match = sql.match(re);
  assert.ok(match, `missing function ${name}`);
  return match[0];
};

const manual = () => functionBody('public.start_manual_class');

function grepStartManualClass() {
  const result = spawnSync('git', ['grep', '-n', '-F', 'start_manual_class'], { encoding: 'utf8' });
  if (![0, 1].includes(result.status)) throw new Error(result.stderr || `git grep failed with ${result.status}`);
  return (result.stdout || '').trim().split('\n').filter(Boolean).map((line) => {
    const [path, lineNo, ...rest] = line.split(':');
    return { path, line: Number(lineNo), text: rest.join(':') };
  });
}

// 1. Single logical request.
test('single manual request claims one durable request row before creating the class', () => {
  const body = manual();
  assert.match(sql, /create\s+table\s+private\.manual_class_start_requests[\s\S]*request_key\s+uuid\s+primary\s+key/i);
  assert.match(body, /p_idempotency_key\s+uuid/i);
  assert.match(body, /insert\s+into\s+private\.manual_class_start_requests\(request_key,requested_by,payload\)[\s\S]*values\(p_idempotency_key,v_actor,v_payload\)/i);
  assert.match(body, /insert\s+into\s+public\.classes/i);
});

// 2. Sequential same-key retry.
test('sequential same-key retry returns the original class instead of creating another', () => {
  const body = manual();
  const conflict = body.indexOf('on conflict (request_key) do nothing');
  const retrySelect = body.indexOf('from private.manual_class_start_requests', conflict);
  const classInsert = body.indexOf('insert into public.classes');
  assert.ok(conflict >= 0 && retrySelect > conflict && classInsert > retrySelect);
  assert.match(body.slice(conflict, classInsert), /v_existing_class_id[\s\S]*from\s+public\.classes[\s\S]*return\s+new_class/i);
});

// 3. Concurrent same-key requests.
test('same-key concurrency is serialized by the request_key primary key and ON CONFLICT', () => {
  const body = manual();
  assert.match(sql, /request_key\s+uuid\s+primary\s+key/i);
  assert.match(body, /on\s+conflict\s*\(request_key\)\s+do\s+nothing/i);
  assert.match(body, /where\s+request_key=p_idempotency_key[\s\S]*for\s+update/i);
  assert.doesNotMatch(body, /pg_advisory|sleep\s*\(/i);
});

// 4. Lost response after commit + retry.
test('a lost-response retry is resolved exclusively from the committed request to class mapping', () => {
  const body = manual();
  assert.match(body, /if\s+v_existing_class_id\s+is\s+null[\s\S]*raise\s+exception/i);
  assert.match(body, /where\s+id=v_existing_class_id[\s\S]*return\s+new_class/i);
  const retryBranch = body.slice(body.indexOf('if v_claimed_key is null'), body.indexOf('-- Mutable resource validity'));
  assert.doesNotMatch(retryBranch, /student_profiles|catalog_terms/i);
});

// 5. Different keys + identical payload.
test('identical payload is not a deduplication key, so distinct request keys remain distinct intentions', () => {
  const requestTable = sql.match(/create\s+table\s+private\.manual_class_start_requests[\s\S]*?\);/i)?.[0] ?? '';
  assert.match(requestTable, /request_key\s+uuid\s+primary\s+key/i);
  assert.doesNotMatch(requestTable, /unique\s*\([^)]*payload|payload\s+jsonb\s+unique/i);
  assert.doesNotMatch(manual(), /on\s+conflict\s*\([^)]*payload/i);
});

// 6. Same key + different student.
test('student identities are part of the canonical server-side payload', () => {
  assert.match(manual(), /'student_ids',to_jsonb\(clean_ids\)/i);
});

// 7. Same key + different duration.
test('duration is part of the canonical payload', () => {
  assert.match(manual(), /'duration_minutes',p_duration_minutes/i);
});

// 8. Same key + changes in location/style/notes/time/type.
test('all approved semantic fields participate in payload equality', () => {
  const body = manual();
  for (const token of [
    "'class_type',p_class_type",
    "'scheduled_start_at',to_jsonb(p_scheduled_start_at)",
    "'style_term_id',p_style_term_id",
    "'location_term_id',p_location_term_id",
    "'notes',v_notes",
  ]) assert.ok(body.includes(token), `missing canonical payload token ${token}`);
  assert.match(body, /v_existing_payload\s+is\s+distinct\s+from\s+v_payload/i);
});

// 9. Pair IDs reordered.
test('pair participant order canonicalizes to the same ordered IDs', () => {
  assert.match(manual(), /array_agg\(id\s+order\s+by\s+id\)[\s\S]*select\s+distinct\s+unnest\(p_student_ids\)/i);
});

// 10. Duplicate IDs.
test('duplicate participant IDs follow the existing distinct-ID normalization', () => {
  const body = manual();
  assert.match(body, /select\s+distinct\s+unnest\(p_student_ids\)\s+id/i);
  assert.match(body, /cardinality\(clean_ids\)<>expected_count/i);
});

// 11. Different actor + same key.
test('actor mismatch fails closed before payload or class resource is exposed', () => {
  const body = manual();
  const actorCheck = body.indexOf('v_existing_actor is distinct from v_actor');
  const payloadCheck = body.indexOf('v_existing_payload is distinct from v_payload');
  const classLookup = body.indexOf('where id=v_existing_class_id');
  assert.ok(actorCheck >= 0 && payloadCheck > actorCheck && classLookup > payloadCheck);
  assert.match(body.slice(actorCheck, payloadCheck), /errcode='42501'/i);
});

// 12. Unauthorized.
test('manual start remains server-authorized to a concrete staff actor', () => {
  const body = manual();
  assert.match(body, /security\s+definer/i);
  assert.match(body, /set\s+search_path=''/i);
  assert.match(body, /v_actor\s+is\s+null\s+or\s+not\s+\(select\s+private\.is_staff\(\)\)/i);
});

// 13-15. Rollback at class / participant / attendance stages.
test('claim, class, participants, attendance and claim completion remain in one transactional RPC', () => {
  const body = manual();
  const claim = body.indexOf('insert into private.manual_class_start_requests');
  const cls = body.indexOf('insert into public.classes');
  const participants = body.indexOf('insert into public.class_participants');
  const attendance = body.indexOf('private.record_class_attendance_fact');
  const bind = body.lastIndexOf('update private.manual_class_start_requests');
  assert.ok(claim >= 0 && cls > claim && participants > cls && attendance > participants && bind > attendance);
  assert.doesNotMatch(body, /\b(?:commit|rollback)\s*;/i);
  assert.doesNotMatch(body, /exception\s+when/i);
  assert.match(sql, /manual_class_start_requests_completion_ck[\s\S]*class_id\s+is\s+null\s+and\s+completed_at\s+is\s+null[\s\S]*class_id\s+is\s+not\s+null\s+and\s+completed_at\s+is\s+not\s+null/i);
});

// 16. Retry after correction.
test('late retry cannot restore present after an attendance correction', () => {
  const start = functionBody('public.start_class');
  const activeBranch = start.indexOf("if v_class.status='active'");
  const factCall = start.indexOf('private.record_class_attendance_fact');
  assert.ok(activeBranch >= 0 && factCall > activeBranch);
  assert.match(start.slice(activeBranch, factCall), /return\s+v_class/i);

  const helper = functionBody('private.record_class_attendance_fact');
  assert.match(helper, /if\s+p_source='session_start'[\s\S]*e\.source='session_start'[\s\S]*return\s+v_start_existing/i);
  assert.match(sql, /class_attendance_events_session_start_once_uidx[\s\S]*where\s+source\s*=\s*'session_start'/i);
});

// 17. Helper ACL.
test('private attendance helper remains sealed', () => {
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    assert.match(sql, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+private\\.record_class_attendance_fact\\([^;]+\\)\\s+from\\s+${role}`, 'i'));
  }
});

// 18. Idempotency table ACL.
test('private manual-start request ledger has no external table access', () => {
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+table\\s+private\\.manual_class_start_requests\\s+from\\s+${role}`, 'i'));
  }
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.match(sql, new RegExp(`has_table_privilege\\(v_role,'private\\.manual_class_start_requests','${privilege}'\\)`, 'i'));
  }
});

// 19. Provenance.
test('session_start remains explicit durable attendance provenance', () => {
  assert.match(sql, /class_attendance_events_source_check[\s\S]*'session_start'/i);
  assert.match(manual(), /private\.record_class_attendance_fact\([\s\S]*'present'[\s\S]*new_class\.started_at[\s\S]*'session_start'/i);
  assert.match(manual(), /'idempotency_key',p_idempotency_key/i);
});

// 20. CORE-01 / CORE-02 authoring contract.
test('CORE provenance remains AUTHORING PRE-APPLY for the exact migration', () => {
  const record = provenance.migrations.find((item) => item.path === migrationPath);
  assert.ok(record, 'missing CORE provenance record');
  assert.equal(record.migration_version, '20260822200930');
  assert.equal(record.operational_class, 'CANONICA');
  assert.equal(record.applied_state, 'PREPARADA_NO_APLICADA');
  assert.equal(record.provenance.lifecycle_phase, 'AUTHORING');
  assert.equal(record.provenance.authorship.pr_number, 134);
  assert.equal(record.provenance.application_evidence, null);
});

// 21-23. Caller UUID behavior. There is no productive current caller to mutate. The exact-branch
// inventory below is a hard guard: inventing unused client code would widen this P0. Server-side
// semantics still prove same-key retry and distinct-key independence, and any future product caller
// makes this test fail until it implements the approved one-UUID-per-intention lifecycle.
test('caller double-tap/network-retry/new-intention cases are N/A only while productive consumer count is zero', () => {
  const refs = grepStartManualClass();
  const nonProductPaths = new Set([migrationPath, legacySchemaPath, testPath, docPath]);
  const productive = refs.filter((ref) => !nonProductPaths.has(ref.path));
  assert.deepEqual(productive, [], `unclassified productive/legacy consumer(s):\n${productive.map((r) => `${r.path}:${r.line}`).join('\n')}`);
  assert.match(docs, /PRODUCTIVO ACTUAL:\s*0/i);
  assert.match(docs, /Caller UUID lifecycle:\s*N\/A/i);
});

// 24. Repo-exhaustive inventory.
test('repo-exhaustive start_manual_class consumer inventory is explicit and current on this exact checkout', () => {
  const refs = grepStartManualClass();
  assert.ok(refs.length > 0, 'expected schema/migration/test/docs references');
  const byPath = new Set(refs.map((ref) => ref.path));
  assert.deepEqual([...byPath].sort(), [docPath, legacySchemaPath, migrationPath, testPath].sort());
  assert.match(docs, /TEST:\s*`tests\/attendance-start-01\.test\.mjs`/i);
  assert.match(docs, /LEGACY SCHEMA SOURCE:\s*`supabase\/live-class\.sql`/i);
  assert.match(docs, /OBSOLETO:\s*firma RPC anterior/i);
});

test('old non-idempotent manual-start runtime signature is removed and only keyed signature is externally granted by the forward migration', () => {
  assert.match(sql, /drop\s+function\s+public\.start_manual_class\(text,bigint\[\],timestamptz,integer,bigint,bigint,text\)/i);
  assert.match(sql, /public\.start_manual_class\(text,bigint\[\],timestamptz,integer,bigint,uuid,bigint,text\)/i);
  assert.doesNotMatch(sql, /grant\s+execute\s+on\s+function\s+public\.start_manual_class\(text,bigint\[\],timestamptz,integer,bigint,bigint,text\)/i);
  assert.match(sql, /v_old_manual\s+regprocedure[\s\S]*if\s+v_old_manual\s+is\s+not\s+null[\s\S]*raise\s+exception/i);
});

test('attendance history remains append-only, prospective, and unrelated domains are untouched', () => {
  assert.doesNotMatch(sql, /update\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.class_attendance_events/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.class_attendance_events\s*\([^;]+?\)\s*select\b/i);
  assert.doesNotMatch(sql, /alter\s+table\s+public\.(people|student_profiles|credit_grants|credit_movements)/i);
  assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+public\.(correct_class_attendance|record_class_attendance|reopen_administratively_finished_class)/i);
});
