"use client";

import { useState } from "react";
import { PullToRefresh } from "../../pull-to-refresh";
import styles from "./playground.module.css";

export default function PullRefreshPlaygroundClient({ serverStamp }: { serverStamp: number }) {
  const [draft, setDraft] = useState("Contexto conservado");

  return (
    <main className={styles.shell} data-testid="pull-refresh-playground">
      <PullToRefresh />

      <header className={styles.header}>
        <p className={styles.kicker}>STAGING_ONLY · V1-010</p>
        <h1>Pull to refresh</h1>
        <p>Desliza hacia abajo desde el borde superior. La ruta y el estado cliente deben permanecer intactos.</p>
      </header>

      <section className={styles.card}>
        <span>Render servidor</span>
        <strong data-testid="server-stamp">{serverStamp}</strong>
      </section>

      <section className={styles.card}>
        <label htmlFor="draft">Estado cliente que debe sobrevivir</label>
        <input
          id="draft"
          data-testid="context-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </section>

      <section className={styles.card}>
        <span>Contrato</span>
        <ul>
          <li>Solo actúa en scroll 0.</li>
          <li>No hace reload duro.</li>
          <li>Espera autosaves registrados antes de revalidar.</li>
          <li>Confirma con “Actualizado”.</li>
        </ul>
      </section>

      <div className={styles.spacer} aria-hidden="true" />
      <section className={styles.card} data-testid="below-fold-card">
        <span>Prueba de scroll</span>
        <strong>Si estás aquí abajo, el gesto no debe activar refresh.</strong>
      </section>
    </main>
  );
}
