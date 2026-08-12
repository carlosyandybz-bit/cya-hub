import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('app/cya-app.tsx', 'utf8');
const liveStart = source.indexOf('function LiveSession(');
const liveEnd = source.indexOf('\nfunction LiveClassView(', liveStart);
const live = source.slice(liveStart, liveEnd);

test('live session deduplicates assignments per student and content', () => {
  assert.ok(live.includes('candidate.person_id===assignment.person_id && candidate.content_id===assignment.content_id'));
});

test('corrections have one creation path inside unified live search', () => {
  assert.equal(live.includes('<summary><Plus/> Nueva corrección</summary>'), false);
  assert.ok(live.includes('<option value="correction">Corrección</option>'));
  assert.equal((live.match(/create_class_correction/g) ?? []).length, 1);
  assert.equal(live.includes('Corrección rápida añadida al alumno.'), false);
});

test('correction card exposes one compact status and measurement control set without duplicate status label', () => {
  assert.equal(live.includes('subtitle={`${correctionStateLabel(assignment.assignment_status)}'), false);
  assert.ok(live.includes('statusLabel={null}'));
  assert.ok(live.includes('className="p0f-status-chip"'));
  assert.ok(live.includes('aria-label={`Frecuencia de ${assignment.teaching_contents.title}`}'));
  assert.ok(live.includes('aria-label={`Influencia de ${assignment.teaching_contents.title}`}'));
  assert.ok(live.includes('<summary>+ Medir</summary>'));
});

test('live session has only the sticky administrative action', () => {
  assert.equal(live.includes('className={`live-bottom'), false);
  const finishActions = [...live.matchAll(/onClick=\{\(\) => setFinishOpen\(true\)\}/g)].length;
  assert.equal(finishActions, 1);
});

test('student context omits portal/provisional status noise', () => {
  assert.equal(live.includes('Con acceso al portal'), false);
  assert.equal(live.includes('Provisional · trabaja igual que cualquier alumno'), false);
});
