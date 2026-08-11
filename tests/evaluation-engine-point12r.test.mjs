import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const v35=fs.readFileSync('supabase/v35-evaluation-engine-rebuild.sql','utf8');
const v36=fs.readFileSync('supabase/v36-evaluation-engine-defaults.sql','utf8');
const v37=fs.readFileSync('supabase/v37-evaluation-engine-hardening.sql','utf8');
const cya=fs.readFileSync('app/cya-app.tsx','utf8');
const engine=fs.readFileSync('app/evaluation-engine.tsx','utf8');
const admin=fs.readFileSync('app/evaluation-admin.tsx','utf8');
const student=fs.readFileSync('app/student-detail.tsx','utf8');

test('Desde cero is a real configurable level but Bachazouk starts at Inicio',()=>{
  assert.match(v35,/term_key,label,metadata,sort_order,active\)\s*select 'dance_level','desde_cero','Desde cero'/);
  assert.match(v35,/not \(s\.term_key='bachazouk' and l\.term_key='desde_cero'\)/);
  assert.match(v37,/l\.term_key='desde_cero'/);
});

test('evaluation is driven by configurable questions, answers and milestones rather than sums',()=>{
  assert.match(v35,/create table if not exists public\.evaluation_milestones/);
  assert.match(v35,/create table if not exists public\.evaluation_questions/);
  assert.match(v35,/create table if not exists public\.evaluation_question_options/);
  assert.match(v35,/score smallint not null check\(score between 0 and 100\)/);
  assert.match(v35,/drop constraint if exists student_evaluations_score_check/);
  assert.doesNotMatch(engine,/\[0,25,50,75,100\]/);
});

test('first evaluation is a guided questionnaire and later class review is an editable table',()=>{
  assert.match(engine,/data-evaluation-mode="diagnostic"/);
  assert.match(engine,/Pregunta \{index\+1\} de \{questions\.length\}/);
  assert.match(engine,/data-evaluation-mode="review"/);
  assert.match(engine,/Revisión después de clase/);
  assert.match(engine,/Sin cambios/);
  assert.match(cya,/InitialEvaluationQuiz/);
  assert.match(cya,/ClassEvaluationClose/);
});

test('Bachata evaluation completes before Bachazouk branch is resolved',()=>{
  const complete=engine.indexOf('complete_evaluation_v3');
  const prompt=engine.indexOf('setShowComplement(true)');
  assert.ok(complete>=0 && prompt>complete);
  assert.match(engine,/Sí, sabe Bachazouk/);
  assert.match(engine,/No sabe, pero quiere aprender/);
  assert.match(v36,/wants_to_learn/);
});

test('Bachata and Bachazouk share class search while keeping independent evaluation',()=>{
  assert.match(v35,/dance_style_relations/);
  assert.match(v35,/share_class_content boolean not null default true/);
  assert.match(v35,/independent_evaluation boolean not null default true/);
  assert.match(v35,/with allowed_styles as/);
  assert.match(v36,/class_evaluation_requirements/);
});

test('only explanations can be mandatory and derivation follows prerequisite chain across styles',()=>{
  assert.match(v35,/create table if not exists public\.required_level_explanations/);
  assert.match(v35,/mark_explanation_learned_by_derivation/);
  assert.match(v35,/with recursive path\(content_id\)/);
  assert.match(v35,/r\.relation_type in \('prerequisite','required_before'\)/);
  assert.match(admin,/Solo las explicaciones pueden ser obligatorias/);
});

test('promotion is >= 50 percent plus all mandatory explanations and still needs teacher decision',()=>{
  assert.match(v35,/scores\.earned\*2>=scores\.possible/);
  assert.match(v35,/req\.total=req\.done/);
  assert.match(v35,/promote_student_level/);
  assert.match(v35,/decision in \('promoted','kept'\)/);
});

test('historical answers snapshot wording and scores so later admin changes do not rewrite the past',()=>{
  assert.match(v35,/question_snapshot text not null/);
  assert.match(v35,/answer_snapshot text not null/);
  assert.match(v35,/milestone_snapshot text not null/);
  assert.match(v35,/score_snapshot smallint not null/);
});

test('evaluation configuration is editable in Administration and config writes are admin-only',()=>{
  assert.match(admin,/Motor de evaluación/);
  assert.match(admin,/Hitos y preguntas/);
  assert.match(admin,/Explicaciones obligatorias/);
  assert.match(v37,/private\.is_admin\(\)/);
});

test('student master no longer exposes the old five-number manual evaluation editor',()=>{
  assert.match(student,/InitialEvaluationQuiz/);
  assert.doesNotMatch(student,/Elige uno de los cinco niveles por parámetro/);
});

test('class close is blocked until evaluation requirements are confirmed',()=>{
  assert.match(v35,/select count\(\*\) into missing_count from public\.class_evaluation_requirements/);
  assert.match(v35,/Revisa la evaluación de cada alumno antes de cerrar la clase/);
  assert.match(v37,/evaluation_review_confirmations/);
});
