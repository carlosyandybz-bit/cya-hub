"use client";

import {
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  MessageSquareText,
  Plus,
  Settings,
  Sparkles,
  Target,
  UsersRound,
  X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { HomeSnapshot, IdentityContext, Mission } from "./v14-types";

type ClassSummary = {
  id: number;
  status: string;
  scheduled_start_at: string;
  pedagogy_closed_at: string | null;
  class_participants: Array<{ person_id: number }>;
};

type PersonSummary = { id: number; display_name: string };

type Notification = {
  id: number;
  title: string;
  body: string | null;
  action_target: string | null;
  created_at: string;
};

type HomeViewProps = {
  client: SupabaseClient;
  identity: IdentityContext;
  studentCount: number;
  classes: ClassSummary[];
  students: PersonSummary[];
  go: (target: string) => void;
  goLive: (id?: number) => void;
  addStudent: () => void;
  scheduleClass: () => void;
  notify: (message: string) => void;
};

const missionStateLabels: Record<string, string> = {
  available: "Disponible",
  in_progress: "En progreso",
  postponed: "Pospuesta",
  not_done: "Vencida",
};

function personNames(item: ClassSummary, students: PersonSummary[]) {
  return item.class_participants
    .map((participant) => students.find((student) => student.id === participant.person_id)?.display_name ?? "Alumno")
    .join(" + ");
}

function timeToMinutes(value: string | undefined, fallback: number) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function localHourMinutes(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hours * 60 + minutes;
}

function greeting(identity: IdentityContext, snapshot: HomeSnapshot | null) {
  const boundaries = snapshot?.greeting_boundaries ?? identity.greeting_boundaries;
  const value = localHourMinutes(snapshot?.timezone ?? identity.timezone);
  const morning = timeToMinutes(boundaries.morning_start, 5 * 60);
  const afternoon = timeToMinutes(boundaries.afternoon_start, 12 * 60);
  const night = timeToMinutes(boundaries.night_start, 20 * 60);
  if (value >= morning && value < afternoon) return "Buenos días";
  if (value >= afternoon && value < night) return "Buenas tardes";
  return "Buenas noches";
}

function dateForTimezone(timezone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function dominantClass(classes: ClassSummary[], now: number) {
  const active = classes.find((item) => item.status === "active");
  if (active) return active;
  const pending = classes.find((item) => item.status === "finished" && !item.pedagogy_closed_at);
  if (pending) return pending;
  return classes
    .filter((item) => item.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
    .find((item) => {
      const distance = new Date(item.scheduled_start_at).getTime() - now;
      return distance >= -30 * 60_000 && distance <= 30 * 60_000;
    }) ?? null;
}

function MissionDialog({
  mission,
  client,
  identity,
  close,
  changed,
  openTarget,
}: {
  mission: Mission;
  client: SupabaseClient;
  identity: IdentityContext;
  close: () => void;
  changed: () => Promise<void>;
  openTarget: () => void;
}) {
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [comment, setComment] = useState(""), [evidence, setEvidence] = useState("");
  const [postponeUntil, setPostponeUntil] = useState(() => {
    const value = new Date(Date.now() + 24 * 60 * 60_000);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  async function act(action: string) {
    setBusy(action);
    setError("");
    const result = await client.rpc("act_on_mission", {
      p_mission_id: mission.id,
      p_action: action,
      p_comment: comment.trim() || null,
      p_postpone_until: action === "postpone" ? new Date(postponeUntil).toISOString() : null,
    });
    if (result.error) {
      setError(result.error.message);
      setBusy("");
      return;
    }
    setComment("");
    await changed();
    setBusy("");
    if (action !== "comment") close();
  }

  async function addEvidence(event: FormEvent) {
    event.preventDefault();
    if (!evidence.trim()) return;
    setBusy("evidence");
    setError("");
    const result = await client.from("mission_evidence").insert({
      mission_id: mission.id,
      evidence_type: "note",
      provider: "cya_hub",
      title: "Evidencia de misión",
      note: evidence.trim(),
      submitted_by: identity.user_id,
    });
    if (result.error) setError(result.error.message);
    else setEvidence("");
    setBusy("");
  }

  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal mission-dialog" role="dialog" aria-modal="true" aria-labelledby="mission-title">
        <header className="modal-head">
          <div>
            <p className="eyebrow">{mission.mission_type === "daily" ? "Misión diaria" : mission.mission_type === "growth" ? "Crecimiento" : "Misión principal"}</p>
            <h2 id="mission-title">{mission.title}</h2>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button>
        </header>
        <div className="modal-body">
          {mission.description ? <p className="modal-intro">{mission.description}</p> : null}
          <div className="mission-meta">
            <span className={`badge mission-${mission.priority}`}>{mission.priority === "urgent" ? "Urgente" : mission.priority === "priority" ? "Prioritaria" : "Normal"}</span>
            <span><Clock3 /> {mission.estimated_duration_minutes} min</span>
            <span>{missionStateLabels[mission.state] ?? mission.state}</span>
          </div>
          <button className="btn mission-open-target" type="button" onClick={openTarget}>Abrir donde se resuelve <ChevronRight /></button>
          <section className="mission-dialog-section">
            <h3>Comentario del equipo</h3>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Añade contexto útil para Carlos y Andy…" />
            <button className="btn ghost" disabled={!comment.trim() || Boolean(busy)} onClick={() => act("comment")}><MessageSquareText /> Guardar comentario</button>
          </section>
          <form className="mission-dialog-section" onSubmit={addEvidence}>
            <h3>Evidencia</h3>
            <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={2} placeholder="Describe qué se ha realizado o añade una referencia…" />
            <button className="btn ghost" disabled={!evidence.trim() || Boolean(busy)}><Check /> Aportar evidencia</button>
          </form>
          <section className="mission-dialog-section postpone-row">
            <label className="field"><span>Posponer hasta</span><input type="datetime-local" value={postponeUntil} onChange={(event) => setPostponeUntil(event.target.value)} /></label>
            <button className="btn ghost" disabled={Boolean(busy)} onClick={() => act("postpone")}>Posponer</button>
          </section>
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            {mission.state !== "in_progress" ? <button className="btn ghost" disabled={Boolean(busy)} onClick={() => act("start")}>Comenzar</button> : null}
            <button className="btn" disabled={Boolean(busy)} onClick={() => act("complete")}><CheckCircle2 /> Completar</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function HomeView({ client, identity, studentCount, classes, students, go, goLive, addStudent, scheduleClass, notify }: HomeViewProps) {
  const [now] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const refreshResult = await client.rpc("refresh_missions");
    if (refreshResult.error) notify(refreshResult.error.message);
    const [homeResult, notificationResult] = await Promise.all([
      client.rpc("home_snapshot"),
      client.from("internal_notifications")
        .select("id,title,body,action_target,created_at")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);
    if (homeResult.error) notify(homeResult.error.message);
    else setSnapshot(homeResult.data as HomeSnapshot);
    if (!notificationResult.error) setNotifications((notificationResult.data ?? []) as Notification[]);
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const focusClass = dominantClass(classes, now);
  const focusMission = snapshot?.missions[0] ?? null;
  const timezone = snapshot?.timezone ?? identity.timezone;
  const focusMinutes = focusClass?.status === "scheduled"
    ? Math.max(0, Math.round((new Date(focusClass.scheduled_start_at).getTime() - now) / 60_000))
    : null;
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const todayClasses = classes.filter((item) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(item.scheduled_start_at)) === todayKey && item.status !== "cancelled");
  const upcoming = useMemo(() => classes
    .filter((item) => item.status === "scheduled" && new Date(item.scheduled_start_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())
    .slice(0, 3), [classes, now]);

  function missionTarget(mission: Mission) {
    const target = mission.action_target ?? "home";
    if (target === "live") goLive();
    else go(target);
  }

  async function openNotification(item: Notification) {
    setNotifications((current) => current.filter((notification) => notification.id !== item.id));
    const result = await client.from("internal_notifications").update({ read_at: new Date().toISOString() }).eq("id", item.id);
    if (result.error) notify(result.error.message);
    if (item.action_target) go(item.action_target);
  }

  const firstName = identity.display_name.trim().split(/\s+/)[0] || identity.profile_name;

  return (
    <>
      <header className="home-hero">
        <div>
          <p className="eyebrow">{dateForTimezone(timezone)}</p>
          <h1>{greeting(identity, snapshot)}, {firstName}</h1>
          <p className="daily-quote">{snapshot?.quote?.text ?? (loading ? "Preparando tu día…" : "Hoy también cuenta lo que construyes poco a poco.")}</p>
        </div>
        <Sparkles />
      </header>

      <section className={`focus ${focusClass ? "class-focus" : focusMission ? "mission-focus" : ""}`}>
        <div>
          <small>{focusClass ? "AHORA TOCA" : focusMission ? "SIGUIENTE MISIÓN" : studentCount ? "TODO AL DÍA" : "PRIMER PASO"}</small>
          <h2>{focusClass
            ? `${focusClass.status === "active" ? "Dando clase" : focusClass.status === "finished" ? "Cerrar clase" : "Próxima clase"} · ${personNames(focusClass, students)}`
            : focusMission?.title ?? (studentCount ? "Tu día está preparado" : "Añade tu primer alumno")}</h2>
          <p>{focusClass
            ? focusClass.status === "scheduled" && focusMinutes !== null ? `Empieza en ${focusMinutes} min. El contexto del alumno está listo.` : focusClass.status === "finished" ? "Queda cerrar la parte pedagógica sin perder lo trabajado." : "Puedes volver al punto exacto de la clase."
            : focusMission?.description ?? (studentCount ? "CYA priorizará automáticamente cualquier clase, misión o aviso que requiera tu atención." : "Los perfiles provisionales funcionan desde el primer momento.")}</p>
          {focusClass ? <button className="btn" onClick={() => goLive(focusClass.id)}><GraduationCap /> Abrir clase</button>
            : focusMission ? <button className="btn" onClick={() => setSelectedMission(focusMission)}><Target /> Abrir misión</button>
            : !studentCount ? <button className="btn" onClick={addStudent}><Plus /> Añadir alumno</button> : null}
        </div>
        {focusClass ? <GraduationCap className="focus-icon" /> : <Target className="focus-icon" />}
      </section>

      <section className="quick-grid" aria-label="Acciones rápidas">
        <button className="quick" onClick={scheduleClass}><CalendarDays /><strong>Programar clase</strong></button>
        <button className="quick" onClick={() => go("students")}><UsersRound /><strong>Abrir alumno</strong></button>
        <button className="quick" onClick={() => go("teaching")}><BookOpen /><strong>Crear contenido</strong></button>
        <button className="quick quick-wide" onClick={() => go("agenda")}><span><CalendarDays /><strong>Ver agenda completa</strong></span><ChevronRight /></button>
      </section>

      <section className="home-grid">
        <article className="card pad mission-card-list">
          <div className="card-head"><div><p className="eyebrow">Misiones</p><h2>Lo importante ahora</h2></div><span>{snapshot?.missions.length ?? 0}</span></div>
          {snapshot?.missions.length ? snapshot.missions.slice(0, 4).map((mission) => (
            <button className="mission-row" key={mission.id} onClick={() => setSelectedMission(mission)}>
              <span className={`mission-priority ${mission.priority}`} />
              <span><strong>{mission.title}</strong><small>{missionStateLabels[mission.state] ?? mission.state}{mission.due_at ? ` · ${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(mission.due_at))}` : ""}</small></span>
              <ChevronRight />
            </button>
          )) : <div className="compact-empty"><CheckCircle2 /><span>{loading ? "Actualizando misiones…" : "No hay misiones pendientes."}</span></div>}
        </article>

        <article className="card pad">
          <div className="card-head"><div><p className="eyebrow">Agenda</p><h2>Próximas clases</h2></div><button className="text-button" onClick={() => go("agenda")}>Ver todo</button></div>
          {upcoming.length ? <div className="home-agenda">{upcoming.map((item) => (
            <button key={item.id} onClick={() => goLive(item.id)}><CalendarDays /><span><strong>{personNames(item, students)}</strong><small>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduled_start_at))}</small></span><ChevronRight /></button>
          ))}</div> : <div className="compact-empty"><CalendarDays /><span>No hay próximas clases programadas.</span></div>}
          <div className="day-summary"><span>Hoy <strong>{todayClasses.length}</strong></span><span>Por cerrar <strong>{classes.filter((item) => item.status === "finished" && !item.pedagogy_closed_at).length}</strong></span></div>
        </article>

        <article className="card pad home-notifications">
          <div className="card-head"><div><p className="eyebrow">Avisos</p><h2>Notificaciones</h2></div><Bell /></div>
          {notifications.length ? notifications.map((item) => <button key={item.id} onClick={() => void openNotification(item)}><Bell /><span><strong>{item.title}</strong><small>{item.body}</small></span><ChevronRight /></button>) : <div className="compact-empty"><CheckCircle2 /><span>No hay avisos nuevos.</span></div>}
        </article>

        {identity.can_admin ? <button className="admin-entry card" onClick={() => go("admin")}><Settings /><span><strong>Administración</strong><small>Equipo, misiones, formularios, datos e integraciones</small></span><ChevronRight /></button> : null}
      </section>

      {selectedMission ? <MissionDialog mission={selectedMission} client={client} identity={identity} close={() => setSelectedMission(null)} changed={load} openTarget={() => { missionTarget(selectedMission); setSelectedMission(null); }} /> : null}
    </>
  );
}
