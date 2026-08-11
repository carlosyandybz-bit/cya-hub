"use client";

import { BookOpenCheck, CheckCircle2, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./class-summary-content-editor.module.css";

type Participant = {
  person_id: number;
  role_term_id: number | null;
  level_term_id: number | null;
};

type Student = { id: number; display_name: string };

type Assignment = {
  id: number;
  person_id: number;
  content_id: number;
  assignment_status: string;
  current_frequency: number | null;
  current_importance: number | null;
  snapshot_measurement_mode: "frequency" | "importance" | "both" | "none";
  teaching_contents: { id: number; title: string; content_type: string } | null;
};

type ClassEvent = {
  id: number;
  person_id: number;
  content_id: number;
  event_type: string;
  created_at: string;
  teaching_contents: { title: string; content_type: string } | null;
};

type SearchResult = {
  content_id: number;
  title: string;
  content_type: string;
  completion_status: string;
  publication_status: string;
  ready: boolean;
};

type Kind = "all" | "correction" | "explanation" | "exercise" | "sequence";
type QuickKind = Exclude<Kind, "all">;
type MeasurementMode = "frequency" | "importance" | "both" | "none";

const kindLabels: Record<string, string> = {
  correction: "Corrección",
  explanation: "Explicación",
  exercise: "Ejercicio",
  sequence: "Secuencia",
};

function assignmentLabel(type: string, status: string) {
  if (type === "correction") return status === "corrected" ? "Corregida" : "Pendiente";
  if (type === "exercise") return status === "completed" ? "Realizado" : status === "active" ? "Activo" : "Pendiente";
  return status === "explained" ? "Explicada" : "Pendiente";
}

export function ClassSummaryContentEditor({
  classId,
  styleTermId,
  participants,
  students,
  notify,
  onChanged,
}: {
  classId: number;
  styleTermId: number | null;
  participants: Participant[];
  students: Student[];
  notify: (message: string) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(participants[0]?.person_id ?? 0);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<ClassEvent[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKind, setQuickKind] = useState<QuickKind>("correction");
  const [quickTitle, setQuickTitle] = useState("");
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>("both");
  const [frequency, setFrequency] = useState(50);
  const [importance, setImportance] = useState(50);

  const participant = participants.find((row) => row.person_id === personId) ?? participants[0] ?? null;
  const studentName = students.find((student) => student.id === personId)?.display_name ?? "Alumno";

  const loadContext = useCallback(async () => {
    const client = getRuntimeSupabaseClient();
    if (!client || !personId) return;
    setLoading(true);
    setError("");
    const [assignmentResult, eventResult] = await Promise.all([
      client
        .from("student_content_assignments")
        .select("id,person_id,content_id,assignment_status,current_frequency,current_importance,snapshot_measurement_mode,teaching_contents!inner(id,title,content_type)")
        .eq("person_id", personId)
        .order("updated_at", { ascending: false }),
      client
        .from("class_content_events")
        .select("id,person_id,content_id,event_type,created_at,teaching_contents(title,content_type)")
        .eq("class_id", classId)
        .eq("person_id", personId)
        .order("created_at", { ascending: false }),
    ]);
    const nextError = assignmentResult.error ?? eventResult.error;
    if (nextError) setError(nextError.message);
    else {
      setAssignments((assignmentResult.data ?? []) as unknown as Assignment[]);
      setEvents((eventResult.data ?? []) as unknown as ClassEvent[]);
    }
    setLoading(false);
  }, [classId, personId]);

  const searchContent = useCallback(async () => {
    const client = getRuntimeSupabaseClient();
    if (!client || !personId || !open) return;
    const result = await client.rpc("search_class_teaching_content", {
      p_class_id: classId,
      p_person_id: personId,
      p_query: query.trim(),
      p_content_type: kind === "all" ? null : kind,
      p_limit: 30,
    });
    if (result.error) setError(result.error.message);
    else setResults((result.data ?? []) as SearchResult[]);
  }, [classId, kind, open, personId, query]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void loadContext(), 0);
    return () => window.clearTimeout(timer);
  }, [loadContext, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void searchContent(), 150);
    return () => window.clearTimeout(timer);
  }, [open, searchContent]);

  const latestExerciseEvents = useMemo(() => {
    const map = new Map<number, ClassEvent>();
    for (const event of events) {
      if (!event.event_type.startsWith("exercise_") || map.has(event.content_id)) continue;
      map.set(event.content_id, event);
    }
    return map;
  }, [events]);

  const workedContentIds = useMemo(() => new Set(events.map((event) => event.content_id)), [events]);
  const workedAssignments = assignments.filter((assignment) => workedContentIds.has(assignment.content_id));

  async function finishMutation(message: string) {
    await Promise.all([loadContext(), searchContent(), Promise.resolve(onChanged())]);
    notify(message);
  }

  async function updateCorrection(
    assignment: Assignment,
    changes: { status?: string; frequency?: number; importance?: number },
  ) {
    const client = getRuntimeSupabaseClient();
    if (!client) return;
    setBusy(`assignment-${assignment.id}`);
    setError("");
    const mode = assignment.snapshot_measurement_mode;
    const result = await client.rpc("update_correction_assignment", {
      p_assignment_id: assignment.id,
      p_class_id: classId,
      p_assignment_status: changes.status ?? assignment.assignment_status,
      p_frequency: mode === "frequency" || mode === "both" ? changes.frequency ?? assignment.current_frequency ?? 0 : null,
      p_importance: mode === "importance" || mode === "both" ? changes.importance ?? assignment.current_importance ?? 0 : null,
    });
    if (result.error) setError(result.error.message);
    else await finishMutation("Corrección actualizada antes del cierre.");
    setBusy("");
  }

  async function updateLearning(assignment: Assignment, status: string) {
    const client = getRuntimeSupabaseClient();
    if (!client) return;
    setBusy(`assignment-${assignment.id}`);
    setError("");
    const result = await client.rpc("update_class_teaching_assignment_status", {
      p_assignment_id: assignment.id,
      p_class_id: classId,
      p_assignment_status: status,
    });
    if (result.error) setError(result.error.message);
    else await finishMutation("Estado pedagógico actualizado antes del cierre.");
    setBusy("");
  }

  async function setExercise(contentId: number, state: "pending" | "active" | "completed") {
    const client = getRuntimeSupabaseClient();
    if (!client || !personId) return;
    setBusy(`exercise-${contentId}`);
    setError("");
    const result = await client.rpc("record_class_content_event", {
      p_class_id: classId,
      p_person_id: personId,
      p_content_id: contentId,
      p_event_type: `exercise_${state}`,
      p_payload: {},
    });
    if (result.error) setError(result.error.message);
    else await finishMutation("Ejercicio actualizado antes del cierre.");
    setBusy("");
  }

  async function markReviewed(contentId: number, type: string) {
    const client = getRuntimeSupabaseClient();
    if (!client || !personId) return;
    setBusy(`event-${contentId}`);
    setError("");
    const result = await client.rpc("record_class_content_event", {
      p_class_id: classId,
      p_person_id: personId,
      p_content_id: contentId,
      p_event_type: type === "correction" ? "improved" : "reviewed",
      p_payload: {},
    });
    if (result.error) setError(result.error.message);
    else await finishMutation("Contenido añadido al trabajo de esta clase.");
    setBusy("");
  }

  async function addExisting(result: SearchResult) {
    const client = getRuntimeSupabaseClient();
    if (!client || !participant || !styleTermId || !participant.role_term_id || !participant.level_term_id) return;
    setBusy(`add-${result.content_id}`);
    setError("");
    if (result.content_type === "exercise") {
      await setExercise(result.content_id, "active");
      setBusy("");
      return;
    }
    const response = await client.rpc("assign_teaching_content", {
      p_person_id: participant.person_id,
      p_content_id: result.content_id,
      p_style_term_id: styleTermId,
      p_role_term_id: participant.role_term_id,
      p_level_term_id: participant.level_term_id,
      p_source_class_id: classId,
    });
    if (response.error) setError(response.error.message);
    else await finishMutation(`${kindLabels[result.content_type]} añadida a esta clase.`);
    setBusy("");
  }

  async function createQuick() {
    const client = getRuntimeSupabaseClient();
    if (!client || !personId || !quickTitle.trim()) return;
    setBusy("quick");
    setError("");
    const result = quickKind === "correction"
      ? await client.rpc("create_class_correction", {
          p_class_id: classId,
          p_person_id: personId,
          p_title: quickTitle.trim(),
          p_measurement_mode: measurementMode,
          p_frequency: measurementMode === "frequency" || measurementMode === "both" ? frequency : null,
          p_importance: measurementMode === "importance" || measurementMode === "both" ? importance : null,
        })
      : await client.rpc("create_quick_class_content", {
          p_class_id: classId,
          p_person_id: personId,
          p_content_type: quickKind,
          p_title: quickTitle.trim(),
        });
    if (result.error) setError(result.error.message);
    else {
      setQuickTitle("");
      setQuickOpen(false);
      await finishMutation(`${kindLabels[quickKind]} creada y vinculada a esta clase.`);
    }
    setBusy("");
  }

  function renderAssignment(assignment: Assignment) {
    const content = assignment.teaching_contents;
    if (!content) return null;
    const disabled = busy === `assignment-${assignment.id}`;
    return (
      <article className={styles.item} key={`assignment-${assignment.id}`}>
        <div className={styles.itemHead}>
          <span>{kindLabels[content.content_type] ?? content.content_type}</span>
          <div><strong>{content.title}</strong><small>{assignmentLabel(content.content_type, assignment.assignment_status)}</small></div>
        </div>
        {content.content_type === "correction" ? (
          <div className={styles.controls}>
            <label><span>Estado</span><select disabled={disabled} value={assignment.assignment_status} onChange={(event) => void updateCorrection(assignment, { status: event.target.value })}><option value="pending">Pendiente</option><option value="corrected">Corregida</option></select></label>
            {assignment.snapshot_measurement_mode === "frequency" || assignment.snapshot_measurement_mode === "both" ? <label><span>Frecuencia</span><select disabled={disabled} value={assignment.current_frequency ?? 0} onChange={(event) => void updateCorrection(assignment, { frequency: Number(event.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}
            {assignment.snapshot_measurement_mode === "importance" || assignment.snapshot_measurement_mode === "both" ? <label><span>Importancia</span><select disabled={disabled} value={assignment.current_importance ?? 0} onChange={(event) => void updateCorrection(assignment, { importance: Number(event.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}
          </div>
        ) : (
          <div className={styles.controls}>
            <label><span>Estado</span><select disabled={disabled} value={assignment.assignment_status} onChange={(event) => void updateLearning(assignment, event.target.value)}><option value="pending">Pendiente</option><option value="explained">Explicada</option></select></label>
            {assignment.assignment_status === "explained" ? <button type="button" disabled={Boolean(busy)} onClick={() => void markReviewed(assignment.content_id, content.content_type)}>Marcar repasada hoy</button> : null}
          </div>
        )}
      </article>
    );
  }

  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <div className={styles.icon}><BookOpenCheck /></div>
        <div><p>Antes de cerrar</p><h2>Revisar contenido trabajado</h2><span>Añade lo que olvidaste o corrige un estado antes de enviar el resumen.</span></div>
        <button type="button" className={styles.toggle} onClick={() => setOpen((value) => !value)}>{open ? <><X /> Cerrar</> : <>Editar contenido</>}</button>
      </header>

      {open ? (
        <div className={styles.editor}>
          {participants.length > 1 ? <div className={styles.people}>{participants.map((row) => <button type="button" key={row.person_id} className={personId === row.person_id ? styles.active : ""} onClick={() => setPersonId(row.person_id)}>{students.find((student) => student.id === row.person_id)?.display_name ?? "Alumno"}</button>)}</div> : <div className={styles.singlePerson}><strong>{studentName}</strong></div>}

          <div className={styles.sectionHead}><div><p>Trabajo registrado</p><h3>Lo que consta en esta clase</h3></div><span>{workedContentIds.size}</span></div>
          {loading ? <div className={styles.empty}>Cargando…</div> : null}
          {!loading && workedAssignments.length ? <div className={styles.list}>{workedAssignments.map(renderAssignment)}</div> : null}
          {!loading ? Array.from(latestExerciseEvents.values()).map((event) => {
            const state = event.event_type.replace("exercise_", "") as "pending" | "active" | "completed";
            return <article className={styles.item} key={`exercise-${event.content_id}`}><div className={styles.itemHead}><span>Ejercicio</span><div><strong>{event.teaching_contents?.title ?? "Ejercicio"}</strong><small>{assignmentLabel("exercise", state)}</small></div></div><div className={styles.controls}><label><span>Estado</span><select disabled={busy === `exercise-${event.content_id}`} value={state} onChange={(change) => void setExercise(event.content_id, change.target.value as typeof state)}><option value="pending">Pendiente</option><option value="active">Activo</option><option value="completed">Realizado</option></select></label></div></article>;
          }) : null}
          {!loading && !workedAssignments.length && !latestExerciseEvents.size ? <div className={styles.empty}>Todavía no consta contenido trabajado. Puedes buscarlo y añadirlo ahora.</div> : null}

          <div className={styles.sectionHead}><div><p>Añadir o localizar</p><h3>Buscar contenido</h3></div><button type="button" onClick={() => setQuickOpen((value) => !value)}><Plus /> Crear nuevo</button></div>
          {quickOpen ? <div className={styles.quick}><div className={styles.quickTop}><select value={quickKind} onChange={(event) => setQuickKind(event.target.value as QuickKind)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Título corto" /></div>{quickKind === "correction" ? <div className={styles.controls}><label><span>Medir por</span><select value={measurementMode} onChange={(event) => setMeasurementMode(event.target.value as MeasurementMode)}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label>{measurementMode === "frequency" || measurementMode === "both" ? <label><span>Frecuencia</span><select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{measurementMode === "importance" || measurementMode === "both" ? <label><span>Importancia</span><select value={importance} onChange={(event) => setImportance(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div> : null}<button type="button" className={styles.primary} disabled={!quickTitle.trim() || busy === "quick"} onClick={() => void createQuick()}>{busy === "quick" ? "Guardando…" : "Crear y añadir"}</button></div> : null}

          <div className={styles.searchBar}><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar corrección, explicación, ejercicio o secuencia…" /></div>
          <div className={styles.filters}>{([['all','Todo'],['correction','Correcciones'],['explanation','Explicaciones'],['exercise','Ejercicios'],['sequence','Secuencias']] as const).map(([value,label]) => <button type="button" key={value} className={kind === value ? styles.active : ""} onClick={() => setKind(value)}>{label}</button>)}</div>

          <div className={styles.results}>{results.map((result) => {
            const assignment = assignments.find((row) => row.content_id === result.content_id);
            const exercise = latestExerciseEvents.get(result.content_id);
            if (assignment) return renderAssignment(assignment);
            if (exercise) {
              const state = exercise.event_type.replace("exercise_", "") as "pending" | "active" | "completed";
              return <article className={styles.searchItem} key={`result-${result.content_id}`}><div><span>{kindLabels[result.content_type]}</span><strong>{result.title}</strong><small>{assignmentLabel("exercise", state)}</small></div><select disabled={busy === `exercise-${result.content_id}`} value={state} onChange={(event) => void setExercise(result.content_id, event.target.value as typeof state)}><option value="pending">Pendiente</option><option value="active">Activo</option><option value="completed">Realizado</option></select></article>;
            }
            return <article className={styles.searchItem} key={`result-${result.content_id}`}><div><span>{kindLabels[result.content_type]}</span><strong>{result.title}</strong><small>{result.ready ? "Disponible para esta clase" : "Incompleto · solo profesores"}</small></div>{result.ready ? <button type="button" disabled={Boolean(busy)} onClick={() => void addExisting(result)}><Plus /> Añadir</button> : null}</article>;
          })}</div>
          {!results.length && !loading ? <div className={styles.empty}>No hay coincidencias para este contexto.</div> : null}

          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.note}><CheckCircle2 /><span>Los cambios se guardan al momento y se reflejan en el resumen antes del cierre pedagógico.</span></div>
        </div>
      ) : null}
    </section>
  );
}
