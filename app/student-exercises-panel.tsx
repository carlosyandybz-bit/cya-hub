"use client";

import { CheckCircle2, Dumbbell, History } from "lucide-react";

type StudentExercise = {
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

function ExerciseRow({ exercise, historical = false }: { exercise: StudentExercise; historical?: boolean }) {
  return (
    <article className={`portal-learning-row student-exercise-row ${historical ? "is-history" : "is-active"}`}>
      <div className="student-exercise-icon" aria-hidden="true">{historical ? <CheckCircle2 /> : <Dumbbell />}</div>
      <div className="student-exercise-copy">
        <span className="content-kind">{exercise.parent_type === "correction" ? "Corrección" : "Explicación"}</span>
        <strong>{exercise.title}</strong>
        <p>{exercise.context_label}</p>
        {exercise.summary || exercise.description ? <small>{exercise.summary || exercise.description}</small> : null}
        <div className="student-exercise-meta">
          {exercise.parent_level ? <span>Nivel {exercise.parent_level}</span> : null}
          {exercise.requires_partner ? <span>Necesita pareja</span> : null}
          {historical ? <span>Histórico</span> : <span>Activo</span>}
        </div>
      </div>
    </article>
  );
}

export function StudentExercisesPanel({ exercises }: { exercises: StudentExercise[] }) {
  const active = exercises.filter((exercise) => exercise.state === "active");
  const history = exercises.filter((exercise) => exercise.state === "history");

  if (!active.length && !history.length) return null;

  return (
    <section className="card portal-card student-exercises-panel">
      <div className="card-head">
        <div>
          <p className="eyebrow">Práctica personal</p>
          <h2>Ejercicios para mejorar</h2>
        </div>
        <span>{active.length}</span>
      </div>

      {active.length ? (
        <div className="portal-learning-list student-exercise-list">
          {active.map((exercise) => <ExerciseRow key={exercise.exercise_id} exercise={exercise} />)}
        </div>
      ) : (
        <div className="compact-empty"><CheckCircle2 /><span>No tienes ejercicios activos ahora mismo.</span></div>
      )}

      {history.length ? (
        <details className="student-exercise-history">
          <summary><History /> Histórico <span>{history.length}</span></summary>
          <div className="portal-learning-list student-exercise-list">
            {history.map((exercise) => <ExerciseRow key={`history-${exercise.exercise_id}`} exercise={exercise} historical />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
