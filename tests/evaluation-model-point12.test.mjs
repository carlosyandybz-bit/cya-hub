import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const detail=fs.readFileSync('app/student-detail.tsx','utf8');
const engine=fs.readFileSync('app/evaluation-engine.tsx','utf8');
const sql=fs.readFileSync('supabase/v34-evaluation-sessions.sql','utf8');
const rebuild=fs.readFileSync('supabase/v35-evaluation-engine-rebuild.sql','utf8');
const live=app.slice(app.indexOf('function LiveSession('),app.indexOf('\nfunction LiveClassView(',app.indexOf('function LiveSession(')));

test('evaluation history is grouped into sessions instead of overwriting previous evaluations',()=>{
  assert.match(sql,/create table if not exists public\.evaluation_sessions/);
  assert.match(sql,/alter table public\.student_evaluations add column if not exists session_id/);
  assert.match(sql,/student_evaluations_session_aptitude_uidx/);
  assert.match(sql,/on conflict\(session_id,aptitude_term_id\).*do update/s);
  assert.doesNotMatch(sql,/on conflict\(class_id,person_id,aptitude_term_id\)/);
  assert.match(sql,/where e\.session_id is null/);
  assert.match(rebuild,/create table if not exists public\.evaluation_answers/);
  assert.match(rebuild,/question_snapshot text not null/);
  assert.match(rebuild,/score_snapshot smallint not null/);
});

test('Point 12R replaces the fixed five-value editor with admin-configured milestones',()=>{
  assert.match(rebuild,/evaluation_milestones/);
  assert.match(rebuild,/score smallint not null check\(score between 0 and 100\)/);
  assert.match(rebuild,/drop constraint if exists student_evaluations_score_check/);
  assert.match(engine,/evaluation_question_options/);
  assert.doesNotMatch(engine,/\[0,25,50,75,100\]/);
});

test('class diagnostic keeps explicit level selection plus style and role context',()=>{
  assert.match(engine,/Evaluar en qué nivel/);
  assert.match(engine,/setLevelId/);
  assert.match(engine,/start_evaluation_v3/);
  assert.match(engine,/p_style_term_id:styleId/);
  assert.match(engine,/p_role_term_id:roleId/);
  assert.match(engine,/p_level_term_id:levelId/);
  assert.match(rebuild,/q\.style_term_id<>s\.style_term_id/);
  assert.match(rebuild,/q\.role_term_id<>s\.role_term_id/);
  assert.match(rebuild,/q\.level_term_id<>s\.level_term_id/);
});

test('aptitudes remain contextual by level and the rebuilt model can scope them by style and role directly',()=>{
  assert.match(rebuild,/style_term_id bigint not null references public\.catalog_terms/);
  assert.match(rebuild,/role_term_id bigint not null references public\.catalog_terms/);
  assert.match(rebuild,/level_term_id bigint not null references public\.catalog_terms/);
  assert.match(rebuild,/aptitude_term_id bigint not null references public\.catalog_terms/);
});

test('diagnostic, review and manual changes share the same append-only session model',()=>{
  assert.match(rebuild,/start_evaluation_v3/);
  assert.match(rebuild,/save_evaluation_answer/);
  assert.match(rebuild,/set_evaluation_milestone_manual/);
  assert.match(rebuild,/complete_evaluation_v3/);
  assert.match(engine,/data-evaluation-mode="diagnostic"/);
  assert.match(engine,/data-evaluation-mode="review"/);
});

test('draft evaluation remains private from the student until completed',()=>{
  assert.match(sql,/evaluation_sessions_student_select/);
  assert.match(sql,/status='completed'/);
  assert.match(sql,/student_evaluations_select/);
  assert.match(sql,/s\.status='completed'/);
});

test('multiple teachers can collaborate while evaluation values remain realtime-compatible',()=>{
  assert.match(sql,/evaluation_sessions_staff_update/);
  assert.match(sql,/using \(\(select private\.is_staff\(\)\)\) with check \(\(select private\.is_staff\(\)\)\)/);
  assert.match(sql,/alter publication supabase_realtime add table public\.student_evaluations/);
  assert.match(live,/table:'student_evaluations'/);
});

test('evaluation grouping remains included in backup domains',()=>{
  assert.match(sql,/when 'classes'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'teaching'.*evaluation_sessions.*student_evaluations/s);
  assert.match(sql,/when 'complete'.*evaluation_sessions.*student_evaluations/s);
});

test('radar remains a display while Point 12 history stays intact',()=>{
  assert.match(detail,/import \{ EvaluationRadar \} from "\.\/evaluation-radar"/);
  assert.match(detail,/Historial/);
  assert.match(detail,/Evaluaciones registradas/);
  assert.match(engine,/EvaluationRadar/);
  assert.doesNotMatch(engine,/onChange=\{.*EvaluationRadar/s);
});
