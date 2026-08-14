"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Coins, Gift, Plus, Save, SlidersHorizontal, UsersRound } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./bz-points-admin.module.css";

type Rule = { rule_key: string; label: string; description: string | null; points: number; trigger_mode: string; active: boolean; sort_order: number };
type Reward = { id: number; name: string; description: string | null; cost_points: number; discount_kind: "fixed_cents" | "percent"; discount_value: number; currency: string; active: boolean; sort_order: number };
type PersonStat = { person_id: number; balance_points: number; earned_points: number; spent_points: number; earn_events: number; last_movement_at: string | null };
type Person = { id: number; display_name: string };

type RewardDraft = { name: string; description: string; cost_points: string; discount_kind: "fixed_cents" | "percent"; discount_value: string; active: boolean };
const blankReward: RewardDraft = { name: "", description: "", cost_points: "", discount_kind: "fixed_cents", discount_value: "", active: true };

function rewardDraft(reward: Reward): RewardDraft {
  return { name: reward.name, description: reward.description ?? "", cost_points: String(reward.cost_points), discount_kind: reward.discount_kind, discount_value: reward.discount_kind === "fixed_cents" ? String(reward.discount_value / 100) : String(reward.discount_value), active: reward.active };
}

function rewardPayload(draft: RewardDraft) {
  const cost = Number(draft.cost_points);
  const rawDiscount = Number(String(draft.discount_value).replace(",", "."));
  const discount = draft.discount_kind === "fixed_cents" ? Math.round(rawDiscount * 100) : Math.round(rawDiscount);
  if (!draft.name.trim() || !Number.isSafeInteger(cost) || cost <= 0 || !Number.isFinite(rawDiscount) || rawDiscount <= 0 || !Number.isSafeInteger(discount)) return null;
  if (draft.discount_kind === "percent" && discount > 100) return null;
  return { p_name: draft.name.trim(), p_description: draft.description.trim() || null, p_cost_points: cost, p_discount_kind: draft.discount_kind, p_discount_value: discount, p_active: draft.active };
}

function RewardEditor({ reward, busy, save }: { reward: Reward; busy: boolean; save: (reward: Reward, draft: RewardDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(() => rewardDraft(reward));
  useEffect(() => setDraft(rewardDraft(reward)), [reward]);
  return <article className={styles.rewardRow}>
    <div className={styles.rewardFields}>
      <label>Nombre<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>Coste BZ<input inputMode="numeric" value={draft.cost_points} onChange={(event) => setDraft({ ...draft, cost_points: event.target.value.replace(/\D/g, "") })} /></label>
      <label>Descuento<select value={draft.discount_kind} onChange={(event) => setDraft({ ...draft, discount_kind: event.target.value as RewardDraft["discount_kind"] })}><option value="fixed_cents">Importe €</option><option value="percent">Porcentaje %</option></select></label>
      <label>Valor<input inputMode="decimal" value={draft.discount_value} onChange={(event) => setDraft({ ...draft, discount_value: event.target.value.replace(/[^\d.,]/g, "") })} /></label>
    </div>
    <label className={styles.description}>Descripción<input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
    <div className={styles.rowActions}><label className={styles.toggle}><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Activa</label><button className="btn" type="button" disabled={busy} onClick={() => void save(reward, draft)}><Save /> Guardar</button></div>
  </article>;
}

export function BZPointsAdmin({ client, notify }: { client: SupabaseClient; notify: (message: string) => void }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, { points: string; active: boolean }>>({});
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [stats, setStats] = useState<PersonStat[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [newReward, setNewReward] = useState<RewardDraft>(blankReward);
  const [busy, setBusy] = useState("");
  const [adjustPerson, setAdjustPerson] = useState("");
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  const load = useCallback(async () => {
    const [ruleResult, rewardResult, statResult, peopleResult] = await Promise.all([
      client.from("bz_point_rules").select("rule_key,label,description,points,trigger_mode,active,sort_order").order("sort_order"),
      client.from("bz_rewards").select("id,name,description,cost_points,discount_kind,discount_value,currency,active,sort_order").order("sort_order").order("id"),
      client.from("bz_person_statistics").select("person_id,balance_points,earned_points,spent_points,earn_events,last_movement_at").order("balance_points", { ascending: false }).limit(100),
      client.from("people").select("id,display_name").eq("active", true).order("display_name"),
    ]);
    const error = ruleResult.error || rewardResult.error || statResult.error || peopleResult.error;
    if (error) { notify(error.message); return; }
    const nextRules = (ruleResult.data ?? []) as Rule[];
    setRules(nextRules);
    setRuleDrafts(Object.fromEntries(nextRules.map((rule) => [rule.rule_key, { points: String(rule.points), active: rule.active }])));
    setRewards((rewardResult.data ?? []) as Reward[]);
    setStats((statResult.data ?? []) as PersonStat[]);
    setPeople((peopleResult.data ?? []) as Person[]);
  }, [client, notify]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  const statRows = useMemo(() => stats.map((stat) => ({ ...stat, name: people.find((person) => person.id === stat.person_id)?.display_name ?? `Persona ${stat.person_id}` })), [stats, people]);

  async function saveRule(rule: Rule) {
    const draft = ruleDrafts[rule.rule_key];
    const points = Number(draft?.points);
    if (!draft || !Number.isSafeInteger(points) || points < 0) { notify("Indica una cantidad válida de BZ Points."); return; }
    setBusy(`rule-${rule.rule_key}`);
    const result = await client.rpc("admin_bz_save_rule", { p_rule_key: rule.rule_key, p_points: points, p_active: draft.active });
    if (result.error) notify(result.error.message); else { notify("Regla BZ actualizada."); await load(); }
    setBusy("");
  }

  async function saveReward(reward: Reward | null, draft: RewardDraft) {
    const payload = rewardPayload(draft);
    if (!payload) { notify("Revisa nombre, coste y descuento de la recompensa."); return; }
    setBusy(reward ? `reward-${reward.id}` : "reward-new");
    const result = await client.rpc("admin_bz_save_reward", { p_reward_id: reward?.id ?? null, ...payload });
    if (result.error) notify(result.error.message);
    else { notify(reward ? "Recompensa actualizada." : "Recompensa creada."); setNewReward(blankReward); await load(); }
    setBusy("");
  }

  async function adjust(event: FormEvent) {
    event.preventDefault();
    const personId = Number(adjustPerson), points = Number(adjustPoints);
    if (!Number.isSafeInteger(personId) || !Number.isSafeInteger(points) || points === 0) { notify("Selecciona una persona e indica un ajuste distinto de cero."); return; }
    setBusy("adjust");
    const result = await client.rpc("admin_bz_adjust_points", { p_person_id: personId, p_points: points, p_note: adjustNote.trim() || null });
    if (result.error) notify(result.error.message);
    else { notify("Ajuste BZ registrado en el historial."); setAdjustPoints(""); setAdjustNote(""); await load(); }
    setBusy("");
  }

  return <section className={styles.root}>
    <header className="admin-section-head"><div><h2>BZ Points y recompensas</h2><p>Configura cuánto suma cada acción. El saldo siempre se calcula desde movimientos auditables.</p></div><Coins /></header>

    <section className={styles.summary}>
      <article><Coins /><div><span>Puntos en circulación</span><strong>{stats.reduce((sum, item) => sum + Number(item.balance_points || 0), 0)}</strong></div></article>
      <article><UsersRound /><div><span>Personas con movimientos</span><strong>{stats.length}</strong></div></article>
      <article><Gift /><div><span>Recompensas activas</span><strong>{rewards.filter((reward) => reward.active).length}</strong></div></article>
    </section>

    <section className={`card pad ${styles.block}`}>
      <div className="card-head"><div><p className="eyebrow">PUNTUACIÓN</p><h3>Reglas para ganar BZ</h3></div><SlidersHorizontal /></div>
      <div className={styles.ruleList}>{rules.map((rule) => { const draft = ruleDrafts[rule.rule_key] ?? { points: String(rule.points), active: rule.active }; return <article key={rule.rule_key}><div><strong>{rule.label}</strong><span>{rule.description}</span><small>{rule.trigger_mode === "automatic" ? "Automática" : "Acción del alumno"}</small></div><label>Puntos<input inputMode="numeric" value={draft.points} onChange={(event) => setRuleDrafts((current) => ({ ...current, [rule.rule_key]: { ...draft, points: event.target.value.replace(/\D/g, "") } }))} /></label><label className={styles.toggle}><input type="checkbox" checked={draft.active} onChange={(event) => setRuleDrafts((current) => ({ ...current, [rule.rule_key]: { ...draft, active: event.target.checked } }))} /> Activa</label><button type="button" className="btn ghost" disabled={busy === `rule-${rule.rule_key}`} onClick={() => void saveRule(rule)}><Save /> Guardar</button></article>; })}</div>
    </section>

    <section className={`card pad ${styles.block}`}>
      <div className="card-head"><div><p className="eyebrow">RECOMPENSAS</p><h3>Cupones y descuentos</h3></div><Gift /></div>
      <div className={styles.rewardList}>{rewards.map((reward) => <RewardEditor reward={reward} key={reward.id} busy={busy === `reward-${reward.id}`} save={async (item, draft) => saveReward(item, draft)} />)}</div>
      <div className={styles.newReward}><h4><Plus /> Nueva recompensa</h4><div className={styles.rewardFields}><label>Nombre<input value={newReward.name} onChange={(event) => setNewReward({ ...newReward, name: event.target.value })} placeholder="Ej. 5 € de descuento" /></label><label>Coste BZ<input inputMode="numeric" value={newReward.cost_points} onChange={(event) => setNewReward({ ...newReward, cost_points: event.target.value.replace(/\D/g, "") })} /></label><label>Descuento<select value={newReward.discount_kind} onChange={(event) => setNewReward({ ...newReward, discount_kind: event.target.value as RewardDraft["discount_kind"] })}><option value="fixed_cents">Importe €</option><option value="percent">Porcentaje %</option></select></label><label>Valor<input inputMode="decimal" value={newReward.discount_value} onChange={(event) => setNewReward({ ...newReward, discount_value: event.target.value.replace(/[^\d.,]/g, "") })} /></label></div><label className={styles.description}>Descripción<input value={newReward.description} onChange={(event) => setNewReward({ ...newReward, description: event.target.value })} /></label><button className="btn" type="button" disabled={busy === "reward-new"} onClick={() => void saveReward(null, newReward)}><Plus /> Crear recompensa</button></div>
    </section>

    <section className={styles.twoCol}>
      <article className="card pad"><div className="card-head"><h3>Saldos</h3><Coins /></div>{statRows.length ? <div className={styles.balanceList}>{statRows.map((row) => <div key={row.person_id}><span>{row.name}</span><strong>{row.balance_points} BZ</strong><small>+{row.earned_points} · −{row.spent_points}</small></div>)}</div> : <div className="compact-empty"><Coins /><span>Aún no hay movimientos BZ.</span></div>}</article>
      <article className="card pad"><div className="card-head"><h3>Ajuste manual</h3><SlidersHorizontal /></div><form className={styles.adjust} onSubmit={adjust}><label>Persona<select value={adjustPerson} onChange={(event) => setAdjustPerson(event.target.value)}><option value="">Selecciona</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label><label>Puntos<input inputMode="numeric" value={adjustPoints} onChange={(event) => setAdjustPoints(event.target.value.replace(/[^\d-]/g, ""))} placeholder="Ej. 50 o -20" /></label><label>Motivo<input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="Quedará en el historial" /></label><button className="btn" disabled={busy === "adjust"}><Save /> Registrar ajuste</button></form></article>
    </section>
  </section>;
}
