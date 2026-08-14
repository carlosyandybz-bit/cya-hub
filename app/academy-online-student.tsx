"use client";

import { GraduationCap, Sparkles } from "lucide-react";
import styles from "./academy-online.module.css";

export function AcademyOnlineStudentComingSoon() {
  return <section className={`card ${styles.soon}`} aria-labelledby="academy-student-title">
    <div className={styles.soonInner}>
      <GraduationCap className={styles.soonIcon} />
      <p className="eyebrow">Academia Online</p>
      <h2 id="academy-student-title">Próximamente</h2>
      <p>Estamos preparando una experiencia de formación online conectada con tu progreso real, tus explicaciones, ejercicios, secuencias y vídeos.</p>
      <span className="badge portal"><Sparkles /> En preparación</span>
    </div>
  </section>;
}
