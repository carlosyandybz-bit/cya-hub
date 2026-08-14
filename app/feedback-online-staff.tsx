"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronRight, ClipboardCheck, Clock3, Search, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ContextEvaluationPanel } from "./context-evaluation-panel-p0f";
import { SecureDriveAsset } from "./drive-media";
import styles from "./feedback-online.module.css";

type PersonBrief = { id: number; display_name: string };
type Term = { id: number; taxonomy: string; label: string; sort_order: number };
type RequestRow = {
  id: number;
  person_id: number;
  status: "submitted" | "in_review";
  style_term_id: number | null;
  role_term_id: number | null;
  level_term_id: number | null;
  student_note: string | null;
  external_file_id: string | null;
  video_title: string | null;
  teacher_summary: string | null;
  evaluation_session_id: number | null;
  due_at: string | null;
  submitted_at: string | null;
  started_at: string | null;
};
type TeachingRow = {
  id: number;
  title: string;
  content_type: string;
  teaching_content_styles: Array<{ style_term_id: number }>;
  teaching_content_roles: Array<{ role_term_id: number }>;
  teaching_content_levels: Array<{ level_term_id: number }>;
};
type LinkRow = { request_id: number; content_id: number; assignment_id: number | null };
type AssignmentRow = { id: number; assignment_status: string };

type Props = {
  client: SupabaseClient;
  students: PersonBrief[];
  visible?: boolean;
  notify?: (message: string) => void;
};

function assignmentOptions(kind: string) {
  if (kind === "correction") return [["pending", "Pendiente"], ["in_correction", "En corrección"], ["corrected", "Corregida"]] as const;
  if (kind === "exercise") return [["pending", "Pendiente"], ["active", "Activo"], ["completed", "Realizado"]] as const;
  return [["pending", "Pendiente"], ["explained", "Explicada"]] as const;
}

function dateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function FeedbackOnlineStaffQueue({ client, students, visible = true, notify }: Props) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [library, setLibrary] = useState<TeachingRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [requestResult, termResult, libraryResult] = await Promise.all([
      client.from("feedback_requests").select("id,person_id,status,style_term_id,role_term_id,level_term_id,student_note,external_file_id,video_title,teacher_summary,evaluation_session_id,due_at,submitted_at,started_at").in("status", ["submitted", "in_review"]).order("submitted_at", { ascending: true }),
      client.from("catalog_terms").select("id,taxonomy,label,sort_order").in("taxonomy", ["dance_style", "dance_role", "dance_level"]).eq("active", true).order("sort_order"),
      client.from("teaching_contents").select("id,title,content_type,teaching_content_styles(style_term_id),teaching_content_roles(role_term_id),teaching_content_levels(level_term_id)").eq("active", true).eq("completion_status", "complete").eq("publication_status", "published").order("title"),
    ]);
    const firstError = requestResult.error || termResult.error || libraryResult.error;
    if (firstError) { setError(firstError.message); return; }
    const nextRequests = (requestResult.data ?? []) as RequestRow[];
    setRequests(nextRequests);
    setTerms((termResult.data ?? []) as Term[]);
    setLibrary((libraryResult.data ?? []) as unknown as TeachingRow[]);
    if (!selectedId || !nextRequests.some((row) => row.id === selectedId)) setSelectedId(nextRequests[0]?.id ?? null);
    if (!nextRequests.length) { setLinks([]); setAssignments([]); return; }
    const ids = nextRequests.map((row) => row.id);
    const linkResult = await client.from("feedback_request_contents").select("request_id,content_id,assignment_id").in("request_id", ids);
    if (linkResult.error) { setError(linkResult.error.message); return; }
    const nextLinks = (linkResult.data ?? []) as LinkRow[];
    setLinks(nextLinks);
    const assignmentIds = nextLinks.map((row) => row.assignment_id).filter((id): id is number => Boolean(id));
    if (assignmentIds.length) {
      const assignmentResult = await client.from("student_content_assignments").select("id,assignment_status").in("id", assignmentIds);
      if (assignmentResult.error) setError(assignmentResult.error.message);
      else setAssignments((assignmentResult.data ?? []) as AssignmentRow[]);
    } else setAssignments([]);
  }, [client, selectedId]);

  useEffect(() => { if (!visible) return; void load(); }, [load, visible]);

  const selected = requests.find((row) => row.id === selectedId) ?? requests[0] ?? null;
  useEffect(() => { setSummary(selected?.teacher_summary || ""); }, [selected?.id, selected?.teacher_summary]);

  const stylesTerms = terms.filter((term) => term.taxonomy === "dance_style");
  const roleTerms = terms.filter((term) => term.taxonomy === "dance_role");
  const levelTerms = terms.filter((term) => term.taxonomy === "dance_level");
  const personName = (personId: number) => students.find((person) => person.id === personId)?.display_name || `Alumno ${personId}`;
  const requestLinks = selected ? links.filter((row) => row.request_id === selected.id) : [];
  const linkedContentIds = new Set(requestLinks.map((row) => row.content_id));
  const contextReady = Boolean(selected?.style_term_id && selected?.role_term_id && selected?.level_term_id);
  const compatible = useMemo(() => {
    if (!selected || !contextReady) return [];
    const q = search.trim().toLocaleLowerCase("es");
    return library.filter((content) =>
      !linkedContentIds.has(content.id)
      && content.teaching_content_styles.some((row) => row.style_term_id === selected.style_term_id)
      && content.teaching_content_roles.some((row) => row.role_term_id === selected.role_term_id)
      && content.teaching_content_levels.some((row) => row.level_term_id === selected.level_term_id)
      && (!q || content.title.toLocaleLowerCase("es").includes(q))
    ).slice(0, 20);
  }, [contextReady, library, linkedContentIds, search, selected]);

  async function updateContext(field: "style" | "role" | "level", value: string) {
    if (!selected) return;
    const style = field === "style" ? Number(value) : selected.style_term_id;
    const role = field === "role" ? Number(value) : selected.role_term_id;
    const level = field === "level" ? Number(value) : selected.level_term_id;
    if (!style || !role || !level) {
      const patch: RequestRow = { ...selected, style_term_id: style || null, role_term_id: role || null, level_term_id: level || null };
      setRequests((rows) => rows.map((row) => row.id === selected.id ? patch : row));
      return;
    }
    setBusy("context"); setError("");
    const result = await client.rpc("feedback_update_context", { p_request_id: selected.id, p_style_term_id: style, p_role_term_id: role, p_level_term_id: level });
    if (result.error) setError(result.error.message); else await load();
    setBusy("");
  }

  async function startReview() {
    if (!selected) return;
    setBusy("start"); setError("");
    const result = await client.rpc("feedback_start_review", { p_request_id: selected.id });
    if (result.error) setError(result.error.message); else { notify?.("Feedback abierto para revisión."); await load(); }
    setBusy("");
  }

  async function addContent(contentId: number) {
    if (!selected) return;
    setBusy(`content-${contentId}`); setError("");
    const result = await client.rpc("feedback_assign_content", { p_request_id: selected.id, p_content_id: contentId });
    if (result.error) setError(result.error.message); else { notify?.("Contenido vinculado al Feedback."); setSearch(""); await load(); }
    setBusy("");
  }

  async function updateAssignment(assignmentId: number, status: string) {
    setBusy(`assignment-${assignmentId}`); setError("");
    const result = await client.rpc("update_teaching_assignment_status", { p_assignment_id: assignmentId, p_assignment_status: status });
    if (result.error) setError(result.error.message); else await load();
    setBusy("");
  }

  async function startEvaluation() {
    if (!selected) return;
    setBusy("evaluation"); setError("");
    const result = await client.rpc("feedback_start_evaluation", { p_request_id: selected.id });
    if (result.error) setError(result.error.message); else { notify?.("Evaluación preparada."); await load(); }
    setBusy("");
  }

  async function complete() {
    if (!selected) return;
    if (!summary.trim()) { setError("Escribe el feedback para el alumno antes de terminar."); return; }
    setBusy("complete"); setError("");
    const result = await client.rpc("feedback_complete_request", { p_request_id: selected.id, p_teacher_summary: summary.trim() });
    if (result.error) setError(result.error.message);
    else { notify?.("Feedback terminado y disponible para el alumno."); setSummary(""); await load(); }
    setBusy("");
  }

  if (!visible) return null;
  return <section className={`card ${styles.staffQueue}`} aria-label="Feedback Online pendientes">
    <div className={styles.staffQueueHead}><div><p className="eyebrow">Feedback Online</p><h2>Pendientes de revisar</h2></div><span className="badge">{requests.length}</span></div>
    {!requests.length ? <div className="compact-empty"><CheckCircle2 /><span>No hay vídeos pendientes.</span></div> : <div className={styles.staffLayout}>
      <div className={styles.queueList}>{requests.map((row) => <button type="button" key={row.id} className={row.id === selected?.id ? styles.queueActive : ""} onClick={() => setSelectedId(row.id)}><Video /><span><strong>{personName(row.person_id)}</strong><small>{row.status === "submitted" ? "Pendiente" : "En revisión"}{row.due_at ? ` · objetivo ${dateTime(row.due_at)}` : ""}</small></span><ChevronRight /></button>)}</div>
      {selected ? <div className={styles.review}>
        <div className={styles.requestHead}><div><span className="badge">{selected.status === "submitted" ? "Pendiente" : "En revisión"}</span><strong>{personName(selected.person_id)} · Feedback #{selected.id}</strong><small>Enviado {dateTime(selected.submitted_at)}</small></div>{selected.due_at ? <span className={styles.due}><Clock3 /> {dateTime(selected.due_at)}</span> : null}</div>
        {selected.student_note ? <div className={styles.studentNote}><strong>Quiere revisar</strong><p>{selected.student_note}</p></div> : null}
        {selected.external_file_id ? <SecureDriveAsset fileId={selected.external_file_id} mediaType="video" title={selected.video_title || "Vídeo de Feedback"} controls className={styles.video} /> : <p className="error">Esta solicitud no tiene vídeo asociado.</p>}
        {selected.status === "submitted" ? <button className="btn" type="button" disabled={busy === "start"} onClick={() => void startReview()}><Video /> {busy === "start" ? "Abriendo…" : "Empezar revisión"}</button> : null}

        <div className={styles.fields}>
          <label className="field"><span>Estilo</span><select value={selected.style_term_id ?? ""} disabled={busy === "context"} onChange={(event) => void updateContext("style", event.target.value)}><option value="">Seleccionar</option>{stylesTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
          <label className="field"><span>Rol</span><select value={selected.role_term_id ?? ""} disabled={busy === "context"} onChange={(event) => void updateContext("role", event.target.value)}><option value="">Seleccionar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
          <label className="field"><span>Nivel</span><select value={selected.level_term_id ?? ""} disabled={busy === "context"} onChange={(event) => void updateContext("level", event.target.value)}><option value="">Seleccionar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
        </div>

        {contextReady ? <div className={styles.teachingBox}><div className="card-head"><div><p className="eyebrow">Enseñanza</p><h3>Contenido para este alumno</h3></div></div>{requestLinks.length ? <div className={styles.linkedList}>{requestLinks.map((link) => { const content = library.find((row) => row.id === link.content_id); const assignment = link.assignment_id ? assignments.find((row) => row.id === link.assignment_id) : null; if (!content) return null; return <div key={link.content_id}><span><strong>{content.title}</strong><small>{content.content_type}</small></span>{assignment ? <select value={assignment.assignment_status} disabled={busy === `assignment-${assignment.id}`} onChange={(event) => void updateAssignment(assignment.id, event.target.value)}>{assignmentOptions(content.content_type).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : null}</div>; })}</div> : null}<label className="search"><Search /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contenido compatible…" /></label>{search.trim() ? <div className={styles.searchResults}>{compatible.map((content) => <button type="button" key={content.id} disabled={busy === `content-${content.id}`} onClick={() => void addContent(content.id)}><span><strong>{content.title}</strong><small>{content.content_type}</small></span><span>Añadir</span></button>)}{!compatible.length ? <small>No hay resultados compatibles.</small> : null}</div> : null}</div> : <p className="modal-intro">Completa estilo, rol y nivel para asignar contenido o evaluar.</p>}

        {contextReady ? <div className={styles.evaluationBox}><div className="card-head"><div><p className="eyebrow">Opcional</p><h3>Evaluación</h3></div>{!selected.evaluation_session_id ? <button className="btn ghost" type="button" disabled={busy === "evaluation"} onClick={() => void startEvaluation()}><ClipboardCheck /> Añadir evaluación</button> : null}</div>{selected.evaluation_session_id ? <ContextEvaluationPanel client={client} personId={selected.person_id} personName={personName(selected.person_id)} classId={null} styleTermId={selected.style_term_id} roleTermId={selected.role_term_id} levelTermId={selected.level_term_id} onCompleted={load} /> : null}</div> : null}

        <label className="field"><span>Feedback para el alumno</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Qué has visto, qué debe corregir y qué debe trabajar ahora." /></label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="button" disabled={busy === "complete" || !summary.trim()} onClick={() => void complete()}><CheckCircle2 /> {busy === "complete" ? "Terminando…" : "Terminar y enviar al alumno"}</button>
      </div> : null}
    </div>}
  </section>;
}
