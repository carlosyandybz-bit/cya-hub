import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx', 'utf8');
const migration = fs.readFileSync('supabase/v49_p21_class_workflow_search.sql', 'utf8');

function sliceBetween(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `Missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Missing end marker: ${end}`);
  return source.slice(from, to);
}

test('class start transition stays operational and independent from Marketing', () => {
  const block = sliceBetween(app, 'async function begin() {', 'const previousClass');
  assert.match(block, /db\.rpc\("start_class"/);
  assert.match(block, /try\s*\{/);
  assert.match(block, /finally\s*\{/);
  assert.doesNotMatch(block, /loadMarketing/);
});

test('class center explicitly supports concurrent open classes', () => {
  assert.match(app, /Clases abiertas/);
  assert.match(app, /empieza una nueva sin bloquear tu trabajo/);
  assert.match(app, /classes\.filter\(\(item\) => item\.status==='active'/);
});

test('quick provisional student remains inside manual class flow', () => {
  assert.match(app, /Crear alumno provisional/);
  assert.match(app, /QuickProvisionalStudentModal/);
  assert.match(app, /setFirstId\(String\(person\.id\)\)/);
  assert.match(app, /setSecondId\(String\(person\.id\)\)/);
});

test('administrative close uses explicit manual duration and v6 billing', () => {
  assert.match(app, /p_duration_minutes:\s*manualDuration/);
  assert.match(app, /administratively_finish_class_v6/);
  assert.match(app, /durationHoursText/);
  assert.match(app, /durationMinutesText/);
});

test('live search exposes all four pedagogical types', () => {
  assert.match(app, /\['correction','Correcciones'\]/);
  assert.match(app, /\['explanation','Explicaciones'\]/);
  assert.match(app, /\['exercise','Ejercicios'\]/);
  assert.match(app, /\['sequence','Secuencias'\]/);
  assert.match(app, /search_class_teaching_content/);
});

test('editable pedagogical summary remains integrated before final close', () => {
  assert.match(app, /ClassSummaryContentEditor/);
  assert.match(app, /close_class_pedagogy_v2/);
  assert.match(app, /Cerrar y enviar al alumno/);
});

test('v49 keeps search RPC compatible while adding category and relation search', () => {
  assert.match(migration, /create or replace function public\.search_class_teaching_content\(/i);
  assert.match(migration, /public\.catalog_terms category/);
  assert.match(migration, /public\.teaching_content_relations rel/);
  assert.match(migration, /related\.title/);
  assert.match(migration, /related_tag/);
});

test('v49 ranks active correction, assigned content, related context and library in order', () => {
  const pendingCorrection = migration.indexOf("a.assignment_status='pending'");
  const relationPriority = migration.indexOf('then 2', pendingCorrection);
  const readyPriority = migration.indexOf('then 3', relationPriority);
  assert.ok(pendingCorrection > 0);
  assert.ok(relationPriority > pendingCorrection);
  assert.ok(readyPriority > relationPriority);
});

test('v49 keeps scheduled data/prepare stages and normalizes operational stages', () => {
  assert.match(migration, /Scheduled classes keep their explicit data\/prepare stage/);
  assert.match(migration, /new\.pedagogy_closed_at is not null/);
  assert.match(migration, /new\.status='finished'/);
  assert.match(migration, /new\.status='active'/);
  assert.match(migration, /where status='finished' and administrative_finished_at is not null and pedagogy_closed_at is null/);
});

test('v49 private trigger helper is not callable by app roles', () => {
  assert.match(migration, /revoke all on function private\.sync_class_workflow_stage_p21\(\) from public,anon,authenticated/);
});


test('P21.2 physically removes the hidden numeric evaluation engine from Dar clase', () => {
  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');
  assert.doesNotMatch(live, /liveTab==='evaluate'/);
  assert.doesNotMatch(live, /save_class_evaluation_v2/);
  assert.doesNotMatch(live, /EvaluationRadar/);
  assert.doesNotMatch(live, /student_evaluations/);
});

test('P21.2 live fallback does not globally refresh CYA every 15 seconds', () => {
  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');
  assert.doesNotMatch(live, /setInterval\(\(\) => \{ void loadLive\(\); void refresh\(\); \},15000\)/);
  assert.match(live, /setInterval\(\(\) => void loadLive\(\),60000\)/);
});

test('P21.2 correction cards expose only one status-frequency-importance control set', () => {
  const live = sliceBetween(app, 'function LiveSession(', 'function LiveClassView(');
  assert.doesNotMatch(live, /correction-detail/);
  assert.match(live, /correction-quick/);
});


test('P21.3 setup progressively hides known values and asks only for missing context', () => {
  const setup = sliceBetween(app, 'function ClassSetupStage(', 'function ClassPreparationStage(');
  assert.match(setup, /editKnown/);
  assert.match(setup, /const showClassFields=editKnown \|\| classMissing/);
  assert.ok(setup.includes('showContextFields=editKnown || !roleValue || !levelValue'));
  assert.match(setup, /CYA ya tiene los datos necesarios para preparar esta clase/);
  assert.match(setup, /Completa únicamente los datos pendientes/);
  assert.match(setup, /Todo listo · Preparar clase/);
  assert.match(setup, /Se decidirá al terminar/);
});

test('P21.3 manual class draft explains canonical reuse instead of re-asking everything', () => {
  const draft = sliceBetween(app, 'function ManualClassDraft(', 'function ClassSetupStage(');
  assert.match(draft, /CYA reutilizará fecha, duración y el contexto de baile que ya conozca/);
  assert.doesNotMatch(draft, /Después confirmarás fecha, duración, estilo, rol, nivel, lugar y bono/);
});

test('P21.4 reopening a class requires two contextual confirmations before the RPC', () => {
  const reopen = sliceBetween(app, 'async function reopenClass(id: number) {', 'function goTarget(');
  assert.equal((reopen.match(/window\.confirm/g) || []).length, 2);
  assert.match(reopen, /targetLabel/);
  assert.match(reopen, /consumos, regularizaciones, transferencias, suplementos y pagos/);
  assert.match(reopen, /Confirmación final: reabrir/);
  const secondConfirmation = reopen.indexOf('Confirmación final: reabrir');
  const rpc = reopen.indexOf('reopen_administratively_finished_class');
  assert.ok(secondConfirmation > 0 && rpc > secondConfirmation);
});
