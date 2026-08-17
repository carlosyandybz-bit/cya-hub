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

const foundations = [
  "Color",
  "Tipografía",
  "Espaciado",
  "Geometría",
  "Elevación",
  "Motion",
];

const componentFamilies = [
  "Botones",
  "Inputs",
  "Navegación",
  "Cards y listas",
  "Modales y sheets",
  "Estados",
];

export default function StagingLabPage() {
  if (!isStagingRuntime()) notFound();

  return (
    <main className={styles.shell} data-staging-only="true">
      <header className={styles.header}>
        <p className={styles.kicker}>STAGING_ONLY · CYA HUB</p>
        <h1>Design Lab</h1>
        <p className={styles.lede}>
          Superficie interna para comparar, probar y validar el lenguaje visual de CYA Hub sin duplicar la aplicación ni exponer herramientas de desarrollo en producción.
        </p>
      </header>

      <section className={styles.statusGrid} aria-label="Estado del laboratorio">
        <article>
          <span>Entorno</span>
          <strong>Staging verificado</strong>
        </article>
        <article>
          <span>Supabase</span>
          <strong>{STAGING_PROJECT_REF}</strong>
        </article>
        <article>
          <span>Aislamiento</span>
          <strong>Build guard activo</strong>
        </article>
      </section>

      <section className={styles.section}>
        <div>
          <p className={styles.eyebrow}>Foundations</p>
          <h2>Sistema visual</h2>
        </div>
        <div className={styles.rail}>
          {foundations.map((item) => (
            <div className={styles.tile} key={item}>{item}</div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div>
          <p className={styles.eyebrow}>Componentes</p>
          <h2>Familias canónicas</h2>
        </div>
        <div className={styles.rail}>
          {componentFamilies.map((item) => (
            <div className={styles.tile} key={item}>{item}</div>
          ))}
        </div>
      </section>

      <aside className={styles.note}>
        Esta primera superficie valida el aislamiento. Las siguientes iteraciones conectarán tokens reales, estados, responsive, motion, comparadores y evidencias Playwright.
      </aside>
    </main>
  );
}
