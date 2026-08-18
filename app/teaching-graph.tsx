"use client";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { ArrowLeft, Crosshair, GitBranch, Route, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SecureDriveAsset } from "./drive-media";
import type { TeachingCardMedia } from "./teaching-content-card";

type TaxonomyLink = { style_term_id?: number; role_term_id?: number; level_term_id?: number };
type GraphContent = {
  id: number;
  title: string;
  content_type: string;
  summary: string | null;
  description: string | null;
  correction_guidance: string | null;
  is_mandatory: boolean;
  completion_status: string;
  publication_status: string;
  requires_partner?: boolean;
  teaching_content_styles: TaxonomyLink[];
  teaching_content_roles: TaxonomyLink[];
  teaching_content_levels: TaxonomyLink[];
  teaching_content_media: TeachingCardMedia[];
};

type GraphRelation = { id: number; source_content_id: number; target_content_id: number; relation_type: string; position: number | null };
type Term = { id: number; term_key?: string; label: string; taxonomy: string; sort_order: number };
type GraphNodeData = { content: GraphContent; level: string; relationCount: number; selected: boolean; inRoute: boolean };

const kindLabels: Record<string, string> = { correction: "Corrección", explanation: "Explicación", exercise: "Ejercicio", sequence: "Secuencia" };
const relationLabels: Record<string, string> = { prerequisite: "Necesita antes", counterpart: "Homóloga", exercise_explanation: "Trabaja explicación", exercise_correction: "Trabaja corrección", sequence_item: "Paso", related: "Relacionada" };
const routeRelationTypes = new Set(["prerequisite", "counterpart", "exercise_explanation", "exercise_correction", "sequence_item"]);

function TeachingNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return <article className={`flow-node kind-${data.content.content_type} ${data.content.is_mandatory ? "mandatory" : ""} ${data.selected ? "selected" : ""} ${data.inRoute ? "in-route" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <span>{kindLabels[data.content.content_type] ?? data.content.content_type}</span>
    <strong>{data.content.title}</strong>
    {data.content.summary ? <em className="flow-node-summary">{data.content.summary}</em> : null}
    <small>{data.level} · {data.relationCount} conexiones{data.content.requires_partner ? " · necesita pareja" : ""}</small>
    <div className="flow-node-flags"><i>{data.content.completion_status === "complete" ? "Completa" : "Incompleta"}</i>{data.content.is_mandatory ? <b>Obligatorio</b> : null}</div>
    <Handle type="source" position={Position.Right} />
  </article>;
}

function GraphCanvas({ contents, relations, terms }: { contents: GraphContent[]; relations: GraphRelation[]; terms: Term[] }) {
  const flow = useReactFlow();
  const [styleId, setStyleId] = useState(""), [roleId, setRoleId] = useState(""), [levelId, setLevelId] = useState(""), [kind, setKind] = useState(""), [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null), [history, setHistory] = useState<number[]>([]), [routeMode, setRouteMode] = useState(false), [layoutRevision, setLayoutRevision] = useState(0);
  const styles = terms.filter((term) => term.taxonomy === "dance_style").sort((a,b) => a.sort_order-b.sort_order), roles = terms.filter((term) => term.taxonomy === "dance_role").sort((a,b) => a.sort_order-b.sort_order), levels = terms.filter((term) => term.taxonomy === "dance_level").sort((a, b) => a.sort_order - b.sort_order);
  const termMap = new Map(terms.map((term) => [term.id, term]));
  const treePresets = styles.flatMap((style) => roles.map((role) => ({ key: `${style.id}-${role.id}`, style, role })));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return contents.filter((content) => content.publication_status !== "archived")
      .filter((content) => !styleId || content.teaching_content_styles.some((item) => item.style_term_id === Number(styleId)))
      .filter((content) => !roleId || content.teaching_content_roles.some((item) => item.role_term_id === Number(roleId)))
      .filter((content) => !levelId || content.teaching_content_levels.some((item) => item.level_term_id === Number(levelId)))
      .filter((content) => !kind || content.content_type === kind)
      .filter((content) => !normalized || [content.title, content.summary, content.description, content.correction_guidance].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(normalized)));
  }, [contents, styleId, roleId, levelId, kind, query]);

  const baseVisibleIds = useMemo(() => new Set(filtered.map((content) => content.id)), [filtered]);
  const routeIds = useMemo(() => {
    if (!routeMode || !selectedId || !baseVisibleIds.has(selectedId)) return null;
    const visited = new Set<number>([selectedId]);
    const queue = [selectedId];
    while (queue.length) {
      const current = queue.shift()!;
      relations.forEach((relation) => {
        if (!routeRelationTypes.has(relation.relation_type)) return;
        const neighbor = relation.source_content_id === current ? relation.target_content_id : relation.target_content_id === current ? relation.source_content_id : null;
        if (neighbor && baseVisibleIds.has(neighbor) && !visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      });
    }
    return visited;
  }, [routeMode, selectedId, baseVisibleIds, relations]);

  const displayed = routeIds ? filtered.filter((content) => routeIds.has(content.id)) : filtered;
  const visibleIds = new Set(displayed.map((content) => content.id));
  const visibleRelations = relations.filter((relation) => visibleIds.has(relation.source_content_id) && visibleIds.has(relation.target_content_id) && (!routeIds || routeRelationTypes.has(relation.relation_type)));
  const grouped = new Map<number, GraphContent[]>();
  displayed.forEach((content) => {
    const firstLevel = content.teaching_content_levels.map((item) => item.level_term_id).filter((value): value is number => Boolean(value)).sort((a, b) => (termMap.get(a)?.sort_order ?? 999) - (termMap.get(b)?.sort_order ?? 999))[0] ?? 0;
    grouped.set(firstLevel, [...(grouped.get(firstLevel) ?? []), content]);
  });
  const columns = [...grouped.keys()].sort((a, b) => (termMap.get(a)?.sort_order ?? 999) - (termMap.get(b)?.sort_order ?? 999));

  const nodes: Node<GraphNodeData>[] = columns.flatMap((columnId, columnIndex) => (grouped.get(columnId) ?? []).sort((a, b) => Number(b.is_mandatory)-Number(a.is_mandatory) || ({explanation:0,correction:1,exercise:2,sequence:3}[a.content_type] ?? 9)-({explanation:0,correction:1,exercise:2,sequence:3}[b.content_type] ?? 9) || a.title.localeCompare(b.title, "es")).map((content, rowIndex) => ({
    id: String(content.id),
    type: "teaching",
    position: { x: columnIndex * 340, y: rowIndex * 190 },
    data: {
      content,
      level: termMap.get(columnId)?.label ?? "Varios niveles",
      relationCount: relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id).length,
      selected: selectedId === content.id,
      inRoute: Boolean(routeIds?.has(content.id)),
    },
  })));

  const edges: Edge[] = visibleRelations.map((relation) => {
    const reverse = relation.relation_type === "prerequisite";
    return {
      id: String(relation.id),
      source: String(reverse ? relation.target_content_id : relation.source_content_id),
      target: String(reverse ? relation.source_content_id : relation.target_content_id),
      label: relationLabels[relation.relation_type] ?? relation.relation_type,
      type: "smoothstep",
      animated: relation.relation_type === "sequence_item",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      className: `flow-edge relation-${relation.relation_type} ${(contents.find((item)=>item.id===relation.source_content_id)?.is_mandatory || contents.find((item)=>item.id===relation.target_content_id)?.is_mandatory) ? "mandatory-edge" : ""} ${routeIds ? "route-edge" : ""}`,
    };
  });

  const selected = contents.find((content) => content.id === selectedId) ?? null;
  const selectedRelations = selected ? relations.filter((relation) => relation.source_content_id === selected.id || relation.target_content_id === selected.id) : [];

  function selectNode(id: number) {
    if (selectedId && selectedId !== id) setHistory((current) => [...current.slice(-9), selectedId]);
    setSelectedId(id);
    window.setTimeout(() => flow.fitView({ nodes: [{ id: String(id) }], duration: 420, padding: 0.8, maxZoom: 1.35 }), 0);
  }

  function goBack() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((current) => current.slice(0, -1));
    setSelectedId(previous);
    window.setTimeout(() => flow.fitView({ nodes: [{ id: String(previous) }], duration: 420, padding: 0.8, maxZoom: 1.35 }), 0);
  }

  function applyTree(style: Term, role: Term) {
    setStyleId(String(style.id)); setRoleId(String(role.id)); setSelectedId(null); setHistory([]); setRouteMode(false);
  }

  function reorganizeMap() {
    setLayoutRevision((value) => value + 1);
    window.setTimeout(() => flow.fitView({ duration: 420, padding: 0.2, maxZoom: 1 }), 0);
  }

  function resetMap() {
    setStyleId(""); setRoleId(""); setLevelId(""); setKind(""); setQuery(""); setSelectedId(null); setHistory([]); setRouteMode(false);
    window.setTimeout(() => flow.fitView({ duration: 350, padding: 0.18, maxZoom: 1 }), 0);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => flow.fitView({ duration: 360, padding: 0.18, maxZoom: 1 }), 30);
    return () => clearTimeout(timer);
  }, [styleId, roleId, levelId, kind, query, routeMode, flow]);

  return <section className="teaching-graph-shell">
    <div className="graph-tree-presets" aria-label="Árboles por estilo y rol">{treePresets.map(({ key, style, role }) => <button key={key} className={styleId===String(style.id)&&roleId===String(role.id)?"active":""} onClick={() => applyTree(style,role)}><GitBranch /><span>{style.label}</span><strong>{role.label}</strong></button>)}</div>
    <div className="graph-filterbar">
      <label className="graph-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nodo…" /></label>
      <select value={styleId} onChange={(event) => { setStyleId(event.target.value); setRouteMode(false); }} aria-label="Filtrar estilo"><option value="">Todos los estilos</option>{styles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={roleId} onChange={(event) => { setRoleId(event.target.value); setRouteMode(false); }} aria-label="Filtrar rol"><option value="">Todos los roles</option>{roles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={levelId} onChange={(event) => setLevelId(event.target.value)} aria-label="Filtrar nivel"><option value="">Todos los niveles</option>{levels.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filtrar tipo"><option value="">Todos los tipos</option><option value="explanation">Explicaciones</option><option value="sequence">Secuencias</option><option value="exercise">Ejercicios</option><option value="correction">Correcciones</option></select>
    </div>
    <div className="teaching-graph" role="application" aria-label="Mapa táctil de enseñanza">
      {nodes.length ? <ReactFlow
        key={`teaching-layout-${layoutRevision}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={{ teaching: TeachingNode }}
        onNodeClick={(_, node) => selectNode(Number(node.id))}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.25}
        maxZoom={2}
        panOnDrag
        panOnScroll={false}
        zoomOnPinch
        zoomOnScroll
        preventScrolling
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#ddd7ed" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap pannable zoomable position="bottom-right" nodeColor={(node) => ({ explanation: "#6d4aff", correction: "#d35f78", exercise: "#19865a", sequence: "#3f78c6" }[(node.data as GraphNodeData).content.content_type] ?? "#8d85a1")} />
        <Panel position="top-right" className="graph-actions"><button className="graph-reorganize" onClick={reorganizeMap}><GitBranch /> Reorganizar</button><button onClick={resetMap}><RotateCcw /> Resetear</button>{selected ? <><button className={routeMode?"active":""} onClick={() => setRouteMode((value) => !value)}><Route /> {routeMode?"Mapa completo":"Ruta"}</button><button onClick={() => flow.fitView({ nodes: [{ id: String(selected.id) }], duration: 350, padding: 0.8, maxZoom: 1.35 })}><Crosshair /> Centrar</button></> : null}{history.length ? <button onClick={goBack}><ArrowLeft /> Anterior</button> : null}</Panel>
      </ReactFlow> : <div className="graph-empty"><GitBranch /><strong>{routeMode ? "No hay una ruta conectada con estos filtros" : "No hay nodos con estos filtros"}</strong><span>Amplía la búsqueda o crea contenido relacionado.</span></div>}
    </div>
    {selected ? <aside className="graph-detail"><header><div><span>{kindLabels[selected.content_type] ?? selected.content_type}</span><h3>{selected.title}</h3></div><button className="icon-btn" onClick={() => { setSelectedId(null); setRouteMode(false); }} aria-label="Cerrar detalle"><X /></button></header>{selected.is_mandatory ? <div className="graph-mandatory-badge">Camino obligatorio</div> : null}{selected.requires_partner ? <div className="graph-partner-badge">Necesita pareja</div> : null}{selected.summary ? <p className="graph-summary">{selected.summary}</p> : null}{selected.description ? <p>{selected.description}</p> : null}{selected.correction_guidance ? <p><strong>Cómo trabajarlo:</strong> {selected.correction_guidance}</p> : null}<div className="graph-related"><strong>Relaciones</strong>{selectedRelations.length ? selectedRelations.map((relation) => { const otherId = relation.source_content_id === selected.id ? relation.target_content_id : relation.source_content_id; const other = contents.find((content) => content.id === otherId); return other ? <button key={relation.id} onClick={() => selectNode(other.id)}><span>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong>{other.title}</strong><Crosshair /></button> : null; }) : <small>Sin relaciones registradas.</small>}</div>{selected.teaching_content_media.length ? <div className="graph-media"><strong>Multimedia</strong><div className="graph-media-grid">{selected.teaching_content_media.filter((media) => media.display_in_resources !== false).map((media) => <article key={media.id ?? media.external_file_id}><div className="graph-media-frame"><SecureDriveAsset fileId={media.external_file_id} mediaType={media.media_type} title={media.title} thumbnailFileId={media.thumbnail_external_file_id} controls={media.media_type === "video"} /></div><span>{media.title || (media.media_type === "video" ? "Vídeo" : "Imagen")}</span></article>)}</div></div> : null}</aside> : null}
  </section>;
}

export function TeachingGraph(props: { contents: GraphContent[]; relations: GraphRelation[]; terms: Term[] }) {
  return <ReactFlowProvider><GraphCanvas {...props} /></ReactFlowProvider>;
}
