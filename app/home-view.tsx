"use client";

import {
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  Megaphone,
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
import type { CalendarItem, CalendarSnapshot, HomeSnapshot, IdentityContext, Mission } from "./v14-types";
import { dateKeyFor, dayWindow, greetingForTimestamp, minutesUntilClass, selectHomeFocus } from "./p24-home-domain";
import styles from "./p24-home.module.css";

type ClassSummary = {
  id: number;
  status: string;
  scheduled_start_at: string;
  pedagogy_closed_at: string | null;
  class_participants: Array<{ person_id: number }>;
};

type PersonSummary = { id: number; display_name: string };

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

const emptyCalendar: CalendarSnapshot = { classes: [], missions: [], marketing_events: [], external_events: [] };
const missionStateLabels: Record<string, string> = { available: "Disponible", in_progress: "En progreso", postponed: "Pospuesta", not_done: "Vencida" };

function personNames(item: ClassSummary, students: PersonSummary[]) {
  return item.class_participants.map((participant) => students.find((student) => student.id === participant.person_id)?.display_name ?? "Alumno").join(" + ");
}

function dateForTimezone(timestamp: number, timezone: string) {
  return new Intl.DateTimeFormat("es-ES", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date(timestamp));
}

function MissionDialog({ mission, client, identity, close, changed, openTarget }: {
  mission: Mission; client: SupabaseClient; identity: IdentityContext; close: () => void; changed: () => Promise<void>; openTarget: () => void;
}) {
  const [busy, setBusy] = useState(""), [error, setError] = useState("");
  const [comment, setComment] = useState(""), [evidence, setEvidence] = useState("");
  const [postponeUntil, setPostponeUntil] = useState(() => {
    const value = new Date(Date.now() + 24 * 60 * 60_000);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });

  async function act(action: string) {
    setBusy(action); setError("");
    const result = await client.rpc("act_on_mission", { p_mission_id: mission.id, p_action: action, p_comment: comment.trim() || null, p_postpone_until: action === "postpone" ? new Date(postponeUntil).toISOString() : null });
    if (result.error) { setError(result.error.message); setBusy(""); return; }
    setComment(""); await changed(); setBusy(""); if (action !== "comment") close();
  }

  async function addEvidence(event: FormEvent) {
    event.preventDefault(); if (!evidence.trim()) return; setBusy("evidence"); setError("");
    const result = await client.from("mission_evidence").insert({ mission_id: mission.id, evidence_type: "note", provider: "cya_hub", title: "Evidencia de misión", note: evidence.trim(), submitted_by: identity.user_id });
    if (result.error) setError(result.error.message); else setEvidence(""); setBusy("");
  }

  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal mission-dialog" role="dialog" aria-modal="true" aria-labelledby="mission-title">
      <header className="modal-head"><div><p className="eyebrow">{mission.mission_type === "daily" ? "Misión diaria" : mission.mission_type === "growth" ? "Crecimiento" : "Misión principal"}</p><h2 id="mission-title">{mission.title}</h2></div><button className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
      <div className="modal-body">
        {mission.description ? <p className="modal-intro">{mission.description}</p> : null}
        <div className="mission-meta"><span className={`badge mission-${mission.priority}`}>{mission.priority === "urgent" ? "Urgente" : mission.priority === "priority" ? "Prioritaria" : "Normal"}</span><span><Clock3 /> {mission.estimated_duration_minutes} min</span><span>{missionStateLabels[mission.state] ?? mission.state}</span></div>
        <button className="btn mission-open-target" type="button" onClick={openTarget}>Abrir donde se resuelve <ChevronRight /></button>
        <section className="mission-dialog-section"><h3>Comentario del equipo</h3><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Añade contexto útil para Carlos y Andy…" /><button className="btn ghost" disabled={!comment.trim() || Boolean(busy)} onClick={() => act("comment")}><MessageSquareText /> Guardar comentario</button></section>
        <form className="mission-dialog-section" onSubmit={addEvidence}><h3>Evidencia</h3><textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={2} placeholder="Describe qué se ha realizado o añade una referencia…" /><button className="btn ghost" disabled={!evidence.trim() || Boolean(busy)}><Check /> Aportar evidencia</button></form>
        <section className="mission-dialog-section postpone-row"><label className="field"><span>Posponer hasta</span><input type="datetime-local" value={postponeUntil} onChange={(event) => setPostponeUntil(event.target.value)} /></label><button className="btn ghost" disabled={Boolean(busy)} onClick={() => act("postpone")}>Posponer</button></section>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions">{mission.state !== "in_progress" ? <button className="btn ghost" disabled={Boolean(busy)} onClick={() => act("start")}>Comenzar</button> : null}<button className="btn" disabled={Boolean(busy)} onClick={() => act("complete")}><CheckCircle2 /> Completar</button></div>
      </div>
    </section>
  </div>;
}

export function HomeView({ client, identity, studentCount, classes, students, go, goLive, addStudent, scheduleClass, notify }: HomeViewProps) {
  const [now, setNow] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [calendar, setCalendar] = useState<CalendarSnapshot>(emptyCalendar);
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const timezone = snapshot?.timezone ?? identity.timezone;
  const dayKey = dateKeyFor(now, timezone);

  const load = useCallback(async () => {
    setLoading(true);
    const refreshResult = await client.rpc("refresh_missions");
    if (refreshResult.error) notify(refreshResult.error.message);
    const homeResult = await client.rpc("home_snapshot");
    if (homeResult.error) { notify(homeResult.error.message); setLoading(false); return; }
    const nextSnapshot = homeResult.data as HomeSnapshot;
    setSnapshot(nextSnapshot);
    const window = dayWindow(Date.now(), nextSnapshot.timezone ?? identity.timezone);
    const calendarResult = await client.rpc("calendar_snapshot", { p_from: window.from, p_to: window.to });
    if (calendarResult.error) notify(calendarResult.error.message); else setCalendar((calendarResult.data ?? emptyCalendar) as CalendarSnapshot);
    setLoading(false);
  }, [client, identity.timezone, notify]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, dayKey]);

  const missions = snapshot?.missions ?? [];
  const focus = selectHomeFocus(classes, missions, now, timezone);
  const focusClass = focus?.kind === "class" ? classes.find((item) => item.id === focus.item.id) ?? null : null;
  const focusMission = focus?.kind === "mission" ? focus.item : null;
  const focusMinutes = focusClass?.status === "scheduled" ? minutesUntilClass(focusClass, now) : null;
  const firstName = identity.display_name.trim().split(/\s+/)[0] || identity.profile_name;
  const boundaries = snapshot?.greeting_boundaries ?? identity.greeting_boundaries;
  const greeting = greetingForTimestamp(now, timezone, boundaries);

  const alertMissions = missions.filter((mission) => mission.id !== focusMission?.id && (mission.priority === "urgent" || mission.state === "not_done")).slice(0, 3);
  const visibleMissions = missions.filter((mission) => mission.id !== focusMission?.id).slice(0, 4);
  const allToday = useMemo(() => [...calendar.classes, ...calendar.missions, ...calendar.marketing_events, ...calendar.external_events]
    .filter((item) => !(focusClass && item.type === "class" && item.id === focusClass.id) && !(focusMission && item.type === "mission" && item.id === focusMission.id))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()).slice(0, 5), [calendar, focusClass, focusMission]);
  const eventCount = calendar.marketing_events.length + calendar.external_events.length;

  function missionTarget(mission: Mission) { const target = mission.action_target ?? "home"; if (target === "live") goLive(); else go(target); }
  function openCalendar(item: CalendarItem) {
    if (item.type === "class") goLive(item.id);
    else if (item.type === "mission") { const mission = missions.find((entry) => entry.id === item.id); if (mission) setSelectedMission(mission); else go("agenda"); }
    else go("agenda");
  }
  const calendarIcon = (item: CalendarItem) => item.type === "class" ? <GraduationCap /> : item.type === "mission" ? <Target /> : item.type === "event" ? <Megaphone /> : <CalendarDays />;

  return <>
    <header className="home-hero"><div><p className="eyebrow">{dateForTimezone(now, timezone)}</p><h1>{greeting}, {firstName}</h1><p className="daily-quote">{snapshot?.quote?.text ?? (loading ? "Preparando tu día…" : "Hoy también cuenta lo que construyes poco a poco.")}</p></div><Sparkles /></header>

    <section className={`focus ${focusClass ? "class-focus" : focusMission ? "mission-focus" : ""}`}>
      <div>
        <small>{focusClass ? "AHORA TOCA" : focusMission ? focusMission.priority === "urgent" ? "URGENTE" : focusMission.state === "not_done" ? "PENDIENTE" : "SIGUIENTE MISIÓN" : studentCount ? "TODO AL DÍA" : "PRIMER PASO"}</small>
        <h2>{focusClass ? `${focusClass.status === "active" ? "Dando clase" : "Próxima clase"} · ${personNames(focusClass, students)}` : focusMission?.title ?? (studentCount ? "Tu día está preparado" : "Añade tu primer alumno")}</h2>
        <p>{focusClass ? focusClass.status === "active" ? "Puedes volver al punto exacto de la clase." : focusMinutes !== null && focusMinutes >= 0 ? `Empieza en ${focusMinutes} min. El contexto del alumno está listo.` : "Esta clase ya debería haber empezado. Puedes abrirla directamente." : focusMission?.description ?? (studentCount ? "No hay ninguna acción prioritaria en este momento." : "Los perfiles provisionales funcionan desde el primer momento.")}</p>
        {focusClass ? <button className="btn" onClick={() => goLive(focusClass.id)}><GraduationCap /> {focusClass.status === "active" ? "Volver a clase" : "Abrir clase"}</button> : focusMission ? <button className="btn" onClick={() => setSelectedMission(focusMission)}><Target /> Abrir misión</button> : !studentCount ? <button className="btn" onClick={addStudent}><Plus /> Añadir alumno</button> : null}
      </div>{focusClass ? <GraduationCap className="focus-icon" /> : <Target className="focus-icon" />}
    </section>

    <div className={styles.pulse} aria-label="Resumen del día"><span><GraduationCap /> Clases <strong>{calendar.classes.length}</strong></span><span><Target /> Misiones <strong>{calendar.missions.length}</strong></span><span><CalendarDays /> Eventos <strong>{eventCount}</strong></span></div>

    {alertMissions.length ? <section className={styles.alerts} aria-label="Avisos accionables">{alertMissions.map((mission) => <button className={styles.alertRow} key={mission.id} onClick={() => setSelectedMission(mission)}><i className={styles.alertDot} /><span><strong>{mission.title}</strong><small>{mission.priority === "urgent" ? "Urgente" : "Requiere actuación"}</small></span><ChevronRight /></button>)}</section> : null}

    <section className="quick-grid" aria-label="Acciones rápidas">
      {focusClass ? <button className="quick" onClick={() => goLive(focusClass.id)}><GraduationCap /><strong>{focusClass.status === "active" ? "Volver a clase" : "Abrir clase"}</strong></button> : <button className="quick" onClick={scheduleClass}><CalendarDays /><strong>Programar clase</strong></button>}
      <button className="quick" onClick={() => go("students")}><UsersRound /><strong>Abrir alumno</strong></button>
      <button className="quick" onClick={() => go("teaching")}><BookOpen /><strong>Enseñanza</strong></button>
      <button className="quick quick-wide" onClick={() => go("agenda")}><span><CalendarDays /><strong>Agenda completa</strong></span><ChevronRight /></button>
    </section>

    <section className="home-grid">
      <article className="card pad mission-card-list"><div className="card-head"><div><p className="eyebrow">Misiones</p><h2>Lo importante después</h2></div><span>{visibleMissions.length}</span></div>{visibleMissions.length ? visibleMissions.map((mission) => <button className="mission-row" key={mission.id} onClick={() => setSelectedMission(mission)}><span className={`mission-priority ${mission.priority}`} /><span><strong>{mission.title}</strong><small>{missionStateLabels[mission.state] ?? mission.state}{mission.due_at ? ` · ${new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(mission.due_at))}` : ""}</small></span><ChevronRight /></button>) : <div className="compact-empty"><CheckCircle2 /><span>{loading ? "Actualizando misiones…" : "No hay más misiones pendientes."}</span></div>}</article>

      <article className="card pad"><div className="card-head"><div><p className="eyebrow">Hoy</p><h2>Agenda del día</h2></div><button className="text-button" onClick={() => go("agenda")}>Ver todo</button></div>{allToday.length ? <div>{allToday.map((item) => <button className={styles.agendaRow} key={`${item.type}-${item.id}`} onClick={() => openCalendar(item)}>{calendarIcon(item)}<span><strong>{item.title}</strong><small>{new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(item.starts_at))} · {item.type === "class" ? "Clase" : item.type === "mission" ? "Misión" : "Evento"}</small></span><ChevronRight /></button>)}</div> : <div className="compact-empty"><CalendarDays /><span>No quedan elementos en la agenda de hoy.</span></div>}<div className="day-summary"><span>Fecha <strong>{dayKey}</strong></span><span>Acción <strong>{focus ? 1 : 0}</strong></span></div></article>

      {identity.can_admin ? <button className="admin-entry card" onClick={() => go("admin")}><Settings /><span><strong>Administración</strong><small>Equipo, frases, misiones, formularios, datos e integraciones</small></span><ChevronRight /></button> : null}
    </section>

    {selectedMission ? <MissionDialog mission={selectedMission} client={client} identity={identity} close={() => setSelectedMission(null)} changed={load} openTarget={() => { missionTarget(selectedMission); setSelectedMission(null); }} /> : null}
  </>;
}
