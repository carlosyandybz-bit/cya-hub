import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const detail=fs.readFileSync('app/student-detail.tsx','utf8');
const panel=fs.readFileSync('app/context-evaluation-panel-p0f.tsx','utf8');
const sql=fs.readFileSync('supabase/v34-evaluation-sessions.sql','utf8');
const currentSql=fs.readFileSync('db/migrations/v54_p0f_live_class_milestones.sql','utf8');

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
  assert.match(panel,/taxonomy==="evaluation_scale"/);
  assert.match(panel,/\[0,25,50,75,100\]\.includes\(score\)/);
  assert.match(panel,/review_context_evaluation_question/);
  assert.match(detail,/evaluationScale/);
});

test('class evaluation asks for evaluated level first and keeps style and role from class',()=>{
  assert.match(app,/styleTermId=\{item\.style_term_id\}/);
  assert.match(app,/roleTermId=\{participant\.role_term_id\}/);
  assert.match(app,/levelTermId=\{participant\.level_term_id\}/);
  assert.match(panel,/p_level_term_id:activeLevelId/);
  assert.match(panel,/selectedLevelId/);
  assert.match(panel,/start_context_evaluation/);
  assert.match(sql,/El estilo no coincide con esta clase/);
  assert.match(sql,/El rol no coincide con esta clase/);
});

test('aptitudes support level now and optional future style or role restrictions without inventing them',()=>{
  assert.match(sql,/a\.metadata \? 'levels'/);
  assert.match(sql,/a\.metadata \? 'styles'/);
  assert.match(sql,/a\.metadata \? 'roles'/);
  assert.match(panel,/metadataAllows\(term,"styles",styleKey\)/);
  assert.match(panel,/metadataAllows\(term,"roles",roleKey\)/);
  assert.match(panel,/metadataAllows\(term,"levels",levelKey\)/);
});

test('manual and reevaluation flows use one contextual engine in class and student detail',()=>{
  assert.match(detail,/ContextEvaluationPanel/);
  assert.match(panel,/baseline\?"reevaluation":"manual"/);
  assert.match(panel,/start_context_evaluation/);
  assert.match(panel,/review_context_evaluation_(?:question|milestone|no_change)/);
  assert.match(panel,/complete_context_evaluation/);
  assert.doesNotMatch(detail,/start_student_evaluation|save_evaluation_score|complete_evaluation_session/);
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
  assert.match(panel,/channel\(`context-evaluation-\$\{session\.id\}`\)/);
  assert.match(panel,/table:"student_evaluations"/);
  assert.match(panel,/table:"student_aptitude_progress"/);
  assert.match(currentSql,/complete_context_evaluation/);
});

test('new evaluation grouping is included in backup domains',()=>{
  assert.match(sql,/when 'classes'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'teaching'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'complete'.*evaluation_sessions.*student_evaluations/s);
});

test('Point 13 may replace the radar while Point 12 history remains intact',()=>{
  assert.match(detail,/import \{ EvaluationRadar \} from "\.\/evaluation-radar"/);
  assert.match(detail,/Historial/);
  assert.match(detail,/Evaluaciones registradas/);
});
