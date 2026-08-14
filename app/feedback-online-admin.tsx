"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Plus, Settings, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./feedback-online.module.css";

type Product = { id: number; name: string; description: string | null; price_cents: number | null; currency: string; target_response_hours: number | null; active: boolean };
type Person = { id: number; display_name: string; active: boolean };
type Order = { id: number; person_id: number; product_id: number; total_price_cents: number; currency: string; payment_status: string; requested_at: string };
type Ledger = { id: number; person_id: number; movement_type: string; delta_credits: number; note: string | null; created_at: string };
type RequestRow = { id: number; person_id: number; status: string; submitted_at: string | null; completed_at: string | null };

type Props = { client: SupabaseClient; notify: (message: string) => void };

function euroInput(cents: number | null) { return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","); }
function centsFromInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return NaN;
  return Math.round(Number(normalized) * 100);
}
function money(cents: number, currency: string) { return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(cents / 100); }
function dateTime(value: string | null) { return value ? new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : ""; }

export function FeedbackOnlineAdmin({ client, notify }: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [price, setPrice] = useState("");
  const [sla, setSla] = useState("");
  const [active, setActive] = useState(false);
  const [personId, setPersonId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [productResult, peopleResult, ordersResult, ledgerResult, requestsResult] = await Promise.all([
      client.from("feedback_products").select("id,name,description,price_cents,currency,target_response_hours,active").order("sort_order").limit(1).maybeSingle(),
      client.from("people").select("id,display_name,active").eq("active", true).order("display_name"),
      client.from("feedback_credit_orders").select("id,person_id,product_id,total_price_cents,currency,payment_status,requested_at").order("requested_at", { ascending: false }).limit(100),
      client.from("feedback_credit_ledger").select("id,person_id,movement_type,delta_credits,note,created_at").order("created_at", { ascending: false }).limit(500),
      client.from("feedback_requests").select("id,person_id,status,submitted_at,completed_at").order("created_at", { ascending: false }).limit(200),
    ]);
    const firstError = productResult.error || peopleResult.error || ordersResult.error || ledgerResult.error || requestsResult.error;
    if (firstError) setError(firstError.message);
    const nextProduct = (productResult.data as Product | null) ?? null;
    setProduct(nextProduct);
    setPrice(euroInput(nextProduct?.price_cents ?? null));
    setSla(nextProduct?.target_response_hours ? String(nextProduct.target_response_hours) : "");
    setActive(Boolean(nextProduct?.active));
    setPeople((peopleResult.data ?? []) as Person[]);
    setOrders((ordersResult.data ?? []) as Order[]);
    setLedger((ledgerResult.data ?? []) as Ledger[]);
    setRequests((requestsResult.data ?? []) as RequestRow[]);
    setPersonId((current) => current || String((peopleResult.data?.[0] as Person | undefined)?.id ?? ""));
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const pendingOrders = orders.filter((row) => row.payment_status === "pending");
  const balanceByPerson = useMemo(() => ledger.reduce<Map<number, number>>((map, row) => map.set(row.person_id, (map.get(row.person_id) || 0) + Number(row.delta_credits || 0)), new Map()), [ledger]);
  const activeRequests = requests.filter((row) => ["submitted", "in_review"].includes(row.status));
  const completedRequests = requests.filter((row) => row.status === "completed");
  const personName = (id: number) => people.find((person) => person.id === id)?.display_name || `Persona ${id}`;

  async function saveProduct() {
    const priceCents = centsFromInput(price);
    if (Number.isNaN(priceCents)) { setError("Indica un precio válido con hasta dos decimales."); return; }
    const slaHours = sla.trim() ? Number(sla) : null;
    if (slaHours !== null && (!Number.isSafeInteger(slaHours) || slaHours < 1 || slaHours > 720)) { setError("El objetivo de respuesta debe estar entre 1 y 720 horas."); return; }
    setBusy("product"); setError("");
    const result = await client.rpc("admin_feedback_save_product", {
      p_product_id: product?.id ?? null,
      p_name: product?.name || "Feedback Online",
      p_description: product?.description || "Envía un vídeo y recibe una revisión pedagógica.",
      p_price_cents: priceCents,
      p_currency: product?.currency || "EUR",
      p_target_response_hours: slaHours,
      p_active: active,
    });
    if (result.error) setError(result.error.message); else { notify("Configuración de Feedback Online guardada."); await load(); }
    setBusy("");
  }

  async function confirmOrder(orderId: number) {
    setBusy(`order-${orderId}`); setError("");
    const result = await client.rpc("admin_feedback_confirm_purchase", { p_order_id: orderId });
    if (result.error) setError(result.error.message); else { notify("Pago confirmado y crédito añadido."); await load(); }
    setBusy("");
  }

  async function addPaidCredit() {
    if (!product?.id || !personId) return;
    setBusy("paid"); setError("");
    const result = await client.rpc("admin_feedback_create_paid_purchase", { p_person_id: Number(personId), p_product_id: product.id, p_note: "Compra registrada desde Administración" });
    if (result.error) setError(result.error.message); else { notify("Crédito de Feedback añadido."); await load(); }
    setBusy("");
  }

  async function adjustCredits() {
    const delta = Number(adjustDelta);
    if (!personId || !Number.isSafeInteger(delta) || delta === 0 || !adjustNote.trim()) { setError("Selecciona una persona, indica un ajuste distinto de cero y escribe el motivo."); return; }
    setBusy("adjust"); setError("");
    const result = await client.rpc("admin_feedback_adjust_credits", { p_person_id: Number(personId), p_delta: delta, p_note: adjustNote.trim() });
    if (result.error) setError(result.error.message); else { setAdjustDelta(""); setAdjustNote(""); notify("Ajuste de créditos registrado."); await load(); }
    setBusy("");
  }

  return <section className={styles.adminStack}>
    <header className="admin-section-head"><div><h2>Feedback Online</h2><p>Configura el producto, confirma compras y audita créditos sin mezclarlo con los bonos de horas.</p></div></header>

    <div className="admin-metric-grid">
      <div><strong>{activeRequests.length}</strong><span>pendientes</span></div>
      <div><strong>{completedRequests.length}</strong><span>terminados</span></div>
      <div><strong>{pendingOrders.length}</strong><span>compras por confirmar</span></div>
      <div><strong>{[...balanceByPerson.values()].reduce((sum, value) => sum + Math.max(0, value), 0)}</strong><span>créditos disponibles</span></div>
    </div>

    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Producto</p><h3>{product?.name || "Feedback Online"}</h3></div><Settings /></div><div className={styles.adminFields}><label className="field"><span>Precio por 1 Feedback (€)</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9,.]/g, ""))} placeholder="Ej. 25,00" /></label><label className="field"><span>Objetivo de respuesta (horas)</span><input inputMode="numeric" value={sla} onChange={(event) => setSla(event.target.value.replace(/[^0-9]/g, ""))} placeholder="Opcional" /></label><label className={styles.check}><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><strong>Disponible para alumnos</strong><small>Solo actívalo cuando precio y operativa estén listos.</small></span></label></div><button className="btn" type="button" disabled={busy === "product"} onClick={() => void saveProduct()}>{busy === "product" ? "Guardando…" : "Guardar Feedback Online"}</button></article>

    {pendingOrders.length ? <article className="card pad"><div className="card-head"><div><p className="eyebrow">Compras</p><h3>Pendientes de confirmación</h3></div><span className="badge">{pendingOrders.length}</span></div><div className={styles.adminRows}>{pendingOrders.map((order) => <div key={order.id}><span><strong>{personName(order.person_id)}</strong><small>{money(order.total_price_cents, order.currency)} · solicitado {dateTime(order.requested_at)}</small></span><button className="btn" type="button" disabled={busy === `order-${order.id}`} onClick={() => void confirmOrder(order.id)}><CheckCircle2 /> {busy === `order-${order.id}` ? "Confirmando…" : "Confirmar pago"}</button></div>)}</div></article> : null}

    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Créditos</p><h3>Añadir o ajustar</h3></div><WalletCards /></div><div className={styles.adminFields}><label className="field"><span>Persona</span><select value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name} · saldo {balanceByPerson.get(person.id) || 0}</option>)}</select></label><div className={styles.adminAction}><button className="btn ghost" type="button" disabled={!product?.price_cents || busy === "paid"} onClick={() => void addPaidCredit()}><Plus /> {busy === "paid" ? "Añadiendo…" : "Registrar compra pagada"}</button><small>{product?.price_cents !== null && product ? money(product.price_cents, product.currency) : "Configura el precio antes."}</small></div><label className="field"><span>Ajuste de créditos (+/-)</span><input inputMode="numeric" value={adjustDelta} onChange={(event) => setAdjustDelta(event.target.value.replace(/[^0-9-]/g, ""))} placeholder="Ej. 1 o -1" /></label><label className="field"><span>Motivo del ajuste</span><input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} placeholder="Obligatorio para auditoría" /></label></div><button className="btn ghost" type="button" disabled={busy === "adjust"} onClick={() => void adjustCredits()}>{busy === "adjust" ? "Registrando…" : "Registrar ajuste"}</button></article>

    <article className="card pad"><div className="card-head"><div><p className="eyebrow">Saldos</p><h3>Personas con movimientos</h3></div><span>{balanceByPerson.size}</span></div><div className={styles.adminRows}>{[...balanceByPerson.entries()].sort((a, b) => personName(a[0]).localeCompare(personName(b[0]), "es")).map(([id, value]) => <div key={id}><span><strong>{personName(id)}</strong><small>{ledger.filter((row) => row.person_id === id).length} movimientos</small></span><strong>{value} créditos</strong></div>)}{!balanceByPerson.size ? <p className="modal-intro">Todavía no hay movimientos de Feedback Online.</p> : null}</div></article>

    {error ? <p className="error">{error}</p> : null}
  </section>;
}
