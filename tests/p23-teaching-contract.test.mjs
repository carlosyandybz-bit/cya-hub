import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/v51_p23_teaching_graph_contract.sql','utf8');
const graph = fs.readFileSync('app/teaching-graph.tsx','utf8');
const app = fs.readFileSync('app/cya-app.tsx','utf8');
const styles = fs.readFileSync('app/p23-teaching.css','utf8');
const buildInfo = fs.readFileSync('app/api/build-info/route.ts','utf8');

test('P23 keeps an explicit no-store ready runtime marker compatible with later packages', () => {
  assert.match(buildInfo, /release:\s*"p\d+[a-z0-9-]*-ready"/i);
  assert.ok(buildInfo.includes('cache-control'));
  assert.ok(buildInfo.includes('no-store'));
});

test('P23 keeps one canonical teaching graph instead of a parallel sequence table', () => {
  assert.ok(migration.includes('teaching_content_relations'));
  assert.ok(migration.includes("relation_type='sequence_item'"));
  assert.equal(migration.includes('create table public.teaching_sequence_items'), false);
});

test('Necesita pareja exists only for exercises and is wired through editor and class UX', () => {
  assert.ok(migration.includes('requires_partner boolean not null default false'));
  assert.ok(migration.includes("check (not requires_partner or content_type='exercise')"));
  assert.ok(migration.includes('set_teaching_exercise_partner_requirement'));
  assert.ok(migration.includes("p_event_type in ('exercise_active','exercise_completed') and v_requires_partner"));
  assert.ok(app.includes('requires_partner: boolean'));
  assert.ok(app.includes('teaching-partner-toggle'));
  assert.ok(app.includes('set_teaching_exercise_partner_requirement'));
  assert.ok(app.includes("content.requires_partner && item.class_participants.length<2"));
  assert.ok(app.includes("notify('Este ejercicio necesita pareja.')"));
  assert.ok(app.includes('partner-badge'));
  assert.ok(styles.includes('.teaching-partner-toggle'));
});

test('counterpart is a unique Leader/Follower explanation pair in the same context', () => {
  assert.ok(migration.includes("new.relation_type='counterpart'"));
  assert.ok(migration.includes("v_source_type<>'explanation' or v_target_type<>'explanation'"));
  assert.ok(migration.includes('v_source_roles[1]=v_target_roles[1]'));
  assert.ok(migration.includes('v_source_styles[1]=v_target_styles[1]'));
  assert.ok(migration.includes('v_source_levels[1]=v_target_levels[1]'));
  assert.ok(migration.includes('v_counterparts<>1'));
});

test('sequence steps are flat, contextual, uniquely positioned and touch-reorderable', () => {
  assert.ok(migration.includes("relation_type='sequence_item'"));
  assert.ok(migration.includes("relation_type='sequence_item' and relation_position is null"));
  assert.ok(migration.includes('teaching_content_relations_sequence_position_uidx'));
  assert.ok(migration.includes('set_teaching_sequence_steps'));
  assert.ok(graph.includes('PointerEvent'));
  assert.ok(graph.includes('onPointerDown'));
  assert.ok(graph.includes('onPointerMove'));
  assert.ok(graph.includes('onPointerUp'));
});

test('graph relations cannot create prerequisite or sequence cycles', () => {
  assert.ok(migration.includes('teaching_relation_reaches'));
  assert.ok(migration.includes("new.relation_type in ('prerequisite','sequence_item')"));
  assert.ok(migration.includes('Relación cíclica no permitida'));
});

test('media stays attached to content detail and never creates graph nodes implicitly', () => {
  assert.ok(app.includes('teaching_content_media'));
  assert.equal(graph.includes('teaching_content_media'), false);
});

test('one canonical graph exposes the eight style-role trees dynamically', () => {
  assert.ok(graph.includes('styleOptions'));
  assert.ok(graph.includes('roleOptions'));
  assert.ok(graph.includes('selectedStyle'));
  assert.ok(graph.includes('selectedRole'));
  assert.equal(graph.includes('Bachata Leader'), false);
});

test('route mode traces the connected pedagogical component without generic related edges', () => {
  assert.ok(graph.includes('routeNodeIds'));
  assert.ok(graph.includes("relation_type === 'prerequisite'"));
  assert.ok(graph.includes("relation_type === 'counterpart'"));
  assert.ok(graph.includes("relation_type === 'sequence_item'"));
});

test('touch navigation preserves pan, pinch, filters, back, center and reset', () => {
  for (const token of ['pointerMapRef','pinchRef','setView','goBack','centerGraph','resetGraph']) assert.ok(graph.includes(token), token);
  assert.ok(styles.includes('touch-action: none'));
});
