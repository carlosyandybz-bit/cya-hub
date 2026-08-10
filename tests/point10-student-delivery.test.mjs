import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const sql = fs.readFileSync('supabase/v31-class-workflow-realtime.sql','utf8');

test('student observations are loaded under RLS and rendered after pedagogical close', () => {
  assert.ok(app.includes('const [studentNotes, setStudentNotes]'));
  assert.ok(app.includes('.eq("visibility_scope", "student")'));
  assert.ok(app.includes('Observaciones de mis clases'));
  assert.ok(sql.includes('class_notes_student_select'));
  assert.ok(sql.includes("visibility_scope='student'"));
  assert.ok(sql.includes('c.pedagogy_closed_at is not null'));
});

test('class-local reviewed/exercise activity is visible in student portal without becoming a recurring assignment', () => {
  assert.ok(app.includes('Trabajo de mis clases'));
  assert.ok(app.includes('event.event_type.startsWith("exercise_")'));
  assert.ok(app.includes('Ejercicio realizado'));
  assert.ok(app.includes('Ejercicio para trabajar'));
  assert.ok(sql.includes("e.event_type in ('exercise_active','exercise_completed')"));
});

test('latest exercise event wins in live class UI', () => {
  const live = app.slice(app.indexOf('function LiveSession('), app.indexOf('\nfunction LiveClassView('));
  assert.ok(live.includes("rows.findIndex((candidate) => candidate.content_id===event.content_id && candidate.event_type.startsWith('exercise_'))===index"));
  assert.equal(live.includes("new Map(personEvents.filter((event) => event.event_type.startsWith('exercise_'))"), false);
});

test('pending assignments and measurements are blocked by RLS, not merely hidden by the portal', () => {
  assert.ok(sql.includes('drop policy if exists student_content_assignments_select'));
  assert.ok(sql.includes('student_visible_at is not null'));
  assert.ok(sql.includes("assignment_status in ('corrected','explained','completed')"));
  assert.ok(sql.includes('drop policy if exists student_content_measurements_select'));
  assert.ok(sql.includes('a.student_visible_at is not null'));
});

test('preparation request updates remain restricted to the student own scheduled class', () => {
  const block = sql.slice(sql.indexOf('create policy class_preparation_requests_student_update'), sql.indexOf('drop policy if exists class_preparation_requests_student_delete'));
  assert.ok(block.includes('join public.class_participants cp'));
  assert.ok((block.match(/cp\.person_id=person_id/g) ?? []).length >= 2);
  assert.ok((block.match(/c\.status='scheduled'/g) ?? []).length >= 2);
});

test('sequence grants are scoped to new v31 tables', () => {
  assert.equal(sql.includes('grant usage,select on all sequences in schema public'), false);
  assert.ok(sql.includes('public.class_content_events_id_seq'));
  assert.ok(sql.includes('public.class_preparation_requests_id_seq'));
  assert.ok(sql.includes('public.class_media_resources_id_seq'));
});
