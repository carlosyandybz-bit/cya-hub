import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app/cya-app.tsx','utf8');
const card=fs.readFileSync('app/teaching-content-card.tsx','utf8');
const css=fs.readFileSync('app/teaching-content-card.module.css','utf8');
const compact=fs.readFileSync('app/p0g-compact-ui.css','utf8');
const migration=fs.readFileSync('db/migrations/v57_p0g_compact_correction_create.sql','utf8');

test('P0G crea corrección con F/I/observación antes de añadir',()=>{
  assert.match(app,/create_class_correction_compact/);
  assert.match(app,/Frecuencia inicial/);
  assert.match(app,/Influencia inicial/);
  assert.match(app,/Visibilidad de la observación inicial/);
  assert.match(app,/p_observation_visibility:quickObservationVisibility/);
  assert.doesNotMatch(app,/Pendiente de corrección<\/strong> por defecto\. Frecuencia e Influencia quedan disponibles sin valor/);
});

test('P0G no muestra Medir u Observación como segunda tarea en la tarjeta contraída',()=>{
  assert.match(app,/renderCorrectionSummary/);
  assert.match(app,/detailControls=\{<div className="p0g-detail-controls"/);
  assert.doesNotMatch(card,/Ver todo/);
  assert.doesNotMatch(card,/visualPlaceholder/);
  assert.match(card,/detailControls\?: ReactNode/);
  assert.match(css,/min-height:54px/);
  assert.doesNotMatch(css,/grid-template-columns:118px/);
  assert.doesNotMatch(css,/grid-template-columns:138px/);
});

test('P0G conserva NULL y estado Pendiente automático',()=>{
  assert.match(app,/setQuickFrequency\(null\)/);
  assert.match(app,/setQuickInfluence\(null\)/);
  assert.match(app,/value=\{quickFrequency\?\?''\}/);
  assert.match(app,/value=\{quickInfluence\?\?''\}/);
  assert.match(migration,/public\.create_class_correction\([\s\S]*p_frequency,[\s\S]*p_importance/);
  assert.doesNotMatch(migration,/coalesce\(p_frequency,\s*0\)/i);
  assert.doesNotMatch(migration,/coalesce\(p_importance,\s*0\)/i);
});

test('P0G usa Influencia visible y una capa cromática compacta',()=>{
  assert.doesNotMatch(app,/importance: "Importancia"/);
  assert.match(compact,/--cya-teaching:#149e99/);
  assert.match(compact,/--cya-marketing:#7a3f68/);
  assert.match(compact,/\.btn\{color:var\(--cya-on-accent\)\}/);
  assert.match(compact,/p0g-metric/);
});

test('P0G RPC es transaccional y observación es opcional',()=>{
  assert.match(migration,/begin;/);
  assert.match(migration,/perform public\.upsert_class_content_note/);
  assert.match(migration,/if v_observation is not null then/);
  assert.match(migration,/grant execute .* to authenticated/);
  assert.match(migration,/commit;/);
});
