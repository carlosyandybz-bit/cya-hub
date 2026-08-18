"use client";

import { useEffect, useState } from "react";

const modules = [
  ["home", "Inicio"],
  ["students", "Alumnado"],
  ["live", "Dar clase"],
  ["teaching", "Enseñanza"],
  ["marketing", "Marketing"],
  ["admin", "Administración"],
  ["student-progress", "Progreso alumno"],
  ["student-formation", "Mi formación"],
  ["student-discover", "Descubre"],
  ["student-missions", "Misiones"],
] as const;

type ModuleId = typeof modules[number][0];

export default function ModuleIdentityPlayground() {
  const [active, setActive] = useState<ModuleId>("home");
  useEffect(() => {
    document.body.dataset.cyaModule = active;
    return () => { delete document.body.dataset.cyaModule; };
  }, [active]);

  return <main style={{minHeight:"100dvh",padding:"24px",maxWidth:980,margin:"0 auto"}} data-testid="module-identity-playground">
    <header className="page-head"><div><p className="eyebrow">CYA Hub · Playground</p><h1>Identidad modular</h1><p>Cada módulo monopoliza su acento visual y el motivo CYA se integra como firma.</p></div></header>
    <div className="module-tabs" role="tablist" aria-label="Módulos de prueba" style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
      {modules.map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={active===id} className={active===id?"active":""} onClick={()=>setActive(id)}>{label}</button>)}
    </div>
    <section className="focus"><div><small>MÓDULO ACTIVO</small><h2>{modules.find(([id])=>id===active)?.[1]}</h2><p>Superficie principal con marca CYA integrada y acento único.</p><button className="btn">Acción principal</button></div></section>
    <section className="grid-2">
      <article className="card pad"><div className="card-head"><h2>Tarjeta importante</h2><span>01</span></div><label className="field"><span>Campo</span><input aria-label="Campo de prueba" placeholder="Prueba focus" /></label><div className="actions" style={{marginTop:12}}><button className="btn ghost">Secundaria</button><span className="badge">Etiqueta</span></div></article>
      <article className="card pad"><div className="card-head"><h2>Estados</h2></div><p className="success">Operación correcta</p><p className="error">Error real conservando semántica</p></article>
    </section>
    <nav className="mobile-nav" aria-label="Dock de prueba" style={{position:"relative",display:"grid",marginTop:96,minHeight:78}}>
      <button>Inicio</button><button>Alumnado</button><button className="primary"><span className="mobile-nav-logo"><img src="/cya-logo.png" alt="" /></span><span>Dar clase</span></button><button>Enseñanza</button><button>Marketing</button>
      <button className="mobile-nav-secondary" aria-label="Más opciones de clase"><span>Más</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
    </nav>
  </main>;
}
