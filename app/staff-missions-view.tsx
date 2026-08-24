"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ChevronRight, Clock3, Target } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { missionTypeLabel } from "./mission-routing";
import type { Mission } from "./v14-types";
import styles from "./staff-missions-view.module.css";

const activeStates = new Set(["available", "not_done", "postponed", "in_progress"]);
const stateLabels: Record<string, string> = { available: "Disponible", not_done: "Pendiente", postponed: "Pospuesta", in_progress: "En progreso", completed: "Completada", completed_automatically: "Resuelta automáticamente", cancelled: "Cancelada", not_applicable: "Ya no procede" };

function localTomorrow() {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function StaffMissionsView({ client, timezone, openTarget, onPendingChange, notify }: { client: SupabaseClient; timezone: string; openTarget: (mission: Mission) => void; onPendingChange: (count: number) => void; notify: (message: string) => void }) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [postponing, setPostponing] = useState<number | null>(null);
  const [postponeUntil, setPostponeUntil] = useState(localTomorrow);

  const load = useCallback(async () => {
    setLoading(true);
    const refresh = await client.rpc("refresh_missions");
    if (refresh.error) notify(refresh.error.message);
    const result = await client.from("missions").select("id,rule_key,mission_type,state,priority,priority_score,title,description,action_target,source_domain,source_id,origin,due_at,estimated_duration_minutes,calendar_block").order("priority_score", { ascending: false }).order("due_at", { ascending: true, nullsFirst: false }).limit(120);
    if (result.error) notify(result.error.message);
    else {
      const next = (result.data ?? []) as Mission[];
      setMissions(next);
      onPendingChange(next.filter((mission) => activeStates.has(mission.state)).length);
    }
    setLoading(false);
  }, [client, notify, onPendingChange]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const active = useMemo(() => missions.filter((mission) => activeStates.has(mission.state)), [missions]);
  const history = useMemo(() => missions.filter((mission) => !activeStates.has(mission.state)).slice(0, 30), [missions]);

  async function act(mission: Mission, action: "complete" | "postpone") {
    const postponedAt = action === "postpone" ? new Date(postponeUntil) : null;
    if (postponedAt && Number.isNaN(postponedAt.getTime())) {
      notify("Indica cuándo quieres retomar la misión.");
      return;
    }
    setBusy(mission.id);
    const result = await client.rpc("act_on_mission", { p_mission_id: mission.id, p_action: action, p_comment: null, p_postpone_until: postponedAt?.toISOString() ?? null });
    if (result.error) notify(result.error.message);
    else { setPostponing(null); notify(action === "complete" ? "Misión completada." : "Misión pospuesta."); await load(); }
    setBusy(null);
  }

  function card(mission: Mission, historical = false) {
    return <article className={styles.card} key={mission.id} data-priority={mission.priority}>
      <div className={styles.cardMain}><div className={styles.meta}><span>{missionTypeLabel(mission.mission_type)}</span><span>{stateLabels[mission.state] ?? mission.state}</span>{mission.estimated_duration_minutes ? <span><Clock3 /> {mission.estimated_duration_minutes} min</span> : null}</div><h2>{mission.title}</h2>{mission.description ? <p>{mission.description}</p> : null}{mission.due_at ? <small>Objetivo · {new Intl.DateTimeFormat("es-ES", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(mission.due_at))}</small> : null}</div>
      {!historical ? <div className={styles.actions}><button type="button" className={styles.target} onClick={() => openTarget(mission)}>Ir a la misión <ChevronRight /></button><button type="button" onClick={() => void act(mission, "complete")} disabled={busy === mission.id}><CheckCircle2 /> Completar</button><button type="button" onClick={() => { setPostponing(postponing === mission.id ? null : mission.id); setPostponeUntil(localTomorrow()); }} disabled={busy === mission.id}>Posponer</button></div> : null}
      {postponing === mission.id ? <div className={styles.postpone}><label><span>Posponer hasta</span><input type="datetime-local" value={postponeUntil} onChange={(event) => setPostponeUntil(event.target.value)} /></label><button type="button" onClick={() => void act(mission, "postpone")} disabled={busy === mission.id || !postponeUntil}>Confirmar</button><button type="button" onClick={() => setPostponing(null)}>Cancelar</button></div> : null}
    </article>;
  }

  return <section className={styles.page}>
    <header><div><p>ACCIONES</p><h1>Misiones</h1><span>Completa, pospone o salta al punto exacto donde se resuelve cada acción.</span></div><strong>{active.length}</strong></header>
    {loading && !missions.length ? <div className={styles.empty}>Actualizando misiones…</div> : active.length ? <div className={styles.list}>{active.map((mission) => card(mission))}</div> : <div className={styles.empty}><Target /> No hay misiones activas.</div>}
    {history.length ? <details className={styles.history}><summary>Historial reciente · {history.length}</summary><div className={styles.list}>{history.map((mission) => card(mission, true))}</div></details> : null}
  </section>;
}
