"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, BellRing, Check, CheckCheck, ChevronRight, Clock3, GraduationCap, LibraryBig, UserRound, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./notifications-view.module.css";

type NotificationRow = {
  id: number;
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
  priority: string;
  priority_score: number;
  source_domain: string | null;
  source_id: string | null;
  action_target: string | null;
  origin: Record<string, unknown> | null;
  state: string;
  due_at: string | null;
};

export type NotificationTargetContext = {
  personId?: number;
  classId?: number;
  contentId?: number;
};

type EnrichedNotification = NotificationRow & {
  mission: MissionMeta | null;
  resolved: boolean;
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

function priorityLabel(value?: string) {
  if (value === "urgent") return "Urgente";
  if (value === "priority") return "Prioritaria";
  return "Normal";
}

function sourceLabel(item: EnrichedNotification) {
  const source = item.mission?.source_domain;
  if (source === "class") return "Clase";
  if (source === "person") return "Alumno";
  if (source === "teaching_content") return "Enseñanza";
  if (source === "daily") return "CYA";
  return "Aviso";
}

function SourceIcon({ item }: { item: EnrichedNotification }) {
  const source = item.mission?.source_domain;
  if (source === "class") return <GraduationCap />;
  if (source === "person") return <UserRound />;
  if (source === "teaching_content") return <LibraryBig />;
  return item.resolved ? <Check /> : <Bell />;
}

function contextFor(item: EnrichedNotification): NotificationTargetContext {
  const origin = item.mission?.origin ?? {};
  const numberValue = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
  return {
    personId: numberValue(origin.person_id),
    classId: numberValue(origin.class_id),
    contentId: numberValue(origin.content_id),
  };
}

export function NotificationsView({ client, timezone, openTarget, onUnreadChange, notify }: Props) {
  const [items, setItems] = useState<EnrichedNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const notificationResult = await client.from("internal_notifications")
      .select("id,title,body,action_target,source_type,source_id,read_at,created_at")
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
        .select("id,priority,priority_score,source_domain,source_id,action_target,origin,state,due_at")
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

  async function markRead(item: EnrichedNotification) {
    if (item.read_at) return item;
    const readAt = new Date().toISOString();
    const result = await client.from("internal_notifications").update({ read_at: readAt }).eq("id", item.id);
    if (result.error) { notify(result.error.message); return null; }
    const next = { ...item, read_at: readAt, resolved: true };
    setItems((current) => current.map((entry) => entry.id === item.id ? next : entry));
    onUnreadChange(Math.max(0, pending.filter((entry) => entry.id !== item.id && !entry.read_at).length));
    return next;
  }

  async function open(item: EnrichedNotification) {
    const updated = await markRead(item) ?? item;
    const target = updated.mission?.action_target ?? updated.action_target;
    if (!target || !validTargets.has(target)) return;
    openTarget(target, contextFor(updated));
  }

  async function markAllRead() {
    if (!pending.length || busy) return;
    setBusy(true);
    const readAt = new Date().toISOString();
    const result = await client.from("internal_notifications").update({ read_at: readAt }).is("read_at", null);
    if (result.error) notify(result.error.message);
    else {
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt, resolved: true })));
      onUnreadChange(0);
    }
    setBusy(false);
  }

  function renderItem(item: EnrichedNotification) {
    const target = item.mission?.action_target ?? item.action_target;
    const actionable = Boolean(target && validTargets.has(target));
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

  return <section className={styles.root}>
    <header className={styles.hero}>
      <div><p>NOTIFICACIONES</p><h1>Centro de avisos</h1><span>Tus avisos pendientes y el historial reciente.</span></div>
      <div className={styles.heroIcon}>{pending.length ? <BellRing /> : <CheckCheck />}</div>
    </header>

    <div className={styles.summary}>
      <div><span>Pendientes</span><strong>{pending.length}</strong></div>
      <div><span>Leídas o resueltas</span><strong>{history.length}</strong></div>
      {pending.length ? <button type="button" onClick={() => void markAllRead()} disabled={busy}><CheckCheck /> {busy ? "Marcando…" : "Marcar todas como leídas"}</button> : null}
    </div>

    {loading ? <div className={styles.empty}><Bell /><span>Cargando notificaciones…</span></div> : <>
      <section className={styles.group}><div className={styles.groupTitle}><h2>Pendientes</h2><span>{pending.length}</span></div>{pending.length ? <div className={styles.list}>{pending.map(renderItem)}</div> : <div className={styles.empty}><CheckCheck /><span>No tienes notificaciones pendientes.</span></div>}</section>
      {history.length ? <section className={styles.group}><div className={styles.groupTitle}><h2>Historial</h2><span>{history.length}</span></div><div className={styles.list}>{history.map(renderItem)}</div></section> : null}
    </>}
  </section>;
}
