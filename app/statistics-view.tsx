"use client";

import { Activity, BarChart3, BookOpenCheck, CalendarDays, CircleDollarSign, Megaphone, Target, TrendingUp, UsersRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./statistics-view.module.css";

type PeriodDays = 30 | 90 | 365;
type Section = "summary" | "business" | "classes" | "students" | "marketing" | "operation";
type Snapshot = {
  days: number;
  generated_at: string;
  period: { from: string; to: string };
  previous_period: { from: string; to: string };
  current: Record<string, number>;
  previous: Record<string, number>;
  pedagogy: Record<string, number | null>;
  marketing: Record<string, number>;
  operation: Record<string, number>;
  future: Record<string, string>;
};

const sections: Array<[Section, string, typeof BarChart3]> = [
  ["summary", "Resumen", BarChart3],
  ["business", "Negocio", CircleDollarSign],
  ["classes", "Clases", CalendarDays],
  ["students", "Alumnado", UsersRound],
  ["marketing", "Marketing", Megaphone],
  ["operation", "Operación", Activity],
];

function euros(cents = 0) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100); }
function number(value = 0) { return new Intl.NumberFormat("es-ES").format(value); }
function minutes(value = 0) { const hours = Math.floor(value / 60), mins = value % 60; return hours ? `${hours} h ${mins ? `${mins} min` : ""}`.trim() : `${mins} min`; }
function percentChange(current = 0, previous = 0) { if (!previous) return current ? null : 0; return ((current - previous) / previous) * 100; }
function comparisonLabel(current: number, previous: number) {
  const change = percentChange(current, previous);
  if (change === null) return "Sin periodo anterior comparable";
  if (change === 0) return "Sin cambio frente al periodo anterior";
  return `${change > 0 ? "+" : ""}${Math.round(change)}% frente al periodo anterior`;
}

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof BarChart3 }) {
  return <article className={styles.metric}><span className={styles.metricIcon}><Icon /></span><div><span>{label}</span><strong>{value}</strong>{hint ? <small>{hint}</small> : null}</div></article>;
}

function Empty({ title, body }: { title: string; body: string }) {
  return <article className={styles.empty}><BarChart3 /><div><strong>{title}</strong><span>{body}</span></div></article>;
}

export function StatisticsView({ client, leave, notify }: { client: SupabaseClient; leave: () => void; notify: (message: string) => void }) {
  const [days, setDays] = useState<PeriodDays>(30);
  const [section, setSection] = useState<Section>("summary");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await client.rpc("teacher_statistics_snapshot", { p_days: days });
    if (result.error) { notify(result.error.message); setSnapshot(null); }
    else setSnapshot(result.data as Snapshot);
    setLoading(false);
  }, [client, days, notify]);

  useEffect(() => { void load(); }, [load]);

  const current = snapshot?.current ?? {};
  const previous = snapshot?.previous ?? {};
  const pedagogy = snapshot?.pedagogy ?? {};
  const marketing = snapshot?.marketing ?? {};
  const operation = snapshot?.operation ?? {};
  const attendanceTotal = (current.attendance_present ?? 0) + (current.attendance_absent ?? 0);
  const attendanceRate = attendanceTotal ? Math.round(((current.attendance_present ?? 0) / attendanceTotal) * 100) : null;
  const bookingRate = (marketing.inquiries ?? 0) ? Math.round(((marketing.bookings ?? 0) / marketing.inquiries) * 100) : null;
  const roi = (marketing.spend_cents ?? 0) > 0 ? Math.round((((marketing.revenue_cents ?? 0) - marketing.spend_cents) / marketing.spend_cents) * 100) : null;
  const generatedLabel = useMemo(() => snapshot?.generated_at ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.generated_at)) : "", [snapshot?.generated_at]);

  function summary() {
    return <>
      <div className={styles.metricGrid}>
        <Metric icon={UsersRound} label="Alumnos activos" value={number(current.students_active)} hint={`${number(current.new_students)} nuevos en el periodo`} />
        <Metric icon={CalendarDays} label="Clases realizadas" value={number(current.classes_finished)} hint={comparisonLabel(current.classes_finished ?? 0, previous.classes_finished ?? 0)} />
        <Metric icon={CircleDollarSign} label="Bonos cobrados" value={euros(current.credit_sales_cents)} hint={comparisonLabel(current.credit_sales_cents ?? 0, previous.credit_sales_cents ?? 0)} />
        <Metric icon={BookOpenCheck} label="Contenido completado" value={number(Number(pedagogy.assignments_completed ?? 0))} hint={`${number(Number(pedagogy.assignments_pending ?? 0))} pendientes ahora`} />
      </div>
      <div className={styles.twoColumns}>
        <article className={styles.panel}><header><div><span>Ritmo de trabajo</span><h2>Clases y aprendizaje</h2></div><TrendingUp /></header><div className={styles.readList}><div><span>Tiempo impartido</span><strong>{minutes(current.class_minutes ?? 0)}</strong></div><div><span>Asistencia</span><strong>{attendanceRate === null ? "Sin datos" : `${attendanceRate}%`}</strong></div><div><span>Alumnos evaluados</span><strong>{number(Number(pedagogy.students_evaluated ?? 0))}</strong></div><div><span>Evaluaciones realizadas</span><strong>{number(Number(pedagogy.evaluations ?? 0))}</strong></div></div></article>
        <article className={styles.panel}><header><div><span>Trabajo pendiente</span><h2>Lo que requiere atención</h2></div><Target /></header><div className={styles.readList}><div><span>Misiones abiertas</span><strong>{number(operation.missions_open ?? 0)}</strong></div><div><span>Misiones no realizadas/caducadas</span><strong>{number(operation.missions_not_done ?? 0)}</strong></div><div><span>Minutos sin cubrir</span><strong>{minutes(current.pending_debt_minutes ?? 0)}</strong></div><div><span>Notificaciones fallidas</span><strong>{number(operation.notifications_failed ?? 0)}</strong></div></div></article>
      </div>
    </>;
  }

  function business() {
    return <div className={styles.metricGrid}>
      <Metric icon={CircleDollarSign} label="Ingresos por bonos cobrados" value={euros(current.credit_sales_cents)} hint={comparisonLabel(current.credit_sales_cents ?? 0, previous.credit_sales_cents ?? 0)} />
      <Metric icon={BarChart3} label="Bonos vendidos" value={number(current.credit_grants_sold)} hint={comparisonLabel(current.credit_grants_sold ?? 0, previous.credit_grants_sold ?? 0)} />
      <Metric icon={UsersRound} label="Nuevos alumnos" value={number(current.new_students)} hint={comparisonLabel(current.new_students ?? 0, previous.new_students ?? 0)} />
      <Metric icon={Activity} label="Saldo pendiente de cubrir" value={minutes(current.pending_debt_minutes ?? 0)} hint="Minutos de clases del periodo todavía sin saldo suficiente" />
    </div>;
  }

  function classes() {
    return <div className={styles.metricGrid}>
      <Metric icon={CalendarDays} label="Clases terminadas" value={number(current.classes_finished)} hint={comparisonLabel(current.classes_finished ?? 0, previous.classes_finished ?? 0)} />
      <Metric icon={TrendingUp} label="Tiempo impartido" value={minutes(current.class_minutes ?? 0)} hint={comparisonLabel(current.class_minutes ?? 0, previous.class_minutes ?? 0)} />
      <Metric icon={UsersRound} label="Asistencias" value={number(current.attendance_present)} hint={attendanceRate === null ? "Sin registros de asistencia" : `${attendanceRate}% de asistencia registrada`} />
      <Metric icon={Activity} label="Ausencias" value={number(current.attendance_absent)} hint={`${number(attendanceTotal)} participaciones registradas`} />
    </div>;
  }

  function students() {
    return <div className={styles.metricGrid}>
      <Metric icon={UsersRound} label="Alumnos activos" value={number(current.students_active)} />
      <Metric icon={BookOpenCheck} label="Asignaciones creadas" value={number(Number(pedagogy.assignments_created ?? 0))} />
      <Metric icon={TrendingUp} label="Asignaciones completadas" value={number(Number(pedagogy.assignments_completed ?? 0))} hint={`${number(Number(pedagogy.assignments_pending ?? 0))} pendientes`} />
      <Metric icon={BarChart3} label="Evaluaciones" value={number(Number(pedagogy.evaluations ?? 0))} hint={pedagogy.evaluation_average == null ? "Sin puntuación media" : `Media ${pedagogy.evaluation_average}/100`} />
    </div>;
  }

  function marketingSection() {
    if (!(marketing.metric_rows ?? 0) && !(marketing.campaigns ?? 0) && !(marketing.messages_sent ?? 0)) return <Empty title="Todavía no hay datos de Marketing" body="Cuando registres campañas, métricas o comunicaciones, aparecerán aquí. No mostramos gráficos de ejemplo como si fueran actividad real." />;
    return <div className={styles.metricGrid}>
      <Metric icon={Megaphone} label="Campañas creadas" value={number(marketing.campaigns)} />
      <Metric icon={CircleDollarSign} label="Inversión registrada" value={euros(marketing.spend_cents)} hint={roi === null ? "ROI sin calcular: falta inversión registrada" : `ROI registrado ${roi}%`} />
      <Metric icon={TrendingUp} label="Ingresos atribuidos" value={euros(marketing.revenue_cents)} />
      <Metric icon={UsersRound} label="Reservas desde campañas" value={number(marketing.bookings)} hint={bookingRate === null ? "Sin consultas suficientes para calcular conversión" : `${bookingRate}% de consultas → reserva`} />
      <Metric icon={Activity} label="Mensajes enviados" value={number(marketing.messages_sent)} hint={`${number(marketing.messages_blocked)} bloqueados por validación`} />
      <Metric icon={BarChart3} label="Clics registrados" value={number(marketing.clicks)} hint={`${number(marketing.inquiries)} consultas`} />
    </div>;
  }

  function operationSection() {
    return <div className={styles.metricGrid}>
      <Metric icon={Target} label="Misiones completadas" value={number(operation.missions_completed)} />
      <Metric icon={Activity} label="Misiones abiertas" value={number(operation.missions_open)} />
      <Metric icon={CalendarDays} label="No realizadas / caducadas" value={number(operation.missions_not_done)} />
      <Metric icon={BarChart3} label="Notificaciones enviadas" value={number(operation.notifications_sent)} hint={`${number(operation.notifications_failed)} fallidas`} />
      <Metric icon={TrendingUp} label="Intentos de entrega" value={number(operation.notification_attempts)} />
    </div>;
  }

  const content = section === "summary" ? summary() : section === "business" ? business() : section === "classes" ? classes() : section === "students" ? students() : section === "marketing" ? marketingSection() : operationSection();

  return <section className={styles.workspace}>
    <header className={styles.hero}><div><button type="button" onClick={leave}>‹ Volver</button><span>Análisis CYA</span><h1>Estadísticas</h1><p>Datos reales para entender clases, negocio, alumnado, Marketing y carga operativa.</p></div><BarChart3 /></header>
    <div className={styles.toolbar}><nav aria-label="Secciones de estadísticas">{sections.map(([key,label,Icon]) => <button key={key} type="button" className={section===key ? styles.active : ""} onClick={() => setSection(key)}><Icon />{label}</button>)}</nav><div className={styles.periods}>{([30,90,365] as PeriodDays[]).map((value) => <button key={value} type="button" className={days===value ? styles.activePeriod : ""} onClick={() => setDays(value)}>{value===365 ? "1 año" : `${value} días`}</button>)}</div></div>
    {loading ? <div className={styles.loading}>Actualizando estadísticas…</div> : snapshot ? <>{content}<footer className={styles.footer}>Actualizado {generatedLabel}. Los datos globales son visibles para cualquier profesor; los alumnos solo verán sus estadísticas personales en su portal.</footer></> : <Empty title="No se han podido cargar las estadísticas" body="Revisa la conexión o los permisos de tu cuenta de profesor." />}
  </section>;
}
