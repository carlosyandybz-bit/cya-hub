"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./student-detail.module.css";

type Student = {
  id: number;
  auth_user_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string | null;
  crm_stage: string;
  active: boolean;
};

type Term = { id: number; label: string; taxonomy: string };
type ClassItem = {
  id: number;
  class_type: "individual" | "pair";
  status: string;
  scheduled_start_at: string;
  duration_minutes: number;
  style_term_id: number | null;
  notes: string | null;
  pedagogy_closed_at: string | null;
  class_participants: Array<{
    person_id: number;
    attendance_status: string;
    billing_grant_id: number | null;
    role_term_id: number | null;
    level_term_id: number | null;
  }>;
};
type CreditItem = {
  id: number;
  modality: "individual" | "pair";
  label: string | null;
  total_minutes: number;
  price_cents: number;
  payment_status: string;
  status: string;
  purchased_at: string;
  credit_grant_members: Array<{ person_id: number }>;
  credit_movements: Array<{ delta_minutes: number }>;
};
type Assignment = {
  id: number;
  person_id: number;
  content_id: number;
  assignment_status: string;
  current_frequency: number | null;
  current_importance: number | null;
  snapshot_style_term_id: number | null;
  snapshot_role_term_id: number | null;
  snapshot_level_term_id: number | null;
  updated_at: string;
  teaching_contents: {
    id: number;
    title: string;
    content_type: string;
    description: string | null;
    correction_guidance: string | null;
  };
};
type CrmContact = {
  id: number;
  source: string | null;
  notes: string | null;
  created_at: string;
  crm_profiles: Array<{
    contact_date: string;
    inquiry: string | null;
    reserved: boolean;
    rate_id: number | null;
    quoted_amount_cents: number | null;
    contact_permission: string;
  }>;
};
type Rate = { id: number; name: string; price_cents: number; currency: string };
type StudentProfile = {
  person_id: number;
  student_since: string | null;
  goals: string | null;
  teacher_notes: string | null;
  active: boolean;
};
type DanceProfile = {
  id: number;
  style_term_id: number;
  role_term_id: number;
  level_term_id: number | null;
  is_primary: boolean;
  active: boolean;
};
type Evaluation = {
  id: number;
  person_id: number;
  class_id: number | null;
  style_term_id: number | null;
  role_term_id: number | null;
  level_term_id: number | null;
  aptitude_term_id: number;
  score: number;
  evaluation_kind: string;
  note: string | null;
  created_at: string;
};
type CrmActivity = {
  id: number;
  activity_type: string;
  summary: string;
  from_stage: string | null;
  to_stage: string | null;
  occurred_at: string;
};
type Tab = "summary" | "learning" | "evaluation" | "classes" | "credits" | "data" | "crm";

const tabItems: Array<[Tab, string]> = [
  ["summary", "Resumen"],
  ["learning", "Formación"],
  ["evaluation", "Evaluación"],
  ["classes", "Clases"],
  ["credits", "Bonos"],
  ["data", "Datos"],
  ["crm", "CRM"],
];
const stageLabels: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  booked: "Reservó",
  student: "Alumno",
  lost: "No continúa",
};
const contentLabels: Record<string, string> = {
  correction: "Corrección",
  explanation: "Explicación",
  exercise: "Ejercicio",
  sequence: "Secuencia",
};
const assignmentLabels: Record<string, string> = {
  pending: "Pendiente",
  in_correction: "En corrección",
  corrected: "Corregida",
  explained: "Explicada",
  practicing: "Practicando",
  completed: "Completado",
};
const classLabels: Record<string, string> = {
  scheduled: "Programada",
  active: "En curso",
  finished: "Realizada",
  cancelled: "Cancelada",
};

function minutesLabel(value: number) {
  const safe = Math.max(0, Number(value) || 0);
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ") || "0 min";
}

function dateLabel(value: string | null, withTime = true) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES", withTime
    ? { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function euros(cents: number | null | undefined, currency = "EUR") {
  if (cents === null || cents === undefined) return "Sin indicar";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function termLabel(id: number | null, terms: Term[]) {
  if (!id) return "Sin indicar";
  return terms.find((term) => term.id === id)?.label ?? "Sin indicar";
}

function creditBalance(credit: CreditItem) {
  return credit.credit_movements.reduce((sum, item) => sum + Number(item.delta_minutes || 0), 0);
}

function StudentRadar({ items }: { items: Array<{ label: string; value: number }> }) {
  if (items.length < 3) return <div className={styles.empty}><TrendingUp /><span>Se necesitan al menos tres aptitudes evaluadas para dibujar el radar.</span></div>;
  const center = 110;
  const radius = 76;
  const count = items.length;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return `${center + Math.cos(angle) * radius * ratio},${center + Math.sin(angle) * radius * ratio}`;
  };
  const values = items.map((item) => Math.max(0, Math.min(100, Number(item.value) || 0)));
  return <figure className={styles.radar}>
    <svg viewBox="0 0 220 220" role="img" aria-label="Radar de la última evaluación por aptitud">
      {[0.25, 0.5, 0.75, 1].map((ratio) => <polygon key={ratio} className={styles.radarRing} points={items.map((_, index) => point(index, ratio)).join(" ")} />)}
      {items.map((_, index) => <line key={index} className={styles.radarAxis} x1={center} y1={center} x2={point(index, 1).split(",")[0]} y2={point(index, 1).split(",")[1]} />)}
      <polygon className={styles.radarValue} points={values.map((value, index) => point(index, value / 100)).join(" ")} />
      {values.map((value, index) => { const [cx, cy] = point(index, value / 100).split(","); return <circle key={index} className={styles.radarPoint} cx={cx} cy={cy} r="3.5" />; })}
    </svg>
    <figcaption>{items.map((item, index) => <span key={item.label}><b>{item.label}</b><strong>{Math.round(values[index])}</strong></span>)}</figcaption>
  </figure>;
}

export function StudentMasterDetail({
  client,
  student,
  terms,
  classes,
  credits,
  assignments,
  crmContact,
  rates,
  close,
  schedule,
  addCredit,
  openClass,
}: {
  client: SupabaseClient;
  student: Student;
  terms: Term[];
  classes: ClassItem[];
  credits: CreditItem[];
  assignments: Assignment[];
  crmContact: CrmContact | null;
  rates: Rate[];
  close: () => void;
  schedule: () => void;
  addCredit: () => void;
  openClass: (id: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [danceProfiles, setDanceProfiles] = useState<DanceProfile[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [crmActivities, setCrmActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const [profileResult, danceResult, evaluationResult, activityResult] = await Promise.all([
        client.from("student_profiles").select("person_id,student_since,goals,teacher_notes,active").eq("person_id", student.id).maybeSingle(),
        client.from("student_dance_profiles").select("id,style_term_id,role_term_id,level_term_id,is_primary,active").eq("person_id", student.id).eq("active", true).order("is_primary", { ascending: false }),
        client.from("student_evaluations").select("id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,score,evaluation_kind,note,created_at").eq("person_id", student.id).order("created_at", { ascending: false }),
        client.from("crm_activities").select("id,activity_type,summary,from_stage,to_stage,occurred_at").eq("person_id", student.id).order("occurred_at", { ascending: false }).limit(30),
      ]);
      if (!alive) return;
      const firstError = [profileResult, danceResult, evaluationResult, activityResult].find((result) => result.error)?.error;
      if (firstError) setError(firstError.message);
      setProfile((profileResult.data ?? null) as StudentProfile | null);
      setDanceProfiles((danceResult.data ?? []) as DanceProfile[]);
      setEvaluations((evaluationResult.data ?? []) as Evaluation[]);
      setCrmActivities((activityResult.data ?? []) as CrmActivity[]);
      setLoading(false);
    }
    void load();
    return () => { alive = false; };
  }, [client, student.id]);

  const ownClasses = useMemo(() => classes
    .filter((item) => item.class_participants.some((participant) => participant.person_id === student.id))
    .sort((a, b) => new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()), [classes, student.id]);
  const upcoming = [...ownClasses]
    .filter((item) => item.status === "scheduled" && new Date(item.scheduled_start_at).getTime() >= Date.now())
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  const ownCredits = useMemo(() => credits
    .filter((item) => item.credit_grant_members.some((member) => member.person_id === student.id))
    .sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime()), [credits, student.id]);
  const balance = ownCredits.filter((item) => item.status === "active").reduce((sum, item) => sum + Math.max(0, creditBalance(item)), 0);
  const ownAssignments = useMemo(() => assignments.filter((item) => item.person_id === student.id), [assignments, student.id]);
  const activeAssignments = ownAssignments.filter((item) => !["corrected", "explained", "completed"].includes(item.assignment_status));
  const crm = crmContact?.crm_profiles?.[0] ?? null;
  const selectedRate = crm?.rate_id ? rates.find((rate) => rate.id === crm.rate_id) ?? null : null;

  const latestByAptitude = new Map<number, Evaluation>();
  evaluations.forEach((item) => { if (!latestByAptitude.has(item.aptitude_term_id)) latestByAptitude.set(item.aptitude_term_id, item); });
  const radarItems = [...latestByAptitude.values()].map((item) => ({ label: termLabel(item.aptitude_term_id, terms), value: item.score }));
  const averageScore = radarItems.length ? Math.round(radarItems.reduce((sum, item) => sum + item.value, 0) / radarItems.length) : null;

  const issues = [
    ...ownCredits.filter((item) => item.payment_status === "pending").map((item) => ({ key: `payment-${item.id}`, label: "Hay un bono con pago pendiente", tab: "credits" as Tab })),
    ...ownClasses.filter((item) => item.status === "finished" && !item.pedagogy_closed_at).map((item) => ({ key: `class-${item.id}`, label: "Hay una clase pendiente de cierre pedagógico", tab: "classes" as Tab })),
    ...(!danceProfiles.length ? [{ key: "dance", label: "Falta definir el contexto de baile del alumno", tab: "data" as Tab }] : []),
    ...(upcoming.length && balance <= 0 ? [{ key: "balance", label: "Tiene una próxima clase y no hay saldo activo", tab: "credits" as Tab }] : []),
  ];

  function closeAnd(action: () => void) {
    close();
    action();
  }

  function renderSummary() {
    return <div className={styles.stack}>
      {issues.length ? <section className={`${styles.issueBox} ${styles.issueBad}`}><header><AlertTriangle /><div><strong>{issues.length === 1 ? "1 incidencia por revisar" : `${issues.length} incidencias por revisar`}</strong><span>CYA las obtiene de los datos actuales, sin duplicar estados.</span></div></header><div>{issues.map((issue) => <button key={issue.key} onClick={() => setTab(issue.tab)}><span>{issue.label}</span><ChevronRight /></button>)}</div></section>
        : <section className={`${styles.issueBox} ${styles.issueGood}`}><header><CheckCircle2 /><div><strong>Todo en orden</strong><span>No hay incidencias operativas detectadas para este alumno.</span></div></header></section>}

      <section className={styles.metrics}>
        <article><WalletCards /><span>Saldo disponible</span><strong>{minutesLabel(balance)}</strong></article>
        <article><CalendarDays /><span>Próxima clase</span><strong>{upcoming[0] ? dateLabel(upcoming[0].scheduled_start_at, false) : "Sin programar"}</strong></article>
        <article><BookOpen /><span>En formación</span><strong>{activeAssignments.length}</strong></article>
        <article><TrendingUp /><span>Evaluación media</span><strong>{averageScore === null ? "Sin evaluar" : `${averageScore}/100`}</strong></article>
      </section>

      <section className={styles.sectionCard}>
        <div className={styles.sectionHead}><div><span>Contexto de baile</span><h3>Cómo trabaja este alumno</h3></div><button onClick={() => setTab("data")}>Ver datos</button></div>
        {danceProfiles.length ? <div className={styles.danceGrid}>{danceProfiles.map((item) => <div key={item.id} className={item.is_primary ? styles.primaryDance : ""}><strong>{termLabel(item.style_term_id, terms)}</strong><span>{termLabel(item.role_term_id, terms)} · {termLabel(item.level_term_id, terms)}</span>{item.is_primary ? <small>Principal</small> : null}</div>)}</div>
          : <div className={styles.empty}><GraduationCap /><span>Todavía no tiene contexto de baile guardado.</span></div>}
      </section>

      {(profile?.goals || profile?.teacher_notes) ? <section className={styles.notesGrid}>
        <article><Target /><div><span>Objetivos</span><p>{profile?.goals || "Sin objetivos escritos."}</p></div></article>
        <article><BookOpen /><div><span>Notas del profesor</span><p>{profile?.teacher_notes || "Sin notas internas."}</p></div></article>
      </section> : null}

      <section className={styles.recentGrid}>
        <article className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Formación</span><h3>Trabajo activo</h3></div><button onClick={() => setTab("learning")}>Ver todo</button></div>{activeAssignments.length ? <div className={styles.compactList}>{activeAssignments.slice(0, 4).map((item) => <button key={item.id} onClick={() => setTab("learning")}><div><span>{contentLabels[item.teaching_contents.content_type] ?? item.teaching_contents.content_type}</span><strong>{item.teaching_contents.title}</strong></div><ChevronRight /></button>)}</div> : <div className={styles.empty}><BookOpen /><span>No hay contenido activo asignado.</span></div>}</article>
        <article className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Clases</span><h3>Actividad reciente</h3></div><button onClick={() => setTab("classes")}>Ver todo</button></div>{ownClasses.length ? <div className={styles.compactList}>{ownClasses.slice(0, 4).map((item) => <button key={item.id} onClick={() => setTab("classes")}><div><span>{classLabels[item.status] ?? item.status}</span><strong>{dateLabel(item.scheduled_start_at)}</strong></div><ChevronRight /></button>)}</div> : <div className={styles.empty}><CalendarDays /><span>Todavía no tiene clases.</span></div>}</article>
      </section>
    </div>;
  }

  function renderLearning() {
    return <section className={styles.sectionCard}>
      <div className={styles.sectionHead}><div><span>Formación</span><h3>{ownAssignments.length} contenidos asignados</h3></div></div>
      {ownAssignments.length ? <div className={styles.learningList}>{ownAssignments.map((assignment) => <details key={assignment.id}>
        <summary><div><span>{contentLabels[assignment.teaching_contents.content_type] ?? assignment.teaching_contents.content_type}</span><strong>{assignment.teaching_contents.title}</strong><small>{assignmentLabels[assignment.assignment_status] ?? assignment.assignment_status}{assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}{assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}</small></div><ChevronRight /></summary>
        <div className={styles.learningBody}>
          <div className={styles.chips}><span>Estilo: {termLabel(assignment.snapshot_style_term_id, terms)}</span><span>Rol: {termLabel(assignment.snapshot_role_term_id, terms)}</span><span>Nivel: {termLabel(assignment.snapshot_level_term_id, terms)}</span></div>
          {assignment.teaching_contents.description ? <p>{assignment.teaching_contents.description}</p> : null}
          {assignment.teaching_contents.correction_guidance ? <p><strong>Cómo trabajarlo:</strong> {assignment.teaching_contents.correction_guidance}</p> : null}
        </div>
      </details>)}</div> : <div className={styles.empty}><BookOpen /><span>No hay formación asignada todavía.</span></div>}
    </section>;
  }

  function renderEvaluation() {
    return <div className={styles.evalGrid}>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Último estado</span><h3>Evolución por aptitud</h3></div>{averageScore !== null ? <b>{averageScore}/100</b> : null}</div>{radarItems.length ? <StudentRadar items={radarItems} /> : <div className={styles.empty}><TrendingUp /><span>Todavía no hay evaluaciones.</span></div>}</section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Historial</span><h3>Evaluaciones registradas</h3></div><b>{evaluations.length}</b></div>{evaluations.length ? <div className={styles.historyList}>{evaluations.slice(0, 30).map((item) => <div key={item.id}><div><strong>{termLabel(item.aptitude_term_id, terms)}</strong><span>{dateLabel(item.created_at)} · {termLabel(item.style_term_id, terms)} · {termLabel(item.role_term_id, terms)}</span>{item.note ? <small>{item.note}</small> : null}</div><b>{item.score}</b></div>)}</div> : <div className={styles.empty}><TrendingUp /><span>Sin historial de evaluación.</span></div>}</section>
    </div>;
  }

  function renderClasses() {
    return <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Clases</span><h3>Historial y próximas</h3></div><button onClick={() => closeAnd(schedule)}>Programar clase</button></div>
      {ownClasses.length ? <div className={styles.classList}>{ownClasses.map((item) => { const participant = item.class_participants.find((value) => value.person_id === student.id); const actionable = item.status === "scheduled" || item.status === "active" || (item.status === "finished" && !item.pedagogy_closed_at); return <article key={item.id}><span className={styles.classIcon}><CalendarDays /></span><div><strong>{termLabel(item.style_term_id, terms)} · {item.class_type === "pair" ? "Pareja" : "Individual"}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span><small>{classLabels[item.status] ?? item.status} · {participant?.attendance_status === "present" ? "Asistió" : participant?.attendance_status === "absent" ? "Ausente" : "Asistencia pendiente"}</small>{item.notes ? <p>{item.notes}</p> : null}</div>{actionable ? <button onClick={() => closeAnd(() => openClass(item.id))}>{item.status === "scheduled" ? "Dar clase" : "Abrir"}</button> : <span className={styles.statusPill}>{classLabels[item.status] ?? item.status}</span>}</article>; })}</div> : <div className={styles.empty}><CalendarDays /><span>No hay clases registradas.</span></div>}
    </section>;
  }

  function renderCredits() {
    return <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Bonos</span><h3>Saldo e historial</h3></div><button onClick={() => closeAnd(addCredit)}>Añadir bono</button></div>
      {ownCredits.length ? <div className={styles.creditGrid}>{ownCredits.map((item) => { const itemBalance = creditBalance(item); return <article key={item.id} className={item.payment_status === "pending" ? styles.pendingCredit : ""}><div><span>{dateLabel(item.purchased_at, false)}</span><strong>{item.label || (item.modality === "pair" ? "Bono de pareja" : "Bono individual")}</strong></div><b>{minutesLabel(itemBalance)}</b><small>de {minutesLabel(item.total_minutes)} · {euros(item.price_cents)} · {item.payment_status === "paid" ? "Pagado" : item.payment_status === "pending" ? "Pago pendiente" : "Reembolsado"}</small></article>; })}</div> : <div className={styles.empty}><WalletCards /><span>No hay bonos registrados.</span></div>}
    </section>;
  }

  function renderData() {
    return <div className={styles.dataGrid}>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Identidad</span><h3>Datos principales</h3></div></div><div className={styles.readGrid}><div><Phone /><span>Teléfono</span><strong>{student.phone || "Sin indicar"}</strong></div><div><Mail /><span>Email</span><strong>{student.email || "Sin indicar"}</strong></div><div><MapPin /><span>País</span><strong>{student.country_code || "Sin indicar"}</strong></div><div><CircleUserRound /><span>Portal</span><strong>{student.auth_user_id ? "Registrado" : "Provisional"}</strong></div><div><CalendarDays /><span>Alumno desde</span><strong>{dateLabel(profile?.student_since ?? null, false)}</strong></div><div><CheckCircle2 /><span>Estado</span><strong>{student.active && profile?.active !== false ? "Activo" : "Inactivo"}</strong></div></div></section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Baile</span><h3>Contextos guardados</h3></div></div>{danceProfiles.length ? <div className={styles.danceGrid}>{danceProfiles.map((item) => <div key={item.id} className={item.is_primary ? styles.primaryDance : ""}><strong>{termLabel(item.style_term_id, terms)}</strong><span>{termLabel(item.role_term_id, terms)} · {termLabel(item.level_term_id, terms)}</span>{item.is_primary ? <small>Principal</small> : null}</div>)}</div> : <div className={styles.empty}><GraduationCap /><span>Sin contexto de baile.</span></div>}</section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Objetivos</span><h3>Información pedagógica</h3></div></div><div className={styles.longText}><strong>Objetivos</strong><p>{profile?.goals || "Sin objetivos guardados."}</p><strong>Notas internas</strong><p>{profile?.teacher_notes || "Sin notas internas."}</p></div></section>
    </div>;
  }

  function renderCrm() {
    return <div className={styles.dataGrid}>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>CRM</span><h3>Captación y situación comercial</h3></div><b>{stageLabels[student.crm_stage] ?? student.crm_stage}</b></div><div className={styles.readGrid}><div><CalendarDays /><span>Primer contacto</span><strong>{crm?.contact_date ? dateLabel(crm.contact_date, false) : "Sin indicar"}</strong></div><div><Target /><span>Origen</span><strong>{crmContact?.source || "Sin indicar"}</strong></div><div><CheckCircle2 /><span>Reservó</span><strong>{crm?.reserved ? "Sí" : "No"}</strong></div><div><WalletCards /><span>Tarifa</span><strong>{selectedRate?.name || "Sin indicar"}</strong></div><div><WalletCards /><span>Importe indicado</span><strong>{euros(crm?.quoted_amount_cents, selectedRate?.currency || "EUR")}</strong></div><div><CheckCircle2 /><span>Permiso de contacto</span><strong>{crm?.contact_permission || "Sin indicar"}</strong></div></div>{crm?.inquiry ? <div className={styles.longText}><strong>Qué buscaba</strong><p>{crm.inquiry}</p></div> : null}{crmContact?.notes ? <div className={styles.longText}><strong>Observaciones CRM</strong><p>{crmContact.notes}</p></div> : null}</section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Actividad</span><h3>Historial CRM</h3></div><b>{crmActivities.length}</b></div>{crmActivities.length ? <div className={styles.historyList}>{crmActivities.map((item) => <div key={item.id}><div><strong>{item.summary}</strong><span>{dateLabel(item.occurred_at)}{item.from_stage || item.to_stage ? ` · ${stageLabels[item.from_stage ?? ""] ?? item.from_stage ?? "—"} → ${stageLabels[item.to_stage ?? ""] ?? item.to_stage ?? "—"}` : ""}</span></div></div>)}</div> : <div className={styles.empty}><Clock3 /><span>Todavía no hay movimientos CRM registrados.</span></div>}</section>
    </div>;
  }

  return <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="student-master-title">
      <header className={styles.header}>
        <div className={styles.hero}><span className={styles.avatar}><CircleUserRound /></span><div><span className={styles.kicker}>Ficha maestra del alumno</span><h2 id="student-master-title">{student.display_name}</h2><div className={styles.heroMeta}><span>{student.auth_user_id ? "Con portal" : "Provisional"}</span><span>{stageLabels[student.crm_stage] ?? student.crm_stage}</span>{issues.length ? <span className={styles.issueBadge}>{issues.length} por revisar</span> : <span className={styles.okBadge}>Sin incidencias</span>}</div></div></div>
        <div className={styles.actions}><button onClick={() => closeAnd(schedule)}><CalendarDays /> Programar</button><button onClick={() => closeAnd(addCredit)}><WalletCards /> Bono</button><button className={styles.close} onClick={close} aria-label="Cerrar"><X /></button></div>
      </header>

      <nav className={styles.tabs} aria-label="Ficha del alumno">{tabItems.map(([value, label]) => <button key={value} className={tab === value ? styles.activeTab : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
      <div className={styles.body}>
        {error ? <p className={styles.error}>{error}</p> : null}
        {loading ? <div className={styles.loading}><span /><strong>Cargando ficha completa…</strong></div> : null}
        {!loading && tab === "summary" ? renderSummary() : null}
        {!loading && tab === "learning" ? renderLearning() : null}
        {!loading && tab === "evaluation" ? renderEvaluation() : null}
        {!loading && tab === "classes" ? renderClasses() : null}
        {!loading && tab === "credits" ? renderCredits() : null}
        {!loading && tab === "data" ? renderData() : null}
        {!loading && tab === "crm" ? renderCrm() : null}
      </div>
    </section>
  </div>;
}
