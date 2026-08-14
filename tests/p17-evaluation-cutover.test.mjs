import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page=fs.readFileSync('app/page.tsx','utf8');
const router=fs.readFileSync('app/app-entry-router.tsx','utf8');
const cya=fs.readFileSync('app/cya-app.tsx','utf8');
const post=fs.readFileSync('app/evaluation-post-class.tsx','utf8');
const panel=fs.readFileSync('app/context-evaluation-panel.tsx','utf8');
const student=fs.readFileSync('app/student-detail.tsx','utf8');
const sql=fs.readFileSync('supabase/v53_p0e_optional_evaluation_baseline.sql','utf8');

function sqlFunctionBody(name){
  const start=sql.indexOf(`create or replace function ${name}`);
  assert.notEqual(start,-1,`${name} must exist`);
  const end=sql.indexOf('$$;',start);
  assert.notEqual(end,-1,`${name} must have a closing SQL body delimiter`);
  return sql.slice(start,end+3);
}

test('P0E removes evaluation gates from the application root',()=>{
  assert.doesNotMatch(page,/InitialEvaluationClassGate|EvaluationPostClassGate|EvaluationPostClassPreparer/);
  assert.match(page,/return <AppEntryRouter \/>/);
  assert.match(router,/return <CyaApp \/>/);
  assert.doesNotMatch(router,/InitialEvaluationClassGate|EvaluationPostClassGate|EvaluationPostClassPreparer/);
});

test('P0E exposes one contextual evaluation engine in class and student profile',()=>{
  assert.match(cya,/ContextEvaluationPanel/);
  assert.match(cya,/Evaluación<\/button>/);
  assert.match(cya,/liveTab==='evaluation'/);
  assert.match(student,/ContextEvaluationPanel/);
  assert.match(panel,/start_context_evaluation/);
  assert.match(panel,/review_context_evaluation_question/);
  assert.match(panel,/complete_context_evaluation/);
});

test('P0E derives baseline from first complete valid evaluation regardless kind',()=>{
  const baselineFunction=sqlFunctionBody('private.first_valid_evaluation_session_id(');
  assert.match(baselineFunction,/private\.evaluation_session_is_valid\(s\.id\)/);
  assert.match(baselineFunction,/order by s\.completed_at asc nulls last,s\.created_at asc,s\.id asc/);
  assert.doesNotMatch(baselineFunction,/evaluation_kind\s*=\s*'initial'/);
  assert.doesNotMatch(baselineFunction,/evaluation_kind\s+in\s*\([^)]*'initial'/);
  assert.match(sql,/No exige baseline previa: esta revisión puede ser la primera evaluación válida/);
});

test('P0E scopes post-class review to the selected class and only class-kind review gates close',()=>{
  assert.match(post,/classId: number/);
  assert.match(post,/\.eq\("id",classId\)/);
  assert.match(sql,/s\.evaluation_kind='class'/);
  assert.match(sql,/La revisión posterior de esta clase todavía no está completa/);
});

test('P0E keeps the guided five-value scale and no raw numeric legacy writer',()=>{
  assert.match(panel,/\[0,25,50,75,100\]/);
  assert.doesNotMatch(panel,/save_evaluation_score|save_class_evaluation/);
});

test('P0E preserves drafts and does not delete or retype historical evaluations',()=>{
  assert.match(sql,/s\.status='draft'/);
  assert.doesNotMatch(sql,/delete\s+from\s+public\.evaluation_sessions/i);
  assert.doesNotMatch(sql,/update\s+public\.evaluation_sessions[\s\S]{0,500}evaluation_kind\s*=/i);
});
