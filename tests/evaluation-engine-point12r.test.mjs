import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const v35=fs.readFileSync('supabase/v35-evaluation-engine-rebuild.sql','utf8');
const v36=fs.readFileSync('supabase/v36-evaluation-engine-defaults.sql','utf8');
const v37=fs.readFileSync('supabase/v37-evaluation-engine-hardening.sql','utf8');
const engine=fs.readFileSync('app/evaluation-engine.tsx','utf8');
const admin=fs.readFileSync('app/evaluation-admin.tsx','utf8');
const cya=fs.readFileSync('app/cya-app.tsx','utf8');
const adminView=fs.readFileSync('app/admin-view.tsx','utf8');
const student=fs.readFileSync('app/student-detail.tsx','utf8');

test('Desde cero is a real configurable level but Bachazouk starts at Inicio',()=>{
  assert.match(v36,/\('dance_level','Desde cero','desde-cero',0/);
  assert.match(v36,/\('dance_level','Inicio','inicio',10/);
  assert.match(v36,/where s\.term_key <> 'bachazouk' or l\.term_key <> 'desde-cero'/);
  assert.match(admin,/Niveles y orden/);
});

test('evaluation is driven by configurable questions, answers and milestones rather than sums',()=>{
  assert.match(v35,/create table if not exists public\.evaluation_milestones/);
  assert.match(v35,/create table if not exists public\.evaluation_questions/);
  assert.match(v35,/create table if not exists public\.evaluation_question_options/);
  assert.match(v35,/milestone_id bigint not null references public\.evaluation_milestones/);
  assert.match(v35,/score smallint not null check \(score between 0 and 100\)/);
  assert.doesNotMatch(v35,/score % 25 = 0/);
  assert.match(v35,/create table if not exists public\.student_evaluation_state/);
});

test('first evaluation is a guided questionnaire and later class review is an editable table',()=>{
  assert.match(engine,/data-evaluation-mode="diagnostic"/);
  assert.match(engine,/Primera evaluación/);
  assert.match(engine,/Pregunta \{index\+1\} de \{questions\.length\}/);
  assert.match(engine,/data-evaluation-mode="review"/);
  assert.match(engine,/Revisión después de clase/);
  assert.match(engine,/Sin cambios/);
  assert.match(cya,/InitialEvaluationQuiz/);
  assert.match(cya,/ClassEvaluationClose/);
});

test('Bachata evaluation completes before Bachazouk branch is resolved',()=>{
  const complete=engine.indexOf('complete_evaluation_v3');
  const decision=engine.indexOf('let shouldAskComplement=false');
  const prompt=engine.indexOf('setShowComplement(shouldAskComplement)');
  assert.ok(complete>=0 && decision>complete && prompt>decision);
  assert.match(engine,/La evaluación de Bachata ya está terminada/);
  assert.match(engine,/Sí, sabe Bachazouk/);
  assert.match(engine,/No sabe, pero quiere aprender/);
  assert.match(v36,/wants_to_learn/);
});

test('Bachata and Bachazouk share class search while keeping independent evaluation',()=>{
  assert.match(v35,/dance_style_relations/);
  assert.match(v35,/share_class_content boolean not null default true/);
  assert.match(v35,/independent_evaluation boolean not null default true/);
  assert.match(v36,/parent\.term_key='bachata'/);
  assert.match(v36,/complement\.term_key='bachazouk'/);
  assert.match(v37,/complement_style_term_id/);
  assert.match(v37,/search_class_teaching_content/);
});

test('only explanations can be mandatory and derivation follows prerequisite chain across styles',()=>{
  assert.match(v35,/create table if not exists public\.mandatory_level_explanations/);
  assert.match(v35,/content_type <> 'explanation'/);
  assert.match(v35,/with recursive required_path/);
  assert.match(v35,/relation_type='prerequisite'/);
  assert.match(v35,/learned_by_derivation/);
});

test('promotion is >= 50 percent plus all mandatory explanations and still needs teacher decision',()=>{
  assert.match(v35,/score_ratio >= 0\.5/);
  assert.match(v35,/mandatory_total = mandatory_done/);
  assert.match(v35,/request_level_promotion/);
  assert.match(v35,/decide_level_promotion/);
  assert.match(v35,/approved boolean not null/);
});

test('historical answers snapshot wording and scores so later admin changes do not rewrite the past',()=>{
  assert.match(v35,/question_prompt_snapshot text not null/);
  assert.match(v35,/option_label_snapshot text not null/);
  assert.match(v35,/milestone_label_snapshot text not null/);
  assert.match(v35,/score_snapshot smallint not null/);
});

test('evaluation configuration is editable in Administration and config writes are admin-only',()=>{
  assert.match(adminView,/EvaluationAdminEditor/);
  assert.match(admin,/Hitos/);
  assert.match(admin,/Preguntas/);
  assert.match(admin,/Contenido obligatorio/);
  assert.match(v37,/is_admin/);
});

test('student master no longer exposes the old five-number manual evaluation editor',()=>{
  assert.doesNotMatch(student,/evaluationScores/);
  assert.doesNotMatch(student,/Guardar evaluación/);
  assert.doesNotMatch(student,/Nueva evaluación/);
});

test('class close is blocked until evaluation requirements are confirmed',()=>{
  assert.match(v35,/class_evaluation_requirements/);
  assert.match(v35,/confirm_evaluation_review/);
  assert.match(v37,/Cierra primero la evaluación obligatoria/);
});
