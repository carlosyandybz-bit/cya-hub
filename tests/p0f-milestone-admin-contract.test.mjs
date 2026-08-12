import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const admin = fs.readFileSync('app/p0f-evaluation-admin.tsx', 'utf8');
const migration = fs.readFileSync('db/migrations/v56_p0f_milestone_admin_contract.sql', 'utf8');

test('P0F milestone thresholds accept the full 0..100 contract without mobile number steppers', () => {
  assert.match(admin, /puntuación de hito entre 0 y 100/);
  assert.match(admin, /threshold\.trim\(\)/);
  assert.match(admin, /score<0\|\|score>100/);
  assert.match(admin, /inputMode="numeric"/);
  assert.doesNotMatch(admin, /type="number"/);
  assert.match(migration, /threshold_score >= 0 and threshold_score <= 100/);
});

test('P0F milestone administration supports editing without changing stable milestone keys', () => {
  assert.match(admin, /function startMilestoneEdit/);
  assert.match(admin, /function saveMilestoneEdit/);
  assert.match(admin, /update\(\{label:editLabel\.trim\(\),threshold_score:score,sort_order:score,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
  const editBlock = admin.slice(admin.indexOf('async function saveMilestoneEdit'), admin.indexOf('async function toggleMilestoneActive'));
  assert.doesNotMatch(editBlock, /milestone_key/);
  assert.match(admin, /Editar \$\{row\.label\}/);
});

test('P0F milestones can be activated and deactivated without deletion', () => {
  assert.match(admin, /async function toggleMilestoneActive/);
  assert.match(admin, /update\(\{active:!row\.active,updated_at:new Date\(\)\.toISOString\(\)\}\)/);
  assert.match(admin, /Desactivar \$\{row\.label\}/);
  assert.match(admin, /Activar \$\{row\.label\}/);
  assert.match(admin, /row\.active\?"Activo":"Inactivo"/);
});

test('P0F keeps unique context thresholds delegated to the existing database constraint', () => {
  assert.doesNotMatch(migration, /drop index.*evaluation_milestones_context_threshold_uidx/i);
  assert.doesNotMatch(migration, /delete from public\.evaluation_milestones/i);
  assert.doesNotMatch(migration, /update public\.student_aptitude_progress/i);
});
