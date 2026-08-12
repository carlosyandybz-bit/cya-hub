import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const sql = fs.readFileSync('supabase/v32-live-class-context-search.sql','utf8');
const liveStart = app.indexOf('function LiveSession(');
const liveEnd = app.indexOf('\nfunction LiveClassView(', liveStart);
const live = app.slice(liveStart, liveEnd);

test('live search is contextual, global across teaching types and server validated', () => {
  assert.match(live,/search_class_teaching_content/);
  assert.match(live,/p_class_id:item\.id/);
  assert.match(live,/p_person_id:searchPersonId/);
  assert.match(live,/p_content_type:null/);
  assert.match(live,/window\.setTimeout\(async \(\) =>/);
  assert.doesNotMatch(live,/const unifiedLibrary=/);
  assert.doesNotMatch(live,/const matchesSearch=/);
});

test('all four teaching types use one quick creation area', () => {
  assert.match(live,/<option value="correction">Corrección<\/option>/);
  assert.match(live,/<option value="explanation">Contenido<\/option>/);
  assert.match(live,/<option value="exercise">Ejercicio<\/option>/);
  assert.match(live,/<option value="sequence">Secuencia<\/option>/);
  assert.equal((live.match(/create_class_correction/g) ?? []).length,1);
  assert.doesNotMatch(live,/<summary><Plus\/> Nueva corrección<\/summary>/);
});

test('assigned content gets current type-specific quick actions without duplicate assignment', () => {
  assert.match(live,/type==='correction' && assignment \? <select className="p0f-status-chip"/);
  assert.match(live,/>Explicada<\/button>/);
  assert.match(live,/>Repasar<\/button>/);
  assert.match(live,/exercise_completed/);
  assert.match(live,/>Realizado<\/button>/);
  assert.match(live,/personAssignments\.find\(\(row\) => row\.content_id===result\.content_id\)/);
  assert.doesNotMatch(live,/Ha reaparecido/);
  assert.doesNotMatch(live,/>Mejorado<\/button>/);
});

test('search RPC validates staff, class participant and exact dance context', () => {
  assert.match(sql,/private\.is_staff\(\)/);
  assert.match(sql,/cp\.person_id=p_person_id/);
  assert.match(sql,/c\.status='active'/);
  assert.match(sql,/s\.style_term_id=v_style_id/);
  assert.match(sql,/r\.role_term_id=v_role_id/);
  assert.match(sql,/l\.level_term_id=v_level_id/);
  assert.match(sql,/t\.active/);
  assert.match(sql,/p_content_type is null or t\.content_type=p_content_type/);
});

test('search RPC returns content only and uses current student merely for ranking', () => {
  const returns = sql.slice(sql.indexOf('returns table('),sql.indexOf('language plpgsql'));
  assert.doesNotMatch(returns,/person_id/);
  assert.doesNotMatch(returns,/assignment_id/);
  assert.match(sql,/a\.person_id=p_person_id and a\.content_id=t\.id/);
  assert.match(sql,/e\.class_id=p_class_id and e\.person_id=p_person_id/);
});

test('search has bounded input and result size and no wildcard expansion', () => {
  assert.match(sql,/length\(coalesce\(p_query,''\)\) > 120/);
  assert.match(sql,/least\(coalesce\(p_limit,30\),50\)/);
  assert.match(sql,/strpos\(lower\(t\.title\),v_query\)>0/);
  assert.doesNotMatch(sql,/ilike/);
  assert.match(sql,/revoke all on function public\.search_class_teaching_content/);
  assert.match(sql,/grant execute on function public\.search_class_teaching_content.*authenticated/);
});
