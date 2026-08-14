"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, ChevronRight, Coins, Gift, History, Sparkles, Target, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./bz-points-panel.module.css";

type Rule = { rule_key: string; label: string; description: string | null; points: number; active: boolean };
type LedgerRow = { id: number; rule_key: string | null; entry_type: string; points_delta: number; source_type: string; source_id: string | null; detail: Record<string, unknown>; created_at: string };
type Reward = { id: number; name: string; description: string | null; cost_points: number; discount_kind: "fixed_cents" | "percent"; discount_value: number; currency: string };
type Redemption = { id: number; reward_id: number; reward_name: string; cost_points: number; discount_kind: "fixed_cents" | "percent"; discount_value: number; currency: string; coupon_code: string; status: string; created_at: string };
type Snapshot = {
  person_id: number;
  balance_points: number;
  earned_points: number;
  spent_points: number;
  today: string;
  daily_login_recorded: boolean;
  previous_review_recorded: boolean;
  next_class: { id: number; scheduled_start_at: string; selected_content_id: number | null } | null;
  rules: Rule[];
  recent_ledger: LedgerRow[];
  rewards: Reward[];
  redemptions: Redemption[];
};

type AssignmentChoice = { content_id: number; title: string; content_type: string; assignment_status: string };

const ruleIcons: Record<string, typeof Sparkles> = {
  registration: Sparkles,
  daily_login: Check,
  bonus_purchase: Coins,
  class_attended: Target,
  exercise_completed: Check,
  previous_class_review: History,
  next_class_content_choice: ChevronRight,
};

function discountLabel(reward: Reward | Redemption) {
  return reward.discount_kind === "percent"
    ? `${reward.discount_value}% de descuento`
    : `${new Intl.NumberFormat("es-ES", { style: "currency", currency: reward.currency }).format(reward.discount_value / 100)} de descuento`;
}

function movementLabel(row: LedgerRow) {
  if (row.entry_type === "redeem") return "Recompensa canjeada";
  if (row.entry_type === "adjustment") return "Ajuste de puntos";
  const label = typeof row.detail?.rule_label === "string" ? row.detail.rule_label : null;
  return label || "BZ Points";
}

export function BZPointsPanel({ client, assignments }: { client: SupabaseClient; assignments: AssignmentChoice[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedContent, setSelectedContent] = useState("");

  const load = useCallback(async () => {
    const result = await client.rpc("bz_snapshot");
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const next = result.data as Snapshot;
    setSnapshot(next);
    setSelectedContent(next.next_class?.selected_content_id ? String(next.next_class.selected_content_id) : "");
    setError("");
  }, [client]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const visibleChoices = useMemo(() => assignments
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.content_id === item.content_id) === index)
    .sort((a, b) => a.title.localeCompare(b.title, "es")), [assignments]);

  async function act(key: string, rpc: string, args: Record<string, unknown>) {
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    const result = await client.rpc(rpc, args);
    if (result.error) setError(result.error.message);
    else {
      const awarded = Boolean((result.data as { points_awarded?: boolean } | null)?.points_awarded);
      setMessage(awarded ? "¡BZ Points añadidos!" : "Guardado. Esta acción ya estaba contabilizada.");
      await load();
    }
    setBusy("");
  }

  async function redeem(reward: Reward) {
    if (busy || !snapshot || snapshot.balance_points < reward.cost_points) return;
    setBusy(`reward-${reward.id}`); setError(""); setMessage("");
    const result = await client.rpc("bz_redeem_reward", { p_reward_id: reward.id });
    if (result.error) setError(result.error.message);
    else {
      const code = (result.data as { coupon_code?: string } | null)?.coupon_code;
      setMessage(code ? `Recompensa creada. Tu código es ${code}.` : "Recompensa creada.");
      await load();
    }
    setBusy("");
  }

  if (!snapshot) return <section className={`${styles.root} card`}><div className={styles.loading}><Coins /><span>{error || "Preparando BZ Points…"}</span></div></section>;

  const activeRules = snapshot.rules.filter((rule) => rule.active && rule.points > 0);
  return <section className={`${styles.root} card`}>
    <header className={styles.hero}>
      <div><p>BZ POINTS</p><h2>Tu progreso también suma</h2><span>Gana puntos con acciones reales de tu aprendizaje y cámbialos por recompensas.</span></div>
      <div className={styles.balance}><Coins /><strong>{snapshot.balance_points}</strong><span>disponibles</span></div>
    </header>

    <div className={styles.totals}><div><span>Ganados</span><strong>+{snapshot.earned_points}</strong></div><div><span>Canjeados</span><strong>{snapshot.spent_points}</strong></div><div><span>Hoy</span><strong>{snapshot.daily_login_recorded ? "✓" : "—"}</strong></div></div>

    {snapshot.next_class ? <section className={styles.prepare}>
      <div className={styles.sectionHead}><div><p>ANTES DE TU PRÓXIMA CLASE</p><h3>Prepárala y suma</h3></div><Target /></div>
      <div className={styles.actionGrid}>
        <button type="button" className={snapshot.previous_review_recorded ? styles.doneAction : ""} disabled={busy === "review" || snapshot.previous_review_recorded} onClick={() => void act("review", "bz_confirm_previous_class_review", { p_class_id: snapshot.next_class?.id })}>
          <History /><span><strong>{snapshot.previous_review_recorded ? "Repaso confirmado" : "He repasado la clase anterior"}</strong><small>{snapshot.previous_review_recorded ? "Ya suma hoy" : `+${snapshot.rules.find((rule) => rule.rule_key === "previous_class_review")?.points ?? 0} BZ Points`}</small></span>{snapshot.previous_review_recorded ? <Check /> : <ChevronRight />}
        </button>
        <div className={styles.choice}>
          <label htmlFor="bz-next-content">¿Qué quieres trabajar?</label>
          <div><select id="bz-next-content" value={selectedContent} onChange={(event) => setSelectedContent(event.target.value)}><option value="">Elige un contenido</option>{visibleChoices.map((item) => <option value={item.content_id} key={item.content_id}>{item.title}</option>)}</select><button type="button" disabled={!selectedContent || busy === "choice"} onClick={() => void act("choice", "bz_choose_next_class_content", { p_class_id: snapshot.next_class?.id, p_content_id: Number(selectedContent) })}>Guardar</button></div>
          <small>Tu profesor lo verá al preparar la clase · +{snapshot.rules.find((rule) => rule.rule_key === "next_class_content_choice")?.points ?? 0} BZ la primera vez.</small>
        </div>
      </div>
    </section> : null}

    <section className={styles.earn}>
      <div className={styles.sectionHead}><div><p>CÓMO GANAR</p><h3>Acciones que suman</h3></div><Sparkles /></div>
      <div className={styles.ruleGrid}>{activeRules.map((rule) => { const Icon = ruleIcons[rule.rule_key] ?? Sparkles; return <article key={rule.rule_key}><Icon /><div><strong>{rule.label}</strong><span>{rule.description}</span></div><b>+{rule.points}</b></article>; })}</div>
    </section>

    <section className={styles.rewards}>
      <div className={styles.sectionHead}><div><p>RECOMPENSAS</p><h3>Cambia tus puntos</h3></div><Gift /></div>
      {snapshot.rewards.length ? <div className={styles.rewardGrid}>{snapshot.rewards.map((reward) => <article key={reward.id}><div className={styles.rewardIcon}><TicketCheck /></div><div><strong>{reward.name}</strong><span>{reward.description || discountLabel(reward)}</span><small>{discountLabel(reward)}</small></div><button type="button" disabled={busy === `reward-${reward.id}` || snapshot.balance_points < reward.cost_points} onClick={() => void redeem(reward)}>{reward.cost_points} BZ</button></article>)}</div> : <div className={styles.empty}>Las próximas recompensas aparecerán aquí.</div>}
    </section>

    {snapshot.redemptions.length ? <section className={styles.coupons}><div className={styles.sectionHead}><div><p>MIS CUPONES</p><h3>Recompensas disponibles</h3></div><TicketCheck /></div><div>{snapshot.redemptions.map((item) => <article key={item.id}><span>{item.reward_name}</span><strong>{item.coupon_code}</strong><small>{discountLabel(item)} · {item.status === "issued" ? "Disponible" : item.status}</small></article>)}</div></section> : null}

    <details className={styles.history}><summary><History /> Historial de BZ Points <span>{snapshot.recent_ledger.length}</span></summary><div>{snapshot.recent_ledger.map((row) => <article key={row.id}><div><strong>{movementLabel(row)}</strong><span>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(row.created_at))}</span></div><b className={row.points_delta > 0 ? styles.positive : styles.negative}>{row.points_delta > 0 ? "+" : ""}{row.points_delta}</b></article>)}</div></details>

    {message ? <p className={styles.success}>{message}</p> : null}
    {error ? <p className={styles.error}>{error}</p> : null}
  </section>;
}
