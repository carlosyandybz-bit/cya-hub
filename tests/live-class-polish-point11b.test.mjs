import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('app/cya-app.tsx','utf8');
const css = fs.readFileSync('app/globals.css','utf8');
const card = fs.readFileSync('app/teaching-content-card.tsx','utf8');
const cardCss = fs.readFileSync('app/teaching-content-card.module.css','utf8');
const migration = fs.readFileSync('supabase/v33-live-class-polish-permissions.sql','utf8');
const liveStart = app.indexOf('function LiveSession(');
const liveEnd = app.indexOf('\nfunction LiveClassView(', liveStart);
const live = app.slice(liveStart, liveEnd);

test('live class keeps one creation route and removes the redundant correction creator', () => {
  assert.equal(live.includes('Nueva corrección'), false);
  assert.ok(live.includes('<option value="correction">Corrección</option>'));
  assert.equal([...live.matchAll(/create_class_correction/g)].length, 1);
});

test('live correction cards expose state frequency and importance while collapsed', () => {
  assert.ok(live.includes('quickControls={<div className="live-card-quick correction-quick">'));
  assert.ok(live.includes('aria-label={`Estado de ${assignment.teaching_contents.title}`}'));
  assert.ok(live.includes('aria-label={`Frecuencia de ${assignment.teaching_contents.title}`}'));
  assert.ok(live.includes('aria-label={`Importancia de ${assignment.teaching_contents.title}`}'));
  assert.ok(live.includes('live-priority-high'));
  assert.ok(live.includes('live-priority-medium'));
  assert.ok(live.includes('live-priority-low'));
});

test('live context tab reuses preparation data and student requests', () => {
  assert.ok(live.includes('liveTab===\'context\''));
  assert.ok(live.includes('student_profiles'));
  assert.ok(live.includes('class_preparation_requests'));
  assert.ok(live.includes('Contexto pedagógico'));
  assert.ok(live.includes('Decisiones del alumno'));
  assert.ok(live.includes('Añadir a esta clase'));
});

test('next content suggestion respects prerequisite relations and context', () => {
  assert.ok(live.includes("relation.relation_type==='prerequisite'"));
  assert.ok(live.includes('prerequisites.every((relation) => explainedIds.has(relation.target_content_id))'));
  assert.ok(live.includes('contentFitsContext(content,item.style_term_id'));
  assert.ok(live.includes('Siguiente por mapa'));
});

test('student avatar uses a simple user glyph instead of nested circles', () => {
  assert.ok(live.includes('<span className="avatar live-student-avatar"><UserRound/></span>'));
});

test('search results carry semantic kind and visual styling', () => {
  assert.ok(live.includes('data-kind={type}'));
  for (const type of ['correction','explanation','exercise','sequence']) {
    assert.ok(css.includes(`.unified-result[data-kind='${type}']`));
  }
});

test('TeachingContentCard supports chromatic kinds and collapsed quick controls', () => {
  assert.ok(card.includes('quickControls?: ReactNode'));
  assert.ok(card.includes('kindTone?: "correction" | "explanation" | "exercise" | "sequence"'));
  assert.ok(card.includes('className={styles.quickControls}'));
  assert.ok(cardCss.includes('.correction{'));
  assert.ok(cardCss.includes('.explanation{'));
  assert.ok(cardCss.includes('.quickControls{'));
});

test('negative balance helper is executable only by trusted application roles', () => {
  assert.ok(migration.includes('revoke all on function private.upsert_negative_balance_incident'));
  assert.ok(migration.includes('from anon'));
  assert.ok(migration.includes('to authenticated'));
  assert.ok(migration.includes('to service_role'));
});
