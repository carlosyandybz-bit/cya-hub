import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const sql = fs.readFileSync('supabase/v31-class-workflow-realtime.sql','utf8');

test('Dar clase opens a class center instead of auto-entering the first active class', () => {
  const start=app.indexOf('function LiveClassView('), end=app.indexOf('\nfunction TeachingContentEditor(',start), live=app.slice(start,end);
  assert.ok(live.includes('title="Centro de clases"'));
  assert.ok(live.includes('Clases abiertas'));
  assert.ok(live.includes('Cierre pendiente'));
  assert.ok(live.includes('Empezar otra clase'));
  assert.equal(live.includes('classToOpen(classes)'),false);
});

test('workflow is Data -> Prepare -> Live -> Summary and reuses profile context', () => {
  assert.ok(app.includes('function ClassSetupStage('));
  assert.ok(app.includes('function ClassPreparationStage('));
  assert.ok(app.includes('function ClassPostAdministrative('));
  assert.ok(app.includes('function ClassFinalSummary('));
  assert.ok(app.includes('student_dance_profiles'));
  assert.ok(app.includes('Lo que ha pedido el alumno'));
  assert.ok(sql.includes("workflow_stage in ('data','prepare','live','administrative','closed')"));
});

test('multiple teachers receive live class changes through Supabase Realtime', () => {
  const start=app.indexOf('function LiveSession('), end=app.indexOf('\nfunction LiveClassView(',start), live=app.slice(start,end);
  assert.ok(live.includes("db.channel(`class-live-${item.id}`)"));
  assert.ok(live.includes("table:'class_notes'"));
  assert.ok(live.includes("table:'class_content_events'"));
  assert.ok(live.includes("table:'student_content_assignments'"));
  assert.ok(sql.includes('alter publication supabase_realtime add table public.class_content_events'));
});

test('correction state is only pending/corrected and improvement is an event', () => {
  assert.ok(app.includes('["pending", "Pendiente de corrección"], ["corrected", "Corregida"]'));
  assert.equal(app.includes('["in_correction", "En corrección"]'),false);
  assert.ok(app.includes("recordEvent(assignment.content_id,'improved')"));
  assert.ok(sql.includes("p_assignment_status not in ('pending','corrected')"));
  assert.ok(sql.includes("'improved'"));
  assert.ok(sql.includes("values(p_person_id,v_content.id,'pending'"));
});

test('explanations and sequences use pending/explained plus reviewed event', () => {
  assert.ok(app.includes('contentType === "explanation" || contentType === "sequence"'));
  assert.ok(app.includes("recordEvent(assignment.content_id,'reviewed')"));
  assert.ok(sql.includes("v_type in ('explanation','sequence')"));
  assert.ok(sql.includes("'reviewed'"));
});

test('exercises are class events instead of recurring permanent assignments', () => {
  assert.ok(sql.includes("if p_content_type='exercise' then"));
  assert.ok(sql.includes("'exercise_pending'"));
  assert.ok(app.includes("recordEvent(content.id,'exercise_active')"));
  assert.ok(app.includes("recordEvent(event.content_id,'exercise_completed')"));
});

test('live screen has work, evaluation and observations separated', () => {
  assert.ok(app.includes("liveTab==='work'"));
  assert.ok(app.includes("liveTab==='evaluate'"));
  assert.ok(app.includes("liveTab==='notes'"));
  assert.ok(app.includes("p_visibility_scope:scope"));
});

test('administrative close can be left pending before pedagogical close', () => {
  assert.ok(app.includes('¿Quieres realizar el cierre de la clase y enviarle la documentación al alumno?'));
  assert.ok(app.includes('No, terminaré después'));
  assert.ok(app.includes('Sí, preparar resumen'));
  assert.ok(sql.includes('close_class_pedagogy_v2'));
});

test('final summary is glanceable and supports final dance media', () => {
  assert.ok(app.includes('Baile final y archivos de clase'));
  assert.ok(app.includes('Progreso'));
  assert.ok(app.includes('A revisar'));
  assert.ok(app.includes("kind:file.type.startsWith('video/')?'final_dance':'class_document'"));
  assert.ok(sql.includes("media_kind in ('class_document','final_dance')"));
});

test('student never receives pending teaching content', () => {
  assert.ok(sql.includes('a.student_visible_at is not null'));
  assert.ok(sql.includes("tc.content_type='correction' and a.assignment_status='corrected'"));
  assert.ok(sql.includes("tc.content_type in ('explanation','sequence') and a.assignment_status='explained'"));
  assert.ok(sql.includes("visibility_scope='private_student'"));
  assert.ok(sql.includes('c.pedagogy_closed_at is not null'));
});

test('class setup can save a preferred compatible credit before finish', () => {
  assert.ok(sql.includes('preferred_billing_grant_id'));
  assert.ok(app.includes('Bono previsto'));
  assert.ok(app.includes('participant.preferred_billing_grant_id'));
  assert.ok(app.includes('p_preferred_grant_ids'));
});

test('elapsed time is still not used by Point 10', () => {
  const workflow = app.slice(app.indexOf('function ClassSetupStage('), app.indexOf('\nfunction TeachingContentEditor('));
  assert.equal(workflow.includes('actual_duration_minutes'),false);
  assert.equal(workflow.includes('started_at).getTime'),false);
});
