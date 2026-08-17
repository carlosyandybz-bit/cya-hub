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

const colorTokens = [
  ["Canvas", "--cya-canvas"],
  ["Surface", "--cya-surface"],
  ["Elevated", "--cya-surface-elevated"],
  ["Interactive", "--cya-surface-interactive"],
  ["Text", "--cya-text"],
  ["Muted", "--cya-text-muted"],
  ["Accent", "--cya-accent"],
  ["Success", "--cya-success"],
  ["Warning", "--cya-warning"],
  ["Danger", "--cya-danger"],
  ["Info", "--cya-info"],
  ["Focus", "--cya-focus"],
] as const;

const spaces = [
  ["1", "4px"], ["2", "8px"], ["3", "12px"], ["4", "16px"],
  ["5", "20px"], ["6", "24px"], ["8", "32px"], ["10", "40px"],
] as const;

const motion = [
  ["Fast", "120 ms", "pressed / iconos"],
  ["Base", "180 ms", "selección / borde / color"],
  ["Slow", "280 ms", "modal / sheet / pantalla"],
] as const;

const navItems = ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"];

export default function StagingLabPage() {
  if (!isStagingRuntime()) notFound();

  return (
    <main className={styles.shell} data-staging-only="true">
      <header className={styles.header}>
        <p className={styles.kicker}>STAGING_ONLY · CYA HUB</p>
        <h1>Design Lab</h1>
        <p className={styles.lede}>
          Una superficie de inspección conectada al mismo Night Motion que utiliza CYA Hub. No es una segunda aplicación: aquí se prueban tokens, estados y patrones antes de aplicarlos al producto.
        </p>
      </header>

      <section className={styles.statusGrid} aria-label="Estado del laboratorio">
        <article><span>Entorno</span><strong>Staging verificado</strong></article>
        <article><span>Supabase</span><strong>{STAGING_PROJECT_REF}</strong></article>
        <article><span>Aislamiento</span><strong>Build + runtime guard</strong></article>
      </section>

      <section className={styles.section} aria-labelledby="lab-colors">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Foundations · Color</p>
          <h2 id="lab-colors">Paleta semántica</h2>
          <p>El color describe función y jerarquía. El violeta firma la marca; no debe convertirse en fondo decorativo indiscriminado.</p>
        </div>
        <div className={styles.swatchGrid}>
          {colorTokens.map(([label, token]) => (
            <article className={styles.swatchCard} key={token}>
              <span className={styles.swatch} style={{ background: `var(${token})` }} aria-hidden="true" />
              <strong>{label}</strong>
              <code>{token}</code>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lab-type">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Foundations · Tipografía</p>
          <h2 id="lab-type">Ritmo editorial + operación</h2>
          <p>Geist mantiene una voz común, pero el tamaño responde a la tarea: expresivo en orientación, compacto en operación.</p>
        </div>
        <div className={styles.typeStack}>
          <div className={styles.typeDisplay}>Movimiento que se entiende.</div>
          <div className={styles.typeHeading}>La próxima acción debe dominar.</div>
          <div className={styles.typeBody}>El cuerpo mantiene legibilidad y densidad suficiente para trabajar en iPhone sin desperdiciar altura útil.</div>
          <div className={styles.typeCaption}>LABEL · METADATO · 12 PX</div>
          <div className={styles.typeData}>01:25 · 3 correcciones · 75%</div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lab-space">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Foundations · Geometría</p>
          <h2 id="lab-space">Espacio, radio y toque</h2>
          <p>Una escala pequeña y deliberada sustituye valores aislados. Todo control táctil conserva un mínimo real de 44 × 44 px.</p>
        </div>
        <div className={styles.geometryPanel}>
          <div className={styles.spaceScale}>
            {spaces.map(([step, value]) => (
              <div className={styles.spaceRow} key={step}>
                <code>space-{step}</code>
                <span className={styles.spaceBar} style={{ width: value }} />
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className={styles.radiusRow}>
            <span className={styles.radiusControl}>14</span>
            <span className={styles.radiusCard}>20</span>
            <span className={styles.radiusFeature}>26</span>
            <span className={styles.touchTarget}>44</span>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lab-components">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Componentes reales</p>
          <h2 id="lab-components">Controles y estados</h2>
          <p>Estos ejemplos consumen las clases globales del producto; el laboratorio no mantiene una copia paralela de los botones o formularios.</p>
        </div>
        <div className={styles.componentStack}>
          <div className={styles.controlGroup}>
            <span className={styles.groupLabel}>Botones</span>
            <div className={styles.buttonRow}>
              <button className="btn" type="button">Acción principal</button>
              <button className="btn ghost" type="button">Secundaria</button>
              <button className="btn" type="button" disabled>Deshabilitada</button>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.groupLabel}>Formulario</span>
            <div className={styles.formGrid}>
              <label className="field"><span>Título</span><input defaultValue="Conexión y movimiento" /></label>
              <label className="field"><span>Tipo</span><select defaultValue="explanation"><option value="explanation">Explicación</option><option value="correction">Corrección</option></select></label>
              <label className="field"><span>Descripción</span><textarea defaultValue="Ejemplo para comprobar densidad, foco y lectura." /></label>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.groupLabel}>Semántica</span>
            <div className={styles.stateRow}>
              <span className={`${styles.state} ${styles.success}`}>Correcto</span>
              <span className={`${styles.state} ${styles.warning}`}>Revisar</span>
              <span className={`${styles.state} ${styles.danger}`}>Error</span>
              <span className={`${styles.state} ${styles.info}`}>Información</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lab-navigation">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Patrón estratégico</p>
          <h2 id="lab-navigation">Jerarquía móvil</h2>
          <p>La navegación conserva cinco destinos. “Dar clase” domina por forma y posición, no por ocupar una franja vertical desproporcionada.</p>
        </div>
        <div className={styles.phoneStage}>
          <div className={styles.phoneCanvas}>
            <span className={styles.phoneLabel}>Contenido útil protegido</span>
            <strong>Ahora</strong>
            <p>Una acción dominante y contexto suficiente. El laboratorio medirá cuánto viewport queda realmente disponible.</p>
          </div>
          <nav className={styles.navPrototype} aria-label="Prototipo de navegación inferior">
            {navItems.map((item) => (
              <button className={item === "Dar clase" ? styles.liveNav : styles.navItem} type="button" key={item}>
                <span aria-hidden="true">{item === "Dar clase" ? "∞" : "•"}</span>
                <strong>{item}</strong>
              </button>
            ))}
          </nav>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="lab-motion">
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Motion</p>
          <h2 id="lab-motion">Movimiento con propósito</h2>
          <p>Transform y opacity, duraciones breves y reducción automática cuando el sistema solicita menos movimiento.</p>
        </div>
        <div className={styles.motionGrid}>
          {motion.map(([name, duration, use]) => (
            <article key={name}><span>{name}</span><strong>{duration}</strong><small>{use}</small></article>
          ))}
        </div>
      </section>

      <aside className={styles.note}>
        <strong>Contrato del laboratorio.</strong> Los experimentos permanecen aquí. Solo tokens, componentes o patrones explícitamente aprobados pasan a PRODUCTO.
      </aside>
    </main>
  );
}
