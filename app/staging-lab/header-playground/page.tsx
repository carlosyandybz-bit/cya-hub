import { notFound } from "next/navigation";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function isStagingRuntime() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  try {
    return new URL(rawUrl).hostname === `${STAGING_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export default function StudentHeaderPlayground() {
  if (!isStagingRuntime()) notFound();

  return (
    <main className={styles.stage} data-staging-only="true">
      <section className={styles.phone} aria-label="Playground cabecera alumno">
        <header className={styles.topbar} data-testid="student-header-playground">
          <button className={styles.brand} type="button" aria-label="Ir a Inicio">
            <span className={styles.mark} aria-hidden="true">∞</span>
            <strong>CYA</strong>
            <span>Hub</span>
          </button>
          <div className={styles.actions} aria-label="Acciones de cuenta">
            <button type="button" aria-label="Notificaciones">◌</button>
            <button type="button" aria-label="Cuenta">CA</button>
          </div>
        </header>
        <div className={styles.content}>
          <span>PLAYGROUND · HEADER</span>
          <h1>Referencia de alineación</h1>
          <p>El logo debe arrancar exactamente en el padding izquierdo de la cabecera. No existe columna central fantasma.</p>
        </div>
      </section>
    </main>
  );
}
