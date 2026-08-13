"use client";

import { Activity, BarChart3, BookOpenCheck, CalendarDays, CircleDollarSign, Megaphone, Target, UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import styles from "./statistics-view.module.css";

type PeriodDays=30|90|365;
type Snapshot={generated_at:string;current:Record<string,number>;pedagogy:Record<string,number|null>;marketing:Record<string,number>;operation:Record<string,number>};
function number(value=0){return new Intl.NumberFormat("es-ES").format(value);}
function euros(cents=0){return new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(cents/100);}
function minutes(value=0){const h=Math.floor(value/60),m=Math.round(value%60);return h?`${h} h${m?` ${m} min`:""}`:`${m} min`;}
function Metric({label,value,icon:Icon}:{label:string;value:string;icon:typeof BarChart3}){return <article className={styles.metric}><span className={styles.metricIcon}><Icon/></span><div><span>{label}</span><strong>{value}</strong></div></article>;}

export function StatisticsExplorer({client,leave,notify}:{client:SupabaseClient;leave:()=>void;notify:(message:string)=>void}){
  const [days,setDays]=useState<PeriodDays>(30),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);const result=await client.rpc("teacher_statistics_snapshot",{p_days:days});if(result.error){notify(result.error.message);setSnapshot(null);}else setSnapshot(result.data as Snapshot);setLoading(false);},[client,days,notify]);
  useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer);},[load]);
  const current=snapshot?.current??{},pedagogy=snapshot?.pedagogy??{},marketing=snapshot?.marketing??{},operation=snapshot?.operation??{};
  const generated=snapshot?.generated_at?new Intl.DateTimeFormat("es-ES",{dateStyle:"medium",timeStyle:"short"}).format(new Date(snapshot.generated_at)):"";
  return <section className={styles.workspace}>
    <header className={styles.hero}><div><button type="button" onClick={leave}>‹ Volver</button><span>Análisis CYA</span><h1>Todas las estadísticas</h1><p>Explorador general de los bloques disponibles. Tu portada principal sigue siendo el panel configurable.</p></div><BarChart3/></header>
    <div className={styles.toolbar}><div className={styles.periods}>{([30,90,365] as PeriodDays[]).map((value)=><button key={value} type="button" className={days===value?styles.activePeriod:""} onClick={()=>setDays(value)}>{value===365?"1 año":`${value} días`}</button>)}</div></div>
    {loading?<div className={styles.loading}>Actualizando estadísticas…</div>:snapshot?<>
      <h2>Negocio y alumnado</h2><div className={styles.metricGrid}><Metric icon={UsersRound} label="Alumnos activos" value={number(current.students_active)}/><Metric icon={UsersRound} label="Nuevos alumnos" value={number(current.new_students)}/><Metric icon={CircleDollarSign} label="Bonos cobrados" value={euros(current.credit_sales_cents)}/><Metric icon={Activity} label="Bonos vendidos" value={number(current.credit_grants_sold)}/></div>
      <h2>Clases</h2><div className={styles.metricGrid}><Metric icon={CalendarDays} label="Clases terminadas" value={number(current.classes_finished)}/><Metric icon={CalendarDays} label="Tiempo impartido" value={minutes(current.class_minutes)}/><Metric icon={UsersRound} label="Asistencias" value={number(current.attendance_present)}/><Metric icon={Activity} label="Ausencias" value={number(current.attendance_absent)}/></div>
      <h2>Enseñanza</h2><div className={styles.metricGrid}><Metric icon={BookOpenCheck} label="Asignaciones creadas" value={number(Number(pedagogy.assignments_created??0))}/><Metric icon={BookOpenCheck} label="Asignaciones completadas" value={number(Number(pedagogy.assignments_completed??0))}/><Metric icon={Target} label="Pendientes" value={number(Number(pedagogy.assignments_pending??0))}/><Metric icon={BarChart3} label="Evaluaciones" value={number(Number(pedagogy.evaluations??0))}/></div>
      <h2>Marketing</h2><div className={styles.metricGrid}><Metric icon={Megaphone} label="Campañas" value={number(marketing.campaigns)}/><Metric icon={CircleDollarSign} label="Inversión" value={euros(marketing.spend_cents)}/><Metric icon={CircleDollarSign} label="Ingresos atribuidos" value={euros(marketing.revenue_cents)}/><Metric icon={UsersRound} label="Reservas" value={number(marketing.bookings)}/></div>
      <h2>Operación</h2><div className={styles.metricGrid}><Metric icon={Target} label="Misiones abiertas" value={number(operation.missions_open)}/><Metric icon={Target} label="Misiones completadas" value={number(operation.missions_completed)}/><Metric icon={Activity} label="Notificaciones enviadas" value={number(operation.notifications_sent)}/><Metric icon={Activity} label="Notificaciones fallidas" value={number(operation.notifications_failed)}/></div>
      <footer className={styles.footer}>Actualizado {generated}. Esta vista usa únicamente datos reales registrados.</footer>
    </>:<div className={styles.loading}>No se han podido cargar las estadísticas.</div>}
  </section>;
}
