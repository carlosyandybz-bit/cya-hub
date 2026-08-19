"use client";

import { Bell, ChevronRight, Search, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import styles from "./playground.module.css";

export default function DesignSystemPlayground() {
  const [tab, setTab] = useState("Resumen");
  const [open, setOpen] = useState(false);

  return <main className={styles.page} data-testid="v51-playground">
    <div className={styles.inner}>
      <header className={styles.hero}>
        <span className={styles.label}>STAGING ONLY · CYA DESIGN SYSTEM V51</span>
        <h1>Sistema visual global</h1>
        <p>Referencia: Inicio del profesor. Esta página valida material, controles, estados y comportamiento antes de aplicarlo al resto de CYA Hub.</p>
      </header>

      <section className={styles.grid}>
        <article className={`card ${styles.panel}`} data-testid="buttons-panel">
          <div className="card-head"><h2>Botones y acciones</h2><span>Estados</span></div>
          <div className={styles.stack}>
            <div className={styles.row}><button className="btn">Acción principal</button><button className="btn ghost">Secundaria</button><button className="icon-btn" aria-label="Notificaciones"><Bell /></button><button className="btn" disabled>Desactivada</button></div>
            <button className={styles.interactiveRow}><span><UserRound /></span><span><strong>Fila interactiva</strong><small>Material y jerarquía compartidos</small></span><ChevronRight /></button>
          </div>
        </article>

        <article className={`card ${styles.panel}`} data-testid="form-panel">
          <div className="card-head"><h2>Formularios y búsqueda</h2><span>48 px</span></div>
          <div className={styles.fields}>
            <label className="field"><span>Nombre</span><input placeholder="Escribe un nombre" /></label>
            <label className="field"><span>Tipo</span><select defaultValue="student"><option value="student">Alumno</option><option value="teacher">Profesor</option></select></label>
            <label className={`field ${styles.wide}`}><span>Notas</span><textarea placeholder="Información útil" /></label>
            <label className={`search ${styles.wide}`}><Search /><input placeholder="Buscar en CYA Hub" /></label>
          </div>
        </article>

        <article className={`card ${styles.panel}`} data-testid="tabs-panel">
          <div className="card-head"><h2>Tabs, chips y feedback</h2><span>Consistencia</span></div>
          <div className={styles.stack}>
            <div className={`segmented ${styles.demoTabs}`}>{["Resumen","Actividad","Datos"].map((value)=><button key={value} className={tab===value?"active":""} onClick={()=>setTab(value)}>{value}</button>)}</div>
            <div className={styles.row}><span className="badge">Pendiente</span><span className="badge portal">Completado</span></div>
            <p className="success">Los cambios se han guardado correctamente.</p>
            <p className="error">Hay un dato que necesita revisión.</p>
          </div>
        </article>

        <article className={`card ${styles.panel}`} data-testid="empty-panel">
          <div className="card-head"><h2>Vacíos y loading</h2><span>Estados</span></div>
          <div className={`empty ${styles.emptyDemo}`}><Sparkles /><strong>Todo al día</strong><p>No hay elementos pendientes en esta sección.</p><button className="btn ghost">Ver historial</button></div>
        </article>
      </section>

      <section className={`card ${styles.panel}`} data-testid="modal-panel">
        <div className="card-head"><h2>Modal / drawer</h2><button className="btn ghost" onClick={()=>setOpen((value)=>!value)}>{open?"Cerrar":"Abrir prueba"}</button></div>
        <div className={styles.modalStage}>
          {open ? <div className={`backdrop ${styles.fakeBackdrop}`}>
            <section className={`modal ${styles.fakeModal}`} role="dialog" aria-modal="true" aria-label="Modal de prueba">
              <header className="modal-head"><h2>Editar información</h2><button className="icon-btn" onClick={()=>setOpen(false)} aria-label="Cerrar modal">×</button></header>
              <div className={`modal-body ${styles.fakeModalBody}`}><label className="field"><span>Título</span><input defaultValue="Clase privada" /></label><div className={styles.row}><button className="btn ghost" onClick={()=>setOpen(false)}>Cancelar</button><button className="btn" onClick={()=>setOpen(false)}>Guardar</button></div></div>
            </section>
          </div> : <p>Abre el modal para validar superficie, borde, jerarquía y controles.</p>}
        </div>
      </section>
    </div>
  </main>;
}
