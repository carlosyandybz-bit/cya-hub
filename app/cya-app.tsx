"use client";

import {
  Archive, ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronRight, CircleUserRound,
  Clock3, Dumbbell, ExternalLink, Eye, EyeOff, FolderOpen, GitBranch, GraduationCap, House,
  Image as ImageIcon, LibraryBig, Link2, LockKeyhole, LogOut, Megaphone, NotebookPen,
  Pencil, Play, Plus, Search, Sparkles, TrendingUp, UsersRound, Video,
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
import { ContextSelector } from "./context-selector";
import { HomeView } from "./home-view";
import { StudentMasterDetail } from "./student-detail";
import { TeachingContentCard } from "./teaching-content-card";
import type { ExperienceContext, IdentityContext } from "./v14-types";

const TeachingGraph = lazy(() => import("./teaching-graph").then((module) => ({ default: module.TeachingGraph })));

type View = "home" | "students" | "classes" | "credits" | "agenda" | "live" | "teaching" | "marketing" | "admin";
type Person = {
  id: number; auth_user_id: string | null; display_name: string; first_name: string | null;
  last_name: string | null; email: string | null; phone: string | null; country_code: string | null;
  crm_stage: string; active: boolean;
};
type CatalogTerm = { id: number; label: string; term_key: string; taxonomy: string; metadata: Record<string, unknown>; sort_order: number };
type ClassParticipant = {
  person_id: number; attendance_status: "planned" | "present" | "absent"; billing_grant_id: number | null;
  role_term_id: number | null; level_term_id: number | null;
};
type ClassItem = {
  id: number; class_type: "individual" | "pair"; status: string; scheduled_start_at: string;
  duration_minutes: number; notes: string | null; style_term_id: number | null; location_term_id: number | null;
  started_at: string | null; administrative_finished_at: string | null; pedagogy_closed_at: string | null;
  class_participants: ClassParticipant[];
};
type CreditItem = {
  id: number; modality: "individual" | "pair"; label: string | null; total_minutes: number;
  price_cents: number; payment_status: string; status: string; purchased_at: string;
  credit_grant_members: Array<{ person_id: number }>; credit_movements: Array<{ delta_minutes: number }>;
};
type ClassNote = { id: number; class_id: number; person_id: number | null; body: string; created_at: string };
type StudentEvaluation = { id: number; person_id: number; class_id: number | null; aptitude_term_id: number; score: number; evaluation_kind: string; created_at: string };
type TeachingContentSummary = {
  id: number; title: string; content_type: string; measurement_mode: "frequency" | "importance" | "both" | "none";
  description: string | null; correction_guidance: string | null;
};
type TeachingContent = TeachingContentSummary & {
  completion_status: "incomplete" | "complete"; publication_status: "draft" | "published" | "archived";
  visibility: "staff" | "student"; category_term_id: number | null; active: boolean; published_at: string | null; updated_at: string;
  teaching_content_styles: Array<{ style_term_id: number }>;
  teaching_content_roles: Array<{ role_term_id: number }>;
  teaching_content_levels: Array<{ level_term_id: number }>;
  teaching_content_tags: Array<{ tag: string }>;
  teaching_content_media: Array<{ id: number; media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;
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
  classes: Array<{
    id: number; class_type: "individual" | "pair"; status: string; scheduled_start_at: string;
    duration_minutes: number; style: string | null; attendance_status: string; role: string | null; level: string | null;
  }>;
  credits: Array<{
    id: number; label: string | null; modality: "individual" | "pair"; total_minutes: number;
    balance_minutes: number; status: string; purchased_at: string; expires_at: string | null;
  }>;
  assignments: Array<{
    id: number; content_id: number; title: string; content_type: string; description: string | null;
    correction_guidance: string | null; assignment_status: string; current_frequency: number | null;
    current_importance: number | null; updated_at: string;
    media: Array<{ media_type: "video" | "image"; provider: string; external_file_id: string; title: string | null }>;
  }>;
  evaluations: Array<{ id: number; class_id: number | null; score: number; aptitude: string; created_at: string }>;
};
type DriveMediaInput = { media_type: "image" | "video"; external_file_id: string; title: string | null };

const DRIVE_TEACHING_FOLDER_URL = "https://drive.google.com/drive/folders/12IT2BihTvmqHUz7zQKuShd6ddSV-6fpO";
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

function roleLabel(role: string) {
  return ({ admin: "Administrador", teacher_admin: "Profesor administrador", teacher: "Profesor", student: "Alumno" } as Record<string, string>)[role] ?? role;
}

function authError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("invalid login credentials")) return "El email o la contraseña no son correctos.";
  if (value.includes("email not confirmed")) return "Confirma primero tu email para entrar.";
  if (value.includes("too many requests")) return "Demasiados intentos seguidos. Espera un momento y vuelve a probar.";
  return message || "No se ha podido iniciar sesión.";
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

function classToOpen(classes: ClassItem[]) {
  const active = classes.find((item) => item.status === "active");
  if (active) return active;
  const pendingClose = classes.find((item) => item.status === "finished" && !item.pedagogy_closed_at);
  if (pendingClose) return pendingClose;
  const scheduled = classes.filter((item) => item.status === "scheduled").sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  const past = scheduled.filter((item) => new Date(item.scheduled_start_at).getTime() <= Date.now());
  return past.at(-1) ?? scheduled[0] ?? null;
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
          <span className="avatar"><CircleUserRound /></span><span className="student-main"><strong>{student.display_name}</strong><span>{student.phone || student.email || "Sin datos de contacto"}</span></span>
          <span className={`badge ${student.auth_user_id ? "portal" : ""}`}>{student.auth_user_id ? "Con portal" : "Provisional"}</span>
        </button>
        <span className="student-row-actions"><button className="btn ghost" onClick={() => schedule(student)}><CalendarDays size={16} /> Programar</button><button className="btn ghost" onClick={() => credit(student)}><WalletCards size={16} /> Bono</button></span>
      </article>)}</div>
      : <div className="empty"><UsersRound /><strong>{students.length ? "No hay coincidencias" : "Aún no hay alumnos"}</strong><p>{students.length ? "Prueba con otro nombre, teléfono o email." : "Añade el primero. No necesita registrarse para que puedas trabajar con su ficha."}</p>{!students.length ? <button className="btn" onClick={add}><Plus size={18} /> Añadir alumno</button> : null}</div>}
  </>;
}

function minutesLabel(value: number) {
  const hours = Math.floor(Math.abs(value) / 60), minutes = Math.abs(value) % 60;
  return [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ") || "0 min";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function namesFor(ids: number[], students: Person[]) {
  return ids.map((id) => students.find((student) => student.id === id)?.display_name || "Alumno").join(" + ");
}

function ClassesView({ classes, students, schedule, goLive }: { classes: ClassItem[]; students: Person[]; schedule: () => void; goLive: (id: number) => void }) {
  return <>
    <Header eyebrow="Agenda" title="Clases" description="Cada clase se identifica por alumno y fecha; la numeración interna queda fuera de la interfaz." action={<button className="btn" onClick={schedule}><Plus size={18} /> Programar</button>} />
    {!students.length ? <div className="empty"><UsersRound /><strong>Primero necesitas un alumno</strong><p>En cuanto añadas un alumno podrás programar su primera clase.</p></div>
    : !classes.length ? <div className="empty"><CalendarDays /><strong>Agenda vacía</strong><p>Programa la primera clase. Puede ser individual o en pareja.</p><button className="btn" onClick={schedule}><Plus size={18} /> Programar clase</button></div>
    : <div className="agenda-list">{classes.map((item) => <article className="agenda-row" key={item.id}>
        <span className="agenda-icon"><CalendarDays /></span><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span></div>
        <span className="agenda-actions"><span className={`badge ${item.status === "active" ? "portal" : ""}`}>{item.status === "scheduled" ? "Programada" : item.status === "active" ? "En clase" : item.status === "finished" ? (item.pedagogy_closed_at ? "Cerrada" : "Por cerrar") : "Cancelada"}</span>{item.status === "scheduled" || item.status === "active" || (item.status === "finished" && !item.pedagogy_closed_at) ? <button className="btn class-go" onClick={() => goLive(item.id)}><Play size={16} /> {item.status === "scheduled" ? "Dar clase" : "Abrir"}</button> : null}</span>
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
  ["pending", "Pendiente"], ["in_correction", "En corrección"], ["corrected", "Corregida"],
] as const;

function correctionStateLabel(value: string) {
  return correctionStates.find(([key]) => key === value)?.[1] ?? value;
}

function assignmentOptions(contentType: string) {
  if (contentType === "correction") return correctionStates;
  if (contentType === "explanation") return [["pending","Pendiente"],["explained","Explicada"]] as const;
  return [["pending","Pendiente"],["practicing","Practicando"],["completed","Completado"]] as const;
}

function linkedTermLabels(ids: number[], terms: CatalogTerm[]) {
  return ids.map((id) => terms.find((term) => term.id === id)?.label).filter(Boolean).join(" · ");
}

function driveId(value: string) {
  const trimmed = value.trim();
  const pathMatch = trimmed.match(/\/d\/([^/?#]+)/), queryMatch = trimmed.match(/[?&]id=([^&#]+)/);
  return decodeURIComponent(pathMatch?.[1] ?? queryMatch?.[1] ?? trimmed);
}

function driveFileUrl(fileId: string) {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}

function teachingMediaFrom(form: FormData): DriveMediaInput[] {
  const references = form.getAll("media_reference").map((value) => String(value).trim());
  const types = form.getAll("media_type").map((value) => String(value));
  const titles = form.getAll("media_title").map((value) => String(value).trim());
  return references.flatMap((reference, index) => reference ? [{
    media_type: types[index] === "image" ? "image" as const : "video" as const,
    external_file_id: driveId(reference), title: titles[index] || null,
  }] : []);
}

function TeachingMediaFields({ existing = [] }: { existing?: TeachingContent["teaching_content_media"] }) {
  const [rows, setRows] = useState([0]);
  return <details className="progressive-fields drive-fields"><summary>Añadir fotos o vídeos desde Drive</summary><div className="drive-fields-body">
    <div className="drive-folder-row"><div><strong>Carpeta de Enseñanza</strong><span>Los archivos continúan privados en vuestro Drive.</span></div><a className="btn ghost" href={DRIVE_TEACHING_FOLDER_URL} target="_blank" rel="noreferrer"><FolderOpen /> Abrir Drive</a></div>
    {existing.length ? <div className="existing-media"><span>Ya añadidos</span><div>{existing.map((media) => <a key={media.id} href={driveFileUrl(media.external_file_id)} target="_blank" rel="noreferrer">{media.media_type === "video" ? <Video /> : <ImageIcon />}<span>{media.title || (media.media_type === "video" ? "Vídeo" : "Foto")}</span><ExternalLink /></a>)}</div></div> : null}
    <div className="drive-media-rows">{rows.map((row, index) => <div className="drive-media-row" key={row}><label className="field"><span>Tipo</span><select name="media_type" defaultValue="video"><option value="video">Vídeo</option><option value="image">Foto</option></select></label><label className="field"><span>Nombre</span><input name="media_title" placeholder="Opcional" /></label><label className="field drive-reference"><span>Enlace o ID de Drive</span><input name="media_reference" placeholder="Pega el enlace del archivo" /></label>{rows.length > 1 ? <button type="button" className="icon-btn drive-remove" onClick={() => setRows((current) => current.filter((value) => value !== row))} aria-label={`Quitar archivo ${index + 1}`}><X /></button> : null}</div>)}</div>
    <button type="button" className="text-button add-media-row" onClick={() => setRows((current) => [...current, Math.max(...current) + 1])}><Plus /> Añadir otro archivo</button>
  </div></details>;
}

function contentFitsContext(content: TeachingContent, styleId: number | null, roleId: number | null, levelId: number | null) {
  if (!styleId || !roleId || !levelId) return false;
  return content.teaching_content_styles.some((link) => link.style_term_id === styleId)
    && content.teaching_content_roles.some((link) => link.role_term_id === roleId)
    && content.teaching_content_levels.some((link) => link.level_term_id === levelId);
}

function assignmentIsDone(assignment: ContentAssignment) {
  return ["corrected","explained","completed"].includes(assignment.assignment_status);
}

function creditBalance(grant: CreditItem) {
  return grant.credit_movements.reduce((sum, movement) => sum + Number(movement.delta_minutes || 0), 0);
}

function ManualStartClass({ students, styles, close, started }: { students: Person[]; styles: CatalogTerm[]; close: () => void; started: (id: number) => Promise<void> }) {
  const [type, setType] = useState<"individual" | "pair">("individual"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [initialDate] = useState(() => localDateTime(new Date()));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const form = new FormData(event.currentTarget), first = Number(form.get("student_1")), second = Number(form.get("student_2") || 0);
    const duration = Number(form.get("hours") || 0) * 60 + Number(form.get("minutes") || 0), scheduled = String(form.get("scheduled_at") || ""), style = Number(form.get("style_term_id") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (!scheduled || duration <= 0 || !style) return setError("Indica fecha, hora, duración y estilo.");
    setBusy(true); setError("");
    const result = await db.rpc("start_manual_class", {
      p_class_type: type, p_student_ids: type === "pair" ? [first, second] : [first], p_scheduled_start_at: new Date(scheduled).toISOString(),
      p_duration_minutes: duration, p_style_term_id: style, p_location_term_id: null, p_notes: String(form.get("notes") || "").trim() || null,
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    const id = Number((result.data as { id?: number } | null)?.id || 0);
    if (id) await started(id);
    setBusy(false); close();
  }
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><h2>Empezar clase ahora</h2><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}>
      <p className="modal-intro">Para una clase que no estaba en agenda. Queda registrada igual que una programada.</p>
      <div className="segmented"><button type="button" className={type === "individual" ? "active" : ""} onClick={() => setType("individual")}>Individual</button><button type="button" className={type === "pair" ? "active" : ""} onClick={() => setType("pair")}>Pareja</button></div>
      <div className="fields-2">
        <label className="field"><span>Alumno *</span><select name="student_1" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
        {type === "pair" ? <label className="field"><span>Segundo alumno *</span><select name="student_2" required defaultValue=""><option value="" disabled>Seleccionar</option>{students.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label> : null}
        <label className="field field-wide"><span>Fecha y hora *</span><input name="scheduled_at" type="datetime-local" required defaultValue={initialDate} /></label>
        <label className="field"><span>Horas</span><input name="hours" type="number" min="0" max="8" defaultValue="1" /></label><label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>
        <label className="field field-wide"><span>Estilo *</span><select name="style_term_id" required defaultValue=""><option value="" disabled>Seleccionar estilo</option>{styles.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}</select></label>
        <label className="field field-wide"><span>Notas</span><input name="notes" placeholder="Opcional" /></label>
      </div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><Play size={17} /> {busy ? "Abriendo…" : "Empezar clase"}</button></div>
    </form>
  </section></div>;
}

function FinishClassModal({ item, students, credits, close, finished }: { item: ClassItem; students: Person[]; credits: CreditItem[]; close: () => void; finished: () => Promise<void> }) {
  const [attendance, setAttendance] = useState<Record<number, "present" | "absent">>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, "present"])) as Record<number, "present" | "absent">);
  const [grantIds, setGrantIds] = useState<Record<number, string>>(() => Object.fromEntries(item.class_participants.map((p) => [p.person_id, p.billing_grant_id ? String(p.billing_grant_id) : ""])));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  function eligibleCredits(personId: number) {
    return credits.filter((grant) => grant.status === "active" && grant.credit_grant_members.some((member) => member.person_id === personId) && creditBalance(grant) >= item.duration_minutes);
  }
  function chooseGrant(personId: number, value: string) {
    setGrantIds((current) => {
      const next = { ...current, [personId]: value }, grant = credits.find((item) => String(item.id) === value);
      if (grant?.modality === "pair") item.class_participants.forEach((participant) => { if (grant.credit_grant_members.some((member) => member.person_id === participant.person_id)) next[participant.person_id] = value; });
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!db) return;
    const personIds = item.class_participants.map((participant) => participant.person_id);
    setBusy(true); setError("");
    const result = await db.rpc("administratively_finish_class", {
      p_class_id: item.id, p_person_ids: personIds, p_attendance: personIds.map((id) => attendance[id]),
      p_grant_ids: personIds.map((id) => attendance[id] === "present" && grantIds[id] ? Number(grantIds[id]) : null),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
    await finished(); setBusy(false); close();
  }
  return <div className="backdrop"><section className="modal finish-modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Parte administrativa</p><h2>Terminar clase</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <form className="modal-body" onSubmit={submit}><p className="modal-intro">Confirma asistencia y qué bono se consume. “Sin bono” deja la clase pendiente de regularizar.</p>
      <div className="finish-list">{item.class_participants.map((participant) => {
        const student = students.find((person) => person.id === participant.person_id), available = eligibleCredits(participant.person_id);
        return <section className="finish-person" key={participant.person_id}><strong>{student?.display_name || "Alumno"}</strong><div className="finish-grid">
          <label className="field"><span>Asistencia</span><select value={attendance[participant.person_id]} onChange={(e) => { const value = e.target.value as "present" | "absent"; setAttendance((current) => ({ ...current, [participant.person_id]: value })); if (value === "absent") setGrantIds((current) => ({ ...current, [participant.person_id]: "" })); }}><option value="present">Ha venido</option><option value="absent">No ha venido</option></select></label>
          <label className="field"><span>Bono</span><select value={grantIds[participant.person_id] || ""} disabled={attendance[participant.person_id] === "absent"} onChange={(e) => chooseGrant(participant.person_id, e.target.value)}><option value="">Sin bono · pendiente</option>{available.map((grant) => <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono pareja" : "Bono individual")} · {minutesLabel(creditBalance(grant))}</option>)}</select></label>
        </div></section>;
      })}</div>
      {error ? <p className="error">{error}</p> : null}<div className="actions"><button className="btn ghost" type="button" onClick={close}>Seguir en clase</button><button className="btn" disabled={busy}><CheckCircle2 size={17} /> {busy ? "Terminando…" : "Terminar clase"}</button></div>
    </form>
  </section></div>;
}

function LiveSession({ item, students, credits, terms, library, relations, refresh, notify, exit }: { item: ClassItem; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {
  const firstParticipant = item.class_participants[0], firstPerson = firstParticipant?.person_id || 0;
  const [activePersonId, setActivePersonId] = useState(firstPerson), [notes, setNotes] = useState<ClassNote[]>([]), [evaluations, setEvaluations] = useState<StudentEvaluation[]>([]), [assignments, setAssignments] = useState<ContentAssignment[]>([]);
  const [search, setSearch] = useState(""), [searchKind, setSearchKind] = useState<"all" | "correction" | "explanation" | "exercise" | "sequence">("all"), [showAll, setShowAll] = useState(false), [noteText, setNoteText] = useState(""), [newCorrection, setNewCorrection] = useState("");
  const [quickType, setQuickType] = useState<"correction" | "explanation" | "exercise" | "sequence">("correction"), [quickTitle, setQuickTitle] = useState("");
  const [measurementMode, setMeasurementMode] = useState<"frequency" | "importance" | "both" | "none">("both"), [frequency, setFrequency] = useState(50), [importance, setImportance] = useState(50);
  const [contextRole, setContextRole] = useState(() => firstParticipant?.role_term_id ? String(firstParticipant.role_term_id) : ""), [contextLevel, setContextLevel] = useState(() => firstParticipant?.level_term_id ? String(firstParticipant.level_term_id) : ""), [busy, setBusy] = useState(""), [syncError, setSyncError] = useState(""), [finishOpen, setFinishOpen] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const personKey = item.class_participants.map((p) => p.person_id).sort((a, b) => a - b).join(",");
  const loadLive = useCallback(async () => {
    if (!db || !personKey) return;
    const ids = personKey.split(",").map(Number);
    const [noteResult, evaluationResult, assignmentResult] = await Promise.all([
      db.from("class_notes").select("id,class_id,person_id,body,created_at").eq("class_id", item.id).order("created_at", { ascending: false }),
      db.from("student_evaluations").select("id,person_id,class_id,aptitude_term_id,score,evaluation_kind,created_at").eq("class_id", item.id),
      db.from("student_content_assignments").select("id,person_id,content_id,assignment_status,current_frequency,current_importance,snapshot_style_term_id,snapshot_role_term_id,snapshot_level_term_id,snapshot_measurement_mode,updated_at,teaching_contents!inner(id,title,content_type,measurement_mode,description,correction_guidance)").in("person_id", ids).order("updated_at", { ascending: false }),
    ]);
    const error = noteResult.error || evaluationResult.error || assignmentResult.error;
    if (error) { setSyncError(error.message); return; }
    setSyncError(""); setNotes((noteResult.data ?? []) as ClassNote[]); setEvaluations((evaluationResult.data ?? []) as StudentEvaluation[]); setAssignments((assignmentResult.data ?? []) as unknown as ContentAssignment[]);
  }, [item.id, personKey]);
  useEffect(() => { const initial = window.setTimeout(() => void loadLive(), 0), timer = window.setInterval(() => { void loadLive(); void refresh(); }, 4000); return () => { clearTimeout(initial); clearInterval(timer); }; }, [loadLive, refresh]);
  useEffect(() => { if (item.status !== "active") return; const timer = window.setInterval(() => setClockNow(Date.now()), 1000); return () => clearInterval(timer); }, [item.status]);
  const participant = item.class_participants.find((p) => p.person_id === activePersonId) ?? item.class_participants[0], student = students.find((person) => person.id === activePersonId);
  const roles = terms.filter((term) => term.taxonomy === "dance_role"), levels = terms.filter((term) => term.taxonomy === "dance_level"), style = terms.find((term) => term.id === item.style_term_id), levelTerm = terms.find((term) => term.id === participant?.level_term_id);
  const aptitudes = terms.filter((term) => term.taxonomy === "aptitude" && Array.isArray(term.metadata.levels) && (term.metadata.levels as unknown[]).includes(levelTerm?.term_key ?? ""));
  const scale = terms.filter((term) => term.taxonomy === "evaluation_scale").map((term) => ({ term, score: Number(term.metadata.score) })).sort((a, b) => a.score - b.score);
  const personAssignments = assignments.filter((assignment) => assignment.person_id === activePersonId);
  const currentCorrections = personAssignments.filter((assignment) => assignment.teaching_contents.content_type === "correction").filter((assignment) => showAll || assignment.assignment_status !== "corrected");
  const contextReady = Boolean(participant?.role_term_id && participant?.level_term_id && item.style_term_id), personNotes = notes.filter((note) => note.person_id === activePersonId || note.person_id === null);
  const assignedContentIds = new Set(personAssignments.map((assignment) => assignment.content_id));
  const doneContentIds = new Set(personAssignments.filter(assignmentIsDone).map((assignment) => assignment.content_id));
  const compatibleLibrary = library.filter((content) => content.active && content.completion_status === "complete" && content.publication_status === "published")
    .filter((content) => contentFitsContext(content, item.style_term_id, participant?.role_term_id ?? null, participant?.level_term_id ?? null));
  const prerequisitesReady = (content: TeachingContent) => relations.filter((relation) => relation.source_content_id === content.id && relation.relation_type === "prerequisite").every((relation) => doneContentIds.has(relation.target_content_id));
  const guideCandidates = compatibleLibrary.filter((content) => ["explanation","sequence"].includes(content.content_type) && !assignedContentIds.has(content.id) && prerequisitesReady(content)).slice(0,4);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const matchesSearch = (content: TeachingContentSummary | TeachingContent) => !normalizedSearch || [content.title,content.description,content.correction_guidance,"teaching_content_tags" in content ? content.teaching_content_tags.map((tag) => tag.tag).join(" ") : ""].filter(Boolean).some((value) => String(value).toLocaleLowerCase("es").includes(normalizedSearch));
  const unifiedAssigned = personAssignments
    .filter((assignment) => searchKind === "all" || assignment.teaching_contents.content_type === searchKind)
    .filter((assignment) => matchesSearch(assignment.teaching_contents))
    .sort((a,b) => Number(assignmentIsDone(a)) - Number(assignmentIsDone(b)) || Number(b.teaching_contents.content_type === "correction") - Number(a.teaching_contents.content_type === "correction"));
  const unifiedLibrary = library
    .filter((content) => content.active && !assignedContentIds.has(content.id))
    .filter((content) => searchKind === "all" || content.content_type === searchKind)
    .filter(matchesSearch)
    .filter((content) => contentFitsContext(content,item.style_term_id,participant?.role_term_id ?? null,participant?.level_term_id ?? null))
    .sort((a,b) => Number(b.completion_status === "complete" && b.publication_status === "published") - Number(a.completion_status === "complete" && a.publication_status === "published"));
  function chooseParticipant(personId: number) {
    const next = item.class_participants.find((candidate) => candidate.person_id === personId);
    setActivePersonId(personId); setContextRole(next?.role_term_id ? String(next.role_term_id) : ""); setContextLevel(next?.level_term_id ? String(next.level_term_id) : "");
  }
  async function saveContext() {
    if (!db || !contextRole || !contextLevel || !participant) return;
    setBusy("context"); const result = await db.rpc("set_class_participant_context", { p_class_id: item.id, p_person_id: participant.person_id, p_role_term_id: Number(contextRole), p_level_term_id: Number(contextLevel) });
    if (result.error) notify(result.error.message); else { await refresh(); notify("Rol y nivel guardados."); } setBusy("");
  }
  async function saveNote() {
    if (!db || !noteText.trim() || !participant) return;
    setBusy("note"); const result = await db.rpc("add_class_note", { p_class_id: item.id, p_person_id: participant.person_id, p_body: noteText.trim() });
    if (result.error) notify(result.error.message); else { setNoteText(""); await loadLive(); } setBusy("");
  }
  async function saveEvaluation(aptitudeId: number, scoreValue: number) {
    if (!db || !participant || !contextReady) return;
    setBusy(`eval-${aptitudeId}`); const result = await db.rpc("save_class_evaluation", { p_class_id: item.id, p_person_id: participant.person_id, p_aptitude_term_id: aptitudeId, p_score: scoreValue });
    if (result.error) notify(result.error.message); else await loadLive(); setBusy("");
  }
  async function createCorrection() {
    if (!db || !participant || !newCorrection.trim() || !contextReady) return;
    setBusy("correction"); const result = await db.rpc("create_class_correction", {
      p_class_id: item.id, p_person_id: participant.person_id, p_title: newCorrection.trim(), p_measurement_mode: measurementMode,
      p_frequency: measurementMode === "frequency" || measurementMode === "both" ? frequency : null,
      p_importance: measurementMode === "importance" || measurementMode === "both" ? importance : null,
    });
    if (result.error) notify(result.error.message); else { setNewCorrection(""); await loadLive(); notify("Corrección añadida."); } setBusy("");
  }
  async function createQuickContent() {
    if (!db || !participant || !quickTitle.trim() || !contextReady || !item.style_term_id || !participant.role_term_id || !participant.level_term_id) return;
    setBusy("quick-create");
    if (quickType === "correction") {
      const result = await db.rpc("create_class_correction", {
        p_class_id: item.id,
        p_person_id: participant.person_id,
        p_title: quickTitle.trim(),
        p_measurement_mode: "both",
        p_frequency: 50,
        p_importance: 50,
      });
      if (result.error) notify(result.error.message);
      else { setQuickTitle(""); await loadLive(); await refresh(); notify("Corrección rápida añadida al alumno."); }
      setBusy("");
      return;
    }
    const result = await db.rpc("save_teaching_content_with_media", {
      p_content_id: null,
      p_content_type: quickType,
      p_title: quickTitle.trim(),
      p_description: null,
      p_correction_guidance: null,
      p_completion_status: "incomplete",
      p_publication_status: "draft",
      p_visibility: "staff",
      p_measurement_mode: "none",
      p_category_term_id: null,
      p_style_term_ids: [item.style_term_id],
      p_role_term_ids: [participant.role_term_id],
      p_level_term_ids: [participant.level_term_id],
      p_tags: [],
      p_media: [],
    });
    if (result.error) notify(result.error.message);
    else { setQuickTitle(""); await refresh(); notify(`${teachingKindLabels[quickType]} guardada en Incompletas para terminar después.`); }
    setBusy("");
  }
  async function updateCorrection(assignment: ContentAssignment, changes: { status?: string; frequency?: number; importance?: number }) {
    if (!db) return; const mode = assignment.snapshot_measurement_mode;
    setBusy(`correction-${assignment.id}`); const result = await db.rpc("update_correction_assignment", {
      p_assignment_id: assignment.id, p_class_id: item.id, p_assignment_status: changes.status ?? assignment.assignment_status,
      p_frequency: mode === "frequency" || mode === "both" ? (changes.frequency ?? assignment.current_frequency ?? 0) : null,
      p_importance: mode === "importance" || mode === "both" ? (changes.importance ?? assignment.current_importance ?? 0) : null,
    });
    if (result.error) notify(result.error.message); else await loadLive(); setBusy("");
  }
  async function assignGuideContent(content: TeachingContent) {
    if (!db || !participant || !contextReady || !item.style_term_id || !participant.role_term_id || !participant.level_term_id) return;
    setBusy(`assign-${content.id}`);
    const result = await db.rpc("assign_teaching_content", {
      p_person_id: participant.person_id, p_content_id: content.id, p_style_term_id: item.style_term_id,
      p_role_term_id: participant.role_term_id, p_level_term_id: participant.level_term_id, p_source_class_id: item.id,
    });
    if (result.error) notify(result.error.message); else { await loadLive(); notify(`${teachingKindLabels[content.content_type]} añadida a la clase.`); }
    setBusy("");
  }
  async function updateGuideAssignment(assignment: ContentAssignment, status: string) {
    if (!db) return; setBusy(`guide-${assignment.id}`);
    const result = await db.rpc("update_teaching_assignment_status", { p_assignment_id: assignment.id, p_assignment_status: status });
    if (result.error) notify(result.error.message); else await loadLive(); setBusy("");
  }
  async function closePedagogy() {
    if (!db) return; setBusy("close"); const result = await db.rpc("close_class_pedagogy", { p_class_id: item.id });
    if (result.error) { notify(result.error.message); setBusy(""); return; }
    await refresh(); notify("Clase cerrada por completo."); setBusy(""); exit();
  }
  const names = namesFor(item.class_participants.map((p) => p.person_id), students), finished = item.status === "finished";
  const observationStart = new Date(item.started_at ?? item.scheduled_start_at).getTime();
  const observationRemaining = item.status === "active" ? Math.min(180, Math.max(0, 180 - Math.floor((clockNow - observationStart) / 1000))) : 0;
  const observationActive = item.status === "active" && observationRemaining > 0;
  const observationClock = `${Math.floor(observationRemaining / 60)}:${String(observationRemaining % 60).padStart(2, "0")}`;
  return <div className="live-overlay">
    <div className="live-sticky"><header className="live-top"><div className="live-title"><span className={`live-dot ${finished ? "done" : ""}`} /><div><span>{finished ? "ADMINISTRACIÓN TERMINADA" : "DANDO CLASE"}</span><strong>{names}</strong><small>{style?.label || "Sin estilo"} · {minutesLabel(item.duration_minutes)}</small></div></div><div className="live-actions">{finished ? <button className="btn" onClick={closePedagogy} disabled={busy === "close"}><CheckCircle2 size={17} /> {busy === "close" ? "Cerrando…" : "Cerrar clase"}</button> : <button className="btn" onClick={() => setFinishOpen(true)}><CheckCircle2 size={17} /> Terminar clase</button>}<button className="icon-btn live-exit" onClick={exit} aria-label="Salir del modo clase"><X /></button></div></header>
      <div className="live-search-area"><label className="live-search"><Search /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar correcciones, explicaciones, ejercicios o secuencias…" /></label><nav className="live-search-kinds" aria-label="Tipo de contenido">{([['all','Todo'],['correction','Correcciones'],['explanation','Explicaciones'],['exercise','Ejercicios'],['sequence','Secuencias']] as const).map(([value,label]) => <button key={value} className={searchKind === value ? "active" : ""} onClick={() => setSearchKind(value)}>{label}</button>)}</nav></div>
    </div>
    <main className="live-body">
      <section className="live-unified-search card">
        <details className="quick-content-create"><summary><Plus /> Crear rápido</summary><div><select value={quickType} onChange={(event) => setQuickType(event.target.value as typeof quickType)}><option value="correction">Corrección</option><option value="explanation">Explicación</option><option value="exercise">Ejercicio</option><option value="sequence">Secuencia</option></select><input value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="Título corto para no detener la clase" /><button className="btn" onClick={createQuickContent} disabled={!contextReady || !quickTitle.trim() || busy === "quick-create"}>{busy === "quick-create" ? "Guardando…" : "Guardar"}</button></div><small>{quickType === "correction" ? "Se añade al alumno con medición inicial 50/50." : "Queda en Incompletas, vinculada al contexto actual, para terminarla después."}</small></details>
        {normalizedSearch || searchKind !== "all" ? <div className="unified-results"><div className="unified-result-head"><strong>Resultados</strong><span>{unifiedAssigned.length + unifiedLibrary.length}</span></div>{unifiedAssigned.map((assignment) => <article className="unified-result assigned" key={`assigned-${assignment.id}`}><span className="content-kind">{teachingKindLabels[assignment.teaching_contents.content_type]}</span><div><strong>{assignment.teaching_contents.title}</strong><small>Ya está en la formación del alumno · {assignmentOptions(assignment.teaching_contents.content_type).find(([value]) => value === assignment.assignment_status)?.[1] ?? assignment.assignment_status}</small></div><CheckCircle2 /></article>)}{unifiedLibrary.slice(0,12).map((content) => { const ready = content.completion_status === "complete" && content.publication_status === "published"; return <article className="unified-result" key={`library-${content.id}`}><span className="content-kind">{teachingKindLabels[content.content_type]}</span><div><strong>{content.title}</strong><small>{ready ? "Biblioteca · compatible con esta clase" : "Incompleta · solo profesores"}</small></div>{ready ? <button className="btn" disabled={busy === `assign-${content.id}`} onClick={() => assignGuideContent(content)}><Plus /> Añadir</button> : <span className="badge">Completar después</span>}</article>; })}{!unifiedAssigned.length && !unifiedLibrary.length ? <div className="compact-empty"><Search /><span>No hay coincidencias. Puedes crear el contenido rápidamente.</span></div> : null}</div> : null}
      </section>
      <section className={`observation-phase ${observationActive ? "active" : "complete"}`} aria-live="polite"><span className="observation-icon"><Clock3 /></span><div><p className="eyebrow">Observación inicial</p><strong>{observationActive ? "Escucha, observa y captura lo importante" : "Primera observación completada"}</strong><span>{observationActive ? "Tienes tres minutos desde el inicio real de la clase. Usa las notas rápidas y convierte lo necesario en corrección." : "Continúa con correcciones, evaluación y la guía de hoy."}</span></div><time dateTime={`PT${observationRemaining}S`}>{observationActive ? observationClock : <CheckCircle2 />}</time></section>
      {item.class_participants.length > 1 ? <div className="participant-tabs">{item.class_participants.map((p) => <button key={p.person_id} className={activePersonId === p.person_id ? "active" : ""} onClick={() => chooseParticipant(p.person_id)}>{students.find((person) => person.id === p.person_id)?.display_name || "Alumno"}</button>)}</div> : null}
      <section className="student-context card"><div className="student-context-main"><span className="avatar"><CircleUserRound /></span><div><p className="eyebrow">Alumno</p><h2>{student?.display_name || "Alumno"}</h2><p>{student?.auth_user_id ? "Con acceso al portal" : "Provisional · trabaja igual que cualquier alumno"}</p></div></div><div className="context-controls"><label className="field"><span>Rol</span><select value={contextRole} onChange={(e) => setContextRole(e.target.value)}><option value="">Seleccionar</option>{roles.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><label className="field"><span>Nivel</span><select value={contextLevel} onChange={(e) => setContextLevel(e.target.value)}><option value="">Seleccionar</option>{levels.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label><button className="btn context-save" onClick={saveContext} disabled={!contextRole || !contextLevel || busy === "context"}>{busy === "context" ? "Guardando…" : "Guardar contexto"}</button></div></section>
      {!contextReady ? <p className="live-hint">Indica rol y nivel una sola vez. A partir de ahí CYA puede relacionar evaluación y correcciones con el contexto correcto.</p> : null}
      {syncError ? <p className="error">{syncError}</p> : null}
      <section className="live-grid">
        <article className="card live-card corrections-card"><div className="live-card-head"><div><p className="eyebrow">Trabajo activo</p><h2>Correcciones</h2></div><button className="text-button" onClick={() => setShowAll(!showAll)}>{showAll ? "Solo activas" : "Ver todas"}</button></div>
          <details className="new-correction"><summary><Plus size={18} /> Nueva corrección</summary><div className="new-correction-body"><label className="field"><span>Qué has visto</span><input value={newCorrection} onChange={(e) => setNewCorrection(e.target.value)} placeholder="Escribe el fallo en una frase…" /></label><div className="correction-new-grid"><label className="field"><span>Medir por</span><select value={measurementMode} onChange={(e) => setMeasurementMode(e.target.value as typeof measurementMode)}><option value="both">Frecuencia + importancia</option><option value="frequency">Frecuencia</option><option value="importance">Importancia</option><option value="none">Sin medición</option></select></label>{measurementMode === "frequency" || measurementMode === "both" ? <label className="field"><span>Frecuencia</span><select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}{measurementMode === "importance" || measurementMode === "both" ? <label className="field"><span>Importancia</span><select value={importance} onChange={(e) => setImportance(Number(e.target.value))}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}</div><button className="btn" onClick={createCorrection} disabled={!contextReady || !newCorrection.trim() || busy === "correction"}>{busy === "correction" ? "Añadiendo…" : "Añadir corrección"}</button></div></details>
          <div className="correction-list">{currentCorrections.length ? currentCorrections.map((assignment) => { const libraryContent = library.find((content) => content.id === assignment.content_id); return <TeachingContentCard
            key={assignment.id}
            kindLabel="Corrección"
            title={assignment.teaching_contents.title}
            subtitle={`${correctionStateLabel(assignment.assignment_status)}${assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}${assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}`}
            statusLabel={correctionStateLabel(assignment.assignment_status)}
            statusTone={assignment.assignment_status === "corrected" ? "success" : "default"}
            description={assignment.teaching_contents.description}
            correctionGuidance={assignment.teaching_contents.correction_guidance}
            media={libraryContent?.teaching_content_media ?? []}
          >
            <div className="correction-detail"><label className="field"><span>Estado</span><select value={assignment.assignment_status} disabled={busy === `correction-${assignment.id}`} onChange={(e) => updateCorrection(assignment, { status: e.target.value })}>{correctionStates.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{assignment.snapshot_measurement_mode === "frequency" || assignment.snapshot_measurement_mode === "both" ? <label className="field"><span>Frecuencia</span><select value={assignment.current_frequency ?? 0} onChange={(e) => updateCorrection(assignment, { frequency: Number(e.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}{assignment.snapshot_measurement_mode === "importance" || assignment.snapshot_measurement_mode === "both" ? <label className="field"><span>Importancia</span><select value={assignment.current_importance ?? 0} onChange={(e) => updateCorrection(assignment, { importance: Number(e.target.value) })}>{[0,25,50,75,100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : null}</div>
          </TeachingContentCard>; }) : <div className="compact-empty"><CheckCircle2 /><span>{personAssignments.some((assignment) => assignment.teaching_contents.content_type === "correction") && !showAll ? "No quedan correcciones activas." : "Todavía no hay correcciones para este alumno."}</span></div>}</div>
        </article>
        <article className="card live-card"><div className="live-card-head"><div><p className="eyebrow">Guardado inmediato</p><h2>Evaluación</h2></div><span className="badge">0–100</span></div>
          {!contextReady ? <div className="compact-empty"><CircleUserRound /><span>Guarda primero rol y nivel.</span></div> : <div className="evaluation-list">{aptitudes.map((aptitude) => { const current = evaluations.find((evaluation) => evaluation.person_id === activePersonId && evaluation.aptitude_term_id === aptitude.id); return <div className="evaluation-row" key={aptitude.id}><div><strong>{aptitude.label}</strong><span>{current ? `${current.score}/100` : "Sin evaluar"}</span></div><div className="score-grid">{scale.map(({ term, score }) => <button key={term.id} className={current?.score === score ? "selected" : ""} title={term.label} aria-label={`${aptitude.label}: ${term.label} (${score})`} disabled={busy === `eval-${aptitude.id}`} onClick={() => saveEvaluation(aptitude.id, score)}>{score}</button>)}</div></div>; })}</div>}
        </article>
        <article className="card live-card notes-card"><div className="live-card-head"><div><p className="eyebrow">Sin perder la canción</p><h2>Notas rápidas</h2></div><NotebookPen /></div><div className="quick-note"><textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Apunta lo que ves ahora…" rows={3} /><button className="btn" onClick={saveNote} disabled={!noteText.trim() || busy === "note"}>{busy === "note" ? "Guardando…" : "Guardar nota"}</button></div>{personNotes.length ? <div className="note-list">{personNotes.slice(0,4).map((note) => <div key={note.id}><span>{new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(note.created_at))}</span><p>{note.body}</p></div>)}</div> : null}</article>
      </section>
      <article className="card live-guide">
        <div className="live-card-head"><div><p className="eyebrow">Guía de hoy</p><h2>Qué trabajar ahora</h2></div><LibraryBig /></div>
        {!contextReady ? <div className="compact-empty"><CircleUserRound /><span>Guarda rol y nivel para activar la guía.</span></div> : <>
          <div className="guide-active">
            {personAssignments.filter((assignment) => assignment.teaching_contents.content_type !== "correction").length ? personAssignments.filter((assignment) => assignment.teaching_contents.content_type !== "correction").map((assignment) => { const libraryContent = library.find((content) => content.id === assignment.content_id); return <TeachingContentCard
              key={assignment.id}
              kindLabel={teachingKindLabels[assignment.teaching_contents.content_type]}
              title={assignment.teaching_contents.title}
              description={assignment.teaching_contents.description}
              correctionGuidance={assignment.teaching_contents.correction_guidance}
              media={libraryContent?.teaching_content_media ?? []}
              actions={<select value={assignment.assignment_status} disabled={busy === `guide-${assignment.id}`} onChange={(e) => updateGuideAssignment(assignment,e.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>}
            />; }) : <div className="guide-empty">Aún no has añadido explicaciones, ejercicios o secuencias a esta clase.</div>}
          </div>
          {guideCandidates.length ? <section className="guide-suggestions"><span className="guide-label">Siguiente contenido disponible</span><div>{guideCandidates.map((content) => <button key={content.id} onClick={() => assignGuideContent(content)} disabled={busy === `assign-${content.id}`}><span>{teachingKindLabels[content.content_type]}</span><strong>{content.title}</strong><Plus /></button>)}</div></section> : null}
        </>}
      </article>
      <section className={`live-bottom ${finished ? "finished" : ""}`}><div><strong>{finished ? "Parte administrativa lista" : "Cuando acabéis de bailar…"}</strong><span>{finished ? "Puedes terminar notas, evaluación y correcciones antes del cierre pedagógico." : "Asistencia y bono se confirman juntos para no dejar medias operaciones."}</span></div>{finished ? <button className="btn" onClick={closePedagogy} disabled={busy === "close"}><CheckCircle2 size={18} /> Cerrar clase</button> : <button className="btn" onClick={() => setFinishOpen(true)}>Terminar clase</button>}</section>
    </main>
    {finishOpen ? <FinishClassModal item={item} students={students} credits={credits} close={() => setFinishOpen(false)} finished={async () => { await refresh(); await loadLive(); notify("Clase terminada. El saldo ya está actualizado."); }} /> : null}
  </div>;
}

function LiveClassView({ classes, students, credits, terms, library, relations, selectedClassId, selectClass, refresh, notify, exit }: { classes: ClassItem[]; students: Person[]; credits: CreditItem[]; terms: CatalogTerm[]; library: TeachingContent[]; relations: TeachingRelation[]; selectedClassId: number | null; selectClass: (id: number | null) => void; refresh: () => Promise<void>; notify: (message: string) => void; exit: () => void }) {
  const [manualOpen, setManualOpen] = useState(false), [busyId, setBusyId] = useState<number | null>(null), [error, setError] = useState("");
  const styles = terms.filter((term) => term.taxonomy === "dance_style"), selected = selectedClassId ? classes.find((item) => item.id === selectedClassId) : null, candidate = selected && !(selected.status === "finished" && selected.pedagogy_closed_at) && selected.status !== "cancelled" ? selected : classToOpen(classes);
  if (candidate && (candidate.status === "active" || (candidate.status === "finished" && !candidate.pedagogy_closed_at))) return <LiveSession key={candidate.id} item={candidate} students={students} credits={credits} terms={terms} library={library} relations={relations} refresh={refresh} notify={notify} exit={exit} />;
  const scheduled = classes.filter((item) => item.status === "scheduled").sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  async function start(item: ClassItem) {
    if (!db) return; setBusyId(item.id); setError(""); const result = await db.rpc("start_class", { p_class_id: item.id });
    if (result.error) { setError(result.error.message); setBusyId(null); return; }
    selectClass(item.id); await refresh(); setBusyId(null); notify("Clase iniciada.");
  }
  return <><Header eyebrow="Modo clase" title="Dar clase" description="Abre la clase que toca o empieza una manual. Al entrar desaparece el resto del menú para que solo quede lo útil." />
    {!students.length ? <div className="empty"><UsersRound /><strong>Necesitas al menos un alumno</strong><p>Los provisionales también pueden dar clase con todas las funciones.</p></div> : <>
      {candidate?.status === "scheduled" ? <section className="card live-next"><div><p className="eyebrow">Clase seleccionada</p><h2>{namesFor(candidate.class_participants.map((p) => p.person_id), students)}</h2><p>{dateLabel(candidate.scheduled_start_at)} · {minutesLabel(candidate.duration_minutes)} · {styles.find((term) => term.id === candidate.style_term_id)?.label || "Estilo pendiente"}</p></div><button className="btn live-start" onClick={() => start(candidate)} disabled={busyId === candidate.id}><Play size={19} /> {busyId === candidate.id ? "Abriendo…" : "Empezar clase"}</button></section> : <div className="empty live-empty"><GraduationCap /><strong>No hay ninguna clase pendiente</strong><p>Puedes empezar una ahora aunque no estuviera programada.</p><button className="btn" onClick={() => setManualOpen(true)}><Play size={18} /> Empezar sin programar</button></div>}
      {scheduled.length > 1 ? <section className="live-agenda"><div className="card-head"><h2>Otras clases programadas</h2></div>{scheduled.filter((item) => item.id !== candidate?.id).map((item) => <button key={item.id} className="live-agenda-row" onClick={() => selectClass(item.id)}><div><strong>{namesFor(item.class_participants.map((p) => p.person_id), students)}</strong><span>{dateLabel(item.scheduled_start_at)}</span></div><ChevronRight /></button>)}</section> : null}
      {candidate?.status === "scheduled" ? <button className="text-button manual-link" onClick={() => setManualOpen(true)}>¿No estaba programada? Empezar otra clase ahora</button> : null}
      {error ? <p className="error live-error">{error}</p> : null}
    </>}
    {manualOpen ? <ManualStartClass students={students} styles={styles} close={() => setManualOpen(false)} started={async (id) => { selectClass(id); await refresh(); notify("Clase iniciada."); }} /> : null}
  </>;
}

function TeachingContentEditor({ initial, defaultType, terms, close, saved, notify }: { initial: TeachingContent | null; defaultType: string; terms: CatalogTerm[]; close: () => void; saved: () => Promise<void>; notify: (message: string) => void }) {
  const [type, setType] = useState(initial?.content_type ?? defaultType), [busy, setBusy] = useState(false), [error, setError] = useState("");
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
      p_media: teachingMediaFrom(form),
    });
    if (result.error) { setError(result.error.message); setBusy(false); return; }
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
        <label className="field"><span>Al publicar</span><select name="visibility" defaultValue={initial?.visibility ?? "student"}><option value="student">Visible para el alumno</option><option value="staff">Solo profesores</option></select></label>
        <label className="field field-wide"><span>Etiquetas</span><input name="tags" defaultValue={initial?.teaching_content_tags.map((item) => item.tag).join(", ") ?? ""} placeholder="ej. conexión, base, giro" /></label>
      </div>
      <div className="teaching-taxonomies">
        <fieldset><legend>Estilos</legend><div className="check-grid">{styles.map((term) => <label key={term.id}><input type="checkbox" name="style_term_ids" value={term.id} defaultChecked={selectedStyles.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
        <fieldset><legend>Roles</legend><div className="check-grid">{roles.map((term) => <label key={term.id}><input type="checkbox" name="role_term_ids" value={term.id} defaultChecked={selectedRoles.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
        <fieldset><legend>Niveles</legend><div className="check-grid">{levels.map((term) => <label key={term.id}><input type="checkbox" name="level_term_ids" value={term.id} defaultChecked={selectedLevels.has(term.id)} /><span>{term.label}</span></label>)}</div></fieldset>
      </div>
      <TeachingMediaFields existing={initial?.teaching_content_media ?? []} />
      <p className="draft-note">Puedes guardar solo el título. Hasta que lo publiques permanecerá en Incompletas y no se propondrá ni se mostrará al alumno.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="actions teaching-actions">{initial ? <button className="btn archive-btn" type="button" onClick={archive} disabled={busy}><Archive size={16} /> Archivar</button> : null}<span /><button className="btn ghost" type="submit" name="intent" value="draft" disabled={busy}>Guardar incompleta</button><button className="btn" type="submit" name="intent" value="publish" disabled={busy}>{busy ? "Guardando…" : initial?.publication_status === "published" ? "Guardar publicada" : "Publicar"}</button></div>
    </form>
  </section></div>;
}

function TeachingRelationEditor({ content, contents, relations, close, saved, notify }: { content: TeachingContent; contents: TeachingContent[]; relations: TeachingRelation[]; close: () => void; saved: () => Promise<void>; notify: (message: string) => void }) {
  const relationChoices = content.content_type === "exercise" ? ["exercise_explanation","exercise_correction","prerequisite","related"] : content.content_type === "explanation" ? ["prerequisite","counterpart","related"] : content.content_type === "sequence" ? ["prerequisite","sequence_item","related"] : ["prerequisite","related"];
  const [relationType,setRelationType] = useState(relationChoices[0]), [targetId,setTargetId] = useState(0), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const targetOptions = contents.filter((candidate) => candidate.id !== content.id && candidate.active).filter((candidate) => relationType === "counterpart" || relationType === "exercise_explanation" ? candidate.content_type === "explanation" : relationType === "exercise_correction" ? candidate.content_type === "correction" : true);
  const ownRelations = relations.filter((relation) => relation.source_content_id === content.id || relation.target_content_id === content.id);
  const effectiveTargetId = targetOptions.some((target) => target.id === targetId) ? targetId : (targetOptions[0]?.id ?? 0);
  async function add() {
    if (!db || !effectiveTargetId) return; setBusy(true); setError("");
    const result = await db.rpc("save_teaching_relation", { p_source_content_id: content.id, p_target_content_id: effectiveTargetId, p_relation_type: relationType, p_position: null });
    if (result.error) setError(result.error.message); else { await saved(); notify("Relación guardada."); }
    setBusy(false);
  }
  async function remove(id: number) {
    if (!db) return; setBusy(true); const result = await db.rpc("delete_teaching_relation", { p_relation_id: id });
    if (result.error) setError(result.error.message); else { await saved(); notify("Relación eliminada."); }
    setBusy(false);
  }
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><section className="modal" role="dialog" aria-modal="true">
    <header className="modal-head"><div><p className="eyebrow">Relaciones</p><h2>{content.title}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
    <div className="modal-body"><div className="relation-builder"><label className="field"><span>Relación</span><select value={relationType} onChange={(event) => setRelationType(event.target.value)}>{relationChoices.map((value) => <option key={value} value={value}>{relationLabels[value]}</option>)}</select></label><label className="field"><span>Contenido</span><select value={effectiveTargetId} onChange={(event) => setTargetId(Number(event.target.value))}>{targetOptions.length ? targetOptions.map((target) => <option key={target.id} value={target.id}>{teachingKindLabels[target.content_type]} · {target.title}</option>) : <option value="0">No hay contenido compatible</option>}</select></label><button className="btn" onClick={add} disabled={!effectiveTargetId || busy}><Link2 size={17} /> Relacionar</button></div>
      {error ? <p className="error">{error}</p> : null}<div className="relation-list">{ownRelations.length ? ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id}><div><span>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong>{other?.title ?? "Contenido archivado"}</strong></div><button className="icon-btn" onClick={() => remove(relation.id)} disabled={busy} aria-label="Quitar relación"><X /></button></div>; }) : <div className="compact-empty"><Link2 /><span>Aún no tiene relaciones.</span></div>}</div>
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
      {ownRelations.length ? <div style={{ display:"grid", gap:7 }}><span style={{ color:"#777287", fontSize:9, fontWeight:800, textTransform:"uppercase", letterSpacing:".04em" }}>Relaciones</span><div style={{ display:"grid", gap:6 }}>{ownRelations.map((relation) => { const otherId = relation.source_content_id === content.id ? relation.target_content_id : relation.source_content_id, other = contents.find((item) => item.id === otherId); return <div key={relation.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10, padding:"9px 10px", border:"1px solid #e8e5ee", borderRadius:10, background:"white" }}><span style={{ color:"#777287", fontSize:10 }}>{relationLabels[relation.relation_type] ?? relation.relation_type}</span><strong style={{ fontSize:11, textAlign:"right" }}>{other?.title ?? "Contenido archivado"}</strong></div>; })}</div></div> : null}
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
    {mode === "students" ? <><label className="search"><Search /><input type="search" value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Buscar alumno" /></label><div className="student-teaching-list">{studentMatches.map((student) => { const own = assignments.filter((assignment) => assignment.person_id === student.id); return <article className="card student-teaching-card" key={student.id}><header><span className="avatar"><CircleUserRound /></span><div><h2>{student.display_name}</h2><span>{own.length ? `${own.length} contenidos en formación` : "Sin contenido asignado"}</span></div><button className="btn" onClick={() => setAssigning(student)}><Plus size={17} /> Añadir</button></header>{own.length ? <div className="student-assignment-list">{own.map((assignment) => <div key={assignment.id}><div><span>{teachingKindLabels[assignment.teaching_contents.content_type]}</span><strong>{assignment.teaching_contents.title}</strong></div><select value={assignment.assignment_status} onChange={(event) => updateAssignment(assignment,event.target.value)}>{assignmentOptions(assignment.teaching_contents.content_type).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div> : null}</article>; })}</div></> : null}
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
    const hours = Number(form.get("hours") || 0), minutes = Number(form.get("minutes") || 0), duration = hours * 60 + minutes;
    const scheduled = String(form.get("scheduled_at") || "");
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
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
        <label className="field"><span>Horas</span><input name="hours" type="number" min="0" max="8" defaultValue="1" /></label>
        <label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>
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
    const duration = Number(form.get("hours") || 0) * 60 + Number(form.get("minutes") || 0);
    if (!first || (type === "pair" && (!second || first === second))) return setError("Selecciona los alumnos correctamente.");
    if (duration <= 0) return setError("El bono necesita una duración mayor que cero.");
    setBusy(true); setError("");
    const result = await db.rpc("create_credit_grant", {
      p_student_ids: type === "pair" ? [first, second] : [first], p_modality: type, p_minutes: duration,
      p_price_cents: Math.round(Number(form.get("price") || 0) * 100), p_label: String(form.get("label") || "").trim() || null,
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
        <label className="field"><span>Horas *</span><input name="hours" type="number" min="0" max="1000" defaultValue="5" /></label><label className="field"><span>Minutos</span><input name="minutes" type="number" min="0" max="59" defaultValue="0" /></label>
        <label className="field"><span>Importe (€)</span><input name="price" type="number" min="0" step="0.01" defaultValue="0" /></label>
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

function StudentPortal({ identity, experience, onExperience }: { identity: IdentityContext; experience: ExperienceContext; onExperience: (value: ExperienceContext) => void }) {
  const [snapshot, setSnapshot] = useState<StudentPortalSnapshot | null>(null), [error, setError] = useState("");
  const [portalNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    if (!db) return;
    setError("");
    const result = await db.rpc("student_portal_snapshot");
    if (result.error) { setError(result.error.message); return; }
    setSnapshot(result.data as StudentPortalSnapshot);
  }, []);
  useEffect(() => { const initial = window.setTimeout(() => void load(), 0); return () => clearTimeout(initial); }, [load]);
  if (!snapshot && !error) return <Spinner />;
  if (!snapshot) return <main className="login"><section className="login-card"><Brand /><h1>No podemos abrir tu ficha</h1><p>{error || "Tu cuenta todavía no está vinculada con una ficha de alumno."}</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  const upcoming = snapshot.classes.filter((item) => item.status === "scheduled" && new Date(item.scheduled_start_at).getTime() >= portalNow).sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  const nextClass = upcoming[0] ?? null;
  const activeCredits = snapshot.credits.filter((credit) => credit.status === "active" && Number(credit.balance_minutes) > 0);
  const balance = activeCredits.reduce((sum, credit) => sum + Number(credit.balance_minutes || 0), 0);
  const activeAssignments = snapshot.assignments.filter((assignment) => !["corrected", "completed"].includes(assignment.assignment_status));
  const latestScores = [...snapshot.evaluations].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).reduce<Map<string, StudentPortalSnapshot["evaluations"][number]>>((map, item) => map.has(item.aptitude) ? map : map.set(item.aptitude, item), new Map());
  const totalScore = [...latestScores.values()].reduce((sum,item) => sum + Number(item.score || 0),0);
  const relativeRadar = [...latestScores.values()].map((item) => ({ label:item.aptitude, value:totalScore ? Number(item.score) / totalScore * 100 : 0 }));
  return <div className="student-portal-shell"><header className="student-portal-head"><Brand /><ContextSelector identity={identity} value={experience} onChange={onExperience} compact /><div><span>{snapshot.profile.display_name || identity.display_name}</span><button className="icon-btn" onClick={() => db?.auth.signOut()} aria-label="Cerrar sesión"><LogOut /></button></div></header><main className="student-portal-main">
    <section className="portal-hero"><div><p className="eyebrow">Mi espacio</p><h1>Hola, {snapshot.profile.first_name || snapshot.profile.display_name}</h1><p>{nextClass ? `Tu próxima clase es ${dateLabel(nextClass.scheduled_start_at)}.` : "Aquí tienes tus clases, saldo y evolución al día."}</p></div><Sparkles /></section>
    <section className="portal-stats"><article><CalendarDays /><span>Próximas clases</span><strong>{upcoming.length}</strong></article><article><WalletCards /><span>Saldo disponible</span><strong>{minutesLabel(balance)}</strong></article><article><BookOpen /><span>En formación</span><strong>{activeAssignments.length}</strong></article><article><TrendingUp /><span>Aptitudes evaluadas</span><strong>{latestScores.size}</strong></article></section>
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
      <article className="card portal-card"><div className="card-head"><h2>Mi evolución</h2><span>Reparto relativo</span></div>{relativeRadar.length ? <><RadarChart items={relativeRadar} scaleLabel="Porcentaje de tus puntos totales en cada aptitud" /><div className="evaluation-history">{snapshot.evaluations.slice(0,12).map((item) => <div key={item.id}><span>{new Intl.DateTimeFormat("es-ES",{ day:"numeric",month:"short",year:"numeric" }).format(new Date(item.created_at))}</span><strong>{item.score}</strong></div>)}</div></> : <div className="compact-empty"><TrendingUp /><span>Tu próxima evaluación aparecerá aquí.</span></div>}</article>
      <article className="card portal-card"><div className="card-head"><h2>Mis clases</h2><span>{snapshot.classes.length}</span></div>{snapshot.classes.length ? <div className="portal-class-list">{snapshot.classes.slice(0, 8).map((item) => <div key={item.id}><CalendarDays /><div><strong>{item.style || (item.class_type === "pair" ? "Clase en pareja" : "Clase individual")}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)}</span></div><span className={`badge ${item.status === "finished" ? "portal" : ""}`}>{portalClassStatus(item.status)}</span></div>)}</div> : <div className="compact-empty"><CalendarDays /><span>Todavía no hay clases en tu historial.</span></div>}</article>
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
  const loadStudents = useCallback(async () => {
    if (!db) return;
    const result = await db.from("people").select("id,auth_user_id,display_name,first_name,last_name,email,phone,country_code,crm_stage,active,student_profiles!inner(person_id,active)").eq("active", true).eq("student_profiles.active", true).order("display_name");
    if (result.error) throw result.error; setStudents((result.data ?? []) as unknown as Person[]);
  }, []);
  const loadOperations = useCallback(async () => {
    if (!db) return;
    const [classResult, creditResult, catalogResult] = await Promise.all([
      db.from("classes").select("id,class_type,status,scheduled_start_at,duration_minutes,notes,style_term_id,location_term_id,started_at,administrative_finished_at,pedagogy_closed_at,class_participants(person_id,attendance_status,billing_grant_id,role_term_id,level_term_id)").order("scheduled_start_at"),
      db.from("credit_grants").select("id,modality,label,total_minutes,price_cents,payment_status,status,purchased_at,credit_grant_members(person_id),credit_movements(delta_minutes)").order("purchased_at", { ascending: false }),
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
      db.from("teaching_contents").select("id,title,content_type,description,correction_guidance,completion_status,publication_status,visibility,measurement_mode,category_term_id,active,published_at,updated_at,teaching_content_styles(style_term_id),teaching_content_roles(role_term_id),teaching_content_levels(level_term_id),teaching_content_tags(tag),teaching_content_media(id,media_type,provider,external_file_id,title)").eq("active",true).order("updated_at",{ ascending:false }),
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
  const refreshLive = useCallback(async () => { await Promise.all([loadOperations(),loadTeaching(),loadMarketing()]); }, [loadOperations,loadTeaching,loadMarketing]);
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
        try { await Promise.all([loadStudents(), loadOperations(), loadTeaching(), loadMarketing()]); } catch (e) { if (alive) setToast(e instanceof Error ? e.message : "No se pudieron cargar los datos."); }
      }
      if (alive) setReady(true);
    } boot(); return () => { alive = false; };
  }, [session.user.id, loadStudents, loadOperations, loadTeaching, loadMarketing]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3000); return () => clearTimeout(timer); }, [toast]);
  if (!ready) return <Spinner />;
  if (!identity) return <main className="login"><section className="login-card"><Brand /><h1>Acceso no disponible</h1><p>La cuenta existe, pero no tiene un rol activo en CYA Hub.</p><button className="btn" onClick={() => db?.auth.signOut()}>Salir</button></section></main>;
  const activeIdentity = identity;
  async function setExperience(value: ExperienceContext) {
    const allowed = value === "teacher" ? activeIdentity.can_teach : value === "student" ? activeIdentity.can_study : activeIdentity.can_admin;
    if (!allowed || !db) return;
    setExperienceState(value);
    if (value === "admin") setView("admin");
    else if (value === "teacher" && view === "admin") setView("home");
    const result = await db.from("user_preferences").upsert({ user_id: activeIdentity.user_id, preferred_context: value }, { onConflict: "user_id" });
    if (result.error) setToast("La vista ha cambiado, pero no se pudo guardar como preferencia.");
  }
  if (experience === "student" && identity.can_study) return <StudentPortal identity={identity} experience={experience} onExperience={setExperience} />;
  if (!identity.can_teach && !identity.can_admin) return <StudentPortal identity={identity} experience="student" onExperience={setExperience} />;
  async function created() { await Promise.all([loadStudents(),loadMarketing()]); setToast("Alumno provisional creado correctamente."); setView("students"); }
  async function classSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Clase programada correctamente."); setView("classes"); }
  async function creditSaved() { await Promise.all([loadOperations(),loadMarketing()]); setToast("Bono creado correctamente."); setView("credits"); }
  const styles = catalog.filter((term) => term.taxonomy === "dance_style");
  function goLive(id?: number) { if (id) setLiveClassId(id); setView("live"); }
  function goTarget(target: string) {
    if (target === "admin") { if (activeIdentity.can_admin) { setExperienceState("admin"); setView("admin"); } return; }
    if (target === "live") { goLive(); return; }
    if (["home", "students", "classes", "credits", "agenda", "teaching", "marketing"].includes(target)) setView(target as View);
  }
  const studentArea = ["students", "classes", "credits", "agenda"].includes(view);
  const activeNav = (id: string) => id === "students" ? studentArea : view === id;
  return <div className="shell">
    <aside className="sidebar"><Brand /><nav>{nav.map(([id, label, Icon]) => <button key={id} className={activeNav(id) ? "active" : ""} onClick={() => setView(id)}><Icon />{label}</button>)}</nav>
      <div className="side-bottom"><ContextSelector identity={identity} value={experience} onChange={setExperience} /></div>
      <div className="side-user"><CircleUserRound /><div><strong>{identity.display_name}</strong><span>{identity.roles.map((role) => roleLabel(role)).join(" · ")}</span></div><button onClick={() => db?.auth.signOut()} aria-label="Cerrar sesión"><LogOut /></button></div>
    </aside>
    <div><header className="mobile-head"><div className="mobile-head-left"><Brand /></div><div /><div className="mobile-head-actions"><button className="icon-btn" onClick={() => setView("home")} aria-label="Notificaciones"><Bell /></button>{identity.can_admin ? <button className="icon-btn" onClick={() => goTarget("admin")} aria-label="Cuenta y administración"><CircleUserRound /></button> : null}</div></header>
      <main className="main"><div className="content">
        {view !== "live" ? <div className="context-toolbar"><ContextSelector identity={identity} value={experience} onChange={setExperience} compact /></div> : null}
        {studentArea ? <nav className="module-tabs" aria-label="Alumnado"><button className={view === "students" ? "active" : ""} onClick={() => setView("students")}><UsersRound /> Alumnos</button><button className={view === "classes" ? "active" : ""} onClick={() => setView("classes")}><CalendarDays /> Clases</button><button className={view === "credits" ? "active" : ""} onClick={() => setView("credits")}><WalletCards /> Bonos</button><button className={view === "agenda" ? "active" : ""} onClick={() => setView("agenda")}><CalendarDays /> Agenda</button></nav> : null}
        {view === "home" && db ? <HomeView client={db} identity={identity} studentCount={students.length} classes={classes} students={students} go={goTarget} goLive={goLive} addStudent={() => setNewOpen(true)} scheduleClass={() => { setScheduleStudentId(null); setScheduleOpen(true); }} notify={setToast} /> : null}
        {view === "students" ? <StudentsView students={students} query={query} setQuery={setQuery} add={() => setNewOpen(true)} open={setSelected} schedule={(student) => { setScheduleStudentId(student.id); setScheduleOpen(true); }} credit={(student) => { setCreditStudentId(student.id); setCreditOpen(true); }} /> : null}
        {view === "classes" ? <ClassesView classes={classes} students={students} schedule={() => { setScheduleStudentId(null); setScheduleOpen(true); }} goLive={goLive} /> : null}
        {view === "credits" ? <CreditsView credits={credits} students={students} add={() => { setCreditStudentId(null); setCreditOpen(true); }} /> : null}
        {view === "agenda" && db ? <AgendaView client={db} timezone={identity.timezone} schedule={() => { setScheduleStudentId(null); setScheduleOpen(true); }} openClass={goLive} notify={setToast} /> : null}
        {view === "live" ? <LiveClassView classes={classes} students={students} credits={credits} terms={catalog} library={teachingContents} relations={teachingRelations} selectedClassId={liveClassId} selectClass={setLiveClassId} refresh={refreshLive} notify={setToast} exit={() => setView("home")} /> : null}
        {view === "teaching" ? <TeachingView contents={teachingContents} relations={teachingRelations} assignments={teachingAssignments} students={students} terms={catalog} refresh={loadTeaching} notify={setToast} /> : null}
        {view === "admin" && db && identity.can_admin ? <AdminView client={db} identity={identity} terms={catalog} notify={setToast} leave={() => { setExperienceState("teacher"); setView("home"); }} /> : null}
        {view === "marketing" && db ? <MarketingView db={db} contacts={crmContacts} rates={marketingRates} content={marketingContent} events={marketingEvents} campaigns={marketingCampaigns} metrics={campaignMetrics} recipients={communicationRecipients} refresh={refreshMarketing} notify={setToast} /> : null}
      </div></main>
      {view !== "live" ? <nav className="mobile-nav">{nav.map(([id, label, Icon]) => <button key={id} className={`${activeNav(id) ? "active" : ""} ${id === "live" ? "primary" : ""}`} onClick={() => setView(id)}><Icon /><span>{label}</span></button>)}</nav> : null}
    </div>
    {newOpen ? <AddStudent close={() => setNewOpen(false)} created={created} /> : null}
    {scheduleOpen ? <ScheduleClass students={students} styles={styles} initialStudentId={scheduleStudentId} close={() => { setScheduleOpen(false); setScheduleStudentId(null); }} saved={classSaved} /> : null}
    {creditOpen ? <AddCredit students={students} initialStudentId={creditStudentId} close={() => { setCreditOpen(false); setCreditStudentId(null); }} saved={creditSaved} /> : null}
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
      close={() => setSelected(null)}
      schedule={() => { setSelected(null); setScheduleStudentId(selected.id); setScheduleOpen(true); }}
      addCredit={() => { setSelected(null); setCreditStudentId(selected.id); setCreditOpen(true); }}
      openClass={(id) => { setSelected(null); goLive(id); }}
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
