"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, BellRing, Check, CheckCheck, ChevronRight, Clock3, GraduationCap, LibraryBig, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./notifications-view.module.css";

type NotificationRow = {
  id: number;
  event_key: string;
  title: string;
  body: string | null;
  action_target: string | null;
  source_type: string | null;
  source_id: string | null;
  read_at: string | null;
  created_at: string;
};

type MissionMeta = {
  id: number;
  rule_key: string | null;
  priority: string;
  priority_score: number;
  source_domain: string | null;
  source_id: string | null;
  action_target: string | null;
  origin: Record<string, unknown> | null;
  state: string;
  due_at: string | null;
};

type IdentityCapabilities = {
  can_admin?: boolean;
  can_teach?: boolean;
  can_study?: boolean;
};

type NotificationAudience = "staff" | "student";

export type NotificationTargetContext = {
  personId?: number;
  classId?: number;
  contentId?: number;
};

type EnrichedNotification = NotificationRow & {
  mission: MissionMeta | null;
  resolved: boolean;
};

type NotificationCluster = {
  key: string;
  items: EnrichedNotification[];
  representative: EnrichedNotification;
};

type Props = {
  client: SupabaseClient;
  timezone: string;
  openTarget: (target: string, context: NotificationTargetContext) => void;
  onUnreadChange: (count: number) => void;
  notify: (message: string) => void;
};

const validTargets = new Set(["home", "students", "classes", "credits", "agenda", "live", "teaching", "marketing", "admin"]);
const resolvedMissionStates = new Set(["completed", "completed_automatically", "cancelled", "not_done", "not_applicable", "expired"]);
const groupedRuleLabels: Record<string, string> = {
  "classes.pending_close": "Clases pendientes de cerrar",
  "classes.preparation": "Clases que necesitan preparación",
  "classes.preparation_needed": "Clases que necesitan preparación",
  "credits.low_balance": "Bonos con saldo bajo",
  "credits.expiry": "Bonos que necesitan revisión",
  "bonuses.low_or_expiring": "Bonos que necesitan revisión",
  "students.incomplete_profile": "Perfiles de alumnos por completar",
  "corrections.missing_explanation": "Correcciones por completar",
  "daily.add_correction": "Contenido diario por añadir",
  "daily.review_information": "Información pendiente de revisar",
};

function priorityLabel(value?: string) {
  if (value === "urgent") return "Urgente";
  if (value === "priority") return "Prioritaria";
  return "Normal";
}

function targetBase(target: string | null | undefined) {
  if (!target) return null;
  const [base] = target.split(":", 1);
  return validTargets.has(base) ? base : null;
}

function sourceLabel(item: EnrichedNotification) {
  const source = item.mission?.source_domain;
  if (source === "class") return "Clase";
  if (source === "person") return "Alumno";
  if (source === "teaching_content") return "Enseñanza";
  if (source === "credit_grant") return "Bono";
  if (source === "daily") return "CYA";
  if (item.source_type === "feedback_online") return "Feedback Online";
  if (item.source_type === "class") return "Clase";
  if (item.source_type === "person") return "Alumno";
  if (item.source_type === "teaching_content") return "Enseñanza";
  if (item.source_type === "credit_grant") return "Bono";
  if (item.source_type === "communication") return "Comunicación";
  return "Aviso";
}

function SourceIcon({ item }: { item: EnrichedNotification }) {
  const source = item.mission?.source_domain ?? item.source_type;
  if (source === "class" || source === "feedback_online") return <GraduationCap />;
  if (source === "person") return <UserRound />;
  if (source === "teaching_content") return <LibraryBig />;
  return item.resolved ? <Check /> : <Bell />;
}

function contextFor(item: EnrichedNotification, target?: string | null): NotificationTargetContext {
  const origin = item.mission?.origin ?? {};
  const numberValue = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
  const base = targetBase(target);
  return {
    personId: base === "live" ? undefined : numberValue(origin.person_id),
    classId: numberValue(origin.class_id),
    contentId: numberValue(origin.content_id),
  };
}

function entityKey(item: EnrichedNotification) {
  const mission = item.mission;
  if (mission?.source_domain && mission.source_id) return `${mission.source_domain}:${mission.source_id}`;
  const origin = mission?.origin ?? {};
  const originEntity = [
    ["person", origin.person_id],
    ["class", origin.class_id],
    ["teaching_content", origin.content_id],
    ["credit_grant", origin.grant_id],
  ].find(([, value]) => value !== undefined && value !== null);
  if (originEntity) return `${originEntity[0]}:${String(originEntity[1])}`;
  if (item.source_type && item.source_id) return `${item.source_type}:${item.source_id}`;
  return `event:${item.event_key || item.source_type || "notice"}`;
}

function semanticKey(item: EnrichedNotification) {
  const target = item.mission?.action_target ?? item.action_target ?? "none";
  const entity = entityKey(item);
  if (item.mission?.rule_key) return `mission:${entity}:${item.mission.rule_key}:${target}`;
  return `event:${entity}:${item.event_key || item.source_type || "notice"}:${target}`;
}

function groupLabel(cluster: NotificationCluster) {
  const titles = new Set(cluster.items.map((item) => item.title));
  if (titles.size === 1) return cluster.representative.title;
  const rule = cluster.representative.mission?.rule_key;
  if (rule && groupedRuleLabels[rule]) return groupedRuleLabels[rule];
  if (cluster.items.length === 1) return cluster.representative.title;
  return `${sourceLabel(cluster.representative)} · ${cluster.items.length} avisos`;
}

function clustersFor(source: EnrichedNotification[]) {
  const map = new Map<string, EnrichedNotification[]>();
  source.forEach((item) => {
    const key = semanticKey(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  });
  return [...map.entries()].map(([key, items]) => ({ key, items, representative: items[0] })) as NotificationCluster[];
}

export function NotificationsView({ client, timezone, openTarget, onUnreadChange, notify }: Props) {
  const [items, setItems] = useState<EnrichedNotification[]>([]);
  const [audience, setAudience] = useState<NotificationAudience>("staff");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [preferenceResult, identityResult] = await Promise.all([
      client.from("user_preferences").select("preferred_context").maybeSingle(),
      client.rpc("identity_context"),
    ]);
    const preferredContext = preferenceResult.data?.preferred_context as string | null | undefined;
    const capabilities = (identityResult.data ?? {}) as IdentityCapabilities;
    const nextAudience: NotificationAudience = preferredContext === "student" || (!capabilities.can_teach && !capabilities.can_admin && capabilities.can_study) ? "student" : "staff";
    setAudience(nextAudience);

    const notificationResult = await client.from("internal_notifications")
      .select("id,event_key,title,body,action_target,source_type,source_id,read_at,created_at")
      .eq("audience", nextAudience)
      .order("created_at", { ascending: false })
      .limit(100);
    if (notificationResult.error) {
      notify(notificationResult.error.message);
      setLoading(false);
      return;
    }
    const notifications = (notificationResult.data ?? []) as NotificationRow[];
    const missionIds = notifications
      .filter((item) => item.source_type === "mission" && item.source_id && /^\d+$/.test(item.source_id))
      .map((item) => Number(item.source_id));
    let missionMap = new Map<number, MissionMeta>();
    if (missionIds.length) {
      const missionResult = await client.from("missions")
        .select("id,rule_key,priority,priority_score,source_domain,source_id,action_target,origin,state,due_at")
        .in("id", [...new Set(missionIds)]);
      if (!missionResult.error) missionMap = new Map(((missionResult.data ?? []) as MissionMeta[]).map((mission) => [mission.id, mission]));
    }
    const enriched = notifications.map((item) => {
      const mission = item.source_type === "mission" && item.source_id ? missionMap.get(Number(item.source_id)) ?? null : null;
      const missionResolved = mission ? resolvedMissionStates.has(mission.state) : false;
      return { ...item, mission, resolved: Boolean(item.read_at) || missionResolved };
    });
    enriched.sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
      if (!a.resolved) {
        const score = Number(b.mission?.priority_score ?? 0) - Number(a.mission?.priority_score ?? 0);
        if (score) return score;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setItems(enriched);
    onUnreadChange(enriched.filter((item) => !item.resolved && !item.read_at).length);
    setLoading(false);
  }, [client, notify, onUnreadChange]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const pending = useMemo(() => items.filter((item) => !item.resolved), [items]);
  const history = useMemo(() => items.filter((item) => item.resolved), [items]);
  const pendingClusters = useMemo(() => clustersFor(pending), [pending]);
  const historyClusters = useMemo(() => clustersFor(history), [history]);

  async function markRead(item: EnrichedNotification) {
    if (item.read_at) return item;
    const readAt = new Date().toISOString();
    const result = await client.from("internal_notifications").update({ read_at: readAt }).eq("id", item.id).eq("audience", audience);
    if (result.error) { notify(result.error.message); return null; }
    const next = { ...item, read_at: readAt, resolved: true };
    setItems((current) => current.map((entry) => entry.id === item.id ? next : entry));
    onUnreadChange(Math.max(0, pending.filter((entry) => entry.id !== item.id && !entry.read_at).length));
    return next;
  }

  async function open(item: EnrichedNotification) {
    const updated = await markRead(item) ?? item;
    const target = updated.mission?.action_target ?? updated.action_target;
    const base = targetBase(target);
    if (!base) return;
    openTarget(base, contextFor(updated, target));
  }

  async function markAllRead() {
    if (!pending.length || busy) return;
    setBusy(true);
    const readAt = new Date().toISOString();
    const result = await client.from("internal_notifications").update({ read_at: readAt }).eq("audience", audience).is("read_at", null);
    if (result.error) notify(result.error.message);
    else {
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt, resolved: true })));
      onUnreadChange(0);
    }
    setBusy(false);
  }

  function renderItem(item: EnrichedNotification) {
    const target = item.mission?.action_target ?? item.action_target;
    const actionable = Boolean(targetBase(target));
    return <article className={`${styles.item} ${item.resolved ? styles.resolved : styles.pending}`} key={item.id}>
      <div className={styles.icon}><SourceIcon item={item} /></div>
      <button className={styles.main} type="button" onClick={() => void open(item)} disabled={!actionable && Boolean(item.read_at)}>
        <span className={styles.meta}>
          <span>{sourceLabel(item)}</span>
          {!item.resolved ? <b className={`${styles.priority} ${styles[item.mission?.priority ?? "normal"]}`}>{priorityLabel(item.mission?.priority)}</b> : <b className={styles.done}>Resuelta</b>}
        </span>
        <strong>{item.title}</strong>
        {item.body ? <small>{item.body}</small> : null}
        <span className={styles.date}><Clock3 /> {new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</span>
      </button>
      {actionable ? <button className={styles.open} type="button" onClick={() => void open(item)} aria-label={`Abrir ${item.title}`}><ChevronRight /></button>
        : !item.read_at ? <button className={styles.open} type="button" onClick={() => void markRead(item)} aria-label={`Marcar ${item.title} como leída`}><Check /></button> : null}
    </article>;
  }

  function renderCluster(cluster: NotificationCluster) {
    if (cluster.items.length === 1) return renderItem(cluster.items[0]);
    const representative = cluster.representative;
    return <details className={`${styles.cluster} ${representative.resolved ? styles.clusterResolved : ""}`} key={cluster.key}>
      <summary>
        <span className={styles.clusterIcon}><SourceIcon item={representative} /></span>
        <span className={styles.clusterText}>
          <span>{sourceLabel(representative)}</span>
          <strong>{groupLabel(cluster)}</strong>
          <small>{cluster.items.length} avisos individuales · toca para verlos</small>
        </span>
        <b className={styles.clusterCount}>{cluster.items.length}</b>
        <ChevronRight className={styles.clusterChevron} />
      </summary>
      <div className={styles.clusterItems}>{cluster.items.map(renderItem)}</div>
    </details>;
  }

  return <section className={styles.root}>
    <header className={styles.hero}>
      <div><p>NOTIFICACIONES</p><h1>{audience === "student" ? "Tus avisos" : "Avisos de trabajo"}</h1><span>{audience === "student" ? "Aquí encontrarás únicamente novedades y acciones relacionadas con tu propia experiencia en CYA." : "Clases, alumnos, bonos, enseñanza, misiones y otras tareas que requieren tu atención se organizan aquí sin mezclar asuntos distintos."}</span></div>
      <div className={styles.heroIcon}>{pending.length ? <BellRing /> : <CheckCheck />}</div>
    </header>

    <div className={styles.summary}>
      <div><span>Pendientes</span><strong>{pending.length}</strong></div>
      <div><span>Grupos pendientes</span><strong>{pendingClusters.length}</strong></div>
      {pending.length ? <button type="button" onClick={() => void markAllRead()} disabled={busy}><CheckCheck /> {busy ? "Marcando…" : "Marcar todas como leídas"}</button> : null}
    </div>

    {loading ? <div className={styles.empty}><Bell /><span>Cargando notificaciones…</span></div> : <>
      <section className={styles.group}><div className={styles.groupTitle}><h2>Pendientes</h2><span>{pending.length}</span></div>{pending.length ? <div className={styles.list}>{pendingClusters.map(renderCluster)}</div> : <div className={styles.empty}><CheckCheck /><span>No tienes notificaciones pendientes.</span></div>}</section>
      {history.length ? <section className={styles.group}><div className={styles.groupTitle}><h2>Historial</h2><span>{history.length}</span></div><div className={styles.list}>{historyClusters.map(renderCluster)}</div></section> : null}
    </>}
  </section>;
}
