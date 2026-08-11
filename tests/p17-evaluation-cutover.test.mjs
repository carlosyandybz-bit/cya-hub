import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/page.tsx','utf8');
const css=fs.readFileSync('app/evaluation-final-model.css','utf8');
const initial=fs.readFileSync('app/evaluation-initial-class.tsx','utf8');
const post=fs.readFileSync('app/evaluation-post-class.tsx','utf8');
const sql=fs.readFileSync('supabase/v43-evaluation-final-cutover.sql','utf8');

test('P17 keeps only the final visible evaluation surfaces',()=>{
  assert.match(page,/InitialEvaluationClassGate/);
  assert.match(page,/EvaluationPostClassGate/);
  assert.match(css,/live-work-tabs > button:nth-child\(3\)/);
  assert.match(css,/live-evaluation/);
  assert.match(css,/display: none !important/);
  assert.match(initial,/start_initial_evaluation/);
  assert.match(initial,/review_evaluation_question/);
  assert.match(initial,/complete_initial_evaluation/);
  assert.match(post,/prepare_post_class_evaluations/);
  assert.match(post,/review_evaluation_question/);
  assert.match(post,/complete_post_class_evaluation/);
});

test('P17 revokes the legacy numeric RPC surface',()=>{
  for(const rpc of [
    'save_class_evaluation',
    'save_class_evaluation_v2',
    'save_evaluation_score',
    'start_student_evaluation',
    'complete_evaluation_session',
    'decide_evaluation_milestone',
  ]) {
    assert.match(sql,new RegExp(`revoke all on function public\\.${rpc}`));
  }
  assert.match(sql,/drop trigger if exists trg_complete_class_evaluation_sessions/);
});

test('P17 never fabricates an initial evaluation after class',()=>{
  assert.match(sql,/Falta la evaluación inicial guiada\. Debe realizarse durante una clase activa/);
  assert.match(sql,/La evaluación inicial no se completó durante la clase/);
  assert.doesNotMatch(sql,/v_kind\s*:=\s*case[\s\S]*'initial'/);
});

test('P17 preserves drafts and requires explicit completion before pedagogy close',()=>{
  assert.match(sql,/La migración NO borra ni autocompleta sesiones existentes/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.evaluation_sessions/i);
  assert.doesNotMatch(sql,/update\s+public\.evaluation_sessions[\s\S]*status\s*=\s*'completed'/i);
  assert.match(sql,/Hay una evaluación de esta clase todavía sin completar/);
  assert.match(sql,/create trigger trg_require_final_evaluation/);
  assert.match(sql,/before update of pedagogy_closed_at/);
});

test('P17 preserves Bachata and Bachazouk dual-review rule',()=>{
  assert.match(sql,/v_class_style_key in \('bachata','bachazouk'\)/);
  assert.match(sql,/v_has_bachata and v_has_bachazouk/);
  assert.match(sql,/completa la revisión de ambos estilos antes del cierre pedagógico/);
});

test('P17 final RPCs remain available to authenticated staff',()=>{
  for(const rpc of [
    'start_initial_evaluation',
    'review_evaluation_question',
    'complete_initial_evaluation',
    'prepare_post_class_evaluation',
    'prepare_post_class_evaluations',
    'complete_post_class_evaluation',
  ]) {
    assert.match(sql,new RegExp(`grant execute on function public\\.${rpc}`));
  }
});