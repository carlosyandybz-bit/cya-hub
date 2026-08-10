import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('app/cya-app.tsx', 'utf8');
const liveStart = source.indexOf('function LiveSession(');
const liveEnd = source.indexOf('\nfunction LiveClassView(', liveStart);
const live = source.slice(liveStart, liveEnd);

test('live session deduplicates assignments per student and content', () => {
  assert.ok(live.includes('rows.findIndex((candidate) => candidate.content_id === assignment.content_id) === index'));
});

test('corrections have one creation path inside live session', () => {
  assert.ok(live.includes('<summary><Plus size={18} /> Nueva corrección</summary>'));
  assert.equal(live.includes('<option value="correction">Corrección</option>'), false);
  assert.equal(live.includes('Corrección rápida añadida al alumno.'), false);
});

test('correction card does not repeat status in subtitle and badge', () => {
  assert.equal(live.includes('subtitle={`${correctionStateLabel(assignment.assignment_status)}'), false);
  assert.ok(live.includes('statusLabel={correctionStateLabel(assignment.assignment_status)}'));
  assert.ok(live.includes('Frec. ${assignment.current_frequency}'));
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
