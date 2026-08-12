import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/v51_p23_teaching_graph_contract.sql','utf8');
const graph = fs.readFileSync('app/teaching-graph.tsx','utf8');
const app = fs.readFileSync('app/cya-app.tsx','utf8');
const styles = fs.readFileSync('app/p23-teaching.css','utf8');
const buildInfo = fs.readFileSync('app/api/build-info/route.ts','utf8');

test('P23 exposes an explicit no-store v51-ready runtime marker', () => {
  assert.ok(buildInfo.includes('p23-teaching-graph-v51-ready'));
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
  assert.ok(migration.includes('v_source_styles is distinct from v_target_styles'));
  assert.ok(migration.includes('v_source_levels is distinct from v_target_levels'));
  assert.ok(migration.includes('Cada explicación solo puede tener una homóloga directa.'));
  assert.ok(app.includes('const counterpartUsed = new Set'));
  assert.ok(app.includes('contentRoles.length===1 && candidateRoles.length===1'));
  assert.ok(app.includes('idsEqual(contentStyles'));
  assert.ok(app.includes('idsEqual(contentLevels'));
});

test('sequence steps are flat, contextual, uniquely positioned and touch-reorderable', () => {
  assert.ok(migration.includes('teaching_content_relations_sequence_position_uidx'));
  assert.ok(migration.includes("if v_target_type='sequence'"));
  assert.ok(migration.includes('Una secuencia no puede contener otra secuencia como paso.'));
  assert.ok(migration.includes('reorder_teaching_sequence'));
  assert.ok(migration.includes('position=v_i*10'));
  assert.ok(app.includes('candidate.content_type !== "sequence"'));
  assert.ok(app.includes('const sequenceItems = content.content_type === "sequence"'));
  assert.ok(app.includes('reorder_teaching_sequence'));
  assert.ok(app.includes('sequence-order-row'));
  assert.ok(app.includes('Subir ${step?.title'));
  assert.ok(app.includes('Bajar ${step?.title'));
  assert.ok(styles.includes('min-width:44px;min-height:44px'));
});

test('graph relations cannot create prerequisite or sequence cycles', () => {
  assert.ok(migration.includes("new.relation_type in ('prerequisite','sequence_item')"));
  assert.ok(migration.includes('with recursive walk(content_id)'));
  assert.ok(migration.includes('La relación crearía un ciclo en el mapa de enseñanza.'));
});

test('media stays attached to content detail and never creates graph nodes implicitly', () => {
  assert.equal(migration.includes('insert into public.teaching_content_media'), false);
  assert.equal(migration.includes('update public.teaching_content_media'), false);
  assert.ok(graph.includes('contents: GraphContent[]; relations: GraphRelation[]'));
  assert.ok(graph.includes('const nodes: Node<GraphNodeData>[] = columns.flatMap'));
  assert.ok(graph.includes('displayed.forEach((content) =>'));
  assert.ok(graph.includes('visibleRelations.map((relation) =>'));
  assert.ok(graph.includes('selected.teaching_content_media.length'));
  assert.ok(graph.includes('className="graph-media"'));
  assert.equal(graph.includes('teaching_content_media.map((media) => ({ id:'), false);
});

test('one canonical graph exposes the eight style-role trees dynamically', () => {
  assert.ok(graph.includes('const treePresets = styles.flatMap((style) => roles.map((role)'));
  assert.ok(graph.includes('aria-label="Árboles por estilo y rol"'));
  assert.ok(graph.includes('applyTree(style,role)'));
  assert.ok(graph.includes('styleId===String(style.id)&&roleId===String(role.id)'));
  assert.ok(styles.includes('.graph-tree-presets'));
  assert.ok(styles.includes('overflow-x:auto'));
});

test('route mode traces the connected pedagogical component without generic related edges', () => {
  assert.ok(graph.includes('const routeRelationTypes = new Set'));
  for (const relation of ['prerequisite','counterpart','exercise_explanation','exercise_correction','sequence_item']) assert.ok(graph.includes(`"${relation}"`));
  assert.ok(graph.includes('const routeIds = useMemo'));
  assert.ok(graph.includes('while (queue.length)'));
  assert.ok(graph.includes('routeRelationTypes.has(relation.relation_type)'));
  assert.ok(graph.includes('{routeMode?"Mapa completo":"Ruta"}'));
  assert.ok(graph.includes('route-edge'));
  assert.ok(styles.includes('.flow-node.in-route'));
});

test('touch navigation preserves pan, pinch, filters, back, center and reset', () => {
  for (const token of ['panOnDrag','zoomOnPinch','zoomOnScroll','fitView','MiniMap','Resetear','Centrar','Anterior','Filtrar estilo','Filtrar rol','Filtrar nivel','Filtrar tipo','Buscar nodo']) {
    assert.ok(graph.includes(token), `missing graph interaction: ${token}`);
  }
  assert.ok(app.includes('<TeachingGraph contents={contents} relations={relations} terms={terms} />'));
  assert.ok(styles.includes('@media(max-width:720px)'));
});
