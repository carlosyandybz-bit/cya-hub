"use client";

import { useState } from "react";
import styles from "./central-controls-lab.module.css";

type Variant = "apex" | "prism" | "wing" | "orbit" | "arc" | "split";

const variants: Array<{ id: Variant; name: string; note: string }> = [
  { id: "apex", name: "Apex", note: "Vértice limpio + cavidad central" },
  { id: "prism", name: "Prism", note: "Diamante técnico + base facetada" },
  { id: "wing", name: "Wing", note: "Ala doble + cuerpo tensado" },
  { id: "orbit", name: "Orbit", note: "Pieza flotante + arco de recepción" },
  { id: "arc", name: "Arc", note: "Chevron ancho + base cóncava" },
  { id: "split", name: "Split", note: "Dos vértices + principal quebrado" },
];

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={open ? styles.chevronOpen : undefined}>
      <path d="M5 14.5 12 8l7 6.5" />
    </svg>
  );
}

function ControlPair({ variant, label }: { variant: Variant; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.controlStage} data-variant={variant} data-testid={`pair-${variant}-${label === "Dar clase" ? "teacher" : "student"}`}>
      <button
        type="button"
        className={`${styles.secondary} ${styles[`${variant}Secondary`]}`}
        aria-label={`Abrir opciones de ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.secondaryShape} aria-hidden="true" />
        <ChevronIcon open={open} />
      </button>

      <button type="button" className={`${styles.primary} ${styles[`${variant}Primary`]}`}>
        <span className={styles.primaryShape} aria-hidden="true" />
        <span className={styles.primaryLabel}>{label}</span>
      </button>

      <div className={`${styles.menuPreview} ${open ? styles.menuPreviewOpen : ""}`} aria-hidden={!open}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export default function CentralControlsLab() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>CYA HUB · LABORATORIO VISUAL</p>
          <h1>Controles centrales complementarios</h1>
          <p>
            Principal con texto. Secundario sin texto. Dos piezas independientes que se leen como un solo objeto.
          </p>
        </div>
        <div className={styles.rules}>
          <span>0 solape</span>
          <span>≥44 px táctil</span>
          <span>Profesor = Alumno</span>
        </div>
      </header>

      <section className={styles.grid}>
        {variants.map((variant) => (
          <article className={styles.card} key={variant.id} data-testid={`concept-${variant.id}`}>
            <div className={styles.cardHead}>
              <div>
                <strong>{variant.name}</strong>
                <small>{variant.note}</small>
              </div>
              <span>{variant.id.toUpperCase()}</span>
            </div>

            <div className={styles.previewRow}>
              <div className={styles.portalPreview}>
                <span className={styles.portalName}>Profesor</span>
                <ControlPair variant={variant.id} label="Dar clase" />
              </div>
              <div className={styles.portalPreview}>
                <span className={styles.portalName}>Alumno</span>
                <ControlPair variant={variant.id} label="Mi formación" />
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
