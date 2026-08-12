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
  Pencil,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TeachingContentCard, type TeachingCardMedia } from "./teaching-content-card";
import { EvaluationRadar } from "./evaluation-radar";
import { ContextEvaluationPanel } from "./context-evaluation-panel";
import { StudentIdentityEditor } from "./person-identity-editor";
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

type Term = { id: number; label: string; term_key?: string; taxonomy: string; metadata?: Record<string, unknown>; sort_order?: number };
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
type LibraryContent = {
  id: number;
  teaching_content_media: TeachingCardMedia[];
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
  health_notes?: string | null;
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
  session_id: number | null;
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
type StudentIncident = {
  id: number;
  incident_type: "negative_balance";
  status: "open" | "resolved" | "accepted";
  title: string;
  related_class_id: number | null;
  related_grant_id: number | null;
  debt_minutes: number;
  remaining_minutes: number;
  resolution_mode: "regularized" | "accepted_without_regularization" | null;
  resolution_note: string | null;
  created_at: string;
  student_incident_people: Array<{ person_id: number }>;
};
type ClassFinancial = {
  actual_duration_minutes: number | null;
  billed_duration_minutes: number | null;
  billed_minutes: number;
  uncovered_minutes: number;
  billing_status: string;
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
  const numeric = Number(value) || 0;
  const absolute = Math.abs(Math.trunc(numeric));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  const text = [hours ? `${hours} h` : "", minutes ? `${minutes} min` : ""].filter(Boolean).join(" ") || "0 min";
  return numeric < 0 ? `−${text}` : text;
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

export function StudentMasterDetail({
  client,
  student,
  terms,
  classes,
  credits,
  assignments,
  teachingContents,
  crmContact,
  rates,
  refresh,
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
  teachingContents: LibraryContent[];
  crmContact: CrmContact | null;
  rates: Rate[];
  refresh: () => Promise<void>;
  close: () => void;
  schedule: () => void;
  addCredit: () => void;
  openClass: (id: number) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [identityEditorOpen,setIdentityEditorOpen] = useState(false);
  const [profileRefresh,setProfileRefresh] = useState(0);
  const [danceProfiles, setDanceProfiles] = useState<DanceProfile[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [evaluationDraftOpen,setEvaluationDraftOpen]=useState(false);
  const [evaluationProfileId,setEvaluationProfileId]=useState<number|null>(null);
  const [evaluationLevelId,setEvaluationLevelId]=useState<number|null>(null);
  const [evaluationKind,setEvaluationKind]=useState<"manual"|"reevaluation">("manual");
  const [evaluationSessionId,setEvaluationSessionId]=useState<number|null>(null);
  const [evaluationScores,setEvaluationScores]=useState<Record<number,number>>({});
  const [evaluationBusy,setEvaluationBusy]=useState("");
  const [crmActivities, setCrmActivities] = useState<CrmActivity[]>([]);
  const [incidents, setIncidents] = useState<StudentIncident[]>([]);
  const [liveBalances, setLiveBalances] = useState<Record<number, number>>({});
  const [classFinancial, setClassFinancial] = useState<Record<number, ClassFinancial>>({});
  const [incidentGrant, setIncidentGrant] = useState<Record<number, string>>({});
  const [acceptingIncident, setAcceptingIncident] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<Record<number, string>>({});
  const [financialBusy, setFinancialBusy] = useState("");
  const [financialNotice, setFinancialNotice] = useState("");
  const [financialRefresh, setFinancialRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      const [profileResult, danceResult, evaluationResult, activityResult] = await Promise.all([
        client.from("student_profiles").select("person_id,student_since,goals,teacher_notes,health_notes,active").eq("person_id", student.id).maybeSingle(),
        client.from("student_dance_profiles").select("id,style_term_id,role_term_id,level_term_id,is_primary,active").eq("person_id", student.id).eq("active", true).order("is_primary", { ascending: false }),
        client.from("student_evaluations").select("id,session_id,person_id,class_id,style_term_id,role_term_id,level_term_id,aptitude_term_id,score,evaluation_kind,note,created_at").eq("person_id", student.id).order("created_at", { ascending: false }),
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
  }, [client, student.id, profileRefresh]);

  useEffect(() => {
    let alive = true;
    async function loadFinancial() {
      const ownCreditIds = credits.filter((credit) => credit.credit_grant_members.some((member) => member.person_id === student.id)).map((credit) => credit.id);
      const linkResult = await client.from("student_incident_people").select("incident_id").eq("person_id", student.id);
      if (!alive) return;
      if (linkResult.error) { setError(linkResult.error.message); return; }
      const incidentIds = [...new Set((linkResult.data ?? []).map((row) => Number(row.incident_id)).filter(Boolean))];
      let nextIncidents: StudentIncident[] = [];
      if (incidentIds.length) {
        const incidentResult = await client.from("student_incidents")
          .select("id,incident_type,status,title,related_class_id,related_grant_id,debt_minutes,remaining_minutes,resolution_mode,resolution_note,created_at,student_incident_people(person_id)")
          .in("id", incidentIds)
          .order("created_at", { ascending: false });
        if (!alive) return;
        if (incidentResult.error) { setError(incidentResult.error.message); return; }
        nextIncidents = (incidentResult.data ?? []) as unknown as StudentIncident[];
      }

      const balances: Record<number, number> = {};
      if (ownCreditIds.length) {
        const movementResult = await client.from("credit_movements").select("grant_id,delta_minutes").in("grant_id", ownCreditIds);
        if (!alive) return;
        if (movementResult.error) { setError(movementResult.error.message); return; }
        ownCreditIds.forEach((id) => { balances[id] = 0; });
        for (const movement of movementResult.data ?? []) balances[Number(movement.grant_id)] = (balances[Number(movement.grant_id)] ?? 0) + Number(movement.delta_minutes || 0);
      }

      const participantResult = await client.from("class_participants")
        .select("class_id,billed_minutes,uncovered_minutes,billing_status,classes(actual_duration_minutes,billed_duration_minutes)")
        .eq("person_id", student.id);
      if (!alive) return;
      if (participantResult.error) { setError(participantResult.error.message); return; }
      const financialByClass: Record<number, ClassFinancial> = {};
      for (const row of participantResult.data ?? []) {
        const nested = row.classes as unknown as { actual_duration_minutes: number | null; billed_duration_minutes: number | null } | Array<{ actual_duration_minutes: number | null; billed_duration_minutes: number | null }> | null;
        const classData = Array.isArray(nested) ? nested[0] : nested;
        financialByClass[Number(row.class_id)] = {
          actual_duration_minutes: classData?.actual_duration_minutes ?? null,
          billed_duration_minutes: classData?.billed_duration_minutes ?? null,
          billed_minutes: Number(row.billed_minutes || 0),
          uncovered_minutes: Number(row.uncovered_minutes || 0),
          billing_status: String(row.billing_status || "planned"),
        };
      }
      if (!alive) return;
      setIncidents(nextIncidents);
      setLiveBalances(balances);
      setClassFinancial(financialByClass);
    }
    void loadFinancial();
    return () => { alive = false; };
  }, [client, credits, student.id, financialRefresh]);

  const ownClasses = useMemo(() => classes
    .filter((item) => item.class_participants.some((participant) => participant.person_id === student.id))
    .sort((a, b) => new Date(b.scheduled_start_at).getTime() - new Date(a.scheduled_start_at).getTime()), [classes, student.id]);
  const upcoming = [...ownClasses]
    .filter((item) => item.status === "scheduled" && new Date(item.scheduled_start_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime());
  const ownCredits = useMemo(() => credits
    .filter((item) => item.credit_grant_members.some((member) => member.person_id === student.id))
    .sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime()), [credits, student.id]);
  const balanceFor = (credit: CreditItem) => Object.prototype.hasOwnProperty.call(liveBalances, credit.id) ? liveBalances[credit.id] : creditBalance(credit);
  const availableBalance = ownCredits.filter((item) => item.status === "active").reduce((sum, item) => sum + Math.max(0, balanceFor(item)), 0);
  const openIncidents = incidents.filter((incident) => incident.status === "open" && incident.incident_type === "negative_balance");
  const pendingDebt = openIncidents.reduce((sum, incident) => sum + Number(incident.remaining_minutes || 0), 0);
  const balance = availableBalance - pendingDebt;
  const ownAssignments = useMemo(() => assignments.filter((item) => item.person_id === student.id), [assignments, student.id]);
  const activeAssignments = ownAssignments.filter((item) => !["corrected", "explained", "completed"].includes(item.assignment_status));
  const crm = crmContact?.crm_profiles?.[0] ?? null;
  const selectedRate = crm?.rate_id ? rates.find((rate) => rate.id === crm.rate_id) ?? null : null;

  const latestByAptitude = new Map<number, Evaluation>();
  evaluations.forEach((item) => { if (!latestByAptitude.has(item.aptitude_term_id)) latestByAptitude.set(item.aptitude_term_id, item); });
  const radarItems = [...latestByAptitude.values()].map((item) => ({ id:item.aptitude_term_id,label:termLabel(item.aptitude_term_id,terms),value:item.score as number|null }));
  const averageScore = radarItems.length ? Math.round(radarItems.reduce((sum, item) => sum + Number(item.value || 0), 0) / radarItems.length) : null;

  const issues = [
    ...openIncidents.map((incident) => ({ key: `debt-${incident.id}`, label: `Saldo pendiente: ${minutesLabel(incident.remaining_minutes)}`, tab: "credits" as Tab })),
    ...ownCredits.filter((item) => item.payment_status === "pending").map((item) => ({ key: `payment-${item.id}`, label: "Hay un bono con pago pendiente", tab: "credits" as Tab })),
    ...ownClasses.filter((item) => item.status === "finished" && !item.pedagogy_closed_at).map((item) => ({ key: `class-${item.id}`, label: "Hay una clase pendiente de cierre pedagógico", tab: "classes" as Tab })),
    ...(!danceProfiles.length ? [{ key: "dance", label: "Falta definir el contexto de baile del alumno", tab: "data" as Tab }] : []),
    ...(upcoming.length && balance <= 0 ? [{ key: "balance", label: "Tiene una próxima clase y el saldo neto no es positivo", tab: "credits" as Tab }] : []),
  ];

  function compatibleCredits(incident: StudentIncident) {
    const people = incident.student_incident_people.map((link) => link.person_id);
    return ownCredits.filter((grant) => grant.status === "active" && balanceFor(grant) > 0)
      .filter((grant) => people.every((personId) => grant.credit_grant_members.some((member) => member.person_id === personId)))
      .filter((grant) => people.length <= 1 || grant.modality === "pair");
  }

  async function regularizeIncident(incident: StudentIncident, grantIdOverride?: number) {
    const grantId = grantIdOverride || Number(incidentGrant[incident.id] || 0);
    if (!grantId) return;
    setFinancialBusy(`regularize-${incident.id}`);
    setFinancialNotice("");
    setError("");
    const result = await client.rpc("regularize_student_incident", { p_incident_id: incident.id, p_grant_id: grantId });
    if (result.error) setError(result.error.message);
    else {
      const remaining = Number((result.data as { remaining_minutes?: number } | null)?.remaining_minutes || 0);
      setFinancialNotice(remaining > 0 ? `Se ha aplicado el saldo disponible. Quedan ${minutesLabel(remaining)} pendientes.` : "Incidencia regularizada. El saldo pendiente ha quedado a cero.");
      setFinancialRefresh((value) => value + 1);
    }
    setFinancialBusy("");
  }

  async function acceptIncident(incident: StudentIncident) {
    const note = (resolutionNotes[incident.id] || "").trim();
    if (note.length < 3) return setError("Escribe un motivo breve antes de aceptar que el saldo no se regularizará.");
    setFinancialBusy(`accept-${incident.id}`);
    setFinancialNotice("");
    setError("");
    const result = await client.rpc("accept_student_incident_without_regularization", { p_incident_id: incident.id, p_note: note });
    if (result.error) setError(result.error.message);
    else {
      setFinancialNotice("Incidencia cerrada conscientemente sin regularizar. La decisión queda registrada en auditoría.");
      setAcceptingIncident(null);
      setFinancialRefresh((value) => value + 1);
    }
    setFinancialBusy("");
  }

  const evaluationProfile=danceProfiles.find((item) => item.id===evaluationProfileId) ?? danceProfiles.find((item) => item.is_primary) ?? danceProfiles[0] ?? null;
  const effectiveEvaluationLevelId=evaluationLevelId ?? evaluationProfile?.level_term_id ?? null;
  const evaluationLevel=terms.find((term) => term.id===effectiveEvaluationLevelId && term.taxonomy==='dance_level') ?? null;
  const evaluationStyle=terms.find((term) => term.id===evaluationProfile?.style_term_id), evaluationRole=terms.find((term) => term.id===evaluationProfile?.role_term_id);
  const evaluationAptitudes=terms.filter((term) => { if (term.taxonomy!=='aptitude' || !evaluationLevel) return false; const metadata=term.metadata ?? {}, levels=Array.isArray(metadata.levels)?metadata.levels as unknown[]:null, styles=Array.isArray(metadata.styles)?metadata.styles as unknown[]:null, roles=Array.isArray(metadata.roles)?metadata.roles as unknown[]:null; return (!levels || levels.includes(evaluationLevel.term_key ?? '')) && (!styles || styles.includes(evaluationStyle?.term_key ?? '')) && (!roles || roles.includes(evaluationRole?.term_key ?? '')); });
  const evaluationScale=terms.filter((term) => term.taxonomy==='evaluation_scale').map((term) => ({term,score:Number(term.metadata?.score)})).filter(({score}) => [0,25,50,75,100].includes(score)).sort((a,b)=>a.score-b.score);
  const hasPreviousContextEvaluation=Boolean(evaluationProfile && evaluations.some((item) => item.style_term_id===evaluationProfile.style_term_id && item.role_term_id===evaluationProfile.role_term_id));

  async function startEvaluationCapture() {
    if (!evaluationProfile || !effectiveEvaluationLevelId) return setError('Selecciona primero el nivel y el contexto de baile.');
    setEvaluationBusy('start'); setError('');
    const kind=hasPreviousContextEvaluation?evaluationKind:'initial';
    const result=await client.rpc('start_student_evaluation',{p_person_id:student.id,p_level_term_id:effectiveEvaluationLevelId,p_evaluation_kind:kind,p_style_term_id:evaluationProfile.style_term_id,p_role_term_id:evaluationProfile.role_term_id,p_class_id:null,p_note:null});
    if (result.error) setError(result.error.message); else { setEvaluationSessionId(Number((result.data as {id:number}).id)); setEvaluationScores({}); }
    setEvaluationBusy('');
  }

  async function saveEvaluationCapture(aptitudeId:number,score:number) {
    if (!evaluationSessionId) return; setEvaluationBusy(`score-${aptitudeId}`); setError('');
    const result=await client.rpc('save_evaluation_score',{p_session_id:evaluationSessionId,p_aptitude_term_id:aptitudeId,p_score:score,p_note:null});
    if (result.error) setError(result.error.message); else { const row=result.data as Evaluation; setEvaluationScores((current) => ({...current,[aptitudeId]:score})); setEvaluations((current) => [row,...current.filter((item) => item.id!==row.id)]); }
    setEvaluationBusy('');
  }

  async function finishEvaluationCapture() {
    if (!evaluationSessionId) return; setEvaluationBusy('finish'); setError('');
    const result=await client.rpc('complete_evaluation_session',{p_session_id:evaluationSessionId});
    if (result.error) setError(result.error.message); else { setEvaluationSessionId(null); setEvaluationDraftOpen(false); setEvaluationScores({}); }
    setEvaluationBusy('');
  }

  function renderSummary() {
    return <div className={styles.stack}>
      {issues.length ? <section className={`${styles.issueBox} ${styles.issueBad}`}><header><AlertTriangle /><div><strong>{issues.length === 1 ? "1 incidencia por revisar" : `${issues.length} incidencias por revisar`}</strong><span>CYA las obtiene de los datos actuales, sin duplicar estados.</span></div></header><div>{issues.map((issue) => <button key={issue.key} onClick={() => setTab(issue.tab)}><span>{issue.label}</span><ChevronRight /></button>)}</div></section>
        : <section className={`${styles.issueBox} ${styles.issueGood}`}><header><CheckCircle2 /><div><strong>Todo en orden</strong><span>No hay incidencias operativas detectadas para este alumno.</span></div></header></section>}

      <section className={styles.metrics}>
        <article><WalletCards /><span>Saldo neto</span><strong>{minutesLabel(balance)}</strong>{pendingDebt > 0 ? <small>{minutesLabel(pendingDebt)} pendientes de regularizar</small> : null}</article>
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
      {ownAssignments.length ? <div className={styles.learningList}>{ownAssignments.map((assignment) => { const libraryContent = teachingContents.find((content) => content.id === assignment.content_id); return <TeachingContentCard
        key={assignment.id}
        kindLabel={contentLabels[assignment.teaching_contents.content_type] ?? assignment.teaching_contents.content_type}
        title={assignment.teaching_contents.title}
        subtitle={`${assignmentLabels[assignment.assignment_status] ?? assignment.assignment_status}${assignment.current_frequency !== null ? ` · Frec. ${assignment.current_frequency}` : ""}${assignment.current_importance !== null ? ` · Importancia ${assignment.current_importance}` : ""}`}
        statusLabel={assignmentLabels[assignment.assignment_status] ?? assignment.assignment_status}
        statusTone={["corrected","explained","completed"].includes(assignment.assignment_status) ? "success" : "default"}
        description={assignment.teaching_contents.description}
        correctionGuidance={assignment.teaching_contents.correction_guidance}
        media={libraryContent?.teaching_content_media ?? []}
        metadata={[
          { label: "Estilo", value: termLabel(assignment.snapshot_style_term_id, terms) },
          { label: "Rol", value: termLabel(assignment.snapshot_role_term_id, terms) },
          { label: "Nivel", value: termLabel(assignment.snapshot_level_term_id, terms) },
        ]}
      />; })}</div> : <div className={styles.empty}><BookOpen /><span>No hay formación asignada todavía.</span></div>}
    </section>;
  }

  function renderEvaluation() {
    return <div className={styles.evalStack}>
      <section className={styles.sectionCard}><ContextEvaluationPanel client={client} personId={student.id} personName={student.display_name} onCompleted={async () => { setProfileRefresh((value) => value + 1); await refresh(); }} /></section>
      <div className={styles.evalGrid}><section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Último estado</span><h3>Evolución por aptitud</h3></div>{averageScore !== null ? <b>{averageScore}/100</b> : null}</div>{radarItems.length ? <EvaluationRadar items={radarItems} scale={evaluationScale.map(({term,score}) => ({score,label:term.label}))} readonly ariaLabel={`Última evaluación de ${student.display_name}`} /> : <div className={styles.empty}><TrendingUp /><span>Todavía no hay evaluaciones.</span></div>}</section><section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Historial</span><h3>Evaluaciones registradas</h3></div><b>{evaluations.length}</b></div>{evaluations.length ? <div className={styles.historyList}>{evaluations.slice(0, 30).map((item) => <div key={item.id}><div><strong>{termLabel(item.aptitude_term_id, terms)}</strong><span>{dateLabel(item.created_at)} · {termLabel(item.level_term_id,terms)} · {termLabel(item.style_term_id, terms)} · {termLabel(item.role_term_id, terms)}</span>{item.note ? <small>{item.note}</small> : null}</div><b>{item.score}</b></div>)}</div> : <div className={styles.empty}><TrendingUp /><span>Sin historial de evaluación.</span></div>}</section></div>
    </div>;
  }

  function renderClasses() {
    return <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Clases</span><h3>Historial y próximas</h3></div><button onClick={schedule}>Programar clase</button></div>
      {ownClasses.length ? <div className={styles.classList}>{ownClasses.map((item) => {
        const participant = item.class_participants.find((value) => value.person_id === student.id);
        const financial = classFinancial[item.id];
        const actualDuration = item.status === "finished" ? financial?.actual_duration_minutes ?? item.duration_minutes : item.duration_minutes;
        const actionable = item.status === "scheduled" || item.status === "active" || (item.status === "finished" && !item.pedagogy_closed_at);
        const financialLabel = financial?.billing_status === "accepted_uncovered" && financial.uncovered_minutes
          ? ` · Aceptado sin regularizar ${minutesLabel(financial.uncovered_minutes)}`
          : financial?.uncovered_minutes ? ` · Pendiente ${minutesLabel(financial.uncovered_minutes)}` : "";
        return <article key={item.id}><span className={styles.classIcon}><CalendarDays /></span><div><strong>{termLabel(item.style_term_id, terms)} · {item.class_type === "pair" ? "Pareja" : "Individual"}</strong><span>{dateLabel(item.scheduled_start_at)} · {minutesLabel(actualDuration)}{item.status === "finished" && actualDuration !== item.duration_minutes ? ` reales · prevista ${minutesLabel(item.duration_minutes)}` : ""}</span><small>{classLabels[item.status] ?? item.status} · {participant?.attendance_status === "present" ? "Asistió" : participant?.attendance_status === "absent" ? "Ausente" : "Asistencia pendiente"}{financialLabel}</small>{item.notes ? <p>{item.notes}</p> : null}</div>{actionable ? <button onClick={() => openClass(item.id)}>{item.status === "scheduled" ? "Dar clase" : "Abrir"}</button> : <span className={styles.statusPill}>{classLabels[item.status] ?? item.status}</span>}</article>;
      })}</div> : <div className={styles.empty}><CalendarDays /><span>No hay clases registradas.</span></div>}
    </section>;
  }

  function renderCredits() {
    return <div className={styles.stack}>
      {openIncidents.length ? <section className={styles.sectionCard}>
        <div className={styles.sectionHead}><div><span>Incidencias de saldo</span><h3>Pendiente de decisión</h3></div><b>{openIncidents.length}</b></div>
        <p>Estas incidencias no desaparecen solas. Puedes regularizarlas con un bono o aceptar expresamente que no se regularizarán.</p>
        <div className={styles.stack}>{openIncidents.map((incident) => {
          const compatible = compatibleCredits(incident);
          const selected = incidentGrant[incident.id] || (compatible[0] ? String(compatible[0].id) : "");
          const relatedClass = incident.related_class_id ? ownClasses.find((item) => item.id === incident.related_class_id) : null;
          return <article className="card" key={incident.id}>
            <div className={styles.sectionHead}><div><span>{relatedClass ? dateLabel(relatedClass.scheduled_start_at, false) : dateLabel(incident.created_at, false)}</span><h3>{incident.title}</h3></div><b>{minutesLabel(incident.remaining_minutes)}</b></div>
            <p>{incident.remaining_minutes < incident.debt_minutes ? `Deuda original ${minutesLabel(incident.debt_minutes)} · ya se ha regularizado una parte.` : "Este tiempo sigue pendiente de regularizar."}</p>
            {compatible.length ? <div className="fields-2"><label className="field"><span>Bono para regularizar</span><select value={selected} onChange={(event) => setIncidentGrant((current) => ({ ...current, [incident.id]: event.target.value }))}>{compatible.map((grant) => <option key={grant.id} value={grant.id}>{grant.label || (grant.modality === "pair" ? "Bono de pareja" : "Bono individual")} · {minutesLabel(balanceFor(grant))}</option>)}</select></label><div className="field"><span>Acción</span><button className="btn" type="button" disabled={financialBusy === `regularize-${incident.id}`} onClick={() => void regularizeIncident(incident, Number(selected))}>{financialBusy === `regularize-${incident.id}` ? "Regularizando…" : "Regularizar con bono"}</button></div></div> : <p>No hay un bono compatible con saldo disponible. Puedes añadir uno y después volver a esta incidencia.</p>}
            {acceptingIncident === incident.id ? <div><label className="field"><span>Motivo para no regularizar *</span><textarea rows={2} value={resolutionNotes[incident.id] || ""} onChange={(event) => setResolutionNotes((current) => ({ ...current, [incident.id]: event.target.value }))} placeholder="Deja constancia del motivo de la decisión" /></label><div className="actions"><button className="btn ghost" type="button" onClick={() => setAcceptingIncident(null)}>Cancelar</button><button className="btn" type="button" disabled={financialBusy === `accept-${incident.id}` || (resolutionNotes[incident.id] || "").trim().length < 3} onClick={() => void acceptIncident(incident)}>{financialBusy === `accept-${incident.id}` ? "Guardando…" : "Confirmar: no regularizar"}</button></div></div> : <button className="btn ghost" type="button" onClick={() => setAcceptingIncident(incident.id)}>Aceptar sin regularizar</button>}
          </article>;
        })}</div>
      </section> : null}

      {financialNotice ? <section className={`${styles.issueBox} ${styles.issueGood}`}><header><CheckCircle2 /><div><strong>Gestión guardada</strong><span>{financialNotice}</span></div></header></section> : null}

      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Bonos</span><h3>Saldo e historial</h3></div><button onClick={addCredit}>Añadir bono</button></div>
        <div className={styles.metrics}><article><WalletCards /><span>Saldo en bonos</span><strong>{minutesLabel(availableBalance)}</strong></article><article><AlertTriangle /><span>Pendiente</span><strong>{minutesLabel(pendingDebt)}</strong></article><article><WalletCards /><span>Saldo neto</span><strong>{minutesLabel(balance)}</strong></article></div>
        {ownCredits.length ? <div className={styles.creditGrid}>{ownCredits.map((item) => { const itemBalance = balanceFor(item); return <article key={item.id} className={item.payment_status === "pending" ? styles.pendingCredit : ""}><div><span>{dateLabel(item.purchased_at, false)}</span><strong>{item.label || (item.modality === "pair" ? "Bono de pareja" : "Bono individual")}</strong></div><b>{minutesLabel(itemBalance)}</b><small>de {minutesLabel(item.total_minutes)} · {euros(item.price_cents)} · {item.payment_status === "paid" ? "Pagado" : item.payment_status === "pending" ? "Pago pendiente" : "Reembolsado"}</small></article>; })}</div> : <div className={styles.empty}><WalletCards /><span>No hay bonos registrados.</span></div>}
      </section>
    </div>;
  }

  function renderData() {
    return <div className={styles.dataGrid}>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Identidad</span><h3>Datos principales</h3></div><button onClick={() => setIdentityEditorOpen(true)}><Pencil size={15}/> Editar</button></div><div className={styles.readGrid}><div><Phone /><span>Teléfono</span><strong>{student.phone || "Sin indicar"}</strong></div><div><Mail /><span>Email</span><strong>{student.email || "Sin indicar"}</strong></div><div><MapPin /><span>País</span><strong>{student.country_code || "Sin indicar"}</strong></div><div><CircleUserRound /><span>Portal</span><strong>{student.auth_user_id ? "Registrado" : "Provisional"}</strong></div><div><CalendarDays /><span>Alumno desde</span><strong>{dateLabel(profile?.student_since ?? null, false)}</strong></div><div><CheckCircle2 /><span>Estado</span><strong>{student.active && profile?.active !== false ? "Activo" : "Inactivo"}</strong></div></div></section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Baile</span><h3>Contextos guardados</h3></div></div>{danceProfiles.length ? <div className={styles.danceGrid}>{danceProfiles.map((item) => <div key={item.id} className={item.is_primary ? styles.primaryDance : ""}><strong>{termLabel(item.style_term_id, terms)}</strong><span>{termLabel(item.role_term_id, terms)} · {termLabel(item.level_term_id, terms)}</span>{item.is_primary ? <small>Principal</small> : null}</div>)}</div> : <div className={styles.empty}><GraduationCap /><span>Sin contexto de baile.</span></div>}</section>
      <section className={styles.sectionCard}><div className={styles.sectionHead}><div><span>Objetivos</span><h3>Información pedagógica</h3></div></div><div className={styles.longText}><strong>Objetivos</strong><p>{profile?.goals || "Sin objetivos guardados."}</p><strong>Notas internas</strong><p>{profile?.teacher_notes || "Sin notas internas."}</p><strong>Salud / a tener en cuenta</strong><p>{profile?.health_notes || "Sin indicaciones."}</p></div></section>
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
        <div className={styles.actions}><button onClick={schedule}><CalendarDays /> Programar</button><button onClick={addCredit}><WalletCards /> Bono</button><button className={styles.close} onClick={close} aria-label="Cerrar"><X /></button></div>
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
    {identityEditorOpen ? <StudentIdentityEditor client={client} person={student} profile={profile} close={() => setIdentityEditorOpen(false)} saved={async () => { await refresh(); setProfileRefresh((value) => value + 1); }} /> : null}
  </div>;
}
