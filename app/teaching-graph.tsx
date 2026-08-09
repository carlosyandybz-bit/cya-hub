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
import { ArrowLeft, Crosshair, ExternalLink, GitBranch, Image as ImageIcon, RotateCcw, Search, Video, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TaxonomyLink = { style_term_id?: number; role_term_id?: number; level_term_id?: number };
type GraphContent = {
  id: number;
  title: string;
  content_type: string;
  description: string | null;
  correction_guidance: string | null;
  completion_status: string;
  publication_status: string;
  teaching_content_styles: TaxonomyLink[];
  teaching_content_roles: TaxonomyLink[];
  teaching_content_levels: TaxonomyLink[];
  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; external_file_id: string; title: string | null }>;
};

type GraphRelation = { id: number; source_content_id: number; target_content_id: number; relation_type: string; position: number | null };
type Term = { id: number; label: string; taxonomy: string; sort_order: number };
type GraphNodeData = { content: GraphContent; level: string; relationCount: number; selected: boolean };

const kindLabels: Record<string, string> = { correction: "Corrección", explanation: "Explicación", exercise: "Ejercicio", sequence: "Secuencia" };
const relationLabels: Record<string, string> = { prerequisite: "Necesita antes", counterpart: "Homóloga", exercise_explanation: "Trabaja explicación", exercise_correction: "Trabaja corrección", sequence_item: "Paso", related: "Relacionada" };

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function TeachingNode({ data }: NodeProps<Node<GraphNodeData>>) {
  return <article className={`flow-node kind-${data.content.content_type} ${data.selected ? "selected" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <span>{kindLabels[data.content.content_type] ?? data.content.content_type}</span>
    <strong>{data.content.title}</strong>
    <small>{data.level} · {data.relationCount} conexiones</small>
    <i>{data.content.completion_status === "complete" ? "Completa" : "Incompleta"}</i>
    <Handle type="source" position={Position.Right} />
  </article>;
}

function GraphCanvas({ contents, relations, terms }: { contents: GraphContent[]; relations: GraphRelation[]; terms: Term[] }) {
  const flow = useReactFlow();
  const [styleId, setStyleId] = useState(""), [roleId, setRoleId] = useState(""), [levelId, setLevelId] = useState(""), [kind, setKind] = useState(""), [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null), [history, setHistory] = useState<number[]>([]);
  const styles = terms.filter((term) => term.taxonomy === "dance_style"), roles = terms.filter((term) => term.taxonomy === "dance_role"), levels = terms.filter((term) => term.taxonomy === "dance_level").sort((a, b) => a.sort_order - b.sort_order);
  const termMap = new Map(terms.map((term) => [term.id, term]));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return contents.filter((content) => content.publication_status !== "archived")
      .filter((content) => !styleId || content.teaching_content_styles.some((item) => item.style_term_id === Number(styleId)))
      .filter((content) => !roleId || content.teaching_content_roles.some((item) => item.role_term_id === Number(roleId)))
      .filter((content) => !levelId || content.teaching_content_levels.some((item) => item.level_term_id === Number(levelId)))
      .filter((content) => !kind || content.content_type === kind)
      .filter((content) => !normalized || [content.title, content.description, content.correction_guidance].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(normalized)));
  }, [contents, styleId, roleId, levelId, kind, query]);

  const visibleIds = new Set(filtered.map((content) => content.id));
  const visibleRelations = relations.filter((relation) => visibleIds.has(relation.source_content_id) && visibleIds.has(relation.target_content_id));
  const grouped = new Map<number, GraphContent[]>();
  filtered.forEach((content) => {
    const firstLevel = content.teaching_content_levels.map((item) => item.level_term_id).filter((value): value is number => Boolean(value)).sort((a, b) => (termMap.get(a)?.sort_order ?? 999) - (termMap.get(b)?.sort_order ?? 999))[0] ?? 0;
    grouped.set(firstLevel, [...(grouped.get(firstLevel) ?? []), content]);
  });
  const columns = [...grouped.keys()].sort((a, b) => (termMap.get(a)?.sort_order ?? 999) - (termMap.get(b)?.sort_order ?? 999));

  const nodes: Node<GraphNodeData>[] = columns.flatMap((columnId, columnIndex) => (grouped.get(columnId) ?? []).sort((a, b) => a.title.localeCompare(b.title, "es")).map((content, rowIndex) => ({
    id: String(content.id),
    type: "teaching",
    position: { x: columnIndex * 290, y: rowIndex * 150 + (columnIndex % 2) * 35 },
    data: {
      content,
      level: termMap.get(columnId)?.label ?? "Varios niveles",
      relationCount: relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id).length,
      selected: selectedId === content.id,
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
      className: `flow-edge relation-${relation.relation_type}`,
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

  useEffect(() => {
    const timer = window.setTimeout(() => flow.fitView({ duration: 360, padding: 0.18, maxZoom: 1 }), 30);
    return () => clearTimeout(timer);
  }, [styleId, roleId, levelId, kind, query, flow]);

  return <section className="teaching-graph-shell">
    <div className="graph-filterbar">
      <label className="graph-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nodo…" /></label>
      <select value={styleId} onChange={(event) => setStyleId(event.target.value)} aria-label="Filtrar estilo"><option value="">Todos los estilos</option>{styles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={roleId} onChange={(event) => setRoleId(event.target.value)} aria-label="Filtrar rol"><option value="">Todos los roles</option>{roles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={levelId} onChange={(event) => setLevelId(event.target.value)} aria-label="Filtrar nivel"><option value="">Todos los niveles</option>{levels.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select>
      <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filtrar tipo"><option value="">Todos los tipos</option><option value="explanation">Explicaciones</option><option value="sequence">Secuencias</option><option value="exercise">Ejercicios</option><option value="correction">Correcciones</option></select>
    </div>
    <div className="teaching-graph" role="application" aria-label="Mapa táctil de enseñanza">
      {nodes.length ? <ReactFlow
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
        <Panel position="top-right" className="graph-actions"><button onClick={() => flow.fitView({ duration: 350, padding: 0.18, maxZoom: 1 })}><RotateCcw /> Resetear</button>{selected ? <button onClick={() => flow.fitView({ nodes: [{ id: String(selected.id) }], duration: 350, padding: 0.8, maxZoom: 1.35 })}><Crosshair /> Centrar</button> : null}{history.length ? <button onClick={goBack}><ArrowLeft /> Anterior</button> : null}</Panel>
      </ReactFlow> : <div className="graph-empty"><GitBranch /><strong>No hay nodos con estos filtros</strong><span>Amplía la búsqueda o crea contenido relacionado.</span></div>}
    </div>
    {selected ? <aside className="graph-detail"><header><div><span>{kindLabels[selected.content_type] ?? selected.content_type}</span><h3>{selected.title}</h3></div><button className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Cerrar detalle"><X /></button></header>{selected.description ? <p>{selected.description}</p> : null}{selected.correction_guidance ? <p><strong>Cómo trabajarlo:</strong> {selected.correction_guidance}</p> : null}<div className="graph-related"><strong>Relaciones</strong>{selectedRelations.length ? selectedRelations.map((relation) => { const otherId = relation.source_content_id === selected.id ? relation.target_content_id : relation.source_content_id; const other = contents.find((content) => content.id === otherId); return other ? <button key={relation.id} onClick={() => selectNode(other.id)}><span>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong>{other.title}</strong><Crosshair /></button> : null; }) : <small>Sin relaciones registradas.</small>}</div>{selected.teaching_content_media.length ? <div className="graph-media"><strong>Multimedia</strong>{selected.teaching_content_media.map((media) => <a key={media.id} href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer">{media.media_type === "video" ? <Video /> : <ImageIcon />}<span>{media.title || (media.media_type === "video" ? "Ver vídeo" : "Ver imagen")}</span><ExternalLink /></a>)}</div> : null}</aside> : null}
  </section>;
}

export function TeachingGraph(props: { contents: GraphContent[]; relations: GraphRelation[]; terms: Term[] }) {
  return <ReactFlowProvider><GraphCanvas {...props} /></ReactFlowProvider>;
}
