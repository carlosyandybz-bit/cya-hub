import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const detail=fs.readFileSync('app/student-detail.tsx','utf8');
const css=fs.readFileSync('app/student-detail.module.css','utf8');
const sql=fs.readFileSync('supabase/v34-evaluation-sessions.sql','utf8');
const live=app.slice(app.indexOf('function LiveSession('),app.indexOf('\nfunction LiveClassView(',app.indexOf('function LiveSession(')));

test('evaluation history is grouped into sessions instead of overwriting previous evaluations',()=>{
  assert.match(sql,/create table if not exists public\.evaluation_sessions/);
  assert.match(sql,/alter table public\.student_evaluations add column if not exists session_id/);
  assert.match(sql,/student_evaluations_session_aptitude_uidx/);
  assert.match(sql,/on conflict\(session_id,aptitude_term_id\).*do update/s);
  assert.doesNotMatch(sql,/on conflict\(class_id,person_id,aptitude_term_id\)/);
  assert.match(sql,/where e\.session_id is null/);
});

test('Point 12 preserves the five discrete configured values',()=>{
  assert.match(sql,/p_score not in \(0,25,50,75,100\)/);
  assert.match(live,/taxonomy==='evaluation_scale'/);
  assert.match(live,/\[0,25,50,75,100\]\.includes\(score\)/);
  assert.match(live,/<b>\{score\}<\/b><small>\{term\.label\}<\/small>/);
  assert.match(detail,/evaluationScale/);
});

test('class evaluation asks for evaluated level first and keeps style and role from class',()=>{
  assert.match(live,/1\. Nivel que estás evaluando/);
  assert.match(live,/setEvaluationLevelId/);
  assert.match(live,/save_class_evaluation_v2/);
  assert.match(live,/p_level_term_id:evaluationLevelId/);
  assert.match(live,/Contexto heredado/);
  assert.match(sql,/El estilo no coincide con esta clase/);
  assert.match(sql,/El rol no coincide con esta clase/);
});

test('aptitudes support level now and optional future style or role restrictions without inventing them',()=>{
  assert.match(sql,/a\.metadata \? 'levels'/);
  assert.match(sql,/a\.metadata \? 'styles'/);
  assert.match(sql,/a\.metadata \? 'roles'/);
  assert.match(live,/metadata\.styles/);
  assert.match(live,/metadata\.roles/);
});

test('manual and reevaluation flows use the same session and score RPCs',()=>{
  assert.match(detail,/start_student_evaluation/);
  assert.match(detail,/save_evaluation_score/);
  assert.match(detail,/complete_evaluation_session/);
  assert.match(detail,/<option value="manual">Seguimiento<\/option>/);
  assert.match(detail,/<option value="reevaluation">Reevaluación<\/option>/);
  assert.match(detail,/hasPreviousContextEvaluation\?evaluationKind:'initial'/);
});

test('draft evaluation is private from the student until completed',()=>{
  assert.match(sql,/evaluation_sessions_student_select/);
  assert.match(sql,/status='completed'/);
  assert.match(sql,/student_evaluations_select/);
  assert.match(sql,/s\.status='completed'/);
  assert.match(sql,/trg_complete_class_evaluation_sessions/);
});

test('multiple teachers can collaborate on evaluation sessions and realtime scores',()=>{
  assert.match(sql,/evaluation_sessions_staff_update/);
  assert.match(sql,/using \(\(select private\.is_staff\(\)\)\) with check \(\(select private\.is_staff\(\)\)\)/);
  assert.match(sql,/alter publication supabase_realtime add table public\.student_evaluations/);
  assert.match(live,/table:'student_evaluations'/);
});

test('new evaluation grouping is included in backup domains',()=>{
  assert.match(sql,/when 'classes'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'teaching'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'complete'.*evaluation_sessions.*student_evaluations/s);
});

test('Point 12 does not redesign radar/history ahead of Points 13 and 14',()=>{
  assert.match(detail,/function StudentRadar/);
  assert.match(detail,/Historial/);
  assert.match(css,/\.radar\{/);
});
