import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/page.tsx','utf8');
const cya=fs.readFileSync('app/cya-app.tsx','utf8');
const panel=fs.readFileSync('app/context-evaluation-panel.tsx','utf8');
const sql=fs.readFileSync('supabase/v53_p0e_optional_evaluation_baseline.sql','utf8');

test('evaluation is contextual, student-owned and non-global',()=>{
  assert.doesNotMatch(page,/Evaluation.*Gate/);
  assert.match(cya,/liveTab==='evaluation'/);
  assert.match(cya,/La evaluación es siempre la misma evaluación del alumno/);
  assert.match(cya,/nunca bloquea el cierre de esta clase/);
});

test('baseline is derived and not a mandatory initial kind',()=>{
  assert.match(sql,/first_valid_evaluation_session_id/);
  assert.match(sql,/p_evaluation_kind text default 'manual'/);
  assert.match(sql,/No exige baseline previa/);
});

test('optional evaluation does not become a close gate',()=>{
  assert.match(sql,/s\.evaluation_kind='class'/);
  assert.doesNotMatch(sql,/s\.evaluation_kind='initial'[\s\S]{0,500}raise exception/);
});

test('manual work and compatible recommendations remain independent of baseline',()=>{
  assert.match(panel,/No bloquea la clase ni el trabajo manual/);
  assert.match(cya,/const suggestedNext=/);
});
