"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Compass,
  GraduationCap,
  House,
  Link2,
  MessageCircle,
  PlayCircle,
  Plus,
  Send,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  Video,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu } from "./account-menu";
import { AcademyOnlineStudentComingSoon } from "./academy-online-student";
import { BZPointsPanel } from "./bz-points-panel";
import { SecureDriveAsset } from "./drive-media";
import { FeedbackOnlineStudentPanel } from "./feedback-online-student";
import { NotificationsView } from "./notifications-view";
import { PreferencesSettingsView, ProfileSettingsView } from "./account-pages";
import { getRuntimeAccessToken } from "./supabase-runtime";
import { prepareVideoForUpload, uploadPreparedClassPreparation, type UploadProgress } from "./video-upload-client";
import type { ExperienceContext, HomeSnapshot, IdentityContext, Mission } from "./v14-types";
import styles from "./student-portal-prf.module.css";

type TeachingMedia = {
  id: number;
  media_type: "image" | "video";
  external_file_id: string;
  thumbnail_external_file_id?: string | null;
  title?: string | null;
};

type PortalAssignment = {
  id: number;
  content_id: number;
  title: string;
  content_type: string;
  description: string | null;
  correction_guidance: string | null;
  assignment_status: string;
  current_frequency: number | null;
  current_importance: number | null;
  updated_at: string;
  media: TeachingMedia[];
};

type PortalClass = {
  id: number;
  class_type: "individual" | "pair";
  status: string;
  scheduled_start_at: string;
  duration_minutes: number;
  billing_status?: string;
  uncovered_minutes?: number;
  style: string | null;
  attendance_status: string;
  role: string | null;
  level: string | null;
};

type PortalEvaluation = {
  id: number;
  score: number;
  aptitude_term_id: number;
  aptitude: string;
  style: string;
  role: string;
  level: string;
  created_at: string;
};

type PortalCredit = {
  id: number;
  label: string | null;
  modality: "individual" | "pair";
  total_minutes: number;
  balance_minutes: number;
  status: string;
  purchased_at: string;
  expires_at: string | null;
};

type ClassSummary = { class_id: number; student_message: string | null; closed_at: string };
type ClassMediaSnapshot = {
  id: number;
  class_id: number;
  media_kind: "class_document" | "final_dance";
  media_type: "image" | "video";
  external_file_id: string;
  title: string | null;
  mime_type: string | null;
  created_at: string;
};
type ClassPrivateVideo = {
  id: number;
  class_id: number;
  person_id: number;
  external_file_id: string;
  title: string | null;
  mime_type: string | null;
  created_at: string;
};
type StudentClassNote = {
  id: number;
  class_id: number;
  person_id: number | null;
  content_id: number | null;
  body: string;
  visibility_scope: "internal" | "student";
  created_at: string;
};

type StudentPortalSnapshot = {
  profile: {
    id: number;
    display_name: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    country_code: string | null;
    student_since: string | null;
    goals: string | null;
  };
  financial?: {
    available_credit_minutes: number;
    pending_debt_minutes: number;
    net_balance_minutes: number;
    open_incident_count: number;
  };
  classes: PortalClass[];
  credits: PortalCredit[];
  assignments: PortalAssignment[];
  evaluations: PortalEvaluation[];
  class_activity?: Array<{ id: number; class_id: number; content_id: number; title: string; content_type: string; event_type: string; created_at: string }>;
  class_summaries?: ClassSummary[];
  class_media?: ClassMediaSnapshot[];
};

type BzSnapshot = { balance_points: number; earned_points: number; next_class: { id: number } | null };

type PreparationRequest = {
  id: number;
  class_id: number;
  person_id: number;
  request_type: "focus" | "comment" | "video" | "content" | "link";
  body: string | null;
  external_file_id: string | null;
  content_id: number | null;
  created_at: string;
  updated_at: string;
};

type PortalScreen = "home" | "progress" | "formation" | "discover" | "missions" | "feedback" | "bz" | "notifications" | "profile" | "preferences";
type FormationTab = "summary" | "practice" | "classes" | "content";

const assignmentStateLabels: Record<string, string> = {
  pending: "Pendiente",
  corrected: "Corregida",
  explained: "Explicada",
  active: "A practicar",
  completed: "Completado",
};

const contentTypeLabels: Record<string, string> = {
  correction: "Corrección",
  explanation: "Explicación",
  exercise: "Ejercicio",
  sequence: "Secuencia",
};

function dateLabel(value: string, includeTime = true) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

function minutesLabel(value: number) {
  const minutes = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function greetingForNow(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("es-ES", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function classStatusLabel(value: string) {
  if (value === "finished") return "Realizada";
  if (value === "scheduled") return "Programada";
  if (value === "active") return "En clase";
  if (value === "cancelled") return "Cancelada";
  return value;
}

function safeLink(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeLink(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  return safeLink(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
}

function missionStateLabel(mission: Mission) {
  if (mission.state === "completed" || mission.state === "completed_automatically") return "Completada";
  if (mission.state === "in_progress") return "En progreso";
  if (mission.state === "not_done") return "Pendiente";
  if (mission.state === "postponed") return "Pospuesta";
  return "Disponible";
}

function PreparationPanel({ client, nextClass, personId, assignments, changed }: {
  client: SupabaseClient;
  nextClass: PortalClass;
  personId: number;
  assignments: PortalAssignment[];
  changed: () => Promise<void>;
}) {
  const [requests, setRequests] = useState<PreparationRequest[]>([]);
  const [focusText, setFocusText] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [linkText, setLinkText] = useState("");
  const [selectedContent, setSelectedContent] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const load = useCallback(async () => {
    const result = await client.from("class_preparation_requests")
      .select("id,class_id,person_id,request_type,body,external_file_id,content_id,created_at,updated_at")
      .eq("class_id", nextClass.id)
      .eq("person_id", personId)
      .order("created_at", { ascending: true });
    if (result.error) { setError(result.error.message); return; }
    setRequests((result.data ?? []) as PreparationRequest[]);
  }, [client, nextClass.id, personId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function insertText(type: "focus" | "comment", value: string) {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(type); setError(""); setMessage("");
    const result = await client.from("class_preparation_requests").insert({ class_id: nextClass.id, person_id: personId, request_type: type, body });
    if (result.error) setError(result.error.message);
    else {
      if (type === "focus") setFocusText(""); else setQuestionText("");
      setMessage(type === "focus" ? "Perfecto. Ya sabemos qué te apetece trabajar." : "Recibido. Tendremos tu duda presente cuando nos veamos.");
      await load(); await changed();
    }
    setBusy("");
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    const body = normalizeLink(linkText);
    if (!body) { setError("Pega un enlace válido de Instagram, YouTube, TikTok o cualquier página con http/https."); return; }
    setBusy("link"); setError(""); setMessage("");
    const result = await client.from("class_preparation_requests").insert({ class_id: nextClass.id, person_id: personId, request_type: "link", body });
    if (result.error) setError(result.error.message);
    else { setLinkText(""); setMessage("Enlace guardado. Lo veremos antes de la clase."); await load(); await changed(); }
    setBusy("");
  }

  async function addContent() {
    const contentId = Number(selectedContent);
    if (!contentId || busy) return;
    setBusy("content"); setError(""); setMessage("");
    const result = await client.rpc("bz_choose_next_class_content", { p_class_id: nextClass.id, p_content_id: contentId });
    if (result.error) setError(result.error.message);
    else {
      const awarded = Boolean((result.data as { points_awarded?: boolean } | null)?.points_awarded);
      setMessage(awarded ? "Añadido. Además, esta primera elección suma BZ Points." : "Añadido a lo que quieres trabajar en clase.");
      setSelectedContent(""); await load(); await changed();
    }
    setBusy("");
  }

  async function uploadVideo(file: File | null) {
    if (!file || busy) return;
    if (!file.type.startsWith("video/")) { setError("Selecciona un vídeo."); return; }
    setBusy("video"); setError(""); setMessage(""); setUploadProgress({ stage: "preparing", progress: 0, message: "Preparando tu vídeo…" });
    try {
      const prepared = await prepareVideoForUpload(file, setUploadProgress);
      const uploaded = await uploadPreparedClassPreparation(nextClass.id, prepared, setUploadProgress);
      setMessage(prepared.compressed ? `Vídeo enviado. Hemos reducido su peso un ${prepared.savingsPercent}% sin frenarte.` : "Vídeo enviado. Lo veremos antes de tu clase.");
      if (!uploaded.requestId) throw new Error("El vídeo se ha subido, pero no hemos podido vincularlo con la clase.");
      await load(); await changed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No hemos podido subir el vídeo esta vez. Puedes probar de nuevo o dejarnos un enlace.");
    } finally {
      setBusy(""); setUploadProgress(null);
    }
  }

  async function removeRequest(request: PreparationRequest) {
    if (busy) return;
    setBusy(`remove-${request.id}`); setError(""); setMessage("");
    if (request.request_type === "video") {
      const token = await getRuntimeAccessToken();
      if (!token) { setError("Tu sesión ha caducado. Vuelve a entrar para modificar la preparación."); setBusy(""); return; }
      const response = await fetch("/api/class-preparation/upload", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ requestId: request.id }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) { setError(payload?.error || "No hemos podido quitar ese vídeo."); setBusy(""); return; }
    } else {
      const result = await client.from("class_preparation_requests").delete().eq("id", request.id);
      if (result.error) { setError(result.error.message); setBusy(""); return; }
    }
    setMessage("Quitado de la preparación."); await load(); await changed(); setBusy("");
  }

  async function saveEdit(request: PreparationRequest) {
    const body = request.request_type === "link" ? normalizeLink(editingBody) : editingBody.trim();
    if (!body) { setError(request.request_type === "link" ? "El enlace no es válido." : "Escribe algo antes de guardar."); return; }
    setBusy(`edit-${request.id}`); setError("");
    const result = await client.from("class_preparation_requests").update({ body }).eq("id", request.id);
    if (result.error) setError(result.error.message);
    else { setEditingId(null); setEditingBody(""); setMessage("Actualizado. Así tendremos la preparación al día."); await load(); await changed(); }
    setBusy("");
  }

  const chosenContentIds = new Set(requests.filter((item) => item.request_type === "content" && item.content_id).map((item) => Number(item.content_id)));
  const contentChoices = assignments.filter((item) => !chosenContentIds.has(item.content_id));

  return <section className={styles.preparePanel} aria-labelledby="prepare-next-class-title">
    <div className={styles.prepareIntro}>
      <div><span>PRÓXIMA CLASE · {dateLabel(nextClass.scheduled_start_at)}</span><h2 id="prepare-next-class-title">¿Qué te apetece trabajar cuando nos veamos?</h2><p>Cuéntanos una idea, mándanos ese vídeo que tienes en mente o déjanos un enlace. Así podemos preparar la clase pensando en ti.</p></div>
      <Sparkles />
    </div>

    <div className={styles.prepareActions}>
      <label className={styles.prepareField}><span>Lo que te apetece trabajar</span><textarea rows={2} value={focusText} onChange={(event) => setFocusText(event.target.value)} placeholder="Por ejemplo: quiero sentirme más cómodo con las ondas…" /><button type="button" disabled={!focusText.trim() || Boolean(busy)} onClick={() => void insertText("focus", focusText)}><Send /> Contárnoslo</button></label>
      <label className={styles.prepareField}><span>¿Tienes alguna duda?</span><textarea rows={2} value={questionText} onChange={(event) => setQuestionText(event.target.value)} placeholder="Cuéntanos cualquier duda antes de vernos" /><button type="button" disabled={!questionText.trim() || Boolean(busy)} onClick={() => void insertText("comment", questionText)}><MessageCircle /> Enviar duda</button></label>

      <div className={styles.prepareField}><span>Contenido que quieres trabajar</span><div className={styles.inlineControl}><select value={selectedContent} onChange={(event) => setSelectedContent(event.target.value)}><option value="">Elige un contenido</option>{contentChoices.map((item) => <option value={item.content_id} key={item.content_id}>{item.title}</option>)}</select><button type="button" disabled={!selectedContent || Boolean(busy)} onClick={() => void addContent()}><Plus /> Añadir</button></div><small>Puedes añadir varios. La primera elección de la clase puede sumar BZ Points.</small></div>

      <form className={styles.prepareField} onSubmit={addLink}><span>Vídeo o referencia que has visto</span><div className={styles.inlineControl}><input value={linkText} onChange={(event) => setLinkText(event.target.value)} placeholder="Pega un enlace de Instagram, YouTube…" inputMode="url" /><button disabled={!linkText.trim() || Boolean(busy)}><Link2 /> Guardar</button></div></form>

      <label className={`${styles.videoDrop} ${busy === "video" ? styles.videoDropBusy : ""}`}><Video /><span><strong>{busy === "video" ? uploadProgress?.message || "Enviando vídeo…" : "Envíanos un vídeo"}</strong><small>Puede ser tu práctica o una referencia que quieras probar en clase.</small></span><Upload /><input type="file" accept="video/*" disabled={Boolean(busy)} onChange={(event) => { void uploadVideo(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} /></label>
    </div>

    {requests.length ? <div className={styles.sentBlock}><div className={styles.sectionHeading}><div><span>YA NOS HAS ENVIADO</span><h3>Tu preparación</h3></div><strong>{requests.length}</strong></div><div className={styles.requestList}>{requests.map((request) => {
      const href = request.request_type === "link" ? safeLink(request.body) : null;
      return <article className={styles.requestRow} key={request.id}>
        <div className={styles.requestIcon}>{request.request_type === "video" ? <PlayCircle /> : request.request_type === "link" ? <Link2 /> : request.request_type === "content" ? <BookOpen /> : request.request_type === "comment" ? <MessageCircle /> : <Target />}</div>
        <div className={styles.requestBody}>
          <span>{request.request_type === "focus" ? "Quiero trabajar" : request.request_type === "comment" ? "Duda" : request.request_type === "content" ? "Contenido" : request.request_type === "video" ? "Vídeo" : "Enlace"}</span>
          {editingId === request.id ? <div className={styles.editRow}><input value={editingBody} onChange={(event) => setEditingBody(event.target.value)} /><button type="button" onClick={() => void saveEdit(request)} disabled={Boolean(busy)}><Check /> Guardar</button><button type="button" onClick={() => { setEditingId(null); setEditingBody(""); }}><X /></button></div> : href ? <a href={href} target="_blank" rel="noreferrer">{request.body}</a> : <strong>{request.body || "Vídeo para preparar la clase"}</strong>}
          {request.request_type === "video" && request.external_file_id ? <SecureDriveAsset fileId={request.external_file_id} mediaType="video" title={request.body} controls className={styles.prepVideo} /> : null}
        </div>
        <div className={styles.requestActions}>{request.request_type === "focus" || request.request_type === "comment" || request.request_type === "link" ? <button type="button" aria-label="Editar" onClick={() => { setEditingId(request.id); setEditingBody(request.body || ""); }}>Editar</button> : null}<button type="button" aria-label="Quitar de la preparación" disabled={Boolean(busy)} onClick={() => void removeRequest(request)}><Trash2 /></button></div>
      </article>;
    })}</div></div> : <p className={styles.prepareEmpty}>Todavía no nos has contado qué te apetece trabajar. Si quieres, déjanos una idea antes de vernos.</p>}

    {message ? <p className={styles.success}>{message}</p> : null}
    {error ? <p className={styles.error}>{error}</p> : null}
  </section>;
}

export function StudentPortalPrf({ client, identity, email, experience, onExperience, onIdentityPatch }: {
  client: SupabaseClient;
  identity: IdentityContext;
  email: string;
  experience: ExperienceContext;
  onExperience: (value: ExperienceContext) => void | Promise<void>;
  onIdentityPatch: (patch: Partial<IdentityContext>) => void;
}) {
  const [screen, setScreen] = useState<PortalScreen>("home");
  const [formationTab, setFormationTab] = useState<FormationTab>("summary");
  const [formationMenu, setFormationMenu] = useState(false);
  const [snapshot, setSnapshot] = useState<StudentPortalSnapshot | null>(null);
  const [homeSnapshot, setHomeSnapshot] = useState<HomeSnapshot | null>(null);
  const [bzSnapshot, setBzSnapshot] = useState<BzSnapshot | null>(null);
  const [privateVideos, setPrivateVideos] = useState<ClassPrivateVideo[]>([]);
  const [studentNotes, setStudentNotes] = useState<StudentClassNote[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    await client.rpc("refresh_missions");
    const [portalResult, homeResult, bzResult, unreadResult] = await Promise.all([
      client.rpc("student_portal_snapshot"),
      client.rpc("home_snapshot"),
      client.rpc("bz_snapshot"),
      client.from("internal_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    ]);
    if (portalResult.error) { setError(portalResult.error.message); setLoading(false); return; }
    const nextSnapshot = portalResult.data as StudentPortalSnapshot;
    setSnapshot(nextSnapshot);
    const [videoResult, noteResult] = await Promise.all([
      client.from("class_video_resources")
        .select("id,class_id,person_id,external_file_id,title,mime_type,created_at")
        .eq("visibility_scope", "private_student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
      client.from("class_notes")
        .select("id,class_id,person_id,content_id,body,visibility_scope,created_at")
        .eq("visibility_scope", "student")
        .eq("person_id", nextSnapshot.profile.id)
        .order("created_at", { ascending: false }),
    ]);
    if (!videoResult.error) setPrivateVideos((videoResult.data ?? []) as ClassPrivateVideo[]);
    if (!noteResult.error) setStudentNotes((noteResult.data ?? []) as StudentClassNote[]);
    if (!homeResult.error) setHomeSnapshot(homeResult.data as HomeSnapshot);
    if (!bzResult.error) setBzSnapshot(bzResult.data as BzSnapshot);
    if (!unreadResult.error) setUnread(unreadResult.count ?? 0);
    setLoading(false);
  }, [client]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => clearTimeout(timer); }, [toast]);

  const upcoming = useMemo(() => (snapshot?.classes ?? []).filter((item) => item.status !== "finished" && item.status !== "cancelled").sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime()), [snapshot?.classes]);
  const nextClass = upcoming[0] ?? null;
  const activeAssignments = useMemo(() => (snapshot?.assignments ?? []).filter((item) => !["corrected", "completed"].includes(item.assignment_status)), [snapshot?.assignments]);
  const latestAssignments = useMemo(() => [...(snapshot?.assignments ?? [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 3), [snapshot?.assignments]);
  const missions = homeSnapshot?.missions ?? [];
  const currentMissions = missions.filter((item) => !["completed", "completed_automatically", "cancelled", "not_applicable"].includes(item.state));
  const missionRank = (mission: Mission) => mission.priority === "urgent" ? 3 : mission.priority === "priority" ? 2 : 1;
  const sortMissions = (items: Mission[]) => [...items].sort((a, b) => missionRank(b) - missionRank(a) || b.priority_score - a.priority_score || (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER) - (b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER));
  const missionGroups = (() => {
    const visible = missions.filter((item) => !["cancelled", "not_applicable"].includes(item.state));
    const completed = sortMissions(visible.filter((item) => ["completed", "completed_automatically"].includes(item.state)));
    const inProgress = sortMissions(visible.filter((item) => item.state === "in_progress"));
    const now = sortMissions(visible.filter((item) => !["completed", "completed_automatically", "in_progress"].includes(item.state) && ["urgent", "priority"].includes(item.priority)));
    const nowIds = new Set(now.map((item) => item.id));
    const available = sortMissions(visible.filter((item) => !["completed", "completed_automatically", "in_progress"].includes(item.state) && !nowIds.has(item.id)));
    return { now, available, inProgress, completed };
  })();
  const priorityMission = missionGroups.now[0] ?? missionGroups.inProgress[0] ?? missionGroups.available[0] ?? null;
  const pendingDebt = snapshot?.financial?.pending_debt_minutes ?? 0;
  const firstName = snapshot?.profile.first_name || identity.display_name.trim().split(/\s+/)[0] || "";
  const latestScores = useMemo(() => {
    const map = new Map<number, PortalEvaluation>();
    for (const item of snapshot?.evaluations ?? []) if (!map.has(item.aptitude_term_id)) map.set(item.aptitude_term_id, item);
    return [...map.values()];
  }, [snapshot?.evaluations]);

  const evaluationTimeline = useMemo(
    () => [...(snapshot?.evaluations ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [snapshot?.evaluations],
  );
  const improvements = useMemo(() => {
    const byAptitude = new Map<number, PortalEvaluation[]>();
    for (const item of evaluationTimeline) {
      const history = byAptitude.get(item.aptitude_term_id) ?? [];
      history.push(item);
      byAptitude.set(item.aptitude_term_id, history);
    }
    return [...byAptitude.values()].flatMap((history) => {
      const latest = history[0];
      const previous = history[1];
      if (!latest || !previous || latest.score <= previous.score) return [];
      return [{ latest, previous, delta: latest.score - previous.score }];
    });
  }, [evaluationTimeline]);
  const progressMilestones = useMemo(() => {
    const finishedClasses = snapshot?.classes.filter((item) => item.status === "finished").length ?? 0;
    const evaluationCount = snapshot?.evaluations.length ?? 0;
    const contentCount = snapshot?.assignments.length ?? 0;
    const milestones: Array<{ key: string; title: string; detail: string }> = [];
    if (finishedClasses >= 1) milestones.push({ key: "first-class", title: "Primera clase completada", detail: `${finishedClasses} ${finishedClasses === 1 ? "clase realizada" : "clases realizadas"}` });
    if (finishedClasses >= 5) milestones.push({ key: "five-classes", title: "5 clases completadas", detail: `${finishedClasses} clases realizadas hasta ahora` });
    if (finishedClasses >= 10) milestones.push({ key: "ten-classes", title: "10 clases completadas", detail: `${finishedClasses} clases realizadas hasta ahora` });
    if (evaluationCount >= 1) milestones.push({ key: "first-evaluation", title: "Primera evaluación registrada", detail: `${evaluationCount} ${evaluationCount === 1 ? "registro de evaluación" : "registros de evaluación"}` });
    if (contentCount >= 5) milestones.push({ key: "five-contents", title: "5 contenidos en tu espacio", detail: `${contentCount} contenidos forman parte de tu formación` });
    return milestones;
  }, [snapshot?.assignments, snapshot?.classes, snapshot?.evaluations]);
  const progressVideos = useMemo(() => {
    const personal = privateVideos.map((video) => ({
      key: `private-${video.id}`,
      fileId: video.external_file_id,
      title: video.title || "Vídeo de clase",
      createdAt: video.created_at,
    }));
    const classVideos = (snapshot?.class_media ?? [])
      .filter((media) => media.media_type === "video")
      .map((media) => ({
        key: `class-${media.id}`,
        fileId: media.external_file_id,
        title: media.title || (media.media_kind === "final_dance" ? "Baile final" : "Vídeo de clase"),
        createdAt: media.created_at,
      }));
    return [...personal, ...classVideos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [privateVideos, snapshot?.class_media]);

  function go(value: PortalScreen) { setFormationMenu(false); setScreen(value); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function goFormation(tab: FormationTab) { setFormationTab(tab); setFormationMenu(false); setScreen("formation"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function notificationTarget(target: string) {
    const value = target.toLowerCase();
    if (value.includes("feedback")) go("feedback");
    else if (value.includes("mission")) go("missions");
    else if (value.includes("progress") || value.includes("evaluation")) go("progress");
    else if (value.includes("teaching") || value.includes("formation") || value.includes("content")) goFormation("summary");
    else go("home");
  }

  async function actOnMission(mission: Mission, action: "start" | "complete") {
    const result = await client.rpc("act_on_mission", { p_mission_id: mission.id, p_action: action, p_comment: null, p_postpone_until: null });
    if (result.error) setToast(result.error.message); else { setToast(action === "complete" ? "¡Hecho! Misión completada." : "Misión en marcha. Vamos a por ella."); await load(); }
  }

  if (loading && !snapshot) return <div className={styles.loading}><strong>CYA</strong><span>Preparando tu espacio…</span></div>;
  if (error && !snapshot) return <div className={styles.loading}><AlertTriangle /><strong>No hemos podido abrir tu espacio</strong><span>{error}</span><button onClick={() => void load()}>Volver a intentar</button></div>;

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <button className={styles.logo} type="button" onClick={() => go("home")} aria-label="Ir a Inicio"><strong>CYA</strong><span>Hub</span></button>
      <div className={styles.topActions}>
        <button className={styles.notificationButton} type="button" onClick={() => go("notifications")} aria-label={unread ? `${unread} notificaciones pendientes` : "Notificaciones"}><Bell />{unread ? <span>{unread > 99 ? "99+" : unread}</span> : null}</button>
        <AccountMenu client={client} identity={identity} experience={experience} email={email} onExperience={onExperience} onOpenProfile={() => go("profile")} onOpenPreferences={() => go("preferences")} onIdentityPatch={onIdentityPatch} notify={setToast} />
      </div>
    </header>

    <main className={styles.main}>
      {screen === "home" ? <>
        <section className={styles.welcome}>
          <div><h1>{greetingForNow(identity.timezone)}, {firstName}</h1><p>{nextClass ? "Tenemos cosas bonitas que preparar para la próxima clase." : "Este es tu espacio para seguir aprendiendo, practicando y descubriendo cosas nuevas."}</p><span>Profesor · CARLOS Y ANDY</span></div>
        </section>

        <section className={styles.nowSection} aria-labelledby="portal-now-title">
          <div className={styles.sectionHeading}><div><span>AHORA</span><h2 id="portal-now-title">Lo que merece tu atención</h2></div></div>
          <div className={styles.nowList}>
            {pendingDebt > 0 ? <article className={`${styles.nowItem} ${styles.nowWarning}`}><AlertTriangle /><div><strong>Hay {minutesLabel(pendingDebt)} por regularizar</strong><span>Lo tenemos localizado para que no se pierda nada de tu historial.</span></div></article> : null}
            {nextClass ? <article className={styles.nowItem}><CalendarDays /><div><strong>Próxima clase · {nextClass.style || "Clase con Carlos & Andy"}</strong><span>{dateLabel(nextClass.scheduled_start_at)} · {minutesLabel(nextClass.duration_minutes)}</span></div><button type="button" onClick={() => document.getElementById("prepare-next-class-title")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Prepararla <ChevronRight /></button></article> : null}
            {priorityMission ? <article className={styles.nowItem}><Target /><div><strong>{priorityMission.title}</strong><span>{priorityMission.description || "Una pequeña acción para seguir avanzando."}</span></div><button type="button" onClick={() => go("missions")}>Ver misión <ChevronRight /></button></article> : null}
            {!pendingDebt && !nextClass && !priorityMission ? <article className={styles.nowItem}><CircleCheck /><div><strong>Todo tranquilo por aquí</strong><span>Puedes aprovechar para practicar, descubrir contenido o enviarnos un vídeo.</span></div></article> : null}
          </div>
        </section>

        <section className={styles.summaryStrip} aria-label="Resumen de tu espacio">
          <button type="button" onClick={() => go("bz")}><Zap /><span>BZ Points<strong>{bzSnapshot?.balance_points ?? 0}</strong></span><ChevronRight /></button>
          <button type="button" onClick={() => go("missions")}><Target /><span>Misiones<strong>{currentMissions.length}</strong></span><ChevronRight /></button>
          <button type="button" onClick={() => go("progress")}><TrendingUp /><span>En progreso<strong>{activeAssignments.length}</strong></span><ChevronRight /></button>
        </section>

        <section className={styles.feedbackCallout}>
          <div><span>FEEDBACK ONLINE</span><h2>¿Quieres que veamos tu baile?</h2><p>Envíanos un vídeo cuando te venga bien. Te diremos qué vemos y dónde puedes poner el foco.</p></div><button type="button" onClick={() => go("feedback")}><Video /> Enviar vídeo</button>
        </section>

        {nextClass && snapshot ? <PreparationPanel client={client} nextClass={nextClass} personId={snapshot.profile.id} assignments={snapshot.assignments} changed={load} /> : null}

        <section className={styles.homeColumns}>
          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>NOVEDADES PARA TI</span><h2>Lo último en tu formación</h2></div><button type="button" onClick={() => goFormation("content")}>Ver contenido</button></div>{latestAssignments.length ? <div className={styles.simpleList}>{latestAssignments.map((item) => <button type="button" key={item.id} onClick={() => goFormation("content")}><BookOpen /><span><strong>{item.title}</strong><small>{contentTypeLabels[item.content_type] ?? item.content_type} · {assignmentStateLabels[item.assignment_status] ?? item.assignment_status}</small></span><ChevronRight /></button>)}</div> : <p className={styles.emptyText}>Todavía no tienes contenido guardado. Poco a poco iremos llenando este espacio contigo.</p>}</article>
          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>ACTIVIDAD RECIENTE</span><h2>Lo que va pasando</h2></div></div>{snapshot?.class_activity?.length ? <div className={styles.activityList}>{snapshot.class_activity.slice(0, 5).map((item) => <div key={item.id}><CircleCheck /><span><strong>{item.title}</strong><small>{dateLabel(item.created_at, false)}</small></span></div>)}</div> : <p className={styles.emptyText}>Aquí iremos guardando tus avances, clases y nuevos contenidos para que puedas mirar atrás cuando quieras.</p>}</article>
        </section>
      </> : null}

      {screen === "progress" ? <section className={styles.pageSection}>
        <header className={styles.pageHeading}><span>PROGRESO</span><h1>En qué enfocarte ahora</h1><p>Primero lo que te ayuda hoy; después, toda tu evolución.</p></header>
        <div className={styles.focusList}>{activeAssignments.slice(0, 3).map((item) => <article key={item.id}><Target /><div><span>{contentTypeLabels[item.content_type] ?? item.content_type}</span><strong>{item.title}</strong><small>{assignmentStateLabels[item.assignment_status] ?? item.assignment_status}</small></div></article>)}{!activeAssignments.length ? <p className={styles.emptyText}>Ahora mismo no tienes nada marcado como prioritario. Eso también significa que puedes elegir por dónde seguir.</p> : null}</div>

        <div className={styles.homeColumns}>
          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>TU EVALUACIÓN</span><h2>Última foto de tu progreso</h2></div><strong>{latestScores.length}</strong></div>{latestScores.length ? <div className={styles.scoreList}>{latestScores.map((item) => <div key={item.aptitude_term_id}><span>{item.aptitude}</span><strong>{item.score}</strong></div>)}</div> : <p className={styles.emptyText}>Aún no hemos guardado una evaluación completa. Tu progreso puede seguir construyéndose mientras tanto.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>DESDE LA ANTERIOR</span><h2>Qué ha mejorado</h2></div><strong>{improvements.length}</strong></div>{improvements.length ? <div className={styles.activityList}>{improvements.map(({ latest, previous, delta }) => <div key={latest.aptitude_term_id}><TrendingUp /><span><strong>{latest.aptitude}</strong><small>{previous.score} → {latest.score} · +{delta} puntos</small></span></div>)}</div> : <p className={styles.emptyText}>Cuando tengamos dos evaluaciones comparables, aquí verás únicamente mejoras respaldadas por tus datos.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>EVOLUCIÓN</span><h2>Cómo ha ido cambiando</h2></div><strong>{evaluationTimeline.length}</strong></div>{evaluationTimeline.length ? <div className={styles.activityList}>{evaluationTimeline.slice(0, 10).map((item) => <div key={item.id}><CalendarDays /><span><strong>{item.aptitude} · {item.score}</strong><small>{item.style} · {item.level} · {dateLabel(item.created_at, false)}</small></span></div>)}</div> : <p className={styles.emptyText}>Tu historial de evaluación aparecerá aquí a medida que vayamos guardando nuevas fotos de tu progreso.</p>}</article>

          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>HITOS</span><h2>Pasos que ya forman parte de tu camino</h2></div><strong>{progressMilestones.length}</strong></div>{progressMilestones.length ? <div className={styles.activityList}>{progressMilestones.map((milestone) => <div key={milestone.key}><CircleCheck /><span><strong>{milestone.title}</strong><small>{milestone.detail}</small></span></div>)}</div> : <p className={styles.emptyText}>Tus primeros hitos aparecerán aquí cuando exista actividad real suficiente para reconocerlos.</p>}</article>
        </div>

        <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>MULTIMEDIA</span><h2>Mis vídeos</h2></div><strong>{progressVideos.length}</strong></div>{progressVideos.length ? <div className={styles.homeColumns}>{progressVideos.slice(0, 12).map((video) => <div key={video.key}><SecureDriveAsset fileId={video.fileId} mediaType="video" title={video.title} controls className={styles.prepVideo} /><p className={styles.emptyText}>{video.title} · {dateLabel(video.createdAt, false)}</p></div>)}</div> : <p className={styles.emptyText}>Cuando tengas vídeos personales de evolución o vídeos guardados de clase, los tendrás reunidos aquí.</p>}</article>
      </section> : null}

      {screen === "formation" ? <section className={styles.pageSection}><header className={styles.pageHeading}><span>MI FORMACIÓN</span><h1>{formationTab === "summary" ? "Resumen" : formationTab === "practice" ? "A practicar" : formationTab === "classes" ? "Clases realizadas" : "Contenido"}</h1><p>{formationTab === "summary" ? "Tu aprendizaje, ordenado para saber qué toca y dónde encontrarlo." : formationTab === "practice" ? "Todo lo que merece práctica ahora, junto y sin hacerte buscar." : formationTab === "classes" ? "Tu historia de clases, ordenada por cada vez que nos vimos." : "Todo lo que ya forma parte de tu espacio de aprendizaje."}</p></header>
        {formationTab === "summary" ? <><div className={styles.formationAccess}><button type="button" onClick={() => goFormation("practice")}><Target /><span><strong>A practicar</strong><small>{activeAssignments.length} elementos activos</small></span><ChevronRight /></button><button type="button" onClick={() => goFormation("classes")}><CalendarDays /><span><strong>Clases realizadas</strong><small>{snapshot?.classes.filter((item) => item.status === "finished").length ?? 0} en tu historial</small></span><ChevronRight /></button><button type="button" onClick={() => goFormation("content")}><BookOpen /><span><strong>Contenido</strong><small>{snapshot?.assignments.length ?? 0} elementos en tu espacio</small></span><ChevronRight /></button></div>{snapshot?.credits?.length ? <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>SALDO</span><h2>Mis bonos</h2></div><strong>{snapshot.credits.length}</strong></div><div className={styles.activityList}>{snapshot.credits.map((credit) => <div key={credit.id}><CircleCheck /><span><strong>{credit.label || (credit.modality === "pair" ? "Bono de pareja" : "Bono individual")}</strong><small>{minutesLabel(credit.balance_minutes)} disponibles</small></span></div>)}</div></article> : null}</> : null}
        {formationTab === "practice" ? <div className={styles.contentList}>{activeAssignments.map((item) => <article key={item.id}><div><span>{contentTypeLabels[item.content_type] ?? item.content_type}</span><h3>{item.title}</h3><p>{item.description || item.correction_guidance || "Lo tienes guardado para seguir trabajándolo."}</p></div><strong>{assignmentStateLabels[item.assignment_status] ?? item.assignment_status}</strong></article>)}{!activeAssignments.length ? <p className={styles.emptyText}>No tienes tareas activas ahora mismo.</p> : null}</div> : null}
        {formationTab === "classes" ? <div className={styles.homeColumns}>
          {snapshot?.class_summaries?.length ? <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>CIERRES PEDAGÓGICOS</span><h2>Resumen de mis clases</h2></div><strong>{snapshot.class_summaries.length}</strong></div><div className={styles.activityList}>{snapshot.class_summaries.slice(0, 8).map((summary) => <div key={summary.class_id}><CircleCheck /><span><strong>{dateLabel(summary.closed_at, false)}</strong><small>{summary.student_message || "Clase cerrada y documentación actualizada."}</small></span></div>)}</div></article> : null}
          {studentNotes.length ? <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>MENSAJES DE CLASE</span><h2>Observaciones de mis clases</h2></div><strong>{studentNotes.length}</strong></div><div className={styles.activityList}>{studentNotes.slice(0, 10).map((note) => <div key={note.id}><MessageCircle /><span><strong>{dateLabel(note.created_at, false)}</strong><small>{note.body}</small></span></div>)}</div></article> : null}
          {privateVideos.length ? <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>MULTIMEDIA</span><h2>Vídeos de mis clases</h2></div><strong>{privateVideos.length}</strong></div>{privateVideos.slice(0, 8).map((video) => <div key={video.id}><SecureDriveAsset fileId={video.external_file_id} mediaType="video" title={video.title || "Vídeo de clase"} controls className={styles.prepVideo} /><p className={styles.emptyText}>{video.title || "Vídeo de clase"}</p></div>)}</article> : null}
          {snapshot?.class_media?.length ? <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>ARCHIVOS</span><h2>Documentación de clase</h2></div><strong>{snapshot.class_media.length}</strong></div>{snapshot.class_media.slice(0, 8).map((media) => <div key={media.id}><SecureDriveAsset fileId={media.external_file_id} mediaType={media.media_type} title={media.title || (media.media_kind === "final_dance" ? "Baile final" : "Documento de clase")} controls={media.media_type === "video"} className={styles.prepVideo} /><p className={styles.emptyText}>{media.title || (media.media_kind === "final_dance" ? "Baile final" : "Documento de clase")}</p></div>)}</article> : null}
          <article className={styles.openSection}><div className={styles.sectionHeading}><div><span>HISTORIAL</span><h2>Mis clases</h2></div><strong>{snapshot?.classes.length ?? 0}</strong></div><div className={styles.classList}>{snapshot?.classes.sort((a, b) => new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()).map((item) => <article key={item.id}><CalendarDays /><div><strong>{item.style || "Clase"}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(item.duration_minutes)} · {classStatusLabel(item.status)}</span></div></article>)}</div>{!snapshot?.classes.length ? <p className={styles.emptyText}>Cuando tengas clases, aquí podrás recorrerlas una a una.</p> : null}</article>
        </div> : null}
        {formationTab === "content" ? <div className={styles.contentList}>{snapshot?.assignments.map((item) => <article key={item.id}><div><span>{contentTypeLabels[item.content_type] ?? item.content_type}</span><h3>{item.title}</h3><p>{item.description || "Este contenido ya forma parte de tu espacio."}</p></div><strong>{assignmentStateLabels[item.assignment_status] ?? item.assignment_status}</strong></article>)}</div> : null}
      </section> : null}

      {screen === "discover" ? <section className={styles.pageSection}><header className={styles.pageHeading}><span>DESCUBRE</span><h1>Más formas de aprender y vivir CYA</h1><p>Aquí reunimos lo que puedes descubrir aunque no tengas una clase programada.</p></header><div className={styles.discoverGrid}><article className={styles.discoverCard}><GraduationCap /><div><span>APRENDE ONLINE</span><h2>Aprende a tu ritmo</h2><p>Programas, rutas y contenido guiado estarán aquí cuando abramos Academia Online.</p></div></article><article className={styles.discoverCard}><CalendarDays /><div><span>EVENTOS</span><h2>Nos vemos también fuera de clase</h2><p>Talleres, intensivos y eventos tendrán aquí su hogar. Si te apuntas a uno, también aparecerá entre tus próximos compromisos.</p></div></article></div><AcademyOnlineStudentComingSoon /></section> : null}

      {screen === "missions" ? <section className={styles.pageSection}>
        <header className={styles.pageHeading}><span>MISIONES</span><h1>Pequeños pasos que sí cuentan</h1><p>Primero lo que merece atención; después, lo que puedes hacer cuando te venga bien.</p></header>
        {[
          { key: "now", label: "AHORA", title: "Prioritarias", items: missionGroups.now, empty: "No hay ninguna misión prioritaria ahora mismo." },
          { key: "available", label: "DISPONIBLES", title: "Para cuando te venga bien", items: missionGroups.available, empty: "No tienes más misiones disponibles ahora mismo." },
          { key: "progress", label: "EN PROGRESO", title: "Lo que ya has empezado", items: missionGroups.inProgress, empty: "No tienes ninguna misión en marcha." },
          { key: "completed", label: "COMPLETADAS", title: "Lo que ya has hecho", items: missionGroups.completed, empty: "Tus misiones completadas aparecerán aquí." },
        ].map((group) => <article className={styles.openSection} key={group.key}>
          <div className={styles.sectionHeading}><div><span>{group.label}</span><h2>{group.title}</h2></div><strong>{group.items.length}</strong></div>
          {group.items.length ? <div className={styles.missionList}>{group.items.map((mission) => {
            const canStart = ["available", "not_done", "postponed"].includes(mission.state);
            const canComplete = ["available", "not_done", "postponed", "in_progress"].includes(mission.state);
            const isCompleted = ["completed", "completed_automatically"].includes(mission.state);
            return <article key={mission.id}><div><span>{mission.priority === "urgent" ? "Urgente" : mission.priority === "priority" ? "Prioritaria" : mission.mission_type === "daily" ? "Misión diaria" : "Misión"}</span><h3>{mission.title}</h3><p>{mission.description || "Una acción para seguir avanzando."}</p><small>{missionStateLabel(mission)}{mission.due_at ? ` · ${dateLabel(mission.due_at)}` : ""}</small></div><div>{canStart ? <button type="button" onClick={() => void actOnMission(mission, "start")}>Empezar</button> : null}{canComplete ? <button type="button" onClick={() => void actOnMission(mission, "complete")}><Check /> Completar</button> : null}{isCompleted ? <CircleCheck aria-label="Completada" /> : null}</div></article>;
          })}</div> : <p className={styles.emptyText}>{group.empty}</p>}
        </article>)}
      </section> : null}

      {screen === "feedback" ? <section className={styles.pageSection}><button className={styles.backButton} type="button" onClick={() => go("home")}><ChevronRight /> Volver a Inicio</button><FeedbackOnlineStudentPanel client={client} /></section> : null}
      {screen === "bz" ? <section className={styles.pageSection}><button className={styles.backButton} type="button" onClick={() => go("home")}><ChevronRight /> Volver a Inicio</button><BZPointsPanel client={client} assignments={snapshot?.assignments ?? []} /></section> : null}
      {screen === "notifications" ? <section className={styles.pageSection}><NotificationsView client={client} timezone={identity.timezone} openTarget={notificationTarget} onUnreadChange={setUnread} notify={setToast} /></section> : null}
      {screen === "profile" ? <section className={styles.pageSection}><ProfileSettingsView client={client} identity={identity} onIdentityPatch={onIdentityPatch} notify={setToast} /></section> : null}
      {screen === "preferences" ? <section className={styles.pageSection}><PreferencesSettingsView client={client} identity={identity} experience={experience} onIdentityPatch={onIdentityPatch} notify={setToast} /></section> : null}
    </main>

    <nav className={styles.bottomNav} aria-label="Portal CYA">
      <button type="button" className={screen === "home" ? styles.active : ""} onClick={() => go("home")}><House /><span>Inicio</span></button>
      <button type="button" className={screen === "progress" ? styles.active : ""} onClick={() => go("progress")}><TrendingUp /><span>Progreso</span></button>
      <div className={styles.formationNav}>
        <button type="button" className={`${styles.formationMain} ${screen === "formation" ? styles.active : ""}`} onClick={() => goFormation("summary")}><BookOpen /><span>Mi formación</span></button>
        <button type="button" className={styles.formationToggle} aria-label="Abrir apartados de Mi formación" aria-expanded={formationMenu} onClick={() => setFormationMenu((value) => !value)}><ChevronDown /></button>
      </div>
      <button type="button" className={screen === "discover" ? styles.active : ""} onClick={() => go("discover")}><Compass /><span>Descubre</span></button>
      <button type="button" className={screen === "missions" ? styles.active : ""} onClick={() => go("missions")}><Target /><span>Misiones</span></button>
    </nav>

    {formationMenu ? <div className={styles.formationSheet} role="menu" aria-label="Apartados de Mi formación"><div><strong>Mi formación</strong><button type="button" aria-label="Cerrar" onClick={() => setFormationMenu(false)}><X /></button></div><button type="button" onClick={() => goFormation("summary")}><Sparkles /> Resumen <ChevronRight /></button><button type="button" onClick={() => goFormation("practice")}><Target /> A practicar <ChevronRight /></button><button type="button" onClick={() => goFormation("classes")}><CalendarDays /> Clases realizadas <ChevronRight /></button><button type="button" onClick={() => goFormation("content")}><BookOpen /> Contenido <ChevronRight /></button></div> : null}

    {toast ? <div className={styles.toast}>{toast}</div> : null}
  </div>;
}
