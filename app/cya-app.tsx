"use client";

import {
  AlertTriangle, Archive, ArrowRight, Bell, BellRing, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound, ClipboardCheck,
  Dumbbell, Eye, EyeOff, GitBranch, GraduationCap, House,
  LibraryBig, Link2, LockKeyhole, Megaphone, NotebookPen,
  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UserRound, UsersRound,
  WalletCards, X,
} from "lucide-react";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  MarketingView,
  type CampaignMetric,
  type CommunicationRecipient,
  type CrmContact,
  type MarketingCampaign,
  type MarketingContent,
  type MarketingEvent,
  type MarketingRate,
} from "./marketing-view";
import { AdminView } from "./admin-view";
import { AgendaView } from "./agenda-view";
import { AccountMenu } from "./account-menu";
import { PreferencesSettingsView, ProfileSettingsView } from "./account-pages";
import { HomeView } from "./home-view";
import { NotificationsView, type NotificationTargetContext } from "./notifications-view";
import { StudentMasterDetail } from "./student-detail";
import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";
import { SecureDriveAsset } from "./drive-media";
import { TeachingMediaEditor, type TeachingMediaDraft } from "./teaching-media-editor";
import { setRuntimeSupabaseClient } from "./supabase-runtime";
import { ClassSummaryContentEditor } from "./class-summary-content-editor";
import { ContextEvaluationPanel } from "./context-evaluation-panel";
import { EvaluationPostClassGate } from "./evaluation-post-class";
import { QuickProvisionalStudentModal, type EditablePersonIdentity } from "./person-identity-editor";
import type { ExperienceContext, IdentityContext } from "./v14-types";

const TeachingGraph = lazy(() => import("./teaching-graph").then((module) => ({ default: module.TeachingGraph })));

type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin" | "profile" | "preferences" | "notifications";
type CyaOverlay = "new-student" | "schedule" | "credit" | null;
type CyaHistoryState = {
  cyaHub: true;
  view: View;
  experience: ExperienceContext;
  selectedId: number | null;
  overlay: CyaOverlay;
  modalStudentId: number | null;
  liveClassId: number | null;
};
type Person = {
  id: number; auth_user_id: string | null; display_name: string; first_name: string | null;
  last_name: string | null; email: string | null; phone: string | null; country_code: string | null;
  crm_stage: string; active: boolean;
};
type CatalogTerm = { id: number; label: string; term_key: string; taxonomy: string; metadata: Record<string, unknown>; sort_order: number };
type ClassParticipant = {
  person_id: number; attendance_status: "planned" | "present" | "absent"; billing_grant_id: number | null;
  preferred_billing_grant_id: number | null; role_term_id: number | null; level_term_id: number | null;
  billed_minutes: number; uncovered_minutes: number; billing_status: string;
};
type ClassItem = {
  id: number; class_type: "individual" | "pair"; status: string; scheduled_start_at: string;
  duration_minutes: number; notes: string | null; style_term_id: number | null; location_term_id: number | null; location_text: string | null;
  workflow_stage: "data" | "prepare" | "live" | "administrative" | "closed"; started_at: string | null; administrative_finished_at: string | null; pedagogy_closed_at: string | null;
  administratively_finished_by: string | null;
  class_participants: ClassParticipant[];
};
type CreditItem = {
  id: number; modality: "individual" | "pair"; label: string | null; total_minutes: number;
  price_cents: number; payment_status: string; status: string; purchased_at: string; expires_at: string | null;
  credit_grant_members: Array<{ person_id: number }>; credit_movements: Array<{ delta_minutes: number }>;
};
type ClassNote = { id: number; class_id: number; person_id: number | null; body: string; visibility_scope: "internal" | "student"; created_at: string };
type ClassContentEvent = { id: number; class_id: number; person_id: number; content_id: number; event_type: string; previous_status: string | null; new_status: string | null; payload: Record<string, unknown>; created_at: string; teaching_contents?: { title: string; content_type: string } | null };
type LiveClassSearchResult = { content_id: number; title: string; content_type: string; description: string | null; correction_guidance: string | null; completion_status: string; publication_status: string; visibility: string; measurement_mode: string; ready: boolean };
type ClassPreparationRequest = { id: number; class_id: number; person_id: number; request_type: string; body: string | null; external_file_id: string | null; content_id: number | null; created_at: string };
type DanceProfileRow = { person_id: number; style_term_id: number; role_term_id: number; level_term_id: number | null; is_primary: boolean; active: boolean };
type StudentPrepProfile = { person_id: number; goals: string | null; teacher_notes: string | null; health_notes: string | null };
type ClassMediaSnapshot = { id: number; class_id: number; media_kind: "class_document" | "final_dance"; media_type: "image" | "video"; external_file_id: string; title: string | null; mime_type: string | null; created_at: string };
type ClassPrivateVideo = { id: number; class_id: number; person_id: number; external_file_id: string; title: string | null; mime_type: string | null; created_at: string };
type TeachingContentSummary = {
  id: number; title: string; content_type: string; measurement_mode: "frequency" | "importance" | "both" | "none";
  description: string | null; correction_guidance: string | null;
};
type TeachingContent = TeachingContentSummary & {
  completion_status: "incomplete" | "complete"; publication_status: "draft" | "published" | "archived";
  visibility: "staff" | "student"; category_term_id: number | null; active: boolean; requires_partner: boolean; published_at: string | null; updated_at: string;
  teaching_content_styles: Array<{ style_term_id: number }>;
  teaching_content_roles: Array<{ role_term_id: number }>;
  teaching_content_levels: Array<{ level_term_id: number }>;
  teaching_content_tags: Array<{ tag: string }>;
  teaching_content_media: TeachingCardMedia[];
};
type TeachingRelation = {
  id: number; source_content_id: number; target_content_id: number; relation_type: string; position: number | null;
};
type ContentAssignment = {
  id: number; person_id: number; content_id: number; assignment_status: string; current_frequency: number | null; current_importance: number | null;
  snapshot_style_term_id: number | null; snapshot_role_term_id: number | null; snapshot_level_term_id: number | null;
  snapshot_measurement_mode: "frequency" | "importance" | "both" | "none"; updated_at: string; teaching_contents: TeachingContentSummary;
};
type StudentPortalSnapshot = {
  profile: {
    id: number; display_name: string; first_name: string | null; last_name: string | null;
    email: string | null; phone: string | null; country_code: string | null; student_since: string | null; goals: string | null;
  };
  financial?: {
    available_credit_minutes: number; pending_debt_minutes: number; net_balance_minutes: number; open_incident_count: number;
  };
  classes: Array<{
    id: number; class_type: "individual" | "pair"; status: string; scheduled_start_at: string;
    duration_minutes: number; billing_status?: string; uncovered_minutes?: number; style: string | null; attendance_status: string; role: string | null; level: string | null;
  }>;
  credits: Array<{
    id: number; label: string | null; modality: "individual" | "pair"; total_minutes: number;
    balance_minutes: number; status: string; purchased_at: string; expires_at: string | null;
  }>;
  assignments: Array<{
    id: number; content_id: number; title: string; content_type: string; description: string | null;
    correction_guidance: string | null; assignment_status: string; current_frequency: number | null;
    current_importance: number | null; updated_at: string;
    media: TeachingCardMedia[];
  }>;
  evaluations: Array<{ id: number; session_id: number | null; class_id: number | null; score: number; aptitude_term_id: number; aptitude: string; style_term_id: number; style: string; role_term_id: number; role: string; level_term_id: number; level: string; evaluation_kind: string; created_at: string }>;
  class_activity?: Array<{ id: number; class_id: number; content_id: number; title: string; content_type: string; event_type: string; created_at: string }>;
  class_summaries?: Array<{ class_id: number; student_message: string | null; closed_at: string }>;
  class_media?: ClassMediaSnapshot[];
};
let db: SupabaseClient | null = null;
let dbConnection: Promise<SupabaseClient> | null = null;

async function connectDatabase() {
  if (db) return db;
  if (!dbConnection) {
    dbConnection = fetch("/api/runtime-config", {
      cache: "no-store",
      headers: { accept: "application/json" },
    }).then(async (response) => {
      const config = await response.json().catch(() => null) as {
        configured?: boolean;
        supabaseUrl?: string;
        supabasePublishableKey?: string;
      } | null;
      if (!response.ok || !config?.configured || !config.supabaseUrl || !config.supabasePublishableKey) {
        throw new Error("CYA Hub no ha podido conectar con sus datos.");
      }
      const parsedUrl = new URL(config.supabaseUrl);
      if (parsedUrl.protocol !== "https:" || !config.supabasePublishableKey.startsWith("sb_publishable_")) {
        throw new Error("La configuración de conexión de CYA Hub no es válida.");
      }
      db = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      setRuntimeSupabaseClient(db);
      return db;
    }).catch((error) => {
      dbConnection = null;
      throw error;
    });
  }
  return dbConnection;
}

const nav = [
  ["home", "Inicio", House],
  ["students", "Alumnado", UsersRound],
  ["live", "Dar clase", GraduationCap],
  ["teaching", "Enseñanza", LibraryBig],
  ["marketing", "Marketing", Megaphone],
] as const;

const teachingKinds = [
  ["correction", "Correcciones", BookOpen],
  ["explanation", "Explicaciones", LibraryBig],
  ["exercise", "Ejercicios", Dumbbell],
  ["sequence", "Secuencias", GitBranch],
] as const;

const teachingKindLabels: Record<string, string> = {
  correction: "Corrección", explanation: "Explicación", exercise: "Ejercicio", sequence: "Secuencia",
};

const relationLabels: Record<string, string> = {
  prerequisite: "Necesita antes", counterpart: "Homóloga", exercise_explanation: "Trabaja explicación",
  exercise_correction: "Trabaja corrección", sequence_item: "Paso de secuencia", related: "Relacionado",
};


function authError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "El email o la contraseña no son correctos.";
  if (value.includes("email not confirmed")) return "Confirma primero tu email para entrar.";
  if (value.includes("too many requests")) return "Demasiados intentos seguidos. Espera un momento y vuelve a probar.";
  return message || "No se ha podido iniciar sesión.";
}

function integerFieldValue(value: FormDataEntryValue | null, min: number, max: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (!/^\d+$/.test(raw)) return null;
  const numeric = Number(raw);
  return Number.isSafeInteger(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function decimalFieldValue(value: FormDataEntryValue | null, min = 0, max = 10000000) {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw.replace(",", ".");
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= min && numeric <= max ? numeric : null;
}

function Brand() {
  return <div className="brand"><span className="brand-mark">CYA</span><span>CYA Hub</span></div>;
}

function RadarChart({ items, scaleLabel }: { items: Array<{ label: string; value: number }>; scaleLabel: string }) {
  if (items.length < 3) return <div className="compact-empty"><TrendingUp /><span>Se necesitan al menos tres aptitudes evaluadas para dibujar el radar.</span></div>;
  const center = 110, radius = 78, count = items.length;
  const point = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    return `${center + Math.cos(angle) * radius * ratio},${center + Math.sin(angle) * radius * ratio}`;
  };
  const values = items.map((item) => Math.max(0, Math.min(100, Number(item.value) || 0)));
  return <figure className="radar-chart">
    <svg viewBox="0 0 220 220" role="img" aria-label={`Radar de evolución. ${scaleLabel}`}>
      {[0.25,0.5,0.75,1].map((ratio) => <polygon key={ratio} className="radar-ring" points={items.map((_, index) => point(index, ratio)).join(" ")} />)}
      {items.map((_, index) => <line key={index} className="radar-axis" x1={center} y1={center} x2={point(index, 1).split(",")[0]} y2={point(index, 1).split(",")[1]} />)}
      <polygon className="radar-value" points={values.map((value, index) => point(index, value / 100)).join(" ")} />
      {values.map((value, index) => { const [cx,cy] = point(index, value / 100).split(","); return <circle key={index} className="radar-point" cx={cx} cy={cy} r="3.5" />; })}
    </svg>
    <figcaption>{items.map((item, index) => <span key={item.label}><i style={{ background: index % 2 ? "#9b82ff" : "#6d4aff" }} /><b>{item.label}</b><strong>{Math.round(values[index])}</strong></span>)}</figcaption>
    <small>{scaleLabel}</small>
  </figure>;
}

function Spinner() {
  return <main className="loading"><div><span className="spinner" /><span>Preparando CYA Hub…</span></div></main>;
}

function Login() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "recovery">("login");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("La conexión de CYA Hub todavía no está configurada.");
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    const result = await db.auth.signInWithPassword({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (result.error) setError(authError(result.error.message));
    setBusy(false);
  }
  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!db) return setError("La conexión de CYA Hub todavía no está configurada.");
    const form = new FormData(event.currentTarget), email = String(form.get("email") ?? "").trim();
    setBusy(true); setError(""); setNotice("");
    const result = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
    if (result.error) setError(authError(result.error.message));
    else setNotice("Si ese email tiene acceso, recibirá un enlace seguro para crear una contraseña nueva.");
    setBusy(false);
  }
  return (
    <main className="login">
      <section className="login-card">
        <Brand />
        <h1>{mode === "login" ? "Tu trabajo, en un solo sitio." : "Recupera tu acceso."}</h1>
        <p>{mode === "login" ? "Acceso privado para Carlos & Andy y su equipo." : "Te enviaremos un enlace de un solo uso al email autorizado."}</p>
        {mode === "login" ? <form className="form" onSubmit={submit}>
            <label className="field"><span>Email</span><input name="email" type="email" inputMode="email" autoComplete="email" required placeholder="tu@email.com" /></label>
            <label className="field"><span>Contraseña</span><div className="password">
              <input name="password" type={visible ? "text" : "password"} autoComplete="current-password" required placeholder="Tu contraseña" />
              <button type="button" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVisible(!visible)}>
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div></label>
            {error ? <p className="error" role="alert">{error}</p> : null}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Entrando…" : <>Entrar <ArrowRight size={18} /></>}</button>
            <button className="login-link" type="button" onClick={() => { setMode("recovery"); setError(""); }}>¿Has olvidado tu contraseña?</button>
          </form> : <form className="form" onSubmit={requestRecovery}>
            <label className="field"><span>Email</span><input name="email" type="email" inputMode="email" autoComplete="email" required placeholder="tu@email.com" /></label>
            {error ? <p className="error" role="alert">{error}</p> : null}
            {notice ? <p className="success" role="status">{notice}</p> : null}
            <button className="btn" type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar enlace seguro"}</button>
            <button className="login-link" type="button" onClick={() => { setMode("login"); setError(""); setNotice(""); }}>Volver al acceso</button>
          </form>}
        <div className="privacy"><LockKeyhole size={15} /> Acceso privado · solo para personas autorizadas.</div>
      </section>
    </main>
  );
}

function PasswordRecovery({ done }: { done: () => void }) {
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), password = String(form.get("password") ?? ""), confirmation = String(form.get("confirmation") ?? "");
    if (password.length < 10) return setError("Usa al menos 10 caracteres.");
    if (password !== confirmation) return setError("Las dos contraseñas no coinciden.");
    setBusy(true); setError("");
    const result = await db.auth.updateUser({ password });
    if (result.error) { setError(authError(result.error.message)); setBusy(false); return; }
    setBusy(false); done();
  }
  return <main className="login"><section className="login-card"><Brand /><h1>Crea tu contraseña nueva.</h1><p>El enlace ya ha sido verificado. Elige una contraseña única para CYA Hub.</p>
    <form className="form" onSubmit={submit}>
      <label className="field"><span>Contraseña nueva</span><div className="password"><input name="password" type={visible ? "text" : "password"} autoComplete="new-password" minLength={10} required /><button type="button" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div></label>
      <label className="field"><span>Repetir contraseña</span><input name="confirmation" type={visible ? "text" : "password"} autoComplete="new-password" minLength={10} required /></label>
      {error ? <p className="error" role="alert">{error}</p> : null}<button className="btn" disabled={busy}>{busy ? "Actualizando…" : "Guardar contraseña"}</button>
    </form></section></main>;
}

function Header({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <header className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{action}</header>;
}


function StudentsView({ students, query, setQuery, add, open, schedule, credit }: { students: Person[]; query: string; setQuery: (v: string) => void; add: () => void; open: (p: Person) => void; schedule: (p: Person) => void; credit: (p: Person) => void }) {
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    if (!q) return students;
    return students.filter((s) => [s.display_name, s.email, s.phone].filter(Boolean).some((v) => String(v).toLocaleLowerCase("es").includes(q)));
  }, [students, query]);
  return <>
    <Header eyebrow="Alumnado" title="Personas, sin ruido" description="Un provisional tiene ficha completa aunque todavía no disponga de acceso a la app." action={<button className="btn" onClick={add}><Plus size={18} /> Nuevo</button>} />
    <label className="search"><Search /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, teléfono o email" /></label>
    {filtered.length ? <div className="student-list">{filtered.map((student) =>
      <article className="student-row" key={student.id}>
        <button className="student-row-main" onClick={() => open(student)}>
          <span className="avatar"><UserRound /></span><span className="student-main"><strong>{student.display_name}</strong><span>{student.phone || student.email || "Sin datos de contacto"}</span></span>
          <span className={`badge ${student.auth_user_id ? "portal" : ""}`}>{student.auth_user_id ? "Registrado" : "Provisional"}</span>
        </button>
        <span className="student-row-actions"><button className="btn ghost" onClick={() => schedule(student)}><CalendarDays size={16} /> Programar</button><button className="btn ghost" onClick={() => credit(student)}><WalletCards size={16} /> Bono</button></span>
      </article>)}</div>
      : <div className="empty"><UsersRound /><strong>{students.length ? "No hay coincidencias" : "Aún no hay alumnos"}</strong><p>{students.length ? "Prueba con otro nombre, teléfono o email." : "Añade el primero. No necesita registrarse para que puedas trabajar con su ficha."}</p>{!students.length ? <button className="btn" onClick={add}><Plus size={18} /> Añadir alumno</button> : null}</div>}
  </>;
}

function minutesLabel(value: number) {
  const numeric = Number(value) || 0;
  const hours = Math.floor(Math.abs(numeric) / 60), minutes = Math.abs(Math.trunc(numeric)) % 60;
  const text = [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ") || "0 min";
  return numeric < 0 ? `−${text}` : text;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function namesFor(ids: number[], students: Person[]) {
  return ids.map((id) => students.find((student) => student.id === id)?.display_name || "Alumno").join(" + ");
}

function ClassesView({ classes, students, schedule, goLive, reopen }: { classes: ClassItem[]; students: Person[]; schedule: () => void; goLive: (id: number) => void; reopen: (id: number) => void }) {
  return <>
    <Header eyebrow="Agenda" title="Clases" description="Cada clase se identifica por alumno y fecha; la numeración interna queda fuera de la interfaz." action={<button className="btn" onClick={schedule}><Plus size={18} /> Programar</button>} />
    {!students.length ? <div className="empty"><UsersRound /><strong>Primero necesitas un alumno</strong><p>En cuanto añadas un alumno podrás programar su primera clase.</p></div>
    : !classes.length ? <div className="empty"><CalendarDays /><strong>Agenda vacía</strong><p>Programa la primera clase. Puede ser individual o en pareja.</p><button className="btn" onClick={schedule}><Plus size={18} /> Programar clase</button></div>
    : <div className="agenda-list">{classes.map((item) => <article className="agenda-row" key={item.id}>
        <span className="agenda-icon"><CalendarDays /></span><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span></div>
        <span className="agenda-actions"><span className={`badge ${item.status === "active" ? "portal" : ""}`}>{item.status === "scheduled" ? "Programada" : item.status === "active" ? "En clase" : item.status === "finished" ? (item.pedagogy_closed_at ? "Cerrada" : "Por cerrar") : "Cancelada"}</span>
          {item.status === "scheduled" || item.status === "active" || (item.status === "finished" && !item.pedagogy_closed_at) ? <button className="btn class-go" onClick={() => goLive(item.id)}><Play size={16} /> {item.status === "scheduled" ? "Dar clase" : "Abrir"}</button> : null}
          {item.status === "finished" && item.administrative_finished_at ? <button className="btn ghost class-reopen" onClick={() => reopen(item.id)}>Reabrir</button> : null}
        </span>
      </article>)}</div>}
  </>;
}

function CreditsView({ credits, students, add }: { credits: CreditItem[]; students: Person[]; add: () => void }) {
  return <>
    <Header eyebrow="Bonos" title="Saldo de clases" description="Bonos legibles por persona y fecha de compra. El saldo sale del historial de movimientos, no de un contador que pueda desincronizarse." action={<button className="btn" onClick={add}><Plus size={18} /> Añadir bono</button>} />
    {!students.length ? <div className="empty"><UsersRound /><strong>Primero necesitas un alumno</strong><p>Después podrás crear su bono individual o de pareja.</p></div>
    : !credits.length ? <div className="empty"><WalletCards /><strong>Aún no hay bonos</strong><p>Crea el primero y el saldo quedará preparado para descontarse al terminar cada clase.</p><button className="btn" onClick={add}><Plus size={18} /> Añadir bono</button></div>
    : <div className="credit-grid">{credits.map((grant) => {
      const balance = grant.credit_movements.reduce((sum, movement) => sum + Number(movement.delta_minutes || 0), 0);
      const names = namesFor(grant.credit_grant_members.map((member) => member.person_id), students);
      return <article className="card pad credit-card" key={grant.id}><div className="credit-top"><div><span>{new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(grant.purchased_at))}</span><h2>{names}</h2></div><span className={`badge ${grant.payment_status === "paid" ? "portal" : ""}`}>{grant.payment_status === "paid" ? "Pagado" : "Pago pendiente"}</span></div>
        <strong className="credit-balance">{minutesLabel(balance)}</strong><span className="credit-caption">disponibles de {minutesLabel(grant.total_minutes)}</span>
        {grant.label ? <p className="credit-label">{grant.label}</p> : null}
      </article>;
    })}</div>}
  </>;
}

const correctionStates = [
  ["pending", "Pendiente de corrección"], ["corrected", "Corregida"],
] as const;

function correctionStateLabel(value: string) {
  return correctionStates.find(([key]) => key === value)?.[1] ?? value;
}

function assignmentOptions(contentType: string) {
  if (contentType === "correction") return correctionStates;
  if (contentType === "explanation" || contentType === "sequence") return [["pending","Pendiente"],["explained","Explicada"]] as const;
  return [["pending","Pendiente"],["active","Activo"],["completed","Realizado"]] as const;
}

function linkedTermLabels(ids: number[], terms: CatalogTerm[]) {
  return ids.map((id) => terms.find((term) => term.id === id)?.label).filter(Boolean).join(" · ");
}

function contentFitsContext(content: TeachingContent, styleId: number | null, roleId: number | null, levelId: number | null) {
  if (!styleId || !roleId || !levelId) return false;
  return content.teaching_content_styles.some((link) => link.style_term_id === styleId)
    && content.teaching_content_roles.some((link) => link.role_term_id === roleId)
    && content.teaching_content_levels.some((link) => link.level_term_id === levelId);
}


function creditBalance(grant: CreditItem) {
  return grant.credit_movements.reduce((sum, movement) => sum + Number(movement.delta_minutes || 0), 0);
}

function compatibleCreditsForClass(item: ClassItem, credits: CreditItem[], personId: number) {
  const classPeople = item.class_participants.map((participant) => participant.person_id).sort((a, b) => a - b);
  return credits.filter((grant) => {
    if (grant.status !== "active" || grant.modality !== item.class_type || creditBalance(grant) <= 0) return false;
    if (grant.expires_at) {
      const expiry = new Date(grant.expires_at).getTime();
      if (Number.isFinite(expiry) && expiry <= Date.now()) return false;
    }
    const members = grant.credit_grant_members.map((member) => member.person_id).sort((a, b) => a - b);
    if (item.class_type === "pair") return members.length === classPeople.length && members.every((id, index) => id === classPeople[index]);
    return members.length === 1 && members[0] === personId;
  }).sort((a, b) => {
    const aExpiry = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const bExpiry = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const safeA = Number.isFinite(aExpiry) ? aExpiry : Number.POSITIVE_INFINITY;
    const safeB = Number.isFinite(bExpiry) ? bExpiry : Number.POSITIVE_INFINITY;
    if (safeA !== safeB) return safeA - safeB;
    return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
  });
}

function defaultGrantSelection(item: ClassItem, credits: CreditItem[]) {
  const next: Record<number, string> = {};
  if (item.class_type === "pair") {
    const firstPerson = item.class_participants[0]?.person_id;
    const available = firstPerson ? compatibleCreditsForClass(item, credits, firstPerson) : [];
    const storedIds = [...new Set(item.class_participants.map((participant) => participant.preferred_billing_grant_id).filter((id): id is number => Boolean(id)))];
    const preferred = storedIds.length === 1 ? available.find((grant) => grant.id === storedIds[0]) ?? available[0] : available[0];
    item.class_participants.forEach((participant) => { next[participant.person_id] = preferred ? String(preferred.id) : ""; });
    return next;
  }
  item.class_participants.forEach((participant) => {
    const available = compatibleCreditsForClass(item, credits, participant.person_id);
    const preferred = available.find((grant) => grant.id === participant.preferred_billing_grant_id) ?? available[0];
    next[participant.person_id] = preferred ? String(preferred.id) : "";
  });
  return next;
}

function transferableIndividualCreditsForPair(item: ClassItem, credits: CreditItem[]) {
  if (item.class_type !== "pair") return [];
  const classPeople = new Set(item.class_participants.map((participant) => participant.person_id));
  return credits.filter((grant) => {
    if (grant.status !== "active" || grant.modality !== "individual" || creditBalance(grant) <= 0) return false;
    if (grant.expires_at) {
      const expiry = new Date(grant.expires_at).getTime();
      if (Number.isFinite(expiry) && expiry <= Date.now()) return false;
    }
    const members = grant.credit_grant_members.map((member) => member.person_id);
    return members.length === 1 && classPeople.has(members[0]);
  }).sort((a, b) => {
    const aExpiry = a.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const bExpiry = b.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const safeA = Number.isFinite(aExpiry) ? aExpiry : Number.POSITIVE_INFINITY;
    const safeB = Number.isFinite(bExpiry) ? bExpiry : Number.POSITIVE_INFINITY;
    if (safeA !== safeB) return safeA - safeB;
    return new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime();
  });
}

function FinishClassModal({ item, students, credits, library, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; library: TeachingContent[]; close: () => void; finished: () => Promise<void> }) {
  type FinancialItemLite = { id: number; item_type: string; concept: string; amount_cents: number; minutes: number | null; source_grant_id: number | null; target_grant_id: number | null };
  type SupplementRow = { id: number; concept: string; amount: string; expanded: boolean };
  type VideoDraft = { id: string; file: File; title: string; mode: "private" | "reusable"; audience: string; contentId: string; saved: boolean };
  const [localCredits, setLocalCredits] = useState<CreditItem[]>([]);
  const allCredits = useMemo(() => {
    const merged = new Map<number, CreditItem>();
    credits.forEach((grant) => merged.set(grant.id, grant));
    localCredits.forEach((grant) => merged.set(grant.id, grant));
    return [...merged.values()];
  }, [localCredits, credits]);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => defaultGrantSelection(item, credits));
  const [durationHoursText, setDurationHoursText] = useState(String(Math.floor(item.duration_minutes / 60)));
  const [durationMinutesText, setDurationMinutesText] = useState(String(item.duration_minutes % 60));
  const [billingMode, setBillingMode] = useState<"none" | "quick" | "direct">("none");
  const [quickHoursText, setQuickHoursText] = useState("5"), [quickMinutesText, setQuickMinutesText] = useState("0"), [quickPrice, setQuickPrice] = useState("");
  const initialTransferSources = transferableIndividualCreditsForPair(item, credits);
  const [transferOpen, setTransferOpen] = useState(false), [transferSourceId, setTransferSourceId] = useState(() => initialTransferSources[0] ? String(initialTransferSources[0].id) : "");
  const [transferMinutesText, setTransferMinutesText] = useState(""), [transferFee, setTransferFee] = useState("0"), [transferBusy, setTransferBusy] = useState(false);
  const [financialItems, setFinancialItems] = useState<FinancialItemLite[]>([]);
  const [supplements, setSupplements] = useState<SupplementRow[]>([]), [nextSupplementId, setNextSupplementId] = useState(1);
  const [regularizationAmounts, setRegularizationAmounts] = useState<Record<string, string>>({});
  const [quickCreatedChargeCents, setQuickCreatedChargeCents] = useState(0), [quickCreatedGrantId, setQuickCreatedGrantId] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "half" | "custom" | "none">("full"), [customPayment, setCustomPayment] = useState("");
  const [videos, setVideos] = useState<VideoDraft[]>([]);
  const [quickBusy, setQuickBusy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const plannedDuration = item.duration_minutes;
  const durationHours = Math.max(0, Math.min(8, Number(durationHoursText || 0)));
  const durationMinutes = Math.max(0, Math.min(59, Number(durationMinutesText || 0)));
  const manualDuration = durationHours * 60 + durationMinutes;
  const classPersonIds = item.class_participants.map((participant) => participant.person_id);
  const hasSelectedGrant = item.class_participants.every((participant) => Boolean(grantIds[participant.person_id]));
  const transferSources = useMemo(() => transferableIndividualCreditsForPair(item, allCredits), [item, allCredits]);
  const transferSource = transferSources.find((grant) => String(grant.id) === transferSourceId) ?? null;
  const selectedGrantId = Object.values(grantIds).find(Boolean) ?? "";
  const selectedGrant = allCredits.find((grant) => String(grant.id) === selectedGrantId) ?? null;
  const reusableVideoContents = library.filter((content) => content.active && ["correction","explanation","sequence"].includes(content.content_type));

  function numericText(value: string, max: number) {
    const clean = value.replace(/\D/g, "");
    if (!clean) return "";
    return String(Math.min(max, Number(clean)));
  }
  function moneyCents(value: string) {
    if (!value.trim()) return null;
    const numeric = Number(value.replace(",", "."));
    return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : null;
  }
  function euroLabel(cents: number) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100); }
  function eligibleCredits(personId: number) { return compatibleCreditsForClass(item, allCredits, personId); }
  function chooseGrant(personId: number, value: string) {
    setBillingMode("none"); setError("");
    setGrantIds((current) => {
      const next = { ...current };
      if (item.class_type === "pair") item.class_participants.forEach((participant) => { next[participant.person_id] = value; });
      else next[personId] = value;
      return next;
    });
  }
  function clearGrantSelection() { setGrantIds(Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, ""])) as Record<number, string>); }
  function selectCreatedGrant(id: number) {
    setGrantIds((current) => {
      const next = { ...current };
      item.class_participants.forEach((participant) => { next[participant.person_id] = String(id); });
      return next;
    });
    setBillingMode("none");
  }
  function expiryLabel(grant: CreditItem) {
    if (!grant.expires_at) return "";
    return ` · caduca ${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(grant.expires_at))}`;
  }
  function ownerLabel(grant: CreditItem) {
    const personId = grant.credit_grant_members[0]?.person_id;
    return students.find((person) => person.id === personId)?.display_name || "Alumno";
  }
  const loadFinancialItems = useCallback(async () => {
    if (!db) return;
    const result = await db.from("class_financial_items").select("id,item_type,concept,amount_cents,minutes,source_grant_id,target_grant_id").eq("class_id", item.id).order("id");
    if (!result.error) setFinancialItems((result.data ?? []) as FinancialItemLite[]);
  }, [item.id]);
  useEffect(() => { const timer=window.setTimeout(() => void loadFinancialItems(),0); return () => window.clearTimeout(timer); }, [loadFinancialItems]);

  function addSupplement() { setSupplements((current) => [...current, { id: nextSupplementId, concept: "", amount: "", expanded: true }]); setNextSupplementId((current) => current + 1); }
  function updateSupplement(id: number, patch: Partial<SupplementRow>) { setSupplements((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  function saveSupplement(id: number) {
    const row = supplements.find((item) => item.id === id); if (!row) return;
    const amount = moneyCents(row.amount);
    if (!row.concept.trim()) return setError("Indica el concepto del suplemento.");
    if (amount === null || amount <= 0) return setError("Indica un importe válido para el suplemento.");
    setError(""); updateSupplement(id, { expanded: false });
  }
  function removeSupplement(id: number) {
    if (!window.confirm("¿Eliminar este suplemento?")) return;
    setSupplements((current) => current.filter((row) => row.id !== id));
  }

  async function createQuickBonus() {
    if (!db) return;
    const duration = Math.max(0, Number(quickHoursText || 0)) * 60 + Math.max(0, Math.min(59, Number(quickMinutesText || 0)));
    const price = moneyCents(quickPrice);
    if (duration <= 0) return setError("Indica la duración del bono.");
    if (price === null) return setError("Indica el importe del bono.");
    setQuickBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", { p_student_ids: classPersonIds, p_modality: item.class_type, p_minutes: duration, p_price_cents: price, p_label: "Bono rápido", p_payment_status: "pending" });
    if (result.error) { setError(result.error.message); setQuickBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const id = Number(row.id || 0);
    if (!id) { setError("No se pudo seleccionar el bono creado."); setQuickBusy(false); return; }
    const created: CreditItem = { id, modality: item.class_type, label: row.label ?? "Bono rápido", total_minutes: duration, price_cents: price, payment_status: "pending", status: row.status ?? "active", purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? null, credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: duration }] };
    setLocalCredits((current) => [created, ...current.filter((grant) => grant.id !== id)]);
    setQuickCreatedChargeCents(price); setQuickCreatedGrantId(id); selectCreatedGrant(id); setQuickBusy(false);
  }
  function openDirectPayment() { clearGrantSelection(); setBillingMode("direct"); setQuickPrice(""); setError(""); }
  function openTransfer() {
    const preferred = transferSources[0];
    if (!preferred) return setError("No hay saldo individual disponible para transferir.");
    setTransferSourceId(String(preferred.id));
    setTransferMinutesText(String(Math.min(manualDuration || item.duration_minutes, creditBalance(preferred))));
    setTransferFee("0"); setTransferOpen(true); setError("");
  }
  async function createPairTransfer() {
    if (!db || !transferSource) return;
    const minutes = Number(transferMinutesText || 0), fee = moneyCents(transferFee);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > creditBalance(transferSource)) return setError("Indica unos minutos válidos dentro del saldo disponible.");
    if (fee === null) return setError("Indica el coste adicional de la transferencia.");
    setTransferBusy(true); setError("");
    const result = await db.rpc("transfer_individual_credit_to_pair", { p_class_id: item.id, p_source_grant_id: transferSource.id, p_minutes: minutes, p_fee_cents: fee });
    if (result.error) { setError(result.error.message); setTransferBusy(false); return; }
    const row = (result.data ?? {}) as Partial<CreditItem> & { id?: number };
    const targetId = Number(row.id || 0);
    if (!targetId) { setError("No se pudo crear el saldo de pareja."); setTransferBusy(false); return; }
    const updatedSource: CreditItem = { ...transferSource, status: creditBalance(transferSource) - minutes <= 0 ? "exhausted" : transferSource.status, credit_movements: [...transferSource.credit_movements, { delta_minutes: -minutes }] };
    const target: CreditItem = { id: targetId, modality: "pair", label: row.label ?? "Transferencia a pareja", total_minutes: minutes, price_cents: 0, payment_status: "paid", status: "active", purchased_at: row.purchased_at ?? new Date().toISOString(), expires_at: row.expires_at ?? transferSource.expires_at, credit_grant_members: classPersonIds.map((person_id) => ({ person_id })), credit_movements: [{ delta_minutes: minutes }] };
    setLocalCredits((current) => [target, updatedSource, ...current.filter((grant) => grant.id !== targetId && grant.id !== transferSource.id)]);
    selectCreatedGrant(targetId); await loadFinancialItems(); setTransferOpen(false); setTransferBusy(false);
  }

  const shortfallRows = useMemo(() => {
    const rows: Array<{ key: string; grant: CreditItem; personIds: number[]; shortfall: number }> = [];
    if (item.class_type === "pair") {
      const grant = allCredits.find((candidate) => String(candidate.id) === selectedGrantId);
      if (grant) { const shortfall = Math.max(0, manualDuration - creditBalance(grant)); if (shortfall) rows.push({ key: `grant-${grant.id}`, grant, personIds: classPersonIds, shortfall }); }
      return rows;
    }
    item.class_participants.forEach((participant) => {
      const id = grantIds[participant.person_id], grant = allCredits.find((candidate) => String(candidate.id) === id);
      if (!grant) return;
      const shortfall = Math.max(0, manualDuration - creditBalance(grant));
      if (shortfall) rows.push({ key: `grant-${grant.id}`, grant, personIds: [participant.person_id], shortfall });
    });
    return rows;
  }, [item, allCredits, selectedGrantId, grantIds, manualDuration, classPersonIds]);

  const supplementTotalCents = supplements.reduce((sum, row) => sum + (moneyCents(row.amount) ?? 0), 0);
  const directPriceCents = billingMode === "direct" ? (moneyCents(quickPrice) ?? 0) : 0;
  const transferTotalCents = financialItems.filter((row) => row.item_type === "pair_transfer").reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  const regularizationTotalCents = shortfallRows.reduce((sum, row) => Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key) ? sum + (moneyCents(regularizationAmounts[row.key]) ?? 0) : sum, 0);
  const totalEconomicCents = quickCreatedChargeCents + directPriceCents + transferTotalCents + supplementTotalCents + regularizationTotalCents;
  const customPaidCents = moneyCents(customPayment);
  const paidNowCents = totalEconomicCents <= 0 ? 0 : paymentMode === "full" ? totalEconomicCents : paymentMode === "half" ? Math.round(totalEconomicCents / 2) : paymentMode === "none" ? 0 : (customPaidCents ?? 0);
  const pendingPaymentCents = Math.max(0, totalEconomicCents - paidNowCents);

  function addVideoFiles(files: FileList | null) {
    if (!files?.length) return;
    const additions = Array.from(files).map((file, index): VideoDraft => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
      mode: "private",
      audience: item.class_type === "pair" ? "both" : String(classPersonIds[0] ?? ""),
      contentId: "",
      saved: false,
    }));
    setVideos((current) => [...current, ...additions]);
  }
  function updateVideo(id: string, patch: Partial<VideoDraft>) { setVideos((current) => current.map((video) => video.id === id ? { ...video, ...patch } : video)); }
  function removeVideo(id: string) {
    const row = videos.find((video) => video.id === id); if (!row || row.saved) return;
    if (!window.confirm("¿Quitar este vídeo del cierre?")) return;
    setVideos((current) => current.filter((video) => video.id !== id));
  }
  async function saveClassVideos() {
    if (!db) return videos.length === 0;
    const sessionResult = await db.auth.getSession(), token = sessionResult.data.session?.access_token;
    if (!token) { setError("Tu sesión ha caducado."); return false; }
    for (const video of videos) {
      if (video.saved) continue;
      const response = await fetch("/api/google-drive/upload", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": video.file.type || "video/mp4", "x-cya-file-name": encodeURIComponent(video.file.name), "x-cya-file-size": String(video.file.size), "x-cya-media-scope": "class_video" }, body: video.file });
      const payload = await response.json().catch(() => null) as { id?: string; mimeType?: string; error?: string } | null;
      if (!response.ok || !payload?.id) { setError(payload?.error || `No se pudo subir ${video.file.name} a Drive.`); return false; }
      const title = video.title.trim() || video.file.name.replace(/\.[^.]+$/, "") || "Vídeo de clase";
      const recipients = video.mode === "private" ? (video.audience === "both" ? classPersonIds : [Number(video.audience)]) : [0];
      for (const personId of recipients) {
        const registered = await db.rpc("register_class_video_resource", { p_class_id: item.id, p_person_id: video.mode === "private" ? personId : null, p_visibility_scope: video.mode === "private" ? "private_student" : "reusable", p_external_file_id: payload.id, p_title: title, p_mime_type: payload.mimeType || video.file.type || "video/mp4", p_size_bytes: video.file.size, p_content_id: video.mode === "reusable" && video.contentId ? Number(video.contentId) : null });
        if (registered.error) { setError(registered.error.message); return false; }
      }
      updateVideo(video.id, { saved: true });
    }
    return true;
  }

  function renderRegularization(grant: CreditItem, personIds: number[]) {
    const row = shortfallRows.find((candidate) => candidate.grant.id === grant.id);
    if (!row) return null;
    const enabled = Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key);
    return <div className="regularization-box"><div><strong>Faltan {minutesLabel(row.shortfall)}</strong><span>Puedes dejarlos pendientes o regularizarlos ahora.</span></div>{enabled ? <div className="regularization-edit"><label className="field"><span>Importe de {minutesLabel(row.shortfall)} (€)</span><input inputMode="decimal" type="text" value={regularizationAmounts[row.key]} onChange={(event) => setRegularizationAmounts((current) => ({ ...current, [row.key]: event.target.value.replace(/[^0-9,.]/g, "") }))} placeholder="0,00" /></label><button className="btn ghost" type="button" onClick={() => setRegularizationAmounts((current) => { const next = { ...current }; delete next[row.key]; return next; })}>Dejar pendiente</button></div> : <button className="btn ghost" type="button" onClick={() => setRegularizationAmounts((current) => ({ ...current, [row.key]: "" }))}><WalletCards size={16} /> Regularizar {minutesLabel(row.shortfall)} ahora</button>}</div>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    if (manualDuration <= 0 || manualDuration > 480) return setError("La duración debe estar entre 1 minuto y 8 horas.");
    const directPrice = moneyCents(quickPrice);
    if (billingMode === "direct" && directPrice === null) return setError("Indica el importe de la clase suelta.");
    if (billingMode === "quick") return setError("Crea el bono rápido o cancela esa opción antes de terminar la clase.");
    if (paymentMode === "custom" && (customPaidCents === null || customPaidCents > totalEconomicCents)) return setError("Indica un pago válido que no supere el total.");
    const supplementPayload: Array<{ concept: string; amount_cents: number }> = [];
    for (const row of supplements) {
      const concept = row.concept.trim(), amount = moneyCents(row.amount);
      if (!concept && !row.amount.trim()) continue;
      if (!concept) return setError("Indica el concepto de cada suplemento.");
      if (amount === null || amount <= 0) return setError(`Indica un importe válido para ${concept}.`);
      supplementPayload.push({ concept, amount_cents: amount });
    }
    const regularizationPayload: Array<{ source_grant_id: number; minutes: number; amount_cents: number }> = [];
    for (const row of shortfallRows) {
      if (!Object.prototype.hasOwnProperty.call(regularizationAmounts, row.key)) continue;
      const amount = moneyCents(regularizationAmounts[row.key]);
      if (amount === null) return setError(`Indica el importe para regularizar ${minutesLabel(row.shortfall)}.`);
      regularizationPayload.push({ source_grant_id: row.grant.id, minutes: row.shortfall, amount_cents: amount });
    }
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    if (!(await saveClassVideos())) { setBusy(false); return; }
    const result = await db.rpc("administratively_finish_class_v6", {
      p_class_id: item.id,
      p_person_ids: personIds,
      p_grant_ids: billingMode === "direct" ? personIds.map(() => null) : personIds.map((id) => grantIds[id] ? Number(grantIds[id]) : null),
      p_duration_minutes: manualDuration,
      p_direct_payment_price_cents: billingMode === "direct" ? directPrice : null,
      p_supplements: supplementPayload,
      p_regularizations: regularizationPayload,
      p_paid_now_cents: paidNowCents,
      p_quick_created_grant_id: quickCreatedGrantId,
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await finished(); setBusy(false); close();
  }

  const pairAvailable = item.class_type === "pair" && classPersonIds[0] ? eligibleCredits(classPersonIds[0]) : [];
  return <div className="backdrop"><section className="modal finish-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Parte administrativa</p><h2>Terminar clase</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Duración</p><h2>Duración de la clase</h2></div><span className="badge">Programada · {minutesLabel(plannedDuration)}</span></div><div className="fields-2"><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={durationHoursText} onChange={(event) => setDurationHoursText(numericText(event.target.value, 8))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={durationMinutesText} onChange={(event) => setDurationMinutesText(numericText(event.target.value, 59))} /></label></div><p className="modal-intro">{manualDuration === plannedDuration ? `Se usarán ${minutesLabel(manualDuration)}.` : `Se usarán ${minutesLabel(manualDuration)} en saldo, incidencias e historial.`}</p></section>

      {item.class_type === "pair" ? <section className="finish-person finish-pair-credit"><strong>{namesFor(classPersonIds, students)}</strong><label className="field"><span>Bono de pareja</span><select value={selectedGrantId} disabled={billingMode === "direct"} onChange={(event) => chooseGrant(classPersonIds[0], event.target.value)}><option value="">Sin bono</option>{pairAvailable.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || "Bono de pareja"} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>{selectedGrant ? renderRegularization(selectedGrant, classPersonIds) : null}</section> : <div className="finish-list">{item.class_participants.map((participant) => {
        const student = students.find((person) => person.id === participant.person_id), available = eligibleCredits(participant.person_id), selected = allCredits.find((grant) => String(grant.id) === grantIds[participant.person_id]);
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={billingMode === "direct"} onChange={(event) => chooseGrant(participant.person_id, event.target.value)}><option value="">Sin bono</option>{available.map((grant) => { const balance = creditBalance(grant), shortfall = Math.max(0, manualDuration - balance); return <option key={grant.id} value={grant.id}>{grant.label || "Bono individual"} · {minutesLabel(balance)}{expiryLabel(grant)}{shortfall ? ` · faltarán ${minutesLabel(shortfall)}` : ""}</option>; })}</select></label>{selected ? renderRegularization(selected, [participant.person_id]) : null}</section>;
      })}</div>}

      {item.class_type === "pair" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pareja</p><h2>Transferir saldo individual</h2></div><button className="btn ghost" type="button" disabled={!transferSources.length || transferBusy} onClick={openTransfer}><WalletCards size={17} /> Transferir saldo</button></div>{transferTotalCents ? <p className="modal-intro">Coste de transferencias realizadas para esta clase: <strong>{euroLabel(transferTotalCents)}</strong>.</p> : <p className="modal-intro">Puedes convertir los minutos que quieras antes de cerrar y usar después el nuevo bono de pareja.</p>}{transferOpen && transferSource ? <div className="transfer-preclose"><label className="field"><span>Bono individual</span><select value={transferSourceId} onChange={(event) => { const value = event.target.value; setTransferSourceId(value); const source = transferSources.find((grant) => String(grant.id) === value); if (source) setTransferMinutesText(String(Math.min(manualDuration || item.duration_minutes, creditBalance(source)))); }}>{transferSources.map((grant) => <option key={grant.id} value={grant.id}>{ownerLabel(grant)} · {grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}{expiryLabel(grant)}</option>)}</select></label><div className="fields-2"><label className="field"><span>Minutos a transferir</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={transferMinutesText} onChange={(event) => setTransferMinutesText(numericText(event.target.value, Math.min(480, creditBalance(transferSource))))} /></label><label className="field"><span>Coste adicional (€)</span><input type="text" inputMode="decimal" value={transferFee} onChange={(event) => setTransferFee(event.target.value.replace(/[^0-9,.]/g, ""))} /></label></div><div className="actions"><button className="btn ghost" type="button" onClick={() => setTransferOpen(false)}>Cancelar</button><button className="btn" type="button" disabled={transferBusy || !transferMinutesText} onClick={() => void createPairTransfer()}>{transferBusy ? "Transfiriendo…" : "Hacer transferencia"}</button></div></div> : null}</section> : null}

      {!hasSelectedGrant && billingMode === "none" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Cobro</p><h2>Sin bono compatible</h2></div></div><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("quick"); setQuickPrice(""); setError(""); }}><Plus size={17} /> Crear bono rápido</button><button className="btn" type="button" onClick={openDirectPayment}><WalletCards size={17} /> Pagar clase suelta</button></div></section> : null}

      {billingMode === "quick" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Bono rápido</p><h2>{item.class_type === "pair" ? "Bono de pareja" : "Bono individual"}</h2></div></div><div className="fields-2"><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={quickHoursText} onChange={(event) => setQuickHoursText(numericText(event.target.value, 1000))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={quickMinutesText} onChange={(event) => setQuickMinutesText(numericText(event.target.value, 59))} /></label><label className="field field-wide"><span>Importe (€)</span><input type="text" inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value.replace(/[^0-9,.]/g, ""))} /></label></div><p className="modal-intro">El pago se decide en el resumen final.</p><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button><button className="btn" type="button" disabled={quickBusy} onClick={() => void createQuickBonus()}><Plus size={17} /> {quickBusy ? "Creando…" : "Crear y usar"}</button></div></section> : null}
      {billingMode === "direct" ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Clase suelta</p><h2>{minutesLabel(manualDuration)}</h2></div><span className="badge">Clase suelta</span></div><label className="field"><span>Importe (€)</span><input type="text" inputMode="decimal" value={quickPrice} onChange={(event) => setQuickPrice(event.target.value.replace(/[^0-9,.]/g, ""))} /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => { setBillingMode("none"); setError(""); }}>Cancelar</button></div></section> : null}

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Extras</p><h2>Suplementos</h2></div><button className="btn ghost" type="button" onClick={addSupplement}><Plus size={17} /> Añadir</button></div>{supplements.length ? <div className="supplement-list">{supplements.map((supplement) => supplement.expanded ? <div className="supplement-editor" key={supplement.id}><div className="fields-2"><label className="field"><span>Concepto</span><input value={supplement.concept} onChange={(event) => updateSupplement(supplement.id, { concept: event.target.value })} placeholder="Parking, desplazamiento…" autoFocus /></label><label className="field"><span>Importe (€)</span><input type="text" inputMode="decimal" value={supplement.amount} onChange={(event) => updateSupplement(supplement.id, { amount: event.target.value.replace(/[^0-9,.]/g, "") })} placeholder="0,00" /></label></div><div className="actions"><button className="btn ghost" type="button" onClick={() => removeSupplement(supplement.id)}>Eliminar</button><button className="btn" type="button" onClick={() => saveSupplement(supplement.id)}>Guardar</button></div></div> : <div className="supplement-compact" key={supplement.id}><button type="button" onClick={() => updateSupplement(supplement.id, { expanded: true })}><span>{supplement.concept}</span><strong>{euroLabel(moneyCents(supplement.amount) ?? 0)}</strong></button><button className="icon-btn" type="button" aria-label="Eliminar suplemento" onClick={() => removeSupplement(supplement.id)}><X /></button></div>)}</div> : <p className="modal-intro">Sin suplementos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Vídeos</p><h2>Vídeos explicativos</h2></div><label className="btn ghost video-add"><Plus size={17} /> Añadir<input type="file" accept="video/*" multiple disabled={busy} onChange={(event) => { addVideoFiles(event.target.files); event.currentTarget.value = ""; }} /></label></div>{videos.length ? <div className="class-video-drafts">{videos.map((video) => <article className="class-video-draft" key={video.id}><div className="class-video-draft-head"><div><strong>{video.file.name}</strong><span>{video.saved ? "Guardado" : "Pendiente de subir"}</span></div>{!video.saved ? <button className="icon-btn" type="button" aria-label="Quitar vídeo" onClick={() => removeVideo(video.id)}><X /></button> : null}</div><label className="field"><span>Título</span><input value={video.title} disabled={video.saved} onChange={(event) => updateVideo(video.id, { title: event.target.value })} /></label><div className="segmented"><button type="button" className={video.mode === "private" ? "active" : ""} disabled={video.saved} onClick={() => updateVideo(video.id, { mode: "private", contentId: "" })}>Para alumno</button><button type="button" className={video.mode === "reusable" ? "active" : ""} disabled={video.saved} onClick={() => updateVideo(video.id, { mode: "reusable" })}>Reutilizable</button></div>{video.mode === "private" && item.class_type === "pair" ? <label className="field"><span>Disponible para</span><select value={video.audience} disabled={video.saved} onChange={(event) => updateVideo(video.id, { audience: event.target.value })}><option value="both">Ambos</option>{classPersonIds.map((personId) => <option key={personId} value={personId}>{students.find((person) => person.id === personId)?.display_name || "Alumno"}</option>)}</select></label> : null}{video.mode === "reusable" ? <label className="field"><span>Añadir ahora a contenido</span><select value={video.contentId} disabled={video.saved} onChange={(event) => updateVideo(video.id, { contentId: event.target.value })}><option value="">Dejar disponible para después</option>{reusableVideoContents.map((content) => <option key={content.id} value={content.id}>{teachingKindLabels[content.content_type]} · {content.title}</option>)}</select></label> : null}</article>)}</div> : <p className="modal-intro">Opcional. Puedes añadir varios vídeos.</p>}</section>

      <section className="card pad"><div className="card-head"><div><p className="eyebrow">Resumen</p><h2>Cierre</h2></div></div><p className="modal-intro"><strong>Duración:</strong> {minutesLabel(manualDuration)}</p>{selectedGrant ? <p className="modal-intro"><strong>Bono:</strong> {selectedGrant.label || (selectedGrant.modality === "pair" ? "Bono de pareja" : "Bono individual")} · se consumirán hasta {minutesLabel(Math.min(manualDuration, creditBalance(selectedGrant)))}</p> : null}{billingMode === "direct" ? <p className="modal-intro"><strong>Clase suelta:</strong> {euroLabel(directPriceCents)}</p> : null}{transferTotalCents ? <p className="modal-intro"><strong>Transferencias:</strong> {euroLabel(transferTotalCents)}</p> : null}{regularizationTotalCents ? <p className="modal-intro"><strong>Regularización:</strong> {euroLabel(regularizationTotalCents)}</p> : null}{supplementTotalCents ? <p className="modal-intro"><strong>Suplementos:</strong> {euroLabel(supplementTotalCents)}</p> : null}{quickCreatedChargeCents ? <p className="modal-intro"><strong>Bono creado ahora:</strong> {euroLabel(quickCreatedChargeCents)}</p> : null}<div className="card-head"><h2>Total de este cierre</h2><strong>{euroLabel(totalEconomicCents)}</strong></div></section>
      {totalEconomicCents > 0 ? <section className="card pad"><div className="card-head"><div><p className="eyebrow">Pago</p><h2>Pago recibido ahora</h2></div><strong>{euroLabel(paidNowCents)}</strong></div><div className="fields-2"><button className={paymentMode === "full" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("full")}>Todo · {euroLabel(totalEconomicCents)}</button><button className={paymentMode === "half" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("half")}>Mitad · {euroLabel(Math.round(totalEconomicCents / 2))}</button><button className={paymentMode === "custom" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("custom")}>Otra cantidad</button><button className={paymentMode === "none" ? "btn" : "btn ghost"} type="button" onClick={() => setPaymentMode("none")}>Nada ahora</button></div>{paymentMode === "custom" ? <label className="field"><span>Importe recibido (€)</span><input type="text" inputMode="decimal" value={customPayment} onChange={(event) => setCustomPayment(event.target.value.replace(/[^0-9,.]/g, ""))} /></label> : null}<div className="card-head"><span>Pagado ahora</span><strong>{euroLabel(paidNowCents)}</strong></div><div className="card-head"><span>Pendiente</span><strong>{euroLabel(pendingPaymentCents)}</strong></div></section> : null}
      {!hasSelectedGrant && billingMode === "none" ? <p className="modal-intro">Si terminas sin bono, la duración quedará pendiente como incidencia.</p> : null}
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy || manualDuration <= 0 || billingMode === "quick"}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}

function ManualClassDraft({ students, close, created, refresh }: { students: Person[]; close: () => void; created: (id: number) => Promise<void>; refresh: () => Promise<void> }) {
  const [type,setType] = useState<"individual"|"pair">("individual"), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [firstId,setFirstId] = useState(""), [secondId,setSecondId] = useState("");
  const [quickSlot,setQuickSlot] = useState<1|2|null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    setBusy(true); setError("");
    const result = await db.rpc("create_manual_class_draft", { p_class_type:type, p_student_ids:type === "pair" ? [first,second] : [first] });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    const id = Number((result.data as { id?: number } | null)?.id || 0);
    if (id) await created(id);
    setBusy(false); close();
  }
  return <><div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><h2>Empezar otra clase</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}><div className="segmented"><button type="button" className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>Individual</button><button type="button" className={type === "pair" ? "active" : ""} onClick={() => setType("pair")}>Pareja</button></div><div className="fields-2"><div className="field"><span>Alumno *</span><select name="student_1" required value={firstId} onChange={(event) => setFirstId(event.target.value)}><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select><button type="button" className="text-button" onClick={() => setQuickSlot(1)}><Plus size={15}/> Crear alumno provisional</button></div>{type === "pair" ? <div className="field"><span>Segundo alumno *</span><select name="student_2" required value={secondId} onChange={(event) => setSecondId(event.target.value)}><option value="" disabled>Seleccionar</option>{students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}</select><button type="button" className="text-button" onClick={() => setQuickSlot(2)}><Plus size={15}/> Crear alumno provisional</button></div> : null}</div><p className="modal-intro">CYA reutilizará fecha, duración y el contexto de baile que ya conozca. Después solo te pedirá lo que realmente falte.</p>{error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><ArrowRight size={17} /> {busy ? "Creando…" : "Continuar"}</button></div></form>
  </section></div>{quickSlot && db ? <QuickProvisionalStudentModal client={db} close={() => setQuickSlot(null)} created={async (person: EditablePersonIdentity) => { await refresh(); if (quickSlot===1) setFirstId(String(person.id)); else setSecondId(String(person.id)); }} /> : null}</>;
}

function ClassSetupStage({ item, students, credits, terms, refresh, notify, back, next }: { item: ClassItem; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; refresh: () => Promise<void>; notify: (message:string) => void; back: () => void; next: () => void }) {
  const personIds = useMemo(() => item.class_participants.map((participant) => participant.person_id), [item.class_participants]);
  const [danceProfiles,setDanceProfiles] = useState<DanceProfileRow[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(""), [editKnown,setEditKnown] = useState(false);
  const [scheduledText,setScheduledText] = useState(() => localDateTime(new Date(item.scheduled_start_at))), [hoursText,setHoursText] = useState(String(Math.floor(item.duration_minutes/60))), [minutesText,setMinutesText] = useState(String(item.duration_minutes%60));
  const [styleId,setStyleId] = useState(item.style_term_id ? String(item.style_term_id) : ""), [locationText,setLocationText] = useState(item.location_text ?? "");
  const [roles,setRoles] = useState<Record<number,string>>(() => Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, participant.role_term_id ? String(participant.role_term_id) : ""]))), [levels,setLevels] = useState<Record<number,string>>(() => Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, participant.level_term_id ? String(participant.level_term_id) : ""])));
  const [grants,setGrants] = useState<Record<number,string>>(() => Object.fromEntries(item.class_participants.map((participant) => [participant.person_id, participant.preferred_billing_grant_id ? String(participant.preferred_billing_grant_id) : ""])));
  const styles = terms.filter((term) => term.taxonomy === "dance_style"), roleTerms = terms.filter((term) => term.taxonomy === "dance_role"), levelTerms = terms.filter((term) => term.taxonomy === "dance_level");
  useEffect(() => { if (!db || !personIds.length) return; let alive=true; void db.from("student_dance_profiles").select("person_id,style_term_id,role_term_id,level_term_id,is_primary,active").in("person_id",personIds).eq("active",true).then((result) => { if (alive && !result.error) setDanceProfiles((result.data ?? []) as DanceProfileRow[]); }); return () => { alive=false; }; }, [personIds]);
  useEffect(() => {
    if (!danceProfiles.length) return;
    const timer=window.setTimeout(() => {
        let effectiveStyle = Number(styleId || 0);
        if (!effectiveStyle) {
          const perPerson = personIds.map((personId) => danceProfiles.filter((row) => row.person_id === personId));
          const common = perPerson[0]?.map((row) => row.style_term_id).find((candidate) => perPerson.every((rows) => rows.some((row) => row.style_term_id === candidate)));
          const primary = danceProfiles.find((row) => row.person_id === personIds[0] && row.is_primary)?.style_term_id;
          effectiveStyle = common ?? primary ?? 0;
          if (effectiveStyle) setStyleId(String(effectiveStyle));
        }
        if (!effectiveStyle) return;
        setRoles((current) => { const nextRoles={...current}; personIds.forEach((personId) => { if (!nextRoles[personId]) { const match=danceProfiles.find((row) => row.person_id===personId && row.style_term_id===effectiveStyle && row.is_primary) ?? danceProfiles.find((row) => row.person_id===personId && row.style_term_id===effectiveStyle); if (match) nextRoles[personId]=String(match.role_term_id); } }); return nextRoles; });
        setLevels((current) => { const nextLevels={...current}; personIds.forEach((personId) => { if (!nextLevels[personId]) { const match=danceProfiles.find((row) => row.person_id===personId && row.style_term_id===effectiveStyle && row.is_primary) ?? danceProfiles.find((row) => row.person_id===personId && row.style_term_id===effectiveStyle); if (match?.level_term_id) nextLevels[personId]=String(match.level_term_id); } }); return nextLevels; });
    },0);
    return () => window.clearTimeout(timer);
  }, [danceProfiles,personIds,styleId]);
  function setGrant(personId:number,value:string) { setGrants((current) => { const nextGrants={...current}; if (item.class_type === "pair") personIds.forEach((id) => nextGrants[id]=value); else nextGrants[personId]=value; return nextGrants; }); }
  async function save() {
    if (!db) return;
    const hours=Number(hoursText || 0), minutes=Number(minutesText || 0), duration=hours*60+minutes;
    if (!scheduledText || !styleId || duration<1 || duration>480) return setError("Confirma fecha, duración y estilo.");
    if (personIds.some((id) => !roles[id] || !levels[id])) return setError("Confirma rol y nivel de todos los alumnos.");
    setBusy(true); setError("");
    const result = await db.rpc("save_class_setup", { p_class_id:item.id,p_scheduled_start_at:new Date(scheduledText).toISOString(),p_duration_minutes:duration,p_style_term_id:Number(styleId),p_location_text:locationText.trim() || null,p_person_ids:personIds,p_role_term_ids:personIds.map((id) => Number(roles[id]) || null),p_level_term_ids:personIds.map((id) => Number(levels[id]) || null),p_preferred_grant_ids:personIds.map((id) => grants[id] ? Number(grants[id]) : null) });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await refresh(); notify("Datos de la clase preparados."); setBusy(false); next();
  }
  const pairAvailable = item.class_type === "pair" && personIds[0] ? compatibleCreditsForClass(item,credits,personIds[0]) : [];
  const setupDuration=Number(hoursText || 0)*60+Number(minutesText || 0);
  const classMissing=!scheduledText || !styleId || setupDuration<1 || setupDuration>480;
  const missingContextIds=personIds.filter((personId) => !roles[personId] || !levels[personId]);
  const showClassFields=editKnown || classMissing;
  const selectedStyle=styles.find((term) => String(term.id)===styleId);
  const selectedGrantFor=(personId:number) => credits.find((grant) => grant.id===Number(grants[personId] || 0));
  const pairSelectedGrant=personIds[0] ? selectedGrantFor(personIds[0]) : undefined;
  return <div className="class-workflow-page"><header className="workflow-head"><button className="icon-btn" onClick={back} aria-label="Volver al centro de clases">‹</button><div><p className="eyebrow">1 · Datos</p><h1>{namesFor(personIds,students)}</h1><p>{classMissing || missingContextIds.length ? "Completa únicamente los datos pendientes." : "CYA ya tiene los datos necesarios para preparar esta clase."}</p></div><button className="btn ghost workflow-edit-data" onClick={() => setEditKnown((current) => !current)}>{editKnown ? "Ocultar edición" : "Editar datos"}</button></header><div className="workflow-stepbar"><span className="active">Datos</span><span>Preparar</span><span>Dar clase</span><span>Resumen</span></div>
    <section className="card pad workflow-card"><div className="card-head"><h2>Clase</h2><span>{item.class_type === "pair" ? "Pareja" : "Individual"}</span></div>{showClassFields ? <div className="fields-2"><label className="field field-wide"><span>Fecha y hora</span><input type="datetime-local" value={scheduledText} onChange={(event) => setScheduledText(event.target.value)} /></label><label className="field"><span>Horas</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={hoursText} onChange={(event) => setHoursText(event.target.value.replace(/\D/g,""))} /></label><label className="field"><span>Minutos</span><input type="text" inputMode="numeric" pattern="[0-9]*" value={minutesText} onChange={(event) => setMinutesText(event.target.value.replace(/\D/g,""))} /></label><label className="field"><span>Estilo</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)}><option value="">Seleccionar</option>{styles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Lugar</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Opcional" /></label></div> : <div className="prepare-list setup-known-list"><span><strong>Fecha</strong>{dateLabel(scheduledText)}</span><span><strong>Duración</strong>{minutesLabel(setupDuration)}</span><span><strong>Estilo</strong>{selectedStyle?.label || "Pendiente"}</span>{locationText ? <span><strong>Lugar</strong>{locationText}</span> : null}</div>}{item.notes ? <p className="workflow-known-note"><strong>Programación</strong>{item.notes}</p> : null}</section>
    <section className="workflow-people">{item.class_participants.map((participant) => { const student=students.find((person) => person.id===participant.person_id), roleValue=roles[participant.person_id] || "", levelValue=levels[participant.person_id] || "", showContextFields=editKnown || !roleValue || !levelValue, roleLabelValue=roleTerms.find((term) => String(term.id)===roleValue)?.label || "Rol pendiente", levelLabelValue=levelTerms.find((term) => String(term.id)===levelValue)?.label || "Nivel pendiente", selectedGrant=selectedGrantFor(participant.person_id); return <article className="card pad workflow-card" key={participant.person_id}><div className="prepare-summary"><span className="avatar"><UserRound /></span><div><strong>{student?.display_name || "Alumno"}</strong><span>{showContextFields ? "Completa su contexto de baile" : "Contexto ya conocido"}</span></div></div>{showContextFields ? <div className="fields-2 workflow-context-fields"><label className="field"><span>Rol</span><select value={roleValue} onChange={(event) => setRoles((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={levelValue} onChange={(event) => setLevels((current) => ({...current,[participant.person_id]:event.target.value}))}><option value="">Seleccionar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label></div> : <div className="prepare-info setup-known-context"><strong>Contexto</strong><p>{roleLabelValue} · {levelLabelValue}</p></div>}{item.class_type === "individual" ? editKnown ? <label className="field workflow-credit"><span>Bono previsto</span><select value={grants[participant.person_id] || ""} onChange={(event) => setGrant(participant.person_id,event.target.value)}><option value="">Decidir al terminar</option>{compatibleCreditsForClass(item,credits,participant.person_id).map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono individual"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono previsto</strong><p>{selectedGrant ? `${selectedGrant.label || "Bono individual"} · ${minutesLabel(creditBalance(selectedGrant))}` : "Se decidirá al terminar"}</p></div> : null}</article>; })}</section>
    {item.class_type === "pair" ? <section className="card pad workflow-card"><div className="card-head"><h2>Bono previsto</h2><span>Opcional</span></div>{editKnown ? <label className="field"><span>Bono de pareja</span><select value={grants[personIds[0]] || ""} onChange={(event) => setGrant(personIds[0],event.target.value)}><option value="">Decidir al terminar</option>{pairAvailable.map((grant) => <option key={grant.id} value={grant.id}>{grant.label || "Bono de pareja"} · {minutesLabel(creditBalance(grant))}</option>)}</select></label> : <div className="prepare-info setup-known-credit"><strong>Bono de pareja</strong><p>{pairSelectedGrant ? `${pairSelectedGrant.label || "Bono de pareja"} · ${minutesLabel(creditBalance(pairSelectedGrant))}` : "Se decidirá al terminar"}</p></div>}</section> : null}
    {error ? <p className="error">{error}</p> : null}<div className="workflow-footer"><button className="btn ghost" onClick={back}>Volver</button><button className="btn" onClick={() => void save()} disabled={busy}>{busy ? "Guardando…" : <>{classMissing || missingContextIds.length ? "Completar y preparar" : "Todo listo · Preparar clase"} <ArrowRight /></>}</button></div>
  </div>;
}

function ClassPreparationStage({ item, classes, students, assignments, terms, refresh, notify, back, editData }: { item: ClassItem; classes: ClassItem[]; students: Person[]; assignments: ContentAssignment[]; terms: CatalogTerm[]; refresh: () => Promise<void>; notify: (message:string) => void; back: () => void; editData: () => void }) {
  const personIds = useMemo(() => item.class_participants.map((participant) => participant.person_id), [item.class_participants]);
  const [profiles,setProfiles] = useState<StudentPrepProfile[]>([]), [requests,setRequests] = useState<ClassPreparationRequest[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");
  useEffect(() => { if (!db) return; let alive=true; void Promise.all([db.from("student_profiles").select("person_id,goals,teacher_notes,health_notes").in("person_id",personIds),db.from("class_preparation_requests").select("id,class_id,person_id,request_type,body,external_file_id,content_id,created_at").eq("class_id",item.id).order("created_at")]).then(([profileResult,requestResult]) => { if (!alive) return; if (!profileResult.error) setProfiles((profileResult.data ?? []) as StudentPrepProfile[]); if (!requestResult.error) setRequests((requestResult.data ?? []) as ClassPreparationRequest[]); }); return () => { alive=false; }; }, [item.id,personIds]);
  async function begin() {
    if (!db || busy) return;
    setBusy(true); setError("");
    try {
      const result=await db.rpc("start_class",{p_class_id:item.id});
      if (result.error) throw result.error;
      await refresh();
      notify("Clase abierta.");
    } catch (cause) {
      const message=typeof cause === "object" && cause && "message" in cause ? String(cause.message) : "No se pudo iniciar la clase.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  const previous = [...classes].filter((candidate) => candidate.id!==item.id && candidate.status==='finished' && candidate.class_participants.some((p) => personIds.includes(p.person_id))).sort((a,b) => new Date(b.scheduled_start_at).getTime()-new Date(a.scheduled_start_at).getTime())[0] ?? null;
  return <div className="class-workflow-page"><header className="workflow-head"><button className="icon-btn" onClick={back} aria-label="Volver al centro de clases">‹</button><div><p className="eyebrow">2 · Preparar</p><h1>{namesFor(personIds,students)}</h1><p>Ubica al alumno antes de empezar a bailar.</p></div><button className="btn ghost workflow-edit-data" onClick={editData}>Editar datos</button></header><div className="workflow-stepbar"><span>Datos</span><span className="active">Preparar</span><span>Dar clase</span><span>Resumen</span></div>
    {previous ? <section className="card pad workflow-card previous-class"><div className="card-head"><h2>Última clase</h2><span>{dateLabel(previous.scheduled_start_at)}</span></div><p>{minutesLabel(previous.duration_minutes)}{terms.find((term) => term.id===previous.style_term_id) ? ` · ${terms.find((term) => term.id===previous.style_term_id)?.label}` : ""}</p></section> : null}
    <section className="workflow-people">{personIds.map((personId) => { const student=students.find((person) => person.id===personId), profile=profiles.find((row) => row.person_id===personId), own=assignments.filter((assignment) => assignment.person_id===personId), pendingCorrections=own.filter((assignment) => assignment.teaching_contents.content_type==='correction' && assignment.assignment_status==='pending'), recentLearning=own.filter((assignment) => ['explanation','sequence'].includes(assignment.teaching_contents.content_type)).sort((a,b) => new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,4), participant=item.class_participants.find((row) => row.person_id===personId); return <article className="card pad prepare-person" key={personId}><div className="prepare-summary"><span className="avatar"><UserRound /></span><div><strong>{student?.display_name || "Alumno"}</strong><span>{terms.find((term) => term.id===participant?.role_term_id)?.label || "Rol"} · {terms.find((term) => term.id===participant?.level_term_id)?.label || "Nivel"}</span></div></div>{profile?.health_notes ? <div className="prepare-alert"><AlertTriangle /><div><strong>A tener en cuenta</strong><span>{profile.health_notes}</span></div></div> : null}{profile?.teacher_notes ? <div className="prepare-info"><strong>Notas del profesor</strong><p>{profile.teacher_notes}</p></div> : null}{profile?.goals ? <div className="prepare-info"><strong>Objetivo</strong><p>{profile.goals}</p></div> : null}<div className="prepare-counts"><div><strong>{pendingCorrections.length}</strong><span>correcciones pendientes</span></div><div><strong>{recentLearning.length}</strong><span>contenidos recientes</span></div></div>{pendingCorrections.length ? <div className="prepare-list"><strong>Mirar hoy</strong>{pendingCorrections.slice(0,4).map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title}</span>)}</div> : null}{recentLearning.length ? <div className="prepare-list"><strong>Últimas explicaciones y secuencias</strong>{recentLearning.map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title} · {assignmentOptions(assignment.teaching_contents.content_type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status}</span>)}</div> : null}</article>; })}</section>
    <section className="card pad workflow-card"><div className="card-head"><div><p className="eyebrow">Para esta clase</p><h2>Lo que ha pedido el alumno</h2></div><span>{requests.length}</span></div>{requests.length ? <div className="request-list">{requests.map((request) => <article key={request.id}><span>{request.request_type==='video' ? 'Vídeo' : request.request_type==='focus' ? 'Quiere trabajar' : request.request_type==='content' ? 'Contenido' : 'Mensaje'}</span><strong>{request.body || (request.content_id ? 'Contenido seleccionado' : 'Vídeo adjunto')}</strong>{request.external_file_id ? <SecureDriveAsset fileId={request.external_file_id} mediaType="video" title="Vídeo para preparar la clase" controls className="request-video" /> : null}</article>)}</div> : <div className="compact-empty"><Sparkles /><span>No ha dejado indicaciones específicas para esta clase.</span></div>}</section>
    {error ? <p className="error">{error}</p> : null}<div className="workflow-footer"><button className="btn ghost" onClick={back}>Salir</button><button className="btn workflow-primary" onClick={() => void begin()} disabled={busy}><Play /> {busy ? "Abriendo…" : "Dar clase"}</button></div>
  </div>;
}

function ClassPostAdministrative({ item, students, no, yes }: { item: ClassItem; students: Person[]; no: () => void; yes: () => void }) {
  const [reviewOpen,setReviewOpen]=useState(false);
  return <div className="class-workflow-page post-admin"><div className="workflow-stepbar"><span>Datos</span><span>Preparar</span><span>Dar clase</span><span className="active">Resumen</span></div><section className="card pad post-admin-card"><CheckCircle2 /><p className="eyebrow">Administración terminada</p><h1>{namesFor(item.class_participants.map((p) => p.person_id),students)}</h1><p>El saldo y el cobro ya están registrados. La evaluación general es opcional. La revisión posterior, si está pendiente, pertenece solo a esta clase.</p><div className="post-admin-actions"><button className="btn ghost" onClick={no}>No, terminaré después</button><button className="btn ghost" onClick={() => setReviewOpen(true)}><ClipboardCheck/> Revisar evaluación de esta clase</button><button className="btn" onClick={yes}>Sí, preparar resumen <ArrowRight /></button></div></section>{reviewOpen ? <EvaluationPostClassGate classId={item.id} onCompleted={() => setReviewOpen(false)} /> : null}</div>;
}

function ClassFinalSummary({ item, students, library, refresh, notify, done, back }: { item: ClassItem; students: Person[]; library: TeachingContent[]; refresh: () => Promise<void>; notify: (message:string) => void; done: () => void; back: () => void }) {
  type MediaDraft = { id:string; file:File; title:string; kind:"class_document"|"final_dance"; audience:string; saved:boolean };
  const personIds = item.class_participants.map((participant) => participant.person_id);
  const [events,setEvents] = useState<ClassContentEvent[]>([]), [studentMessage,setStudentMessage] = useState(""), [internalNote,setInternalNote] = useState(""), [media,setMedia] = useState<MediaDraft[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const loadSummaryEvents=useCallback(async () => { if (!db) return; const result=await db.from("class_content_events").select("id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents(title,content_type)").eq("class_id",item.id).order("created_at"); if (result.error) { setError(result.error.message); return; } setEvents((result.data ?? []) as unknown as ClassContentEvent[]); },[item.id]);
  useEffect(() => { const timer=window.setTimeout(() => void loadSummaryEvents(),0); return () => window.clearTimeout(timer); }, [loadSummaryEvents]);
  const titleFor = (event:ClassContentEvent) => event.teaching_contents?.title || library.find((content) => content.id===event.content_id)?.title || "Contenido";
  const uniqueByContent = (rows:ClassContentEvent[]) => rows.filter((event,index,array) => array.findIndex((candidate) => candidate.content_id===event.content_id && candidate.event_type===event.event_type)===index);
  const positives = uniqueByContent(events.filter((event) => event.event_type==='improved' || event.event_type==='reviewed' || (event.event_type==='status_changed' && ['corrected','explained'].includes(event.new_status || '')) || event.event_type==='exercise_completed' || (event.event_type==='measurement_changed' && Number(event.payload.new_frequency ?? 0)<Number(event.payload.old_frequency ?? 0))));
  const negatives = uniqueByContent(events.filter((event) => (event.event_type==='status_changed' && event.new_status==='pending' && ['corrected','explained'].includes(event.previous_status || '')) || (event.event_type==='measurement_changed' && Number(event.payload.new_frequency ?? 0)>Number(event.payload.old_frequency ?? 0))));
  const newItems = uniqueByContent(events.filter((event) => event.event_type==='added'));
  const exercises = uniqueByContent(events.filter((event) => event.event_type.startsWith('exercise_')));
  function addMedia(files:FileList|null) { if (!files?.length) return; const additions=Array.from(files).map((file,index):MediaDraft => ({id:`${Date.now()}-${index}-${file.name}`,file,title:file.name.replace(/\.[^.]+$/,''),kind:file.type.startsWith('video/')?'final_dance':'class_document',audience:item.class_type==='pair'?'both':String(personIds[0] || ''),saved:false})); setMedia((current) => [...current,...additions]); }
  async function uploadMedia() {
    if (!db || !media.length) return true;
    const sessionResult=await db.auth.getSession(), token=sessionResult.data.session?.access_token; if (!token) { setError("Tu sesión ha caducado."); return false; }
    for (const draft of media) {
      if (draft.saved) continue;
      const response=await fetch('/api/google-drive/upload',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':draft.file.type || 'video/mp4','x-cya-file-name':encodeURIComponent(draft.file.name),'x-cya-file-size':String(draft.file.size),'x-cya-media-scope':'class_video'},body:draft.file});
      const payload=await response.json().catch(() => null) as {id?:string;mimeType?:string;error?:string}|null;
      if (!response.ok || !payload?.id) { setError(payload?.error || `No se pudo subir ${draft.file.name}.`); return false; }
      const recipients=draft.audience==='both' ? personIds : [Number(draft.audience)];
      for (const personId of recipients) { const result=await db.rpc('register_class_media_resource',{p_class_id:item.id,p_person_id:personId,p_media_kind:draft.kind,p_external_file_id:payload.id,p_title:draft.title.trim() || draft.file.name,p_mime_type:payload.mimeType || draft.file.type,p_size_bytes:draft.file.size}); if (result.error) { setError(result.error.message); return false; } }
      setMedia((current) => current.map((row) => row.id===draft.id ? {...row,saved:true} : row));
    }
    return true;
  }
  async function closeSummary() { if (!db) return; setBusy(true); setError(""); if (!(await uploadMedia())) { setBusy(false); return; } const result=await db.rpc('close_class_pedagogy_v2',{p_class_id:item.id,p_student_message:studentMessage.trim() || null,p_internal_note:internalNote.trim() || null}); if (result.error) { setError(result.error.message); setBusy(false); return; } await refresh(); notify("Clase cerrada y documentación actualizada."); setBusy(false); done(); }
  const renderEvent = (event:ClassContentEvent,tone:"positive"|"negative"|"neutral") => <div className={`summary-event ${tone}`} key={`${event.id}-${tone}`}><span>{tone==='positive'?'↑':tone==='negative'?'↓':'•'}</span><div><strong>{titleFor(event)}</strong><small>{event.event_type==='improved'?'Mejorado':event.event_type==='reviewed'?'Repasado':event.new_status==='corrected'?'Corregida':event.new_status==='explained'?'Explicada':event.event_type==='exercise_completed'?'Ejercicio realizado':event.event_type==='exercise_active'?'Ejercicio activo':event.event_type==='added'?'Añadido hoy':'Cambio observado'}</small></div></div>;
  return <div className="class-workflow-page final-summary"><header className="workflow-head"><button className="icon-btn" onClick={back} aria-label="Volver">‹</button><div><p className="eyebrow">Cierre pedagógico</p><h1>Resumen de la clase</h1><p>{namesFor(personIds,students)} · {dateLabel(item.scheduled_start_at)}</p></div></header><div className="workflow-stepbar"><span>Datos</span><span>Preparar</span><span>Dar clase</span><span className="active">Resumen</span></div>
    <section className="summary-glance"><article className="card pad positive-card"><div className="card-head"><h2>Progreso</h2><strong>{positives.length}</strong></div>{positives.length ? positives.slice(0,8).map((event) => renderEvent(event,'positive')) : <p>Sin cambios positivos marcados.</p>}</article><article className="card pad negative-card"><div className="card-head"><h2>A revisar</h2><strong>{negatives.length}</strong></div>{negatives.length ? negatives.slice(0,8).map((event) => renderEvent(event,'negative')) : <p>Sin retrocesos marcados.</p>}</article></section>
    <ClassSummaryContentEditor classId={item.id} styleTermId={item.style_term_id} participants={item.class_participants} students={students} notify={notify} onChanged={loadSummaryEvents} />
    <section className="card pad workflow-card"><div className="card-head"><h2>Trabajado hoy</h2><span>{newItems.length + exercises.length}</span></div><div className="summary-neutral">{newItems.map((event) => renderEvent(event,'neutral'))}{exercises.map((event) => renderEvent(event,'neutral'))}{!newItems.length && !exercises.length ? <p className="modal-intro">No se añadieron contenidos nuevos.</p> : null}</div></section>
    <section className="card pad workflow-card"><div className="card-head"><h2>Mensajes</h2></div><div className="fields-2"><label className="field"><span>Para el alumno</span><textarea rows={4} value={studentMessage} onChange={(event) => setStudentMessage(event.target.value)} placeholder="Resumen, recomendaciones o recordatorio visible" /></label><label className="field"><span>Nota interna</span><textarea rows={4} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Solo profesores" /></label></div></section>
    <section className="card pad workflow-card"><div className="card-head"><div><p className="eyebrow">Documentación</p><h2>Baile final y archivos de clase</h2></div><label className="btn ghost video-add"><Plus /> Añadir<input type="file" accept="image/*,video/*" multiple disabled={busy} onChange={(event) => { addMedia(event.target.files); event.currentTarget.value=''; }} /></label></div>{media.length ? <div className="summary-media-list">{media.map((draft) => <article key={draft.id}><div><strong>{draft.file.name}</strong><span>{draft.saved?'Guardado':'Pendiente'}</span></div><label className="field"><span>Tipo</span><select value={draft.kind} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,kind:event.target.value as MediaDraft['kind']} : row))}><option value="final_dance">Baile final</option><option value="class_document">Documento de clase</option></select></label>{item.class_type==='pair' ? <label className="field"><span>Disponible para</span><select value={draft.audience} disabled={draft.saved} onChange={(event) => setMedia((current) => current.map((row) => row.id===draft.id ? {...row,audience:event.target.value} : row))}><option value="both">Ambos</option>{personIds.map((personId) => <option key={personId} value={personId}>{students.find((person) => person.id===personId)?.display_name || 'Alumno'}</option>)}</select></label> : null}<button className="icon-btn" type="button" aria-label="Quitar archivo" disabled={draft.saved} onClick={() => setMedia((current) => current.filter((row) => row.id!==draft.id))}><X /></button></article>)}</div> : <p className="modal-intro">Opcional. El baile final queda vinculado a esta clase para seguir la evolución.</p>}</section>
    {error ? <p className="error">{error}</p> : null}<div className="workflow-footer"><button className="btn ghost" onClick={back}>Volver</button><button className="btn" onClick={() => void closeSummary()} disabled={busy}><CheckCircle2 /> {busy?'Cerrando…':'Cerrar y enviar al alumno'}</button></div>
  </div>;
}

function LiveSession({ item, classes, students, credits, terms, library, relations, refresh, notify, exit }: { item: ClassItem; classes: ClassItem[]; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {
  const firstParticipant=item.class_participants[0], firstPerson=firstParticipant?.person_id || 0;
  const [activePersonId,setActivePersonId]=useState(firstPerson), [notes,setNotes]=useState<ClassNote[]>([]), [assignments,setAssignments]=useState<ContentAssignment[]>([]), [events,setEvents]=useState<ClassContentEvent[]>([]);
  const [prepProfiles,setPrepProfiles]=useState<StudentPrepProfile[]>([]), [prepRequests,setPrepRequests]=useState<ClassPreparationRequest[]>([]);
  const [search,setSearch]=useState(""), [searchKind,setSearchKind]=useState<"all"|"correction"|"explanation"|"exercise"|"sequence">("all"), [searchResults,setSearchResults]=useState<LiveClassSearchResult[]>([]), [searchLoading,setSearchLoading]=useState(false), [searchError,setSearchError]=useState(""), [showCorrected,setShowCorrected]=useState(false), [showLearningHistory,setShowLearningHistory]=useState(false), [liveTab,setLiveTab]=useState<"work"|"context"|"notes"|"evaluation">("work");
  const [internalText,setInternalText]=useState(""), [studentText,setStudentText]=useState(""), [quickType,setQuickType]=useState<"correction"|"explanation"|"exercise"|"sequence">("explanation"), [quickTitle,setQuickTitle]=useState("");
  const [measurementMode,setMeasurementMode]=useState<"frequency"|"importance"|"both"|"none">("both"), [frequency,setFrequency]=useState(50), [importance,setImportance]=useState(50), [busy,setBusy]=useState(""), [syncError,setSyncError]=useState(""), [finishOpen,setFinishOpen]=useState(false);
  const personKey=item.class_participants.map((p) => p.person_id).sort((a,b)=>a-b).join(',');
  const loadLive=useCallback(async () => { if (!db || !personKey) return; const ids=personKey.split(',').map(Number); const [noteResult,assignmentResult,eventResult]=await Promise.all([db.from('class_notes').select('id,class_id,person_id,body,visibility_scope,created_at').eq('class_id',item.id).order('created_at',{ascending:false}),db.from('student_content_assignments').select('id,person_id,content_id,assignment_status,current_frequency,current_importance,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,updated_at,teaching_contents!inner(id,title,content_type,measurement_mode,description,correction_guidance)').in('person_id',ids).order('updated_at',{ascending:false}),db.from('class_content_events').select('id,class_id,person_id,content_id,event_type,previous_status,new_status,payload,created_at,teaching_contents(title,content_type)').eq('class_id',item.id).order('created_at',{ascending:false})]); const error=noteResult.error || assignmentResult.error || eventResult.error; if (error) { setSyncError(error.message); return; } setSyncError(''); setNotes((noteResult.data ?? []) as ClassNote[]); setAssignments((assignmentResult.data ?? []) as unknown as ContentAssignment[]); setEvents((eventResult.data ?? []) as unknown as ClassContentEvent[]); },[item.id,personKey]);
  useEffect(() => { const initial=window.setTimeout(() => void loadLive(),0), fallback=window.setInterval(() => void loadLive(),60000); if (!db) return () => { clearTimeout(initial); clearInterval(fallback); }; const channel=db.channel(`class-live-${item.id}`).on('postgres_changes',{event:'*',schema:'public',table:'class_notes',filter:`class_id=eq.${item.id}`},() => void loadLive()).on('postgres_changes',{event:'*',schema:'public',table:'class_content_events',filter:`class_id=eq.${item.id}`},() => void loadLive()).on('postgres_changes',{event:'*',schema:'public',table:'student_content_assignments'},(payload) => { const row=(payload.new || payload.old) as {person_id?:number}; if (row.person_id && personKey.split(',').includes(String(row.person_id))) void loadLive(); }).subscribe(); return () => { clearTimeout(initial); clearInterval(fallback); void db?.removeChannel(channel); }; },[item.id,loadLive,personKey]);
  useEffect(() => { if (!db || !personKey) return; let alive=true; const ids=personKey.split(',').map(Number); void Promise.all([db.from("student_profiles").select("person_id,goals,teacher_notes,health_notes").in("person_id",ids),db.from("class_preparation_requests").select("id,class_id,person_id,request_type,body,external_file_id,content_id,created_at").eq("class_id",item.id).order("created_at")]).then(([profileResult,requestResult]) => { if (!alive) return; if (!profileResult.error) setPrepProfiles((profileResult.data ?? []) as StudentPrepProfile[]); if (!requestResult.error) setPrepRequests((requestResult.data ?? []) as ClassPreparationRequest[]); }); return () => { alive=false; }; },[item.id,personKey]);
  const participant=item.class_participants.find((p) => p.person_id===activePersonId) ?? item.class_participants[0], student=students.find((person) => person.id===activePersonId), style=terms.find((term) => term.id===item.style_term_id), roleTerm=terms.find((term) => term.id===participant?.role_term_id), levelTerm=terms.find((term) => term.id===participant?.level_term_id);
  const personAssignments=assignments.filter((assignment,index,rows) => assignment.person_id===activePersonId && rows.findIndex((candidate) => candidate.person_id===assignment.person_id && candidate.content_id===assignment.content_id)===index), assignedContentIds=new Set(personAssignments.map((assignment) => assignment.content_id)), contextReady=Boolean(participant?.role_term_id && participant?.level_term_id && item.style_term_id);
  const corrections=personAssignments.filter((assignment) => assignment.teaching_contents.content_type==='correction'), visibleCorrections=showCorrected ? corrections : corrections.filter((assignment) => assignment.assignment_status==='pending');
  const learning=personAssignments.filter((assignment) => ['explanation','sequence'].includes(assignment.teaching_contents.content_type));
  const learningPending=learning.filter((assignment) => assignment.assignment_status==='pending'), learningDone=learning.filter((assignment) => assignment.assignment_status==='explained').sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()), visibleLearning=showLearningHistory ? [...learningPending,...learningDone] : [...learningPending,...learningDone.slice(0,3)];
  const personEvents=events.filter((event) => event.person_id===activePersonId), exerciseEvents=personEvents.filter((event,index,rows) => event.event_type.startsWith('exercise_') && rows.findIndex((candidate) => candidate.content_id===event.content_id && candidate.event_type.startsWith('exercise_'))===index);
  const prepProfile=prepProfiles.find((row) => row.person_id===activePersonId) ?? null, prepRequestsForPerson=prepRequests.filter((row) => row.person_id===activePersonId);
  const previousClass=[...classes].filter((candidate) => candidate.id!==item.id && candidate.status==='finished' && candidate.class_participants.some((row) => row.person_id===activePersonId)).sort((a,b) => new Date(b.scheduled_start_at).getTime()-new Date(a.scheduled_start_at).getTime())[0] ?? null;
  const recentLearningContext=learning.slice().sort((a,b)=>new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime()).slice(0,3), explainedIds=new Set(learning.filter((assignment) => assignment.assignment_status==='explained').map((assignment) => assignment.content_id));
  const compatibleNext=library.filter((content) => content.active && content.completion_status==='complete' && content.publication_status==='published' && ['explanation','sequence'].includes(content.content_type) && !assignedContentIds.has(content.id) && contentFitsContext(content,item.style_term_id,participant?.role_term_id ?? null,participant?.level_term_id ?? null));
  const connectedNext=compatibleNext.filter((content) => { const prerequisites=relations.filter((relation) => relation.source_content_id===content.id && relation.relation_type==='prerequisite'); return prerequisites.length>0 && prerequisites.every((relation) => explainedIds.has(relation.target_content_id)); });
  const freeNext=compatibleNext.filter((content) => !relations.some((relation) => relation.source_content_id===content.id && relation.relation_type==='prerequisite'));
  const suggestedNext=[...connectedNext,...freeNext.filter((content) => !connectedNext.some((candidate) => candidate.id===content.id))].slice(0,3), connectedSuggestionIds=new Set(connectedNext.map((content) => content.id));
  const shouldShowSearch=Boolean(search.trim()) || searchKind!=='all', searchPersonId=participant?.person_id ?? null;
  useEffect(() => {
    let alive=true;
    const timer=window.setTimeout(async () => {
      if (!alive) return;
      if (!shouldShowSearch || !contextReady || !searchPersonId) { setSearchResults([]); setSearchLoading(false); setSearchError(''); return; }
      setSearchResults([]); setSearchLoading(true); setSearchError('');
      if (!db) { setSearchLoading(false); setSearchError('Sin conexión con los datos.'); return; }
      const result=await db.rpc('search_class_teaching_content',{p_class_id:item.id,p_person_id:searchPersonId,p_query:search.trim(),p_content_type:searchKind==='all'?null:searchKind,p_limit:30});
      if (!alive) return;
      if (result.error) { setSearchResults([]); setSearchError(result.error.message); }
      else setSearchResults((result.data ?? []) as LiveClassSearchResult[]);
      setSearchLoading(false);
    },shouldShowSearch ? 140 : 0);
    return () => { alive=false; window.clearTimeout(timer); };
  },[contextReady,item.id,search,searchKind,searchPersonId,shouldShowSearch]);
  async function saveNote(scope:'internal'|'student') { if (!db || !participant) return; const text=scope==='internal'?internalText:studentText; if (!text.trim()) return; setBusy(`note-${scope}`); const result=await db.rpc('add_class_note_v2',{p_class_id:item.id,p_person_id:participant.person_id,p_body:text.trim(),p_visibility_scope:scope}); if (result.error) notify(result.error.message); else { if (scope==='internal') setInternalText(''); else setStudentText(''); await loadLive(); } setBusy(''); }
  async function createQuickContent() {
    if (!db || !participant || !quickTitle.trim() || !contextReady) return;
    setBusy('quick-create');
    const result=quickType==='correction'
      ? await db.rpc('create_class_correction',{p_class_id:item.id,p_person_id:participant.person_id,p_title:quickTitle.trim(),p_measurement_mode:measurementMode,p_frequency:measurementMode==='frequency'||measurementMode==='both'?frequency:null,p_importance:measurementMode==='importance'||measurementMode==='both'?importance:null})
      : await db.rpc('create_quick_class_content',{p_class_id:item.id,p_person_id:participant.person_id,p_content_type:quickType,p_title:quickTitle.trim()});
    if (result.error) notify(result.error.message);
    else { const createdType=quickType; setQuickTitle(''); await Promise.all([refresh(),loadLive()]); notify(createdType==='correction'?'Corrección pendiente añadida.':`${teachingKindLabels[createdType]} apuntada para completar después.`); }
    setBusy('');
  }
  async function updateCorrection(assignment:ContentAssignment,changes:{status?:string;frequency?:number;importance?:number}) { if (!db) return; const mode=assignment.snapshot_measurement_mode; setBusy(`correction-${assignment.id}`); const result=await db.rpc('update_correction_assignment',{p_assignment_id:assignment.id,p_class_id:item.id,p_assignment_status:changes.status ?? assignment.assignment_status,p_frequency:mode==='frequency'||mode==='both'?(changes.frequency ?? assignment.current_frequency ?? 0):null,p_importance:mode==='importance'||mode==='both'?(changes.importance ?? assignment.current_importance ?? 0):null}); if (result.error) notify(result.error.message); else await loadLive(); setBusy(''); }
  async function recordEvent(contentId:number,eventType:string) { if (!db || !participant) return; setBusy(`event-${contentId}-${eventType}`); const result=await db.rpc('record_class_content_event',{p_class_id:item.id,p_person_id:participant.person_id,p_content_id:contentId,p_event_type:eventType,p_payload:{}}); if (result.error) notify(result.error.message); else await loadLive(); setBusy(''); }
  async function assignContent(content:TeachingContent) { if (!db || !participant || !contextReady || !item.style_term_id || !participant.role_term_id || !participant.level_term_id) return; if (content.content_type==='exercise') { if (content.requires_partner && item.class_participants.length<2) { notify('Este ejercicio necesita pareja.'); return; } await recordEvent(content.id,'exercise_active'); return; } setBusy(`assign-${content.id}`); const result=await db.rpc('assign_teaching_content',{p_person_id:participant.person_id,p_content_id:content.id,p_style_term_id:item.style_term_id,p_role_term_id:participant.role_term_id,p_level_term_id:participant.level_term_id,p_source_class_id:item.id}); if (result.error) notify(result.error.message); else { await loadLive(); notify(`${teachingKindLabels[content.content_type]} añadida.`); } setBusy(''); }
  async function updateLearning(assignment:ContentAssignment,status:string) { if (!db) return; setBusy(`guide-${assignment.id}`); const result=await db.rpc('update_class_teaching_assignment_status',{p_assignment_id:assignment.id,p_class_id:item.id,p_assignment_status:status}); if (result.error) notify(result.error.message); else await loadLive(); setBusy(''); }
  const names=namesFor(item.class_participants.map((p) => p.person_id),students);
  return <div className="live-overlay"><div className="live-sticky"><header className="live-top"><div className="live-title"><span className="live-dot"/><div><span>DANDO CLASE</span><strong>{names}</strong><small>{style?.label || 'Sin estilo'} · {minutesLabel(item.duration_minutes)}</small></div></div><div className="live-actions"><button className="btn" onClick={() => setFinishOpen(true)}><CheckCircle2/> Terminar</button><button className="icon-btn live-exit" onClick={exit} aria-label="Volver al centro de clases"><X/></button></div></header><div className="live-search-area"><label className="live-search"><Search/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar correcciones, explicaciones, ejercicios o secuencias…"/></label><nav className="live-search-kinds">{([['all','Todo'],['correction','Correcciones'],['explanation','Explicaciones'],['exercise','Ejercicios'],['sequence','Secuencias']] as const).map(([value,label]) => <button key={value} className={searchKind===value?'active':''} onClick={() => setSearchKind(value)}>{label}</button>)}</nav></div></div>
    <main className="live-body">{item.class_participants.length>1 ? <div className="participant-tabs">{item.class_participants.map((p) => <button key={p.person_id} className={activePersonId===p.person_id?'active':''} onClick={() => setActivePersonId(p.person_id)}>{students.find((person) => person.id===p.person_id)?.display_name || 'Alumno'}</button>)}</div> : null}<section className="student-context card"><div className="student-context-main"><span className="avatar live-student-avatar"><UserRound/></span><div><p className="eyebrow">Alumno</p><h2>{student?.display_name || 'Alumno'}</h2><p>{roleTerm?.label || 'Rol pendiente'} · {levelTerm?.label || 'Nivel pendiente'}</p></div></div></section>{syncError ? <p className="error">{syncError}</p> : null}
      <section className="live-unified-search card"><details className="quick-content-create"><summary><Plus/> Crear nuevo</summary><div><select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Título corto"/>{quickType==='correction' ? <div className="correction-new-grid quick-correction-fields"><label className="field"><span>Medir por</span><select value={measurementMode} onChange={(event) => setMeasurementMode(event.target.value as typeof measurementMode)}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label>{measurementMode==='frequency'||measurementMode==='both' ? <label className="field"><span>Frecuencia</span><select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{measurementMode==='importance'||measurementMode==='both' ? <label className="field"><span>Importancia</span><select value={importance} onChange={(event) => setImportance(Number(event.target.value))}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div> : null}<button className="btn" onClick={() => void createQuickContent()} disabled={!quickTitle.trim() || busy==='quick-create'}>{busy==='quick-create'?'Guardando…':'Guardar pendiente'}</button></div><small>CYA hereda alumno, estilo, rol y nivel de esta clase. Lo nuevo queda pendiente y oculto al alumno hasta que corresponda.</small></details>{shouldShowSearch ? <div className="unified-results"><div className="unified-result-head"><strong>Resultados</strong><span>{searchLoading?'…':searchResults.length}</span></div>{searchError ? <p className="error live-search-error">{searchError}</p> : null}{searchLoading ? <div className="compact-empty"><span className="spinner"/><span>Buscando en el contexto de {student?.display_name || 'este alumno'}…</span></div> : searchResults.map((result) => { const type=result.content_type, content=library.find((row) => row.id===result.content_id), assignment=personAssignments.find((row) => row.content_id===result.content_id), exerciseEvent=exerciseEvents.find((row) => row.content_id===result.content_id), partnerBlocked=type==='exercise'&&Boolean(content?.requires_partner)&&item.class_participants.length<2; const statusLabel=partnerBlocked?'Necesita pareja':type==='exercise' ? (exerciseEvent?.event_type==='exercise_completed'?'Realizado':exerciseEvent?.event_type==='exercise_active'?'Activo':exerciseEvent?.event_type==='exercise_pending'?'Pendiente':'Disponible') : assignment ? (assignmentOptions(type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status) : result.ready?'Compatible con esta clase':'Incompleta · solo profesores'; return <article className={`unified-result ${assignment||exerciseEvent?'assigned':''}`} data-kind={type} key={`search-${result.content_id}`}><span className="content-kind">{teachingKindLabels[type]}</span><div><strong>{result.title}</strong><small>{statusLabel}</small></div><div className="unified-result-actions">{type==='correction' && assignment ? assignment.assignment_status==='corrected' ? <button className="btn ghost" onClick={() => void updateCorrection(assignment,{status:'pending'})}>Ha reaparecido</button> : <><button className="btn ghost" onClick={() => void recordEvent(result.content_id,'improved')}>Mejorado</button><button className="btn" onClick={() => void updateCorrection(assignment,{status:'corrected'})}>Corregir</button></> : ['explanation','sequence'].includes(type) && assignment ? assignment.assignment_status==='explained' ? <button className="btn ghost" onClick={() => void recordEvent(result.content_id,'reviewed')}>Repasar</button> : <button className="btn" onClick={() => void updateLearning(assignment,'explained')}>Explicada</button> : type==='exercise' ? exerciseEvent?.event_type==='exercise_completed' ? <CheckCircle2/> : exerciseEvent?.event_type==='exercise_active' ? <button className="btn" onClick={() => void recordEvent(result.content_id,'exercise_completed')}>Realizado</button> : <button className="btn" onClick={() => void recordEvent(result.content_id,'exercise_active')}>{exerciseEvent?'Activar':'Usar'}</button> : !assignment && result.ready && content ? <button className="btn" disabled={busy===`assign-${result.content_id}`} onClick={() => void assignContent(content)}><Plus/> Añadir</button> : !assignment ? <span className="badge">Completar después</span> : <CheckCircle2/>}</div></article>; })}{!searchLoading && !searchError && !searchResults.length ? <div className="compact-empty"><Search/><span>No hay coincidencias para este alumno, estilo, rol y nivel.</span></div> : null}</div> : null}</section>
      <nav className="live-work-tabs"><button className={liveTab==='work'?'active':''} onClick={() => setLiveTab('work')}><BookOpen/> Trabajo</button><button className={liveTab==='context'?'active':''} onClick={() => setLiveTab('context')}><Sparkles/> Contexto</button><button className={liveTab==='notes'?'active':''} onClick={() => setLiveTab('notes')}><NotebookPen/> Observaciones</button><button className={liveTab==='evaluation'?'active':''} onClick={() => setLiveTab('evaluation')}><ClipboardCheck/> Evaluación</button></nav>
      {liveTab==='work' ? <section className="live-workspace"><article className="card live-card corrections-card"><div className="live-card-head"><div><p className="eyebrow">Prioridad</p><h2>Correcciones</h2></div><button className="text-button" onClick={() => setShowCorrected(!showCorrected)}>{showCorrected?'Solo pendientes':'Ver corregidas'}</button></div><div className="correction-list">{visibleCorrections.length ? visibleCorrections.map((assignment) => { const content=library.find((row) => row.id===assignment.content_id); return <TeachingContentCard key={assignment.id} kindTone="correction" className={`live-content-card ${Math.max(assignment.current_frequency ?? 0,assignment.current_importance ?? 0)>=75?'live-priority-high':Math.max(assignment.current_frequency ?? 0,assignment.current_importance ?? 0)>=50?'live-priority-medium':'live-priority-low'}`} kindLabel="Corrección" title={assignment.teaching_contents.title} subtitle={`${assignment.current_frequency!==null?`Frec. ${assignment.current_frequency}`:''}${assignment.current_importance!==null?` · Importancia ${assignment.current_importance}`:''}`} statusLabel={correctionStateLabel(assignment.assignment_status)} statusTone={assignment.assignment_status==='corrected'?'success':'warning'} description={assignment.teaching_contents.description} correctionGuidance={assignment.teaching_contents.correction_guidance} media={content?.teaching_content_media ?? []} actions={assignment.assignment_status==='pending' ? <button className="btn ghost live-mini-action" onClick={() => void recordEvent(assignment.content_id,'improved')}>↑ Mejorado</button> : null} quickControls={<div className="live-card-quick correction-quick"><select className="quick-status" aria-label={`Estado de ${assignment.teaching_contents.title}`} value={assignment.assignment_status} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{status:event.target.value})}>{correctionStates.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{assignment.snapshot_measurement_mode==='frequency'||assignment.snapshot_measurement_mode==='both' ? <label><span>Frec.</span><select aria-label={`Frecuencia de ${assignment.teaching_contents.title}`} value={assignment.current_frequency ?? 0} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{frequency:Number(event.target.value)})}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}{assignment.snapshot_measurement_mode==='importance'||assignment.snapshot_measurement_mode==='both' ? <label><span>Imp.</span><select aria-label={`Importancia de ${assignment.teaching_contents.title}`} value={assignment.current_importance ?? 0} disabled={busy===`correction-${assignment.id}`} onChange={(event) => void updateCorrection(assignment,{importance:Number(event.target.value)})}>{[0,25,50,75,100].map((value) => <option key={value}>{value}</option>)}</select></label> : null}</div>}></TeachingContentCard>; }) : <div className="compact-empty"><CheckCircle2/><span>{showCorrected?'No hay correcciones en el histórico.':'No hay correcciones pendientes.'}</span></div>}</div></article>
        <article className="card live-card learning-card"><div className="live-card-head"><div><p className="eyebrow">Explicaciones y secuencias</p><h2>Contenido</h2></div><button className="text-button" onClick={() => setShowLearningHistory(!showLearningHistory)}>{showLearningHistory?'Ver recientes':'Ver más'}</button></div><div className="guide-active">{visibleLearning.length ? visibleLearning.map((assignment) => { const content=library.find((row) => row.id===assignment.content_id); return <TeachingContentCard key={assignment.id} kindTone={assignment.teaching_contents.content_type as "explanation"|"sequence"} className="live-content-card" kindLabel={teachingKindLabels[assignment.teaching_contents.content_type]} title={assignment.teaching_contents.title} statusLabel={assignmentOptions(assignment.teaching_contents.content_type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status} statusTone={assignment.assignment_status==='explained'?'success':'warning'} description={assignment.teaching_contents.description} media={content?.teaching_content_media ?? []} quickControls={<div className="live-card-quick learning-quick"><select aria-label={`Estado de ${assignment.teaching_contents.title}`} value={assignment.assignment_status} disabled={busy===`guide-${assignment.id}`} onChange={(event) => void updateLearning(assignment,event.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{assignment.assignment_status==='explained' ? <button className="btn ghost live-mini-action" onClick={() => void recordEvent(assignment.content_id,'reviewed')}>Repasar</button> : null}</div>}/>; }) : <div className="compact-empty"><LibraryBig/><span>No hay explicaciones o secuencias asignadas.</span></div>}</div></article>
        <article className="card live-card exercise-card"><div className="live-card-head"><div><p className="eyebrow">Solo esta clase</p><h2>Ejercicios</h2></div><span className="badge">{exerciseEvents.length}</span></div>{exerciseEvents.length ? <div className="exercise-live-list">{exerciseEvents.map((event) => { const content=library.find((row) => row.id===event.content_id), title=event.teaching_contents?.title || content?.title || 'Ejercicio'; return <div key={event.id}><div><strong>{title}</strong><span>{event.event_type==='exercise_completed'?'Realizado':event.event_type==='exercise_active'?'Activo':'Pendiente'}</span></div><div>{event.event_type!=='exercise_active' ? <button className="btn ghost" onClick={() => void recordEvent(event.content_id,'exercise_active')}>Activo</button> : null}{event.event_type!=='exercise_completed' ? <button className="btn" onClick={() => void recordEvent(event.content_id,'exercise_completed')}>Realizado</button> : null}</div></div>; })}</div> : <div className="compact-empty"><Dumbbell/><span>Busca un ejercicio cuando quieras usarlo en esta clase.</span></div>}</article></section> : null}
      {liveTab==='notes' ? <section className="live-notes-grid"><article className="card live-card notes-card"><div className="live-card-head"><div><p className="eyebrow">Solo profesores</p><h2>Nota interna</h2></div><NotebookPen/></div><div className="quick-note"><textarea value={internalText} onChange={(event) => setInternalText(event.target.value)} placeholder="Algo que debemos recordar…" rows={4}/><button className="btn" onClick={() => void saveNote('internal')} disabled={!internalText.trim() || busy==='note-internal'}>Guardar</button></div></article><article className="card live-card notes-card"><div className="live-card-head"><div><p className="eyebrow">Para el alumno</p><h2>Observación</h2></div><BookOpen/></div><div className="quick-note"><textarea value={studentText} onChange={(event) => setStudentText(event.target.value)} placeholder="Mensaje o recomendación para el resumen…" rows={4}/><button className="btn" onClick={() => void saveNote('student')} disabled={!studentText.trim() || busy==='note-student'}>Guardar</button></div></article><article className="card live-card note-history"><div className="live-card-head"><h2>Notas de esta clase</h2><span>{notes.filter((note) => note.person_id===activePersonId || note.person_id===null).length}</span></div><div className="note-list">{notes.filter((note) => note.person_id===activePersonId || note.person_id===null).slice(0,8).map((note) => <div key={note.id}><span>{note.visibility_scope==='student'?'Alumno':'Interna'}</span><p>{note.body}</p></div>)}</div></article></section> : null}
      {liveTab==='evaluation' && db && participant ? <section className="live-evaluation-workspace"><article className="card live-card"><ContextEvaluationPanel client={db} personId={activePersonId} personName={student?.display_name || 'Alumno'} classId={item.id} styleTermId={item.style_term_id} roleTermId={participant.role_term_id} levelTermId={participant.level_term_id} onCompleted={loadLive} /></article></section> : null}
      {liveTab==='context' ? <section className="live-context-grid"><article className="card live-card live-context-card"><div className="live-card-head"><div><p className="eyebrow">Contexto pedagógico</p><h2>{student?.display_name || 'Alumno'}</h2></div><Sparkles/></div>{previousClass ? <div className="context-strip"><span>Última clase</span><strong>{dateLabel(previousClass.scheduled_start_at)} · {minutesLabel(previousClass.duration_minutes)}</strong></div> : null}{prepProfile?.health_notes ? <div className="prepare-alert"><AlertTriangle/><div><strong>A tener en cuenta</strong><span>{prepProfile.health_notes}</span></div></div> : null}{prepProfile?.teacher_notes ? <div className="prepare-info"><strong>Notas del profesor</strong><p>{prepProfile.teacher_notes}</p></div> : null}{prepProfile?.goals ? <div className="prepare-info"><strong>Objetivo</strong><p>{prepProfile.goals}</p></div> : null}<div className="context-mini-grid"><div><strong>{corrections.filter((assignment) => assignment.assignment_status==='pending').length}</strong><span>correcciones pendientes</span></div><div><strong>{recentLearningContext.length}</strong><span>contenidos recientes</span></div></div>{corrections.filter((assignment) => assignment.assignment_status==='pending').length ? <div className="prepare-list"><strong>Mirar hoy</strong>{corrections.filter((assignment) => assignment.assignment_status==='pending').slice(0,4).map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title}</span>)}</div> : null}{recentLearningContext.length ? <div className="prepare-list"><strong>Últimas explicaciones y secuencias</strong>{recentLearningContext.map((assignment) => <span key={assignment.id}>{assignment.teaching_contents.title} · {assignmentOptions(assignment.teaching_contents.content_type).find(([value]) => value===assignment.assignment_status)?.[1] || assignment.assignment_status}</span>)}</div> : null}</article><article className="card live-card live-context-card"><div className="live-card-head"><div><p className="eyebrow">Para esta clase</p><h2>Decisiones del alumno</h2></div><span className="badge">{prepRequestsForPerson.length}</span></div>{prepRequestsForPerson.length ? <div className="request-list live-request-list">{prepRequestsForPerson.map((request) => { const requested=request.content_id ? library.find((content) => content.id===request.content_id) : null, canAdd=Boolean(requested && requested.active && requested.completion_status==='complete' && requested.publication_status==='published' && contentFitsContext(requested,item.style_term_id,participant?.role_term_id ?? null,participant?.level_term_id ?? null)); return <article key={request.id}><span>{request.request_type==='video'?'Vídeo':request.request_type==='focus'?'Quiere trabajar':request.request_type==='content'?'Contenido':'Mensaje'}</span><strong>{request.body || requested?.title || (request.external_file_id?'Vídeo adjunto':'Petición guardada')}</strong>{request.external_file_id ? <SecureDriveAsset fileId={request.external_file_id} mediaType="video" title="Vídeo para preparar la clase" controls className="request-video" /> : null}{requested && canAdd && !assignedContentIds.has(requested.id) ? <button className="btn ghost context-add" onClick={() => void assignContent(requested)}><Plus/> Añadir a esta clase</button> : null}</article>; })}</div> : <div className="compact-empty"><Sparkles/><span>No dejó indicaciones específicas para esta clase.</span></div>}</article><article className="card live-card live-context-card context-suggestions"><div className="live-card-head"><div><p className="eyebrow">Guía de hoy</p><h2>Siguiente contenido</h2></div><span className="badge">{suggestedNext.length}</span></div>{suggestedNext.length ? <div className="context-suggestion-list">{suggestedNext.map((content) => <article data-kind={content.content_type} key={content.id}><div><span>{connectedSuggestionIds.has(content.id)?'Siguiente por mapa':'Compatible'}</span><strong>{content.title}</strong><small>{teachingKindLabels[content.content_type]}</small></div><button className="btn" disabled={busy===`assign-${content.id}`} onClick={() => void assignContent(content)}><Plus/> Añadir</button></article>)}</div> : <div className="compact-empty"><GitBranch/><span>No hay otro contenido compatible desbloqueado.</span></div>}</article></section> : null}
    </main>{finishOpen ? <FinishClassModal item={item} students={students} credits={credits} library={library} close={() => setFinishOpen(false)} finished={async () => { await refresh(); await loadLive(); notify('Parte administrativa terminada.'); }} /> : null}</div>;
}

function LiveClassView({ classes, students, credits, terms, library, relations, assignments, selectedClassId, selectClass, refresh, notify, exit }: { classes: ClassItem[]; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; assignments: ContentAssignment[]; selectedClassId: number | null; selectClass: (id: number | null) => void; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {
  const [manualOpen,setManualOpen]=useState(false), [forceData,setForceData]=useState(false), [summaryId,setSummaryId]=useState<number|null>(null);
  const selected=selectedClassId ? classes.find((item) => item.id===selectedClassId) ?? null : null;
  useEffect(() => { if (selectedClassId) return; const timer=window.setTimeout(() => { setForceData(false); setSummaryId(null); },0); return () => window.clearTimeout(timer); },[selectedClassId]);
  if (selected) {
    if (selected.status==='cancelled' || selected.pedagogy_closed_at) return <div className="class-workflow-page"><div className="empty"><CheckCircle2/><strong>Esta clase ya está cerrada</strong><button className="btn" onClick={() => selectClass(null)}>Volver al centro</button></div></div>;
    if (selected.status==='finished' && !selected.pedagogy_closed_at) return summaryId===selected.id ? <ClassFinalSummary item={selected} students={students} library={library} refresh={refresh} notify={notify} done={() => { setSummaryId(null); selectClass(null); }} back={() => setSummaryId(null)} /> : <ClassPostAdministrative item={selected} students={students} no={() => selectClass(null)} yes={() => setSummaryId(selected.id)} />;
    if (selected.status==='active') return <LiveSession key={selected.id} item={selected} classes={classes} students={students} credits={credits} terms={terms} library={library} relations={relations} refresh={refresh} notify={notify} exit={() => selectClass(null)} />;
    if (forceData || selected.workflow_stage==='data') return <ClassSetupStage item={selected} students={students} credits={credits} terms={terms} refresh={refresh} notify={notify} back={() => selectClass(null)} next={() => setForceData(false)} />;
    return <ClassPreparationStage item={selected} classes={classes} students={students} assignments={assignments} terms={terms} refresh={refresh} notify={notify} back={() => selectClass(null)} editData={() => setForceData(true)} />;
  }
  const active=classes.filter((item) => item.status==='active' && !item.pedagogy_closed_at).sort((a,b)=>new Date(b.scheduled_start_at).getTime()-new Date(a.scheduled_start_at).getTime()), pending=classes.filter((item) => item.status==='finished' && !item.pedagogy_closed_at).sort((a,b)=>new Date(b.scheduled_start_at).getTime()-new Date(a.scheduled_start_at).getTime()), scheduled=classes.filter((item) => item.status==='scheduled').sort((a,b)=>new Date(a.scheduled_start_at).getTime()-new Date(b.scheduled_start_at).getTime());
  const row=(item:ClassItem,label:string,tone:string) => <button className="class-center-row" key={item.id} onClick={() => selectClass(item.id)}><span className={`class-center-status ${tone}`}/><div><strong>{namesFor(item.class_participants.map((p) => p.person_id),students)}</strong><small>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</small></div><span className="badge">{label}</span><ChevronRight/></button>;
  return <><Header eyebrow="Dar clase" title="Centro de clases" description="Entra en cualquier clase abierta, deja otra pendiente o empieza una nueva sin bloquear tu trabajo." action={<button className="btn" onClick={() => setManualOpen(true)}><Plus/> Empezar otra clase</button>} />
    <section className="class-center-grid"><article className="card class-center-section"><header><div><p className="eyebrow">En curso</p><h2>Clases abiertas</h2></div><strong>{active.length}</strong></header>{active.length ? active.map((item) => row(item,'Abierta','active')) : <div className="class-center-empty">No hay clases abiertas.</div>}</article><article className="card class-center-section"><header><div><p className="eyebrow">Por terminar</p><h2>Cierre pendiente</h2></div><strong>{pending.length}</strong></header>{pending.length ? pending.map((item) => row(item,'Cerrar','pending')) : <div className="class-center-empty">Todo cerrado.</div>}</article></section>
    <section className="card class-center-section scheduled-section"><header><div><p className="eyebrow">Agenda</p><h2>Programadas</h2></div><strong>{scheduled.length}</strong></header>{scheduled.length ? scheduled.map((item) => row(item,item.workflow_stage==='prepare'?'Preparada':'Preparar','scheduled')) : <div className="class-center-empty">No hay clases programadas.</div>}</section>
    <button className="text-button class-center-exit" onClick={exit}>Salir de Dar clase</button>{manualOpen ? <ManualClassDraft students={students} close={() => setManualOpen(false)} refresh={refresh} created={async (id) => { await refresh(); selectClass(id); }} /> : null}
  </>;
}

function TeachingContentEditor({ initial, defaultType, terms, close, saved, notify }: { initial: TeachingContent | null; defaultType: string; terms: CatalogTerm[]; close: () => void; saved: () => Promise<void>; notify: (message: string) => void }) {
  const [type, setType] = useState(initial?.content_type ?? defaultType), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [requiresPartner,setRequiresPartner] = useState(Boolean(initial?.requires_partner));
  const [media, setMedia] = useState<TeachingMediaDraft[]>(() => (initial?.teaching_content_media ?? []).map((item) => ({ ...item, _key: `existing-${item.id ?? item.external_file_id}` })));
  const [mediaUploading, setMediaUploading] = useState(false);
  const styles = terms.filter((term) => term.taxonomy === "dance_style"), roles = terms.filter((term) => term.taxonomy === "dance_role"), levels = terms.filter((term) => term.taxonomy === "dance_level");
  const categoryTaxonomy = type === "correction" ? "correction_category" : `${type}_category`;
  const categories = terms.filter((term) => term.taxonomy === categoryTaxonomy);
  const selectedStyles = new Set(initial?.teaching_content_styles.map((link) => link.style_term_id) ?? []), selectedRoles = new Set(initial?.teaching_content_roles.map((link) => link.role_term_id) ?? []), selectedLevels = new Set(initial?.teaching_content_levels.map((link) => link.level_term_id) ?? []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value === "publish" ? "publish" : "draft";
    const form = new FormData(event.currentTarget), categoryId = Number(form.get("category_term_id") || 0) || null;
    const styleIds = form.getAll("style_term_ids").map(Number), roleIds = form.getAll("role_term_ids").map(Number), levelIds = form.getAll("level_term_ids").map(Number);
    const tags = String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean);
    setBusy(true); setError("");
    const result = await db.rpc("save_teaching_content_with_media", {
      p_content_id: initial?.id ?? null, p_content_type: type, p_title: String(form.get("title") || "").trim(),
      p_description: String(form.get("description") || "").trim() || null, p_correction_guidance: String(form.get("correction_guidance") || "").trim() || null,
      p_completion_status: intent === "publish" ? "complete" : "incomplete", p_publication_status: intent === "publish" ? "published" : "draft",
      p_visibility: intent === "publish" ? String(form.get("visibility") || "student") : "staff", p_measurement_mode: type === "correction" ? String(form.get("measurement_mode") || "both") : "none",
      p_category_term_id: categoryId, p_style_term_ids: styleIds, p_role_term_ids: roleIds, p_level_term_ids: levelIds, p_tags: tags,
      p_media: media.map((item) => ({
        media_type: item.media_type,
        provider: "google_drive",
        external_file_id: item.external_file_id,
        title: item.title || null,
        mime_type: item.mime_type || null,
        group_label: item.group_label || null,
        is_cover: Boolean(item.is_cover),
        is_preview: Boolean(item.is_preview),
        display_in_resources: item.display_in_resources !== false,
        thumbnail_external_file_id: item.thumbnail_external_file_id || null,
        thumbnail_mime_type: item.thumbnail_mime_type || null,
        preview_start_seconds: item.preview_start_seconds ?? null,
        preview_end_seconds: item.preview_end_seconds ?? null,
      })),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    const savedContentId = Number((result.data as { id?: number } | null)?.id ?? initial?.id ?? 0);
    if (type === "exercise" && savedContentId) {
      const partnerResult = await db.rpc("set_teaching_exercise_partner_requirement", { p_content_id: savedContentId, p_requires_partner: requiresPartner });
      if (partnerResult.error) { setError(partnerResult.error.message); setBusy(false); return; }
    }
    await saved(); notify(intent === "publish" ? "Contenido publicado." : "Guardado en Incompletas."); setBusy(false); close();
  }
  async function archive() {
    if (!db || !initial || !window.confirm("¿Archivar este contenido? Su historial se conservará.")) return;
    setBusy(true); const result = await db.rpc("archive_teaching_content", { p_content_id: initial.id });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(); notify("Contenido archivado."); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal teaching-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Enseñanza</p><h2>{initial ? "Editar contenido" : "Nuevo contenido"}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <div className="fields-2">
        <label className="field"><span>Tipo</span><select value={type} disabled={Boolean(initial)} onChange={(event) => setType(event.target.value)}>{teachingKinds.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Categoría</span><select name="category_term_id" defaultValue={initial?.category_term_id ?? categories[0]?.id ?? ""}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <label className="field field-wide"><span>Título *</span><input name="title" required defaultValue={initial?.title ?? ""} autoFocus placeholder="Nombre corto y fácil de encontrar" /></label>
        <label className="field field-wide"><span>Explicación</span><textarea name="description" rows={3} defaultValue={initial?.description ?? ""} placeholder="Qué necesita entender o hacer el alumno" /></label>
        {type === "correction" ? <><label className="field field-wide"><span>Cómo se corrige</span><textarea name="correction_guidance" rows={3} defaultValue={initial?.correction_guidance ?? ""} placeholder="Indicaciones concretas para corregir el error" /></label><label className="field"><span>Medir por</span><select name="measurement_mode" defaultValue={initial?.measurement_mode ?? "both"}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label></> : null}
        {type === "exercise" ? <label className="field field-wide teaching-partner-toggle"><input type="checkbox" checked={requiresPartner} onChange={(event) => setRequiresPartner(event.target.checked)} /><span><strong>Necesita pareja</strong><small>Solo podrá activarse o completarse en una clase con al menos dos participantes.</small></span></label> : null}
        <label className="field"><span>Al publicar</span><select name="visibility" defaultValue={initial?.visibility ?? "student"}><option value="student">Visible para el alumno</option><option value="staff">Solo profesores</option></select></label>
        <label className="field field-wide"><span>Etiquetas</span><input name="tags" defaultValue={initial?.teaching_content_tags.map((item) => item.tag).join(", ") ?? ""} placeholder="ej. conexión, base, giro" /></label>
      </div>
      <div className="teaching-taxonomies">
        <fieldset><legend>Estilos</legend><div className="check-grid">{styles.map((term) => <label key={term.id}><input type="checkbox" name="style_term_ids" value={term.id} defaultChecked={selectedStyles.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
        <fieldset><legend>Roles</legend><div className="check-grid">{roles.map((term) => <label key={term.id}><input type="checkbox" name="role_term_ids" value={term.id} defaultChecked={selectedRoles.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
        <fieldset><legend>Niveles</legend><div className="check-grid">{levels.map((term) => <label key={term.id}><input type="checkbox" name="level_term_ids" value={term.id} defaultChecked={selectedLevels.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
      </div>
      <TeachingMediaEditor value={media} onChange={setMedia} onUploadingChange={setMediaUploading} allowClassVideos={["correction","explanation","sequence"].includes(type)} />
      <p className="draft-note">Puedes guardar solo el título. Hasta que lo publiques permanecerá en Incompletas y no se propondrá ni se mostrará al alumno.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions teaching-actions">{initial ? <button className="btn archive-btn" type="button" onClick={archive} disabled={busy}><Archive size={16} /> Archivar</button> : null}<span /><button className="btn ghost" type="submit" name="intent" value="draft" disabled={busy || mediaUploading}>Guardar incompleta</button><button className="btn" type="submit" name="intent" value="publish" disabled={busy || mediaUploading}>{busy ? "Guardando…" : initial?.publication_status === "published" ? "Guardar publicada" : "Publicar"}</button></div>
    </form>
  </section></div>;
}

function TeachingRelationEditor({ content, contents, relations, close, saved, notify }: { content: TeachingContent; contents: TeachingContent[]; relations: TeachingRelation[]; close: () => void; saved: () => Promise<void>; notify: (message: string) => void }) {
  const relationChoices = content.content_type === "exercise" ? ["exercise_explanation","exercise_correction","prerequisite","related"] : content.content_type === "explanation" ? ["prerequisite","counterpart","related"] : content.content_type === "sequence" ? ["prerequisite","sequence_item","related"] : ["prerequisite","related"];
  const [relationType,setRelationType] = useState(relationChoices[0]), [targetId,setTargetId] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const idsEqual = (left:number[], right:number[]) => left.length===right.length && [...left].sort((a,b)=>a-b).every((value,index)=>value===[...right].sort((a,b)=>a-b)[index]);
  const counterpartUsed = new Set(relations.filter((relation) => relation.relation_type === "counterpart").flatMap((relation) => [relation.source_content_id,relation.target_content_id]));
  const contentStyles = content.teaching_content_styles.map((item) => item.style_term_id), contentRoles = content.teaching_content_roles.map((item) => item.role_term_id), contentLevels = content.teaching_content_levels.map((item) => item.level_term_id);
  const targetOptions = contents.filter((candidate) => candidate.id !== content.id && candidate.active).filter((candidate) => {
    if (relationType === "counterpart") {
      const candidateRoles=candidate.teaching_content_roles.map((item)=>item.role_term_id);
      return candidate.content_type === "explanation" && content.content_type === "explanation" && !counterpartUsed.has(content.id) && !counterpartUsed.has(candidate.id) && contentRoles.length===1 && candidateRoles.length===1 && contentRoles[0]!==candidateRoles[0] && idsEqual(contentStyles,candidate.teaching_content_styles.map((item)=>item.style_term_id)) && idsEqual(contentLevels,candidate.teaching_content_levels.map((item)=>item.level_term_id));
    }
    if (relationType === "exercise_explanation") return candidate.content_type === "explanation";
    if (relationType === "exercise_correction") return candidate.content_type === "correction";
    if (relationType === "sequence_item") return candidate.content_type !== "sequence";
    return true;
  });
  const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);
  const sequenceItems = content.content_type === "sequence" ? relations.filter((relation) => relation.source_content_id === content.id && relation.relation_type === "sequence_item").sort((a,b)=>(a.position??999999)-(b.position??999999)||a.id-b.id) : [];
  const effectiveTargetId = targetOptions.some((target) => target.id === targetId) ? targetId : (targetOptions[0]?.id ?? 0);
  async function add() {
    if (!db || !effectiveTargetId) return; setBusy(true); setError("");
    const nextPosition = relationType === "sequence_item" ? Math.max(0,...sequenceItems.map((item) => item.position ?? 0)) + 10 : null;
    const result = await db.rpc("save_teaching_relation", { p_source_content_id: content.id, p_target_content_id: effectiveTargetId, p_relation_type: relationType, p_position: nextPosition });
    if (result.error) setError(result.error.message); else { await saved(); notify("Relación guardada."); }
    setBusy(false);
  }
  async function remove(id: number) {
    if (!db) return; setBusy(true); const result = await db.rpc("delete_teaching_relation", { p_relation_id: id });
    if (result.error) setError(result.error.message); else { await saved(); notify("Relación eliminada."); }
    setBusy(false);
  }
  async function moveSequenceItem(index:number,direction:-1|1) {
    if (!db) return; const next=index+direction; if (next<0 || next>=sequenceItems.length) return;
    const ordered=sequenceItems.map((item)=>item.target_content_id); [ordered[index],ordered[next]]=[ordered[next],ordered[index]];
    setBusy(true); setError(""); const result=await db.rpc("reorder_teaching_sequence",{p_sequence_content_id:content.id,p_item_content_ids:ordered});
    if (result.error) setError(result.error.message); else { await saved(); notify("Orden de la secuencia actualizado."); } setBusy(false);
  }
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Relaciones</p><h2>{content.title}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <div className="modal-body"><div className="relation-builder"><label className="field"><span>Relación</span><select value={relationType} onChange={(event) => setRelationType(event.target.value)}>{relationChoices.map((value) => <option key={value} value={value}>{relationLabels[value]}</option>)}</select></label><label className="field"><span>Contenido</span><select value={effectiveTargetId} onChange={(event) => setTargetId(Number(event.target.value))}>{targetOptions.length ? targetOptions.map((target) => <option key={target.id} value={target.id}>{teachingKindLabels[target.content_type]} · {target.title}</option>) : <option value="0">No hay contenido compatible</option>}</select></label><button className="btn" onClick={add} disabled={!effectiveTargetId || busy}><Link2 size={17} /> Relacionar</button></div>
      {error ? <p className="error">{error}</p> : null}{content.content_type === "sequence" && sequenceItems.length ? <div className="sequence-order"><div><strong>Orden de la secuencia</strong><span>Usa los controles para ordenar los pasos.</span></div>{sequenceItems.map((relation,index) => { const step=contents.find((item)=>item.id===relation.target_content_id); return <div className="sequence-order-row" key={`order-${relation.id}`}><span>{index+1}</span><strong>{step?.title ?? "Contenido archivado"}</strong><div><button className="icon-btn" disabled={busy||index===0} onClick={() => void moveSequenceItem(index,-1)} aria-label={`Subir ${step?.title ?? "paso"}`}>↑</button><button className="icon-btn" disabled={busy||index===sequenceItems.length-1} onClick={() => void moveSequenceItem(index,1)} aria-label={`Bajar ${step?.title ?? "paso"}`}>↓</button></div></div>; })}</div> : null}<div className="relation-list">{ownRelations.length ? ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id}><div><span>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong>{other?.title ?? "Contenido archivado"}</strong></div><button className="icon-btn" onClick={() => remove(relation.id)} disabled={busy} aria-label="Quitar relación"><X /></button></div>; }) : <div className="compact-empty"><Link2 /><span>Aún no tiene relaciones.</span></div>}</div>
    </div>
  </section></div>;
}

function TeachingAssignModal({ student, contents, assignments, terms, close, saved }: { student: Person; contents: TeachingContent[]; assignments: ContentAssignment[]; terms: CatalogTerm[]; close: () => void; saved: () => Promise<void> }) {
  const assigned = new Set(assignments.filter((assignment) => assignment.person_id === student.id).map((assignment) => assignment.content_id));
  const reusable = contents.filter((content) => content.active && content.completion_status === "complete" && content.publication_status === "published" && !assigned.has(content.id));
  const [contentId,setContentId] = useState(reusable[0]?.id ?? 0), [styleId,setStyleId] = useState(0), [roleId,setRoleId] = useState(0), [levelId,setLevelId] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const selectedContent = reusable.find((content) => content.id === contentId) ?? null;
  const effectiveStyleId = selectedContent?.teaching_content_styles.some((link) => link.style_term_id === styleId) ? styleId : (selectedContent?.teaching_content_styles[0]?.style_term_id ?? 0);
  const effectiveRoleId = selectedContent?.teaching_content_roles.some((link) => link.role_term_id === roleId) ? roleId : (selectedContent?.teaching_content_roles[0]?.role_term_id ?? 0);
  const effectiveLevelId = selectedContent?.teaching_content_levels.some((link) => link.level_term_id === levelId) ? levelId : (selectedContent?.teaching_content_levels[0]?.level_term_id ?? 0);
  async function assign() {
    if (!db || !selectedContent || !effectiveStyleId || !effectiveRoleId || !effectiveLevelId) return; setBusy(true); setError("");
    const result = await db.rpc("assign_teaching_content", { p_person_id: student.id, p_content_id: selectedContent.id, p_style_term_id: effectiveStyleId, p_role_term_id: effectiveRoleId, p_level_term_id: effectiveLevelId, p_source_class_id: null });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(); setBusy(false); close();
  }
  const labelFor = (id: number) => terms.find((term) => term.id === id)?.label ?? "—";
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true"><header className="modal-head"><div><p className="eyebrow">Enseñar</p><h2>{student.display_name}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header><div className="modal-body">
    {!reusable.length ? <div className="compact-empty"><CheckCircle2 /><span>No queda contenido publicado sin asignar.</span></div> : <div className="form"><label className="field"><span>Contenido</span><select value={contentId} onChange={(event) => setContentId(Number(event.target.value))}>{reusable.map((content) => <option key={content.id} value={content.id}>{teachingKindLabels[content.content_type]} · {content.title}</option>)}</select></label>{selectedContent ? <div className="assign-context"><label className="field"><span>Estilo</span><select value={effectiveStyleId} onChange={(event) => setStyleId(Number(event.target.value))}>{selectedContent.teaching_content_styles.map((link) => <option key={link.style_term_id} value={link.style_term_id}>{labelFor(link.style_term_id)}</option>)}</select></label><label className="field"><span>Rol</span><select value={effectiveRoleId} onChange={(event) => setRoleId(Number(event.target.value))}>{selectedContent.teaching_content_roles.map((link) => <option key={link.role_term_id} value={link.role_term_id}>{labelFor(link.role_term_id)}</option>)}</select></label><label className="field"><span>Nivel</span><select value={effectiveLevelId} onChange={(event) => setLevelId(Number(event.target.value))}>{selectedContent.teaching_content_levels.map((link) => <option key={link.level_term_id} value={link.level_term_id}>{labelFor(link.level_term_id)}</option>)}</select></label></div> : null}{error ? <p className="error">{error}</p> : null}<button className="btn" onClick={assign} disabled={busy || !effectiveStyleId || !effectiveRoleId || !effectiveLevelId}>{busy ? "Asignando…" : "Añadir a su formación"}</button></div>}
  </div></section></div>;
}

function TeachingMap({ contents, relations, terms }: { contents: TeachingContent[]; relations: TeachingRelation[]; terms: CatalogTerm[] }) {
  return <Suspense fallback={<div className="graph-empty graph-loading"><span className="spinner" /><strong>Preparando mapa…</strong></div>}><TeachingGraph contents={contents} relations={relations} terms={terms} /></Suspense>;
}

function TeachingView({ contents, relations, assignments, students, terms, refresh, notify }: { contents: TeachingContent[]; relations: TeachingRelation[]; assignments: ContentAssignment[]; students: Person[]; terms: CatalogTerm[]; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const [mode,setMode] = useState<"library"|"students"|"map">("library"), [kind,setKind] = useState("correction"), [query,setQuery] = useState("");
  const [editing,setEditing] = useState<TeachingContent|null>(null), [creating,setCreating] = useState(false), [relating,setRelating] = useState<TeachingContent|null>(null), [assigning,setAssigning] = useState<Person|null>(null), [studentQuery,setStudentQuery] = useState("");
  const filtered = contents.filter((content) => content.active && content.content_type === kind).filter((content) => !query.trim() || [content.title,content.description,content.correction_guidance,content.teaching_content_tags.map((tag) => tag.tag).join(" ")].some((value) => String(value || "").toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))));
  const incomplete = filtered.filter((content) => content.completion_status === "incomplete"), complete = filtered.filter((content) => content.completion_status === "complete");
  const categoryTaxonomy = kind === "correction" ? "correction_category" : `${kind}_category`, categories = terms.filter((term) => term.taxonomy === categoryTaxonomy);
  const studentMatches = students.filter((student) => !studentQuery.trim() || student.display_name.toLocaleLowerCase("es").includes(studentQuery.trim().toLocaleLowerCase("es")));
  async function updateAssignment(assignment: ContentAssignment, status: string) {
    if (!db) return; const result = await db.rpc("update_teaching_assignment_status", { p_assignment_id: assignment.id, p_assignment_status: status });
    if (result.error) notify(result.error.message); else { await refresh(); notify("Estado actualizado."); }
  }
  const renderContent = (content: TeachingContent) => {
    const category = terms.find((term) => term.id === content.category_term_id)?.label ?? "Sin categoría";
    const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);
    const measurementLabel = ({ frequency: "Frecuencia", importance: "Importancia", both: "Frecuencia + importancia", none: "Sin medición" } as Record<string,string>)[content.measurement_mode] ?? content.measurement_mode;
    const visibilityLabel = content.visibility === "student" ? "Visible para el alumno" : "Solo profesores";
    const publicationLabel = content.publication_status === "published" ? "Publicada" : content.publication_status === "archived" ? "Archivada" : "Borrador";
    const statusLabel = content.publication_status === "published" ? "Publicada" : content.completion_status === "incomplete" ? "Incompleta" : "Borrador";
    return <TeachingContentCard
      key={content.id}
      kindLabel={teachingKindLabels[content.content_type]}
      title={content.title}
      subtitle={`${linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms)} · ${linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms)} · ${linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms)}`}
      statusLabel={statusLabel}
      statusTone={content.publication_status === "published" ? "success" : content.completion_status === "incomplete" ? "warning" : "default"}
      description={content.description}
      correctionGuidance={content.correction_guidance}
      media={content.teaching_content_media}
      tags={content.teaching_content_tags.map((tag) => tag.tag)}
      metadata={[
        { label: "Tipo", value: teachingKindLabels[content.content_type] },
        { label: "Categoría", value: category },
        { label: "Estado", value: publicationLabel },
        { label: "Visibilidad", value: visibilityLabel },
        ...(content.content_type === "correction" ? [{ label: "Medición", value: measurementLabel }] : []),
        { label: "Estilos", value: linkedTermLabels(content.teaching_content_styles.map((link) => link.style_term_id),terms) },
        { label: "Roles", value: linkedTermLabels(content.teaching_content_roles.map((link) => link.role_term_id),terms) },
        { label: "Niveles", value: linkedTermLabels(content.teaching_content_levels.map((link) => link.level_term_id),terms) },
      ]}
      actions={<>
        <button className="icon-btn" onClick={() => setRelating(content)} aria-label={`Relaciones de ${content.title}`} title="Relaciones"><Link2 /></button>
        <button className="icon-btn" onClick={() => setEditing(content)} aria-label={`Editar ${content.title}`} title="Editar"><Pencil /></button>
      </>}
    >
      {content.content_type === "exercise" && content.requires_partner ? <span className="badge partner-badge">Necesita pareja</span> : null}{ownRelations.length ? <div style={{ display:"grid", gap:7 }}><span style={{ color:"#777287", fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:".04em" }}>Relaciones</span><div style={{ display:"grid", gap:6 }}>{ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"9px 10px", border:"1px solid #e8e5ee", borderRadius:10, background:"white" }}><span style={{ color:"#777287", fontSize:12.5 }}>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong style={{ fontSize:13, textAlign:"right" }}>{other?.title ?? "Contenido archivado"}</strong></div>; })}</div></div> : null}
    </TeachingContentCard>;
  };
  return <>
    <Header eyebrow="Enseñanza" title="Tu biblioteca" description="Crea una vez, relaciona bien y reutiliza en cada clase." action={<button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Crear contenido</button>} />
    <div className="teaching-switch"><button className={mode === "library" ? "active" : ""} onClick={() => setMode("library")}><LibraryBig /> Biblioteca</button><button className={mode === "students" ? "active" : ""} onClick={() => setMode("students")}><UsersRound /> Enseñar alumnos</button><button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><GitBranch /> Mapa</button></div>
    {mode === "library" ? <>
      <div className="teaching-kind-grid">{teachingKinds.map(([value,label,Icon]) => { const total = contents.filter((content) => content.active && content.content_type === value).length; return <button key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}><Icon /><span><strong>{label}</strong><small>{total} {total === 1 ? "contenido" : "contenidos"}</small></span></button>; })}</div>
      <label className="search"><Search /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Buscar en ${teachingKindLabels[kind]?.toLocaleLowerCase("es") ?? "contenido"}…`} /></label>
      {incomplete.length ? <section className="teaching-group incomplete-group"><div className="card-head"><h2>Incompletas</h2><span>{incomplete.length}</span></div><div className="teaching-list">{incomplete.map(renderContent)}</div></section> : null}
      {categories.map((category) => { const items = complete.filter((content) => content.category_term_id === category.id); return items.length ? <section className="teaching-group" key={category.id}><div className="card-head"><h2>{category.label}</h2><span>{items.length}</span></div><div className="teaching-list">{items.map(renderContent)}</div></section> : null; })}
      {complete.some((content) => !content.category_term_id) ? <section className="teaching-group"><div className="card-head"><h2>Sin categoría</h2></div><div className="teaching-list">{complete.filter((content) => !content.category_term_id).map(renderContent)}</div></section> : null}
      {!filtered.length ? <div className="empty"><BookOpen /><strong>No hay contenido aquí todavía</strong><p>Crea el primero o guarda una idea incompleta solo con el título.</p><button className="btn" onClick={() => setCreating(true)}><Plus size={18} /> Crear {teachingKindLabels[kind]?.toLocaleLowerCase("es")}</button></div> : null}
    </> : null}
    {mode === "students" ? <><label className="search"><Search /><input type="search" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Buscar alumno" /></label><div className="student-teaching-list">{studentMatches.map((student) => { const own = assignments.filter((assignment) => assignment.person_id === student.id); return <article className="card student-teaching-card" key={student.id}><header><span className="avatar"><UserRound /></span><div><h2>{student.display_name}</h2><span>{own.length ? `${own.length} contenidos en formación` : "Sin contenido asignado"}</span></div><button className="btn" onClick={() => setAssigning(student)}><Plus size={17} /> Añadir</button></header>{own.length ? <div className="student-assignment-list">{own.map((assignment) => <div key={assignment.id}><div><span>{teachingKindLabels[assignment.teaching_contents.content_type]}</span><strong>{assignment.teaching_contents.title}</strong></div><select value={assignment.assignment_status} onChange={(event) => updateAssignment(assignment,event.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div> : null}</article>; })}</div></> : null}
    {mode === "map" ? <TeachingMap contents={contents} relations={relations} terms={terms} /> : null}
    {creating ? <TeachingContentEditor initial={null} defaultType={kind} terms={terms} close={() => setCreating(false)} saved={refresh} notify={notify} /> : null}
    {editing ? <TeachingContentEditor key={editing.id} initial={editing} defaultType={editing.content_type} terms={terms} close={() => setEditing(null)} saved={refresh} notify={notify} /> : null}
    {relating ? <TeachingRelationEditor key={relating.id} content={relating} contents={contents} relations={relations} close={() => setRelating(null)} saved={refresh} notify={notify} /> : null}
    {assigning ? <TeachingAssignModal key={assigning.id} student={assigning} contents={contents} assignments={assignments} terms={terms} close={() => setAssigning(null)} saved={async () => { await refresh(); notify("Contenido añadido al alumno."); }} /> : null}
  </>;
}

function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function ScheduleClass({ students, styles, initialStudentId, close, saved }: { students: Person[]; styles: CatalogTerm[]; initialStudentId?: number | null; close: () => void; saved: () => Promise<void> }) {
  const [type, setType] = useState<"individual" | "pair">("individual"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [initialDate] = useState(() => localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const hours = integerFieldValue(form.get("hours"), 0, 8), minutes = integerFieldValue(form.get("minutes"), 0, 59);
    const scheduled = String(form.get("scheduled_at") || "");
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (hours === null || minutes === null) return setError("Indica horas y minutos válidos.");
    const duration = hours * 60 + minutes;
    if (!scheduled || duration <= 0) return setError("Indica fecha, hora y duración.");
    setBusy(true); setError("");
    const result = await db.rpc("schedule_class", {
      p_class_type: type, p_student_ids: type === "pair" ? [first, second] : [first],
      p_scheduled_start_at: new Date(scheduled).toISOString(), p_duration_minutes: duration,
      p_style_term_id: Number(form.get("style_term_id") || 0) || null, p_location_term_id: null,
      p_notes: String(form.get("notes") || "").trim() || null,
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><h2>Programar clase</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <div className="segmented"><button type="button" className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>Individual</button><button type="button" className={type === "pair" ? "active" : ""} onClick={() => setType("pair")}>Pareja</button></div>
      <div className="fields-2">
        <label className="field"><span>Alumno *</span><select name="student_1" required defaultValue={initialStudentId ? String(initialStudentId) : ""}><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
        {type === "pair" ? <label className="field"><span>Segundo alumno *</span><select name="student_2" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label> : null}
        <label className="field field-wide"><span>Fecha y hora *</span><input name="scheduled_at" type="datetime-local" required defaultValue={initialDate} /></label>
        <label className="field"><span>Horas</span><input name="hours" type="text" inputMode="numeric" pattern="[0-8]" defaultValue="1" /></label>
        <label className="field"><span>Minutos</span><input name="minutes" type="text" inputMode="numeric" pattern="[0-5]?[0-9]" defaultValue="" /></label>
        <label className="field field-wide"><span>Estilo *</span><select name="style_term_id" required defaultValue=""><option value="" disabled>Seleccionar estilo</option>{styles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label>
        <label className="field field-wide"><span>Notas</span><input name="notes" placeholder="Opcional" /></label>
      </div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Programando…" : "Programar clase"}</button></div>
    </form>
  </section></div>;
}

function AddCredit({ students, initialStudentId, close, saved }: { students: Person[]; initialStudentId?: number | null; close: () => void; saved: () => Promise<void> }) {
  const [type, setType] = useState<"individual" | "pair">("individual"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const hours = integerFieldValue(form.get("hours"), 0, 1000), minutes = integerFieldValue(form.get("minutes"), 0, 59), price = decimalFieldValue(form.get("price"));
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (hours === null || minutes === null) return setError("Indica horas y minutos válidos.");
    if (price === null) return setError("Indica un importe válido.");
    const duration = hours * 60 + minutes;
    if (duration <= 0) return setError("El bono necesita una duración mayor que cero.");
    setBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: type === "pair" ? [first, second] : [first], p_modality: type, p_minutes: duration,
      p_price_cents: Math.round(price * 100), p_label: String(form.get("label") || "").trim() || null,
      p_payment_status: String(form.get("payment_status") || "paid"),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await saved(); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><h2>Añadir bono</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <div className="segmented"><button type="button" className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>Individual</button><button type="button" className={type === "pair" ? "active" : ""} onClick={() => setType("pair")}>Pareja</button></div>
      <div className="fields-2">
        <label className="field"><span>Alumno *</span><select name="student_1" required defaultValue={initialStudentId ? String(initialStudentId) : ""}><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
        {type === "pair" ? <label className="field"><span>Segundo alumno *</span><select name="student_2" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label> : null}
        <label className="field"><span>Horas *</span><input name="hours" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="5" /></label><label className="field"><span>Minutos</span><input name="minutes" type="text" inputMode="numeric" pattern="[0-5]?[0-9]" defaultValue="" /></label>
        <label className="field"><span>Importe (€)</span><input name="price" type="text" inputMode="decimal" pattern="[0-9]*([,.][0-9]{0,2})?" defaultValue="" /></label>
        <label className="field"><span>Pago</span><select name="payment_status" defaultValue="paid"><option value="paid">Pagado</option><option value="pending">Pendiente</option></select></label>
        <label className="field field-wide"><span>Nombre del bono</span><input name="label" placeholder="Opcional" /></label>
      </div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Guardando…" : "Crear bono"}</button></div>
    </form>
  </section></div>;
}

function AddStudent({ close, created }: { close: () => void; created: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), first = String(form.get("first_name") ?? "").trim(), last = String(form.get("last_name") ?? "").trim();
    if (!first) return setError("Escribe al menos el nombre.");
    setBusy(true); setError("");
    const result = await db.rpc("create_student", { p_display_name: [first, last].filter(Boolean).join(" "), p_first_name: first, p_last_name: last || null, p_email: String(form.get("email") ?? "").trim() || null, p_phone: String(form.get("phone") ?? "").trim() || null, p_country_code: String(form.get("country_code") ?? "").trim() || null });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await created(); setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-title">
    <header className="modal-head"><h2 id="new-title">Nuevo alumno provisional</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}><div className="fields-2">
      <label className="field"><span>Nombre *</span><input name="first_name" autoFocus required /></label><label className="field"><span>Apellidos</span><input name="last_name" /></label>
      <label className="field"><span>Teléfono</span><input name="phone" type="tel" /></label><label className="field"><span>Email</span><input name="email" type="email" /></label>
      <label className="field"><span>País</span><input name="country_code" maxLength={2} placeholder="ES" /></label>
    </div>{error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}>{busy ? "Guardando…" : "Crear alumno"}</button></div></form>
  </section></div>;
}

function portalClassStatus(value: string) {
  return ({ scheduled: "Programada", active: "En curso", finished: "Realizada", cancelled: "Cancelada" } as Record<string, string>)[value] ?? value;
}

function PortalClassRow({ item }: { item: StudentPortalSnapshot["classes"][number] }) {
  const billingNote = item.billing_status === "accepted_uncovered" && item.uncovered_minutes ? ` · aceptado sin regularizar ${minutesLabel(item.uncovered_minutes)}` : item.uncovered_minutes ? ` · pendiente ${minutesLabel(item.uncovered_minutes)}` : "";
  return <div><CalendarDays /><div><strong>{item.style || (item.class_type === "pair" ? "Clase en pareja" : "Clase individual")}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}{billingNote}</span></div><span className={`badge ${item.status === "finished" ? "portal" : ""}`}>{portalClassStatus(item.status)}</span></div>;
}

function StudentPortal({ identity, experience, onExperience, client, email, onIdentityPatch, onOpenProfile, onOpenPreferences }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void | Promise<void>; client: SupabaseClient; email: string; onIdentityPatch: (patch: Partial<IdentityContext>) => void; onOpenProfile: () => void; onOpenPreferences: () => void }) {
  const [snapshot, setSnapshot] = useState<StudentPortalSnapshot | null>(null), [error, setError] = useState("");
  const [privateVideos, setPrivateVideos] = useState<ClassPrivateVideo[]>([]);
  const [studentNotes, setStudentNotes] = useState<ClassNote[]>([]);
  const [portalNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    if (!db) return;
    setError("");
    const result = await db.rpc("student_portal_snapshot");
    if (result.error) { setError(result.error.message); return; }
    const nextSnapshot = result.data as StudentPortalSnapshot;
    const [videoResult, noteResult] = await Promise.all([
      db.from("class_video_resources")
        .select("id,class_id,person_id,external_file_id,title,mime_type,created_at")
        .eq("visibility_scope", "private_student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
      db.from("class_notes")
        .select("id,class_id,person_id,body,visibility_scope,created_at")
        .eq("visibility_scope", "student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
    ]);
    if (!videoResult.error) setPrivateVideos((videoResult.data ?? []) as ClassPrivateVideo[]);
    if (!noteResult.error) setStudentNotes((noteResult.data ?? []) as ClassNote[]);
    setSnapshot(nextSnapshot);
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => clearTimeout(initial); }, [load]);
  if (!snapshot && !error) return <Spinner />;
  if (!snapshot) return <main className="login"><section className="login-card"><Brand /><h1>No podemos abrir tu ficha</h1><p>{error || "Tu cuenta todavía no está vinculada con una ficha de alumno."}</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  const upcoming = snapshot.classes.filter((item) => item.status === "scheduled" && new Date(item.scheduled_start_at).getTime() >= portalNow).sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  const nextClass = upcoming[0] ?? null;
  const activeCredits = snapshot.credits.filter((credit) => credit.status === "active" && Number(credit.balance_minutes) > 0);
  const availableBalance = activeCredits.reduce((sum, credit) => sum + Number(credit.balance_minutes || 0), 0);
  const pendingDebt = Number(snapshot.financial?.pending_debt_minutes || 0);
  const balance = snapshot.financial ? Number(snapshot.financial.net_balance_minutes || 0) : availableBalance;
  const activeAssignments = snapshot.assignments.filter((assignment) => !["corrected", "explained", "completed"].includes(assignment.assignment_status));
  const orderedEvaluations = [...snapshot.evaluations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestEvaluation = orderedEvaluations[0] ?? null;
  const contextEvaluations = latestEvaluation ? orderedEvaluations.filter((item) => item.style_term_id === latestEvaluation.style_term_id && item.role_term_id === latestEvaluation.role_term_id && item.level_term_id === latestEvaluation.level_term_id) : orderedEvaluations;
  const latestScores = contextEvaluations.reduce<Map<string, StudentPortalSnapshot["evaluations"][number]>>((map, item) => map.has(item.aptitude) ? map : map.set(item.aptitude, item), new Map());
  const totalScore = [...latestScores.values()].reduce((sum,item) => sum + Number(item.score || 0),0);
  const relativeRadar = [...latestScores.values()].map((item) => ({ label:item.aptitude, value:totalScore ? Number(item.score) / totalScore * 100 : 0 }));
  const evolutionContextLabel = latestEvaluation ? [latestEvaluation.style, latestEvaluation.role, latestEvaluation.level].filter(Boolean).join(" · ") : "Último contexto";
  return <div className="student-portal-shell"><header className="student-portal-head"><Brand /><div><span>{identity.profile_name || snapshot.profile.display_name || identity.display_name}</span><AccountMenu client={client} identity={identity} experience={experience} email={email} variant="header" onExperience={onExperience} onOpenProfile={onOpenProfile} onOpenPreferences={onOpenPreferences} onIdentityPatch={onIdentityPatch} notify={() => undefined} /></div></header><main className="student-portal-main">
    <section className="portal-hero"><div><p className="eyebrow">Mi espacio</p><h1>Hola, {snapshot.profile.first_name || snapshot.profile.display_name}</h1><p>{nextClass ? `Tu próxima clase es ${dateLabel(nextClass.scheduled_start_at)}.` : "Aquí tienes tus clases, saldo y evolución al día."}</p></div><Sparkles /></section>
    <section className="portal-stats"><article><CalendarDays /><span>Próximas clases</span><strong>{upcoming.length}</strong></article><article><WalletCards /><span>Saldo neto</span><strong>{minutesLabel(balance)}</strong></article><article><BookOpen /><span>En formación</span><strong>{activeAssignments.length}</strong></article><article><TrendingUp /><span>Aptitudes evaluadas</span><strong>{latestScores.size}</strong></article></section>
    {pendingDebt > 0 ? <section className="card portal-next"><div><p className="eyebrow">Saldo pendiente</p><h2>{minutesLabel(pendingDebt)} por regularizar</h2><p>Una o más clases quedaron sin saldo suficiente. El profesor puede regularizarlas con un bono o dejar constancia de otra decisión.</p></div><AlertTriangle /></section> : null}
    {nextClass ? <section className="card portal-next"><div><p className="eyebrow">Próxima clase</p><h2>{nextClass.style || "Clase privada"}</h2><p>{dateLabel(nextClass.scheduled_start_at)} · {minutesLabel(nextClass.duration_minutes)}</p></div><div><span>{nextClass.role || "Rol por confirmar"}</span><span>{nextClass.level || "Nivel por confirmar"}</span></div></section> : null}
    <section className="portal-grid"><article className="card portal-card"><div className="card-head"><h2>Mi formación</h2><span>{snapshot.assignments.length}</span></div>{snapshot.assignments.length ? <div className="portal-learning-list">{snapshot.assignments.map((assignment) => <TeachingContentCard
        key={assignment.id}
        kindLabel={teachingKindLabels[assignment.content_type] ?? assignment.content_type}
        title={assignment.title}
        statusLabel={assignmentOptions(assignment.content_type).find(([value]) => value === assignment.assignment_status)?.[1] ?? assignment.assignment_status}
        statusTone={["corrected","explained","completed"].includes(assignment.assignment_status) ? "success" : "default"}
        description={assignment.description}
        correctionGuidance={assignment.correction_guidance}
        media={assignment.media ?? []}
        metadata={[
          ...(assignment.current_frequency !== null ? [{ label: "Frecuencia", value: String(assignment.current_frequency) }] : []),
          ...(assignment.current_importance !== null ? [{ label: "Importancia", value: String(assignment.current_importance) }] : []),
        ]}
      />)}</div> : <div className="compact-empty"><BookOpen /><span>Cuando te asignemos contenido aparecerá aquí.</span></div>}</article>
      {privateVideos.length ? <article className="card portal-card"><div className="card-head"><h2>Vídeos de mis clases</h2><span>{privateVideos.length}</span></div><div className="portal-video-list">{privateVideos.map((video) => <div className="portal-video-item" key={video.id}><SecureDriveAsset fileId={video.external_file_id} mediaType="video" title={video.title || "Vídeo de clase"} controls className="portal-video-media" /><div><strong>{video.title || "Vídeo de clase"}</strong><span>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(video.created_at))}</span></div></div>)}</div></article> : null}
      {snapshot.class_summaries?.length ? <article className="card portal-card"><div className="card-head"><h2>Resumen de mis clases</h2><span>{snapshot.class_summaries.length}</span></div><div className="portal-class-summary-list">{snapshot.class_summaries.slice(0,6).map((summary) => <div key={summary.class_id}><strong>{new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(summary.closed_at))}</strong><p>{summary.student_message || "Clase cerrada y documentación actualizada."}</p></div>)}</div></article> : null}
      {studentNotes.length ? <article className="card portal-card"><div className="card-head"><h2>Observaciones de mis clases</h2><span>{studentNotes.length}</span></div><div className="portal-class-summary-list">{studentNotes.slice(0,8).map((note) => <div key={note.id}><strong>{new Intl.DateTimeFormat("es-ES",{day:"numeric",month:"short",year:"numeric"}).format(new Date(note.created_at))}</strong><p>{note.body}</p></div>)}</div></article> : null}
      {snapshot.class_activity?.some((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")) ? <article className="card portal-card"><div className="card-head"><h2>Trabajo de mis clases</h2><span>{snapshot.class_activity.filter((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")).filter((event,index,rows) => rows.findIndex((candidate) => candidate.class_id===event.class_id && candidate.content_id===event.content_id)===index).length}</span></div><div className="portal-class-summary-list">{snapshot.class_activity.filter((event) => event.event_type === "reviewed" || event.event_type.startsWith("exercise_")).filter((event,index,rows) => rows.findIndex((candidate) => candidate.class_id===event.class_id && candidate.content_id===event.content_id)===index).slice(0,12).map((event) => <div key={event.id}><strong>{event.title}</strong><p>{event.event_type === "reviewed" ? "Repasado en clase" : event.event_type === "exercise_completed" ? "Ejercicio realizado" : event.event_type === "exercise_active" ? "Ejercicio para trabajar" : "Ejercicio pendiente"}</p></div>)}</div></article> : null}
      {snapshot.class_media?.length ? <article className="card portal-card"><div className="card-head"><h2>Documentación de clase</h2><span>{snapshot.class_media.length}</span></div><div className="portal-video-list">{snapshot.class_media.slice(0,8).map((media) => <div className="portal-video-item" key={media.id}><SecureDriveAsset fileId={media.external_file_id} mediaType={media.media_type} title={media.title || (media.media_kind === "final_dance" ? "Baile final" : "Documento de clase")} controls={media.media_type === "video"} className="portal-video-media" /><div><strong>{media.title || (media.media_kind === "final_dance" ? "Baile final" : "Documento de clase")}</strong><span>{media.media_kind === "final_dance" ? "Baile final" : "Clase"}</span></div></div>)}</div></article> : null}
      <article className="card portal-card"><div className="card-head"><h2>Mi evolución</h2><span>{evolutionContextLabel}</span></div>{relativeRadar.length ? <><RadarChart items={relativeRadar} scaleLabel="Porcentaje de tus puntos totales en cada aptitud" /><div className="evaluation-history">{contextEvaluations.slice(0,12).map((item) => <div key={item.id}><span>{new Intl.DateTimeFormat("es-ES",{ day:"numeric",month:"short",year:"numeric" }).format(new Date(item.created_at))}</span><strong>{item.score}</strong></div>)}</div></> : <div className="compact-empty"><TrendingUp /><span>Tu próxima evaluación aparecerá aquí.</span></div>}</article>
      <article className="card portal-card"><div className="card-head"><h2>Mis clases</h2><span>{snapshot.classes.length}</span></div>{snapshot.classes.length ? <div className="portal-class-list">{snapshot.classes.slice(0, 8).map((item) => <PortalClassRow key={item.id} item={item} />)}{snapshot.classes.length > 8 ? <details className="portal-history-more"><summary>Ver {snapshot.classes.length - 8} clases anteriores</summary><div className="portal-class-list">{snapshot.classes.slice(8).map((item) => <PortalClassRow key={item.id} item={item} />)}</div></details> : null}</div> : <div className="compact-empty"><CalendarDays /><span>Todavía no hay clases en tu historial.</span></div>}</article>
      <article className="card portal-card"><div className="card-head"><h2>Mis bonos</h2><span>{snapshot.credits.length}</span></div>{snapshot.credits.length ? <div className="portal-credit-list">{snapshot.credits.map((credit) => <div key={credit.id}><div><strong>{credit.label || (credit.modality === "pair" ? "Bono de pareja" : "Bono individual")}</strong><span>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(credit.purchased_at))}</span></div><strong>{minutesLabel(Number(credit.balance_minutes || 0))}</strong></div>)}</div> : <div className="compact-empty"><WalletCards /><span>No tienes bonos registrados todavía.</span></div>}</article>
    </section>
  </main></div>;
}

function StaffApp({ session }: { session: Session }) {
  const [view, setView] = useState<View>("home"), [identity, setIdentity] = useState<IdentityContext | null>(null), [experience, setExperienceState] = useState<ExperienceContext>("teacher"), [students, setStudents] = useState<Person[]>([]);
  const [query, setQuery] = useState(""), [newOpen, setNewOpen] = useState(false), [selected, setSelected] = useState<Person | null>(null), [ready, setReady] = useState(false);
  const [classes, setClasses] = useState<ClassItem[]>([]), [credits, setCredits] = useState<CreditItem[]>([]), [catalog, setCatalog] = useState<CatalogTerm[]>([]);
  const [teachingContents,setTeachingContents] = useState<TeachingContent[]>([]), [teachingRelations,setTeachingRelations] = useState<TeachingRelation[]>([]), [teachingAssignments,setTeachingAssignments] = useState<ContentAssignment[]>([]);
  const [crmContacts,setCrmContacts] = useState<CrmContact[]>([]), [marketingRates,setMarketingRates] = useState<MarketingRate[]>([]), [marketingContent,setMarketingContent] = useState<MarketingContent[]>([]);
  const [marketingEvents,setMarketingEvents] = useState<MarketingEvent[]>([]), [marketingCampaigns,setMarketingCampaigns] = useState<MarketingCampaign[]>([]), [campaignMetrics,setCampaignMetrics] = useState<CampaignMetric[]>([]);
  const [communicationRecipients,setCommunicationRecipients] = useState<CommunicationRecipient[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false), [creditOpen, setCreditOpen] = useState(false);
  const [scheduleStudentId,setScheduleStudentId] = useState<number | null>(null), [creditStudentId,setCreditStudentId] = useState<number | null>(null);
  const [toast, setToast] = useState<string>(""), [liveClassId, setLiveClassId] = useState<number | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const patchIdentity = useCallback((patch: Partial<IdentityContext>) => setIdentity((current) => current ? { ...current, ...patch } : current), []);
  const loadNotificationCount = useCallback(async () => {
    if (!db) return;
    const notificationResult = await db.from("internal_notifications")
      .select("id,source_type,source_id,read_at")
      .is("read_at", null)
      .limit(200);
    if (notificationResult.error) return;
    const rows = (notificationResult.data ?? []) as Array<{ id: number; source_type: string | null; source_id: string | null; read_at: string | null }>;
    const missionIds = rows.filter((item) => item.source_type === "mission" && item.source_id && /^\d+$/.test(item.source_id)).map((item) => Number(item.source_id));
    if (!missionIds.length) { setUnreadNotificationCount(rows.length); return; }
    const missionResult = await db.from("missions").select("id,state").in("id", [...new Set(missionIds)]);
    if (missionResult.error) { setUnreadNotificationCount(rows.length); return; }
    const states = new Map(((missionResult.data ?? []) as Array<{ id: number; state: string }>).map((item) => [item.id, item.state]));
    const resolved = new Set(["completed", "completed_automatically", "cancelled"]);
    setUnreadNotificationCount(rows.filter((item) => item.source_type !== "mission" || !item.source_id || !resolved.has(states.get(Number(item.source_id)) ?? "")).length);
  }, []);
  const loadStudents = useCallback(async () => {
    if (!db) return;
    const result = await db.from("people").select("id,auth_user_id,display_name,first_name,last_name,email,phone,country_code,crm_stage,active,student_profiles!inner(person_id,active)").eq("active", true).eq("student_profiles.active", true).order("display_name");
    if (result.error) throw result.error; setStudents((result.data ?? []) as unknown as Person[]);
  }, []);
  const loadOperations = useCallback(async () => {
    if (!db) return;
    const [classResult, creditResult, catalogResult] = await Promise.all([
      db.from("classes").select("id,class_type,status,scheduled_start_at,duration_minutes,notes,style_term_id,location_term_id,location_text,workflow_stage,started_at,administrative_finished_at,pedagogy_closed_at,administratively_finished_by,class_participants(person_id,attendance_status,billing_grant_id,preferred_billing_grant_id,role_term_id,level_term_id,billed_minutes,uncovered_minutes,billing_status)").order("scheduled_start_at"),
      db.from("credit_grants").select("id,modality,label,total_minutes,price_cents,payment_status,status,purchased_at,expires_at,credit_grant_members(person_id),credit_movements(delta_minutes)").order("purchased_at", { ascending: false }),
      db.from("catalog_terms").select("id,label,term_key,taxonomy,metadata,sort_order").in("taxonomy", ["dance_style","dance_role","dance_level","aptitude","evaluation_scale","correction_category","explanation_category","exercise_category","sequence_category"]).eq("active", true).order("sort_order"),
    ]);
    if (classResult.error) throw classResult.error;
    if (creditResult.error) throw creditResult.error;
    if (catalogResult.error) throw catalogResult.error;
    setClasses((classResult.data ?? []) as unknown as ClassItem[]);
    setCredits((creditResult.data ?? []) as unknown as CreditItem[]);
    setCatalog((catalogResult.data ?? []) as unknown as CatalogTerm[]);
  }, []);
  const loadTeaching = useCallback(async () => {
    if (!db) return;
    const [contentResult, relationResult, assignmentResult] = await Promise.all([
      db.from("teaching_contents").select("id,title,content_type,description,correction_guidance,completion_status,publication_status,visibility,measurement_mode,category_term_id,active,requires_partner,published_at,updated_at,teaching_content_styles(style_term_id),teaching_content_roles(role_term_id),teaching_content_levels(level_term_id),teaching_content_tags(tag),teaching_content_media(id,media_type,provider,external_file_id,title,mime_type,sort_order,group_label,is_cover,is_preview,display_in_resources,thumbnail_external_file_id,thumbnail_mime_type,preview_start_seconds,preview_end_seconds)").eq("active",true).order("updated_at",{ ascending:false }),
      db.from("teaching_content_relations").select("id,source_content_id,target_content_id,relation_type,position").order("id"),
      db.from("student_content_assignments").select("id,person_id,content_id,assignment_status,current_frequency,current_importance,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,updated_at,teaching_contents!inner(id,title,content_type,measurement_mode,description,correction_guidance)").order("updated_at",{ ascending:false }),
    ]);
    if (contentResult.error) throw contentResult.error;
    if (relationResult.error) throw relationResult.error;
    if (assignmentResult.error) throw assignmentResult.error;
    setTeachingContents((contentResult.data ?? []) as unknown as TeachingContent[]);
    setTeachingRelations((relationResult.data ?? []) as TeachingRelation[]);
    setTeachingAssignments((assignmentResult.data ?? []) as unknown as ContentAssignment[]);
  }, []);
  const loadMarketing = useCallback(async () => {
    if (!db) return;
    const [contactResult, rateResult, contentResult, eventResult, campaignResult, metricResult, recipientResult] = await Promise.all([
      db.from("people").select("id,auth_user_id,display_name,first_name,last_name,email,phone,country_code,crm_stage,source,notes,created_at,student_profiles(person_id,active),crm_profiles(contact_date,inquiry,reserved,rate_id,quoted_amount_cents,contact_permission)").eq("active",true).order("created_at",{ascending:false}),
      db.from("marketing_rates").select("id,name,rate_type,duration_minutes,price_cents,currency,description,active,sort_order").order("sort_order").order("id"),
      db.from("marketing_content").select("id,title,channel,content_type,status,body,planned_for,published_at,updated_at,marketing_content_media(id,media_type,provider,external_file_id,title)").neq("status","archived").order("updated_at",{ascending:false}),
      db.from("marketing_events").select("id,title,status,starts_at,ends_at,location,description,capacity,price_cents,registration_url").order("starts_at",{ascending:false}),
      db.from("marketing_campaigns").select("id,title,channel,objective,audience_scope,status,message,event_id,budget_cents,scheduled_at,starts_at,ends_at,updated_at,marketing_campaign_media(id,media_type,provider,external_file_id,title)").order("updated_at",{ascending:false}),
      db.from("marketing_campaign_metrics").select("id,campaign_id,metric_date,spend_cents,impressions,reach,clicks,inquiries,bookings,revenue_cents").order("metric_date",{ascending:false}),
      db.from("communication_recipients").select("id,campaign_id,person_id,channel,destination,message_snapshot,media_snapshot,status,blocked_reason,prepared_at,sent_at,updated_at,person:people(display_name,country_code),campaign:marketing_campaigns(title)").order("updated_at",{ascending:false}),
    ]);
    for (const result of [contactResult,rateResult,contentResult,eventResult,campaignResult,metricResult,recipientResult]) if (result.error) throw result.error;
    setCrmContacts((contactResult.data ?? []) as unknown as CrmContact[]);
    setMarketingRates((rateResult.data ?? []) as MarketingRate[]);
    setMarketingContent((contentResult.data ?? []) as unknown as MarketingContent[]);
    setMarketingEvents((eventResult.data ?? []) as MarketingEvent[]);
    setMarketingCampaigns((campaignResult.data ?? []) as unknown as MarketingCampaign[]);
    setCampaignMetrics((metricResult.data ?? []) as CampaignMetric[]);
    setCommunicationRecipients((recipientResult.data ?? []) as unknown as CommunicationRecipient[]);
  }, []);
  const refreshLive = useCallback(async () => {
    await Promise.all([loadOperations(),loadStudents()]);
    try { await loadTeaching(); }
    catch (error) { setToast(error instanceof Error ? error.message : "La clase está abierta, pero no se pudo actualizar la enseñanza."); }
  }, [loadOperations,loadStudents,loadTeaching]);
  const refreshMarketing = useCallback(async () => { await Promise.all([loadMarketing(),loadStudents()]); }, [loadMarketing,loadStudents]);
  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!db) return;
      const [contextResult, preferenceResult] = await Promise.all([
        db.rpc("identity_context"),
        db.from("user_preferences").select("preferred_context").eq("user_id", session.user.id).maybeSingle(),
      ]);
      if (!alive) return;
      const nextIdentity = !contextResult.error && contextResult.data ? contextResult.data as IdentityContext : null;
      if (nextIdentity) setIdentity(nextIdentity);
      if (nextIdentity) {
        const preferred = preferenceResult.data?.preferred_context as ExperienceContext | null;
        const allowed = preferred === "teacher" ? nextIdentity.can_teach : preferred === "student" ? nextIdentity.can_study : preferred === "admin" ? nextIdentity.can_admin : false;
        setExperienceState(allowed && preferred ? preferred : nextIdentity.can_teach ? "teacher" : nextIdentity.can_study ? "student" : "admin");
      }
      if (nextIdentity?.can_teach || nextIdentity?.can_admin) {
        try { await Promise.all([loadStudents(), loadOperations(), loadTeaching(), loadMarketing(), loadNotificationCount()]); } catch (e) { if (alive) setToast(e instanceof Error ? e.message : "No se pudieron cargar los datos."); }
      }
      if (alive) setReady(true);
    } boot(); return () => { alive = false; };
  }, [session.user.id, loadStudents, loadOperations, loadTeaching, loadMarketing, loadNotificationCount]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.history.state as CyaHistoryState | null;
    if (!existing?.cyaHub) {
      window.history.replaceState({ cyaHub: true, view: "home", experience: "teacher", selectedId: null, overlay: null, modalStudentId: null, liveClassId: null } satisfies CyaHistoryState, "", window.location.href);
    }
    const restore = (event: PopStateEvent) => {
      const state = event.state as CyaHistoryState | null;
      if (!state?.cyaHub) return;
      setView(state.view);
      setExperienceState(state.experience);
      setLiveClassId(state.liveClassId ?? null);
      setSelected(state.selectedId ? students.find((student) => student.id === state.selectedId) ?? null : null);
      setNewOpen(state.overlay === "new-student");
      setScheduleOpen(state.overlay === "schedule");
      setCreditOpen(state.overlay === "credit");
      setScheduleStudentId(state.overlay === "schedule" ? state.modalStudentId ?? null : null);
      setCreditStudentId(state.overlay === "credit" ? state.modalStudentId ?? null : null);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [students]);
  if (!ready) return <Spinner />;
  if (!identity) return <main className="login"><section className="login-card"><Brand /><h1>Acceso no disponible</h1><p>La cuenta existe, pero no tiene un rol activo en CYA Hub.</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  const activeIdentity = identity;
  function historyState(nextView: View, options: Partial<Omit<CyaHistoryState, "cyaHub" | "view">> = {}): CyaHistoryState {
    return {
      cyaHub: true,
      view: nextView,
      experience: options.experience ?? experience,
      selectedId: options.selectedId ?? null,
      overlay: options.overlay ?? null,
      modalStudentId: options.modalStudentId ?? null,
      liveClassId: options.liveClassId ?? null,
    };
  }
  function clearTransient() {
    setSelected(null);
    setNewOpen(false);
    setScheduleOpen(false);
    setCreditOpen(false);
    setScheduleStudentId(null);
    setCreditStudentId(null);
  }
  function navigateView(nextView: View, options: { liveClassId?: number | null; experience?: ExperienceContext } = {}) {
    const nextExperience = options.experience ?? experience;
    if (view === nextView && !selected && !newOpen && !scheduleOpen && !creditOpen && (nextView !== "live" || (options.liveClassId ?? null) === liveClassId) && nextExperience === experience) return;
    const state = historyState(nextView, { experience: nextExperience, liveClassId: options.liveClassId ?? null });
    window.history.pushState(state, "", window.location.href);
    clearTransient();
    setExperienceState(nextExperience);
    setLiveClassId(state.liveClassId);
    setView(nextView);
  }
  function replaceView(nextView: View, options: { experience?: ExperienceContext } = {}) {
    const nextExperience = options.experience ?? experience;
    const state = historyState(nextView, { experience: nextExperience });
    window.history.replaceState(state, "", window.location.href);
    clearTransient();
    setLiveClassId(null);
    setExperienceState(nextExperience);
    setView(nextView);
  }
  function openStudentDetail(student: Person) {
    window.history.pushState(historyState(view, { selectedId: student.id }), "", window.location.href);
    setSelected(student);
  }
  function openNewStudent() {
    window.history.pushState(historyState(view, { overlay: "new-student" }), "", window.location.href);
    setNewOpen(true);
  }
  function openSchedule(studentId: number | null = null) {
    window.history.pushState(historyState(view, { overlay: "schedule", modalStudentId: studentId }), "", window.location.href);
    setSelected(null);
    setScheduleStudentId(studentId);
    setScheduleOpen(true);
  }
  function openCredit(studentId: number | null = null) {
    window.history.pushState(historyState(view, { overlay: "credit", modalStudentId: studentId }), "", window.location.href);
    setSelected(null);
    setCreditStudentId(studentId);
    setCreditOpen(true);
  }
  function goBack(fallback: View = "home") {
    const state = window.history.state as CyaHistoryState | null;
    if (state?.cyaHub && (state.selectedId || state.overlay || state.view !== "home")) {
      window.history.back();
      return;
    }
    replaceView(fallback);
  }
  async function setExperience(value: ExperienceContext) {
    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;
    if (!allowed || !db) return;
    const result = await db.rpc("set_experience_context", { p_context: value });
    if (result.error) {
      setToast(result.error.message || "No se pudo cambiar de vista.");
      return;
    }
    if (result.data) setIdentity(result.data as IdentityContext);
    if (value === "admin") navigateView("admin", { experience: value });
    else if (value === "teacher" && view === "admin") navigateView("home", { experience: value });
    else {
      window.history.pushState(historyState(view, { experience: value }), "", window.location.href);
      setExperienceState(value);
    }
  }
  const accountEmail = session.user.email ?? "";
  if (view === "profile" || view === "preferences") return <div className="account-settings-shell">
    <header className="account-settings-head">
      <button className="mobile-back account-settings-back" type="button" onClick={() => goBack("home")} aria-label="Volver">‹</button>
      <div className="account-settings-brand"><Brand /></div>
      <AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="header" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} />
    </header>
    <main className="account-settings-main">
      {view === "profile" ? <ProfileSettingsView client={db!} identity={identity} onIdentityPatch={patchIdentity} notify={setToast} /> : <PreferencesSettingsView client={db!} identity={identity} experience={experience} onIdentityPatch={patchIdentity} notify={setToast} />}
    </main>
    {toast ? <div className="toast">{toast}</div> : null}
  </div>;
  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} client={db!} email={accountEmail} onIdentityPatch={patchIdentity} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} />;
  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} client={db!} email={accountEmail} onIdentityPatch={patchIdentity} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} />;
  async function created() { await Promise.all([loadStudents(),loadMarketing()]); setToast("Alumno provisional creado correctamente."); setNewOpen(false); replaceView("students"); }
  async function classSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Clase programada correctamente."); setScheduleOpen(false); setScheduleStudentId(null); replaceView("classes"); }
  async function creditSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Bono creado correctamente."); setCreditOpen(false); setCreditStudentId(null); replaceView("credits"); }
  const styles = catalog.filter((term) => term.taxonomy === "dance_style");
  const isLiveClassSessionActive = view === "live" && liveClassId !== null && classes.some((item) => item.id === liveClassId && item.status === "active" && item.workflow_stage === "live");
  function goLive(id?: number) { navigateView("live", { liveClassId: id ?? liveClassId }); }
  async function reopenClass(id: number) {
    if (!db) return;
    const targetClass=classes.find((item) => item.id===id);
    const targetLabel=targetClass ? `${dateLabel(targetClass.scheduled_start_at)} · ${namesFor(targetClass.class_participants.map((participant) => participant.person_id),students)}` : `clase ${id}`;
    if (!window.confirm(`¿Reabrir ${targetLabel}? Se deshará su cierre administrativo, incluidos consumos, regularizaciones, transferencias, suplementos y pagos registrados en ese cierre.`)) return;
    if (!window.confirm(`Confirmación final: reabrir ${targetLabel} revertirá los movimientos financieros de ese cierre. Tendrás que terminar la clase de nuevo.`)) return;
    const result = await db.rpc("reopen_administratively_finished_class", { p_class_id: id });
    if (result.error) { setToast(result.error.message); return; }
    await loadOperations();
    setToast("Clase reabierta. Puedes corregirla y volver a terminarla.");
    goLive(id);
  }
  function goTarget(target: string) {
    if (target === "admin") { if (activeIdentity.can_admin) navigateView("admin", { experience: "admin" }); return; }
    if (target === "live") { goLive(); return; }
    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing", "notifications"].includes(target)) navigateView(target as View);
  }
  function openNotificationTarget(target: string, context: NotificationTargetContext) {
    if (context.classId) { navigateView("live", { liveClassId: context.classId }); return; }
    if (context.personId) {
      const student = students.find((item) => item.id === context.personId);
      if (student) {
        const state = historyState("students", { selectedId: student.id });
        window.history.pushState(state, "", window.location.href);
        clearTransient();
        setLiveClassId(null);
        setView("students");
        setSelected(student);
        return;
      }
    }
    goTarget(target);
  }
  const studentArea = ["students", "classes", "credits", "agenda"].includes(view);
  const activeNav = (id: string) => id === "students" ? studentArea : view === id;
  return <div className="shell">
    <aside className="sidebar"><Brand /><nav>{nav.map(([id, label, Icon]) => <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => navigateView(id)}><Icon />{label}</button>)}</nav>
      <AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="sidebar" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} />
    </aside>
    <div><header className="mobile-head"><div className="mobile-head-back">{view !== "home" ? <button className="mobile-back" type="button" onClick={() => goBack("home")} aria-label="Volver">‹</button> : null}</div><div className="mobile-head-brand"><Brand /></div><div className="mobile-head-actions"><button className={`icon-btn notification-trigger ${unreadNotificationCount ? "has-notifications" : ""}`} onClick={() => navigateView("notifications")} aria-label={unreadNotificationCount ? `${unreadNotificationCount} notificaciones pendientes` : "Notificaciones"}>{unreadNotificationCount ? <BellRing /> : <Bell />}{unreadNotificationCount ? <span className="notification-dot" aria-hidden="true" /> : null}</button><AccountMenu client={db!} identity={identity} experience={experience} email={accountEmail} variant="header" onExperience={setExperience} onOpenProfile={() => navigateView("profile")} onOpenPreferences={() => navigateView("preferences")} notify={setToast} /></div></header>
      <main className="main"><div className="content">
        {studentArea ? <nav className="module-tabs" aria-label="Alumnado"><button className={view === "students" ? "active" : ""} onClick={() => navigateView("students")}><UsersRound /> Alumnos</button><button className={view === "classes" ? "active" : ""} onClick={() => navigateView("classes")}><CalendarDays /> Clases</button><button className={view === "credits" ? "active" : ""} onClick={() => navigateView("credits")}><WalletCards /> Bonos</button><button className={view === "agenda" ? "active" : ""} onClick={() => navigateView("agenda")}><CalendarDays /> Agenda</button></nav> : null}
        {view === "home" && db ? <HomeView client={db} identity={identity} studentCount={students.length} classes={classes} students={students} go={goTarget} goLive={goLive} addStudent={openNewStudent} scheduleClass={() => openSchedule(null)} notify={setToast} /> : null}
        {view === "notifications" && db ? <NotificationsView client={db} timezone={identity.timezone} openTarget={openNotificationTarget} onUnreadChange={setUnreadNotificationCount} notify={setToast} /> : null}
        {view === "students" ? <StudentsView students={students} query={query} setQuery={setQuery} add={openNewStudent} open={openStudentDetail} schedule={(student) => openSchedule(student.id)} credit={(student) => openCredit(student.id)} /> : null}
        {view === "classes" ? <ClassesView classes={classes} students={students} schedule={() => openSchedule(null)} goLive={goLive} reopen={(id) => void reopenClass(id)} /> : null}
        {view === "credits" ? <CreditsView credits={credits} students={students} add={() => openCredit(null)} /> : null}
        {view === "agenda" && db ? <AgendaView client={db} timezone={identity.timezone} schedule={() => openSchedule(null)} openClass={goLive} notify={setToast} /> : null}
        {view === "live" ? <LiveClassView classes={classes} students={students} credits={credits} terms={catalog} library={teachingContents} relations={teachingRelations} assignments={teachingAssignments} selectedClassId={liveClassId} selectClass={setLiveClassId} refresh={refreshLive} notify={setToast} exit={() => goBack("home")} /> : null}
        {view === "teaching" ? <TeachingView contents={teachingContents} relations={teachingRelations} assignments={teachingAssignments} students={students} terms={catalog} refresh={loadTeaching} notify={setToast} /> : null}
        {view === "admin" && db && identity.can_admin ? <AdminView client={db} identity={identity} terms={catalog} notify={setToast} leave={() => { setExperienceState("teacher"); setView("home"); }} /> : null}
        {view === "marketing" && db ? <MarketingView db={db} contacts={crmContacts} rates={marketingRates} content={marketingContent} events={marketingEvents} campaigns={marketingCampaigns} metrics={campaignMetrics} recipients={communicationRecipients} refresh={refreshMarketing} notify={setToast} /> : null}
      </div></main>
      {!isLiveClassSessionActive ? <nav className="mobile-nav">{nav.map(([id, label, Icon]) => <button key={id} className={`${activeNav(id) ? "active" : ""} ${id === "live" ? "primary" : ""}`} onClick={() => navigateView(id)}><Icon /><span>{label}</span></button>)}</nav> : null}
    </div>
    {newOpen ? <AddStudent close={() => goBack(view)} created={created} /> : null}
    {scheduleOpen ? <ScheduleClass students={students} styles={styles} initialStudentId={scheduleStudentId} close={() => goBack(view)} saved={classSaved} /> : null}
    {creditOpen ? <AddCredit students={students} initialStudentId={creditStudentId} close={() => goBack(view)} saved={creditSaved} /> : null}
    {selected && db ? <StudentMasterDetail
      client={db}
      student={selected}
      terms={catalog}
      classes={classes}
      credits={credits}
      assignments={teachingAssignments}
      teachingContents={teachingContents}
      crmContact={crmContacts.find((contact) => contact.id === selected.id) ?? null}
      rates={marketingRates}
      refresh={async () => { await Promise.all([loadStudents(),loadMarketing()]); }}
      close={() => goBack(view)}
      schedule={() => openSchedule(selected.id)}
      addCredit={() => openCredit(selected.id)}
      openClass={(id) => goLive(id)}
    /> : null}{toast ? <div className="toast">{toast}</div> : null}
  </div>;
}

export default function CyaApp() {
  const [session, setSession] = useState<Session | null>(null), [checking, setChecking] = useState(true);
  const [connectionError, setConnectionError] = useState(""), [connectionAttempt, setConnectionAttempt] = useState(0);
  const [recoveringPassword,setRecoveringPassword] = useState(false);
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | null = null;
    connectDatabase().then(async (client) => {
      const authListener = client.auth.onAuthStateChange((event, value) => {
        if (!alive) return;
        if (event === "PASSWORD_RECOVERY") setRecoveringPassword(true);
        setSession(value); setChecking(false);
      });
      unsubscribe = () => authListener.data.subscription.unsubscribe();
      const { data } = await client.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      setChecking(false);
    }).catch((error) => {
      if (!alive) return;
      setConnectionError(error instanceof Error ? error.message : "CYA Hub no ha podido conectar con sus datos.");
      setChecking(false);
    });
    return () => { alive = false; unsubscribe?.(); };
  }, [connectionAttempt]);
  function retryConnection() {
    setChecking(true);
    setConnectionError("");
    setConnectionAttempt((value) => value + 1);
  }
  if (checking) return <Spinner />;
  if (connectionError) return <main className="login"><section className="login-card"><Brand /><h1>Estamos reconectando CYA Hub</h1><p>{connectionError}</p><button className="btn" onClick={retryConnection}>Reintentar <ArrowRight size={18} /></button><div className="privacy"><LockKeyhole size={15} /> Tus datos permanecen protegidos.</div></section></main>;
  if (recoveringPassword && session) return <PasswordRecovery done={() => setRecoveringPassword(false)} />;
  if (!session) return <Login />;
  return <StaffApp session={session} />;
}
