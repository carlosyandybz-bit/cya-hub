import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/v51_p23_teaching_graph_contract.sql','utf8');
const graph = fs.readFileSync('app/teaching-graph.tsx','utf8');
const app = fs.readFileSync('app/cya-app.tsx','utf8');

test('P23 keeps one canonical teaching graph instead of a parallel sequence table', () => {
  assert.ok(migration.includes('teaching_content_relations'));
  assert.ok(migration.includes("relation_type='sequence_item'"));
  assert.equal(migration.includes('create table public.teaching_sequence_items'), false);
});

test('Necesita pareja exists only for exercises and class events enforce it', () => {
  assert.ok(migration.includes('requires_partner boolean not null default false'));
  assert.ok(migration.includes("check (not requires_partner or content_type='exercise')"));
  assert.ok(migration.includes('set_teaching_exercise_partner_requirement'));
  assert.ok(migration.includes('Necesita pareja solo existe para Ejercicios.'));
  assert.ok(migration.includes("p_event_type in ('exercise_active','exercise_completed') and v_requires_partner"));
  assert.ok(migration.includes('Este ejercicio necesita pareja.'));
});

test('counterpart is a unique Leader/Follower explanation pair in the same context', () => {
  assert.ok(migration.includes("new.relation_type='counterpart'"));
  assert.ok(migration.includes("v_source_type<>'explanation' or v_target_type<>'explanation'"));
  assert.ok(migration.includes('v_source_roles[1]=v_target_roles[1]'));
  assert.ok(migration.includes('v_source_styles is distinct from v_target_styles'));
  assert.ok(migration.includes('v_source_levels is distinct from v_target_levels'));
  assert.ok(migration.includes('Cada explicación solo puede tener una homóloga directa.'));
});

test('sequence steps are flat, uniquely positioned and atomically reorderable', () => {
  assert.ok(migration.includes('teaching_content_relations_sequence_position_uidx'));
  assert.ok(migration.includes("if v_target_type='sequence'"));
  assert.ok(migration.includes('Una secuencia no puede contener otra secuencia como paso.'));
  assert.ok(migration.includes('reorder_teaching_sequence'));
  assert.ok(migration.includes('v_temp_base'));
  assert.ok(migration.includes('position=v_i*10'));
});

test('graph relations cannot create prerequisite or sequence cycles', () => {
  assert.ok(migration.includes("new.relation_type in ('prerequisite','sequence_item')"));
  assert.ok(migration.includes('with recursive walk(content_id)'));
  assert.ok(migration.includes('La relación crearía un ciclo en el mapa de enseñanza.'));
});

test('media remains a separate domain and never becomes a graph node implicitly', () => {
  assert.equal(migration.includes('insert into public.teaching_content_media'), false);
  assert.equal(migration.includes('update public.teaching_content_media'), false);
  assert.ok(graph.includes('contents: GraphContent[]; relations: GraphRelation[]'));
  assert.ok(graph.includes('teaching_content_media'));
});

test('existing graph already provides the core touch navigation that P23 must preserve', () => {
  for (const token of ['panOnDrag','zoomOnPinch','zoomOnScroll','fitView','MiniMap','Resetear','Centrar','Anterior','Filtrar estilo','Filtrar rol','Filtrar nivel','Filtrar tipo','Buscar nodo']) {
    assert.ok(graph.includes(token), `missing graph interaction: ${token}`);
  }
  assert.ok(app.includes('<TeachingGraph contents={contents} relations={relations} terms={terms} />'));
});
