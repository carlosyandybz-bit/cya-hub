"use client";

import { Check, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { useMemo } from "react";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import styles from "./experience-switcher.module.css";

type ExperienceSwitcherProps = {
  identity: IdentityContext;
  experience: ExperienceContext;
  busy?: boolean;
  onSelect: (value: ExperienceContext) => void | Promise<void>;
};

const labels: Record<ExperienceContext, string> = {
  teacher: "Profesor",
  student: "Alumno",
  admin: "Administrador",
};

const descriptions: Record<ExperienceContext, string> = {
  teacher: "Clases, alumnado y enseñanza",
  student: "Tu aprendizaje y progreso",
  admin: "Configuración y gobierno de CYA",
};

function ExperienceIcon({ value }: { value: ExperienceContext }) {
  if (value === "admin") return <ShieldCheck aria-hidden="true" />;
  if (value === "student") return <UserRound aria-hidden="true" />;
  return <UsersRound aria-hidden="true" />;
}

function allowedContexts(identity: IdentityContext) {
  const values: ExperienceContext[] = [];
  if (identity.can_teach) values.push("teacher");
  if (identity.can_study) values.push("student");
  if (identity.can_admin) values.push("admin");
  return values;
}

export function ExperienceSwitcher({ identity, experience, busy = false, onSelect }: ExperienceSwitcherProps) {
  const contexts = useMemo(
    () => allowedContexts(identity),
    [identity.can_admin, identity.can_study, identity.can_teach],
  );

  if (contexts.length <= 1) return null;

  return (
    <section className={styles.root} aria-labelledby="experience-switcher-title">
      <div className={styles.heading}>
        <div>
          <strong id="experience-switcher-title">Ver como</strong>
          <span>Elige la experiencia que quieres usar ahora</span>
        </div>
        <span className={styles.currentLabel}>Vista actual · {labels[experience]}</span>
      </div>

      <div className={styles.options} role="group" aria-label="Cambiar experiencia">
        {contexts.map((context) => {
          const active = context === experience;
          return (
            <button
              key={context}
              type="button"
              className={`${styles.option} ${active ? styles.active : ""}`}
              aria-pressed={active}
              aria-label={`${labels[context]}${active ? ", vista actual" : ""}. ${descriptions[context]}`}
              disabled={busy}
              onClick={() => void onSelect(context)}
            >
              <ExperienceIcon value={context} />
              <span className={styles.optionText}>
                <strong>{labels[context]}</strong>
                <small>{descriptions[context]}</small>
              </span>
              {active ? <span className={styles.activeMark}><Check aria-hidden="true" /><span>Actual</span></span> : null}
            </button>
          );
        })}
      </div>

      <p className={styles.note}>Cambiar de vista no cambia tus permisos reales.</p>
    </section>
  );
}
