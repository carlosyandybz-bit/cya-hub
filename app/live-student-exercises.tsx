"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Dumbbell, History } from "lucide-react";
import styles from "./live-student-exercises.module.css";

type DerivedExercise = {
  exercise_id: number;
  title: string;
  summary: string | null;
  description: string | null;
  requires_partner: boolean;
  state: "active" | "history";
  parent_type: "correction" | "explanation";
  parent_content_id: number;
  parent_title: string;
  parent_status: string;
  parent_level: string | null;
  current_level: string | null;
  updated_at: string;
  context_label: string;
};

type ClassExerciseEvent = {
  id: number;
  person_id: number;
  content_id: number;
  event_type: string;
  created_at: string;
  teaching_contents?: { title: string; content_type: string } | null;
};

function eventPriority(type: string) {
  if (type === "exercise_completed") return 3;
  if (type === "exercise_active") return 2;
  if (type === "exercise_pending") return 1;
  return 0;
}

export function LiveStudentExercises({
  client,
  personId,
  classId,
  participantCount,
  classEvents,
  notify,
  onChanged,
}: {
  client: SupabaseClient;
  personId: number;
  classId: number;
  participantCount: number;
  classEvents: ClassExerciseEvent[];
  notify: (message: string) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [exercises, setExercises] = useState<DerivedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await client.rpc("get_student_derived_exercises", { p_person_id: personId });
    if (result.error) {
      setError(result.error.message);
      setExercises([]);
    } else {
      setError("");
      setExercises((result.data ?? []) as DerivedExercise[]);
    }
    setLoading(false);
  }, [client, personId]);

  useEffect(() => {
    void load();
    const channel = client
      .channel(`live-derived-exercises-${personId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "student_content_assignments", filter: `person_id=eq.${personId}` }, () => void load())
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, load, personId]);

  const todayEvents = useMemo(() => {
    const latest = new Map<number, ClassExerciseEvent>();
    classEvents
      .filter((event) => event.person_id === personId && event.event_type.startsWith("exercise_"))
      .forEach((event) => {
        const current = latest.get(event.content_id);
        if (!current || new Date(event.created_at).getTime() > new Date(current.created_at).getTime() || eventPriority(event.event_type) > eventPriority(current.event_type)) latest.set(event.content_id, event);
      });
    return [...latest.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [classEvents, personId]);

  const eventByExercise = useMemo(() => new Map(todayEvents.map((event) => [event.content_id, event])), [todayEvents]);
  const active = exercises.filter((exercise) => exercise.state === "active");
  const history = exercises.filter((exercise) => exercise.state === "history");
  const exerciseById = useMemo(() => new Map(exercises.map((exercise) => [exercise.exercise_id, exercise])), [exercises]);

  async function record(exercise: DerivedExercise, eventType: "exercise_active" | "exercise_completed") {
    if (exercise.requires_partner && participantCount < 2) {
      notify("Este ejercicio necesita pareja.");
      return;
    }
    setBusy(`${exercise.exercise_id}-${eventType}`);
    const result = await client.rpc("record_class_content_event", {
      p_class_id: classId,
      p_person_id: personId,
      p_content_id: exercise.exercise_id,
      p_event_type: eventType,
      p_payload: { derived_from: exercise.parent_type, parent_content_id: exercise.parent_content_id },
    });
    if (result.error) notify(result.error.message);
    else await onChanged();
    setBusy("");
  }

  return (
    <article className={`card live-card exercise-card ${styles.panel}`}>
      <div className="live-card-head">
        <div><p className="eyebrow">Estado del alumno</p><h2>Ejercicios para mejorar</h2></div>
        <span className="badge">{active.length}</span>
      </div>

      {loading ? <div className="compact-empty"><span className="spinner"/><span>Cargando ejercicios del alumno…</span></div> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && !error && active.length ? (
        <div className={styles.activeList}>
          {active.map((exercise) => {
            const event = eventByExercise.get(exercise.exercise_id);
            const completed = event?.event_type === "exercise_completed";
            const activeToday = event?.event_type === "exercise_active";
            return (
              <article className={styles.exercise} data-parent={exercise.parent_type} key={exercise.exercise_id}>
                <div className={styles.exerciseMain}>
                  <span className={styles.kind}>{exercise.parent_type === "correction" ? "Para corregir" : "Para mejorar"}</span>
                  <strong>{exercise.title}</strong>
                  <p>{exercise.context_label}</p>
                  {exercise.summary || exercise.description ? <small>{exercise.summary || exercise.description}</small> : null}
                  <div className={styles.meta}>
                    {exercise.parent_level ? <span>{exercise.parent_level}</span> : null}
                    {exercise.requires_partner ? <span>Necesita pareja</span> : null}
                  </div>
                </div>
                <div className={styles.actions}>
                  {completed ? <span className={styles.done}><CheckCircle2/> Realizado hoy</span> : activeToday ? <button className="btn" disabled={Boolean(busy)} onClick={() => void record(exercise, "exercise_completed")}>Marcar realizado</button> : <button className="btn ghost" disabled={Boolean(busy) || (exercise.requires_partner && participantCount < 2)} onClick={() => void record(exercise, "exercise_active")}>{exercise.requires_partner && participantCount < 2 ? "Necesita pareja" : "Usar hoy"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : !loading && !error ? <div className="compact-empty"><CheckCircle2/><span>No hay ejercicios activos derivados de sus correcciones o explicaciones.</span></div> : null}

      {todayEvents.length ? (
        <section className={styles.today}>
          <div className={styles.subhead}><strong>Trabajados hoy</strong><span>{todayEvents.length}</span></div>
          <div className={styles.todayList}>
            {todayEvents.map((event) => {
              const exercise = exerciseById.get(event.content_id);
              return <div key={event.content_id}><Dumbbell/><div><strong>{exercise?.title || event.teaching_contents?.title || "Ejercicio"}</strong><span>{event.event_type === "exercise_completed" ? "Realizado" : event.event_type === "exercise_active" ? "En práctica" : "Pendiente"}</span></div></div>;
            })}
          </div>
        </section>
      ) : null}

      {history.length ? (
        <details className={styles.history}>
          <summary><History/> Histórico <span>{history.length}</span></summary>
          <div className={styles.historyList}>
            {history.map((exercise) => <div key={`history-${exercise.exercise_id}`}><strong>{exercise.title}</strong><span>{exercise.context_label}</span>{exercise.parent_level ? <small>Nivel {exercise.parent_level}</small> : null}</div>)}
          </div>
        </details>
      ) : null}
    </article>
  );
}
