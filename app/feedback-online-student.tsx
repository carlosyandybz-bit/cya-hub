"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Clock3, Play, Send, Upload, Video, WalletCards, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SecureDriveAsset } from "./drive-media";
import { prepareVideoForUpload, uploadPreparedFeedback } from "./video-upload-client";
import styles from "./feedback-online.module.css";

type Product = {
  id: number;
  name: string;
  description: string | null;
  price_cents: number | null;
  currency: string;
  target_response_hours: number | null;
  active: boolean;
};

type Order = {
  id: number;
  product_id: number;
  payment_status: "pending" | "paid" | "cancelled";
  total_price_cents: number;
  currency: string;
  requested_at: string;
  paid_at: string | null;
};

type RequestRow = {
  id: number;
  product_id: number;
  status: "draft" | "submitted" | "in_review" | "completed" | "cancelled";
  style_term_id: number | null;
  role_term_id: number | null;
  level_term_id: number | null;
  student_note: string | null;
  external_file_id: string | null;
  video_title: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  teacher_summary: string | null;
  due_at: string | null;
  submitted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type Term = { id: number; taxonomy: string; label: string; sort_order: number };

type Props = {
  client: SupabaseClient;
  notify?: (message: string) => void;
};

const statusLabel: Record<RequestRow["status"], string> = {
  draft: "Preparando",
  submitted: "Pendiente de revisión",
  in_review: "En revisión",
  completed: "Listo",
  cancelled: "Cancelado",
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: currency || "EUR" }).format(cents / 100);
}

function dateTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function durationLabel(hours: number | null) {
  if (!hours) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "día" : "días"}`;
  }
  return `${hours} h`;
}

export function FeedbackOnlineStudentPanel({ client, notify }: Props) {
  const [product, setProduct] = useState<Product | null>(null);
  const [balance, setBalance] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [styleId, setStyleId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [levelId, setLevelId] = useState("");

  const load = useCallback(async () => {
    setError("");
    const [productResult, balanceResult, ordersResult, requestsResult, termsResult] = await Promise.all([
      client.from("feedback_products").select("id,name,description,price_cents,currency,target_response_hours,active").eq("active", true).order("sort_order").limit(1).maybeSingle(),
      client.rpc("feedback_credit_balance", { p_person_id: null }),
      client.from("feedback_credit_orders").select("id,product_id,payment_status,total_price_cents,currency,requested_at,paid_at").order("requested_at", { ascending: false }).limit(20),
      client.from("feedback_requests").select("id,product_id,status,style_term_id,role_term_id,level_term_id,student_note,external_file_id,video_title,mime_type,size_bytes,teacher_summary,due_at,submitted_at,started_at,completed_at,created_at").order("created_at", { ascending: false }).limit(30),
      client.from("catalog_terms").select("id,taxonomy,label,sort_order").in("taxonomy", ["dance_style", "dance_role", "dance_level"]).eq("active", true).order("sort_order"),
    ]);
    const firstError = balanceResult.error || ordersResult.error || requestsResult.error || termsResult.error;
    if (firstError) setError(firstError.message);
    if (!productResult.error) setProduct((productResult.data as Product | null) ?? null);
    if (!balanceResult.error) setBalance(Number(balanceResult.data || 0));
    if (!ordersResult.error) setOrders((ordersResult.data ?? []) as Order[]);
    if (!requestsResult.error) setRequests((requestsResult.data ?? []) as RequestRow[]);
    if (!termsResult.error) setTerms((termsResult.data ?? []) as Term[]);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const pendingOrder = orders.find((row) => row.payment_status === "pending") ?? null;
  const openRequest = requests.find((row) => ["draft", "submitted", "in_review"].includes(row.status)) ?? null;
  const stylesTerms = useMemo(() => terms.filter((term) => term.taxonomy === "dance_style"), [terms]);
  const roleTerms = useMemo(() => terms.filter((term) => term.taxonomy === "dance_role"), [terms]);
  const levelTerms = useMemo(() => terms.filter((term) => term.taxonomy === "dance_level"), [terms]);
  const labelFor = (id: number | null) => id ? terms.find((term) => term.id === id)?.label ?? "" : "";

  async function requestPurchase() {
    if (!product) return;
    setBusy("purchase"); setError("");
    const result = await client.rpc("feedback_request_purchase", { p_product_id: product.id });
    if (result.error) setError(result.error.message);
    else { notify?.("Solicitud de compra enviada."); await load(); }
    setBusy("");
  }

  async function createDraft() {
    if (!product) return;
    setBusy("draft"); setError("");
    const result = await client.rpc("feedback_create_draft", {
      p_product_id: product.id,
      p_style_term_id: styleId ? Number(styleId) : null,
      p_role_term_id: roleId ? Number(roleId) : null,
      p_level_term_id: levelId ? Number(levelId) : null,
      p_student_note: note.trim() || null,
    });
    if (result.error) setError(result.error.message);
    else { setNote(""); notify?.("Feedback preparado. Ya puedes subir tu vídeo."); await load(); }
    setBusy("");
  }

  async function uploadVideo(requestId: number, file: File) {
    if (!file.type.startsWith("video/")) return setError("Selecciona un archivo de vídeo.");
    if (file.size <= 0 || file.size > 1024 * 1024 * 1024) return setError("El vídeo debe ser menor de 1 GB.");
    setBusy(`upload-${requestId}`); setError(""); setUploadMessage("Preparando vídeo…");
    try {
      const prepared = await prepareVideoForUpload(file, (progress) => setUploadMessage(progress.message));
      await uploadPreparedFeedback(requestId, prepared, (progress) => setUploadMessage(progress.message));
      setUploadMessage(prepared.compressed ? `Vídeo optimizado · ${prepared.savingsPercent}% menos` : "Vídeo guardado");
      notify?.(prepared.compressed ? `Vídeo guardado · ${prepared.savingsPercent}% menos de tamaño.` : "Vídeo guardado. Revísalo y envíalo cuando quieras.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir el vídeo.");
      setUploadMessage("");
    }
    setBusy("");
  }

  async function submitRequest(requestId: number) {
    setBusy(`submit-${requestId}`); setError("");
    const result = await client.rpc("feedback_submit_request", { p_request_id: requestId });
    if (result.error) setError(result.error.message);
    else { notify?.("Feedback enviado para revisión."); await load(); }
    setBusy("");
  }

  async function cancelRequest(requestId: number) {
    if (!window.confirm("¿Cancelar este Feedback Online? Si aún no ha empezado la revisión, el crédito se devolverá automáticamente.")) return;
    setBusy(`cancel-${requestId}`); setError("");
    const result = await client.rpc("feedback_cancel_request", { p_request_id: requestId });
    if (result.error) setError(result.error.message);
    else { notify?.("Feedback cancelado."); await load(); }
    setBusy("");
  }

  if (loading) return <section className={`card ${styles.panel}`}><p className="modal-intro">Cargando Feedback Online…</p></section>;
  if (!product && requests.length === 0 && orders.length === 0 && balance === 0) return null;

  return <section className={`card ${styles.panel}`} aria-labelledby="feedback-online-title">
    <div className={styles.head}>
      <div><p className="eyebrow">Feedback Online</p><h2 id="feedback-online-title">Revisa tu baile en vídeo</h2><p>{product?.description || "Consulta aquí tus revisiones de vídeo."}</p></div>
      <div className={styles.balance}><WalletCards /><span>Créditos</span><strong>{balance}</strong></div>
    </div>

    {product ? <div className={styles.product}>
      <div><strong>{product.name}</strong><span>{product.price_cents !== null ? money(product.price_cents, product.currency) : "Precio pendiente de configurar"}{durationLabel(product.target_response_hours) ? ` · respuesta objetivo ${durationLabel(product.target_response_hours)}` : ""}</span></div>
      {product.price_cents !== null && balance < 1 ? pendingOrder ? <span className="badge">Compra pendiente de confirmación</span> : <button className="btn ghost" type="button" disabled={busy === "purchase"} onClick={() => void requestPurchase()}>{busy === "purchase" ? "Solicitando…" : `Solicitar compra · ${money(product.price_cents, product.currency)}`}</button> : null}
    </div> : null}

    {!openRequest && product && balance > 0 ? <div className={styles.newRequest}>
      <div className={styles.fields}>
        <label className="field"><span>Estilo</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)}><option value="">Por indicar</option>{stylesTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
        <label className="field"><span>Rol</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Por indicar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
        <label className="field"><span>Nivel</span><select value={levelId} onChange={(event) => setLevelId(event.target.value)}><option value="">Por indicar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
      </div>
      <label className="field"><span>¿Qué quieres que revisemos?</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional: cuéntanos qué estás trabajando o qué duda tienes." /></label>
      <button className="btn" type="button" disabled={busy === "draft"} onClick={() => void createDraft()}><Video /> {busy === "draft" ? "Preparando…" : "Preparar nuevo Feedback"}</button>
    </div> : null}

    {openRequest ? <article className={styles.current}>
      <div className={styles.requestHead}><div><span className={`badge ${openRequest.status === "completed" ? "portal" : ""}`}>{statusLabel[openRequest.status]}</span><strong>Feedback #{openRequest.id}</strong><small>{[labelFor(openRequest.style_term_id), labelFor(openRequest.role_term_id), labelFor(openRequest.level_term_id)].filter(Boolean).join(" · ") || "Contexto por completar"}</small></div>{openRequest.due_at ? <span className={styles.due}><Clock3 /> Objetivo · {dateTime(openRequest.due_at)}</span> : null}</div>
      {openRequest.student_note ? <p>{openRequest.student_note}</p> : null}
      {openRequest.external_file_id ? <SecureDriveAsset fileId={openRequest.external_file_id} mediaType="video" title={openRequest.video_title || "Vídeo de Feedback"} controls className={styles.video} /> : null}
      {openRequest.status === "draft" ? <div className={styles.actions}>
        <label className="btn ghost"><Upload /> {busy === `upload-${openRequest.id}` ? (uploadMessage || "Subiendo…") : openRequest.external_file_id ? "Cambiar vídeo" : "Subir vídeo"}<input className={styles.fileInput} type="file" accept="video/*" disabled={Boolean(busy)} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadVideo(openRequest.id, file); event.currentTarget.value = ""; }} /></label>
        <button className="btn" type="button" disabled={!openRequest.external_file_id || Boolean(busy)} onClick={() => void submitRequest(openRequest.id)}><Send /> {busy === `submit-${openRequest.id}` ? "Enviando…" : "Enviar para revisión"}</button>
        <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void cancelRequest(openRequest.id)}><X /> Cancelar</button>
      </div> : null}
      {openRequest.status === "submitted" ? <div className={styles.actions}><span className={styles.wait}><Clock3 /> Todavía puedes cancelar mientras no haya empezado la revisión.</span><button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void cancelRequest(openRequest.id)}>Cancelar y recuperar crédito</button></div> : null}
      {openRequest.status === "in_review" ? <p className={styles.wait}><Play /> Ya estamos revisando tu vídeo.</p> : null}
    </article> : null}

    {error ? <p className="error">{error}</p> : null}

    {requests.some((row) => row.status === "completed") ? <div className={styles.history}><div className="card-head"><h3>Feedback anteriores</h3><span>{requests.filter((row) => row.status === "completed").length}</span></div>{requests.filter((row) => row.status === "completed").map((row) => <article key={row.id}><div><CheckCircle2 /><div><strong>{row.video_title || `Feedback #${row.id}`}</strong><span>{dateTime(row.completed_at)} · {[labelFor(row.style_term_id), labelFor(row.role_term_id)].filter(Boolean).join(" · ")}</span></div></div>{row.teacher_summary ? <p>{row.teacher_summary}</p> : null}{row.external_file_id ? <SecureDriveAsset fileId={row.external_file_id} mediaType="video" title={row.video_title || "Vídeo de Feedback"} controls className={styles.historyVideo} /> : null}</article>)}</div> : null}
  </section>;
}
