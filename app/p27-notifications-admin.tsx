"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BellRing, CheckCircle2, Clock3, Mail, MessageCircle, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type NotificationRule = {
  event_key: string;
  label: string;
  enabled: boolean;
  channels: string[];
  anticipation_minutes: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  template: string;
};

type Integration = {
  integration_key: string;
  label: string;
  status: string;
  public_config: Record<string, unknown> | null;
  last_checked_at: string | null;
  last_error: string | null;
};

type Delivery = {
  id: number;
  event_key: string;
  channel: string;
  status: string;
  queued_at: string;
  sent_at: string | null;
  last_error: string | null;
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

function integerInRange(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function channelLabel(channel: string) {
  if (channel === "internal") return "Aviso interno";
  if (channel === "email") return "Email";
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "system") return "Sistema";
  return channel;
}

function Switch({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <button type="button" className={`switch ${checked ? "on" : ""}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>;
}

export function P27NotificationsAdmin({ client, notify }: Props) {
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [ruleResult, integrationResult, deliveryResult] = await Promise.all([
      client.from("notification_rules")
        .select("event_key,label,enabled,channels,anticipation_minutes,quiet_hours_start,quiet_hours_end,template")
        .order("label"),
      client.from("integration_settings")
        .select("integration_key,label,status,public_config,last_checked_at,last_error")
        .in("integration_key", ["email", "whatsapp"])
        .order("integration_key"),
      client.from("notification_deliveries")
        .select("id,event_key,channel,status,queued_at,sent_at,last_error")
        .order("queued_at", { ascending: false })
        .limit(50),
    ]);
    const error = ruleResult.error ?? integrationResult.error ?? deliveryResult.error;
    if (error) notify(error.message);
    setRules((ruleResult.data ?? []) as NotificationRule[]);
    setIntegrations((integrationResult.data ?? []) as Integration[]);
    setDeliveries((deliveryResult.data ?? []) as Delivery[]);
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => ({
    sent: deliveries.filter((delivery) => delivery.status === "sent").length,
    queued: deliveries.filter((delivery) => delivery.status === "queued" || delivery.status === "sending").length,
    failed: deliveries.filter((delivery) => delivery.status === "failed").length,
    skipped: deliveries.filter((delivery) => delivery.status === "skipped").length,
  }), [deliveries]);

  function integrationFor(key: string) {
    return integrations.find((integration) => integration.integration_key === key) ?? null;
  }

  function externalReady(key: string) {
    const integration = integrationFor(key);
    return integration?.status === "connected" && integration.public_config?.dispatch_ready === true;
  }

  async function updateRule(rule: NotificationRule, changes: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    const result = await client.from("notification_rules").update(changes).eq("event_key", rule.event_key);
    if (result.error) notify(result.error.message);
    else {
      notify("Regla de notificación actualizada.");
      await load();
    }
    setBusy("");
  }

  if (loading) return <div className="admin-loading"><span className="spinner" /><p>Comprobando el motor de notificaciones…</p></div>;

  return <section className="admin-stack">
    <header className="admin-section-head">
      <div>
        <p className="eyebrow">P27 · MOTOR AUTOMÁTICO</p>
        <h2>Motor de notificaciones</h2>
        <p>La bandeja interna funciona de forma automática. Un canal externo solo se habilita cuando su conexión y su dispatcher están verificados.</p>
      </div>
      <button className="btn ghost" type="button" onClick={() => void load()} disabled={Boolean(busy)}><RefreshCw /> Actualizar</button>
    </header>

    <div className="admin-content-grid">
      <article className="card pad">
        <div className="card-head"><div><p className="eyebrow">Canal interno</p><h2>Bandeja interna operativa</h2></div><span className="badge portal">Operativa</span></div>
        <p>Los avisos se registran de forma idempotente, se resuelven cuando deja de existir la acción pendiente y cada miembro del equipo ve únicamente su propia bandeja.</p>
        <div className="status-list">
          <div><CheckCircle2 /> Entrega automática interna</div>
          <div><CheckCircle2 /> Sin duplicados por evento y destinatario</div>
          <div><CheckCircle2 /> Misiones terminales salen de pendientes</div>
          <div><ShieldCheck /> Auditoría global separada de la bandeja personal</div>
        </div>
      </article>

      <article className="card pad">
        <div className="card-head"><div><p className="eyebrow">Últimas 50 entregas</p><h2>Salud del motor</h2></div><BellRing /></div>
        <div className="admin-metric-grid">
          <div><strong>{counts.sent}</strong><span>entregadas</span></div>
          <div><strong>{counts.queued}</strong><span>en cola</span></div>
          <div><strong>{counts.failed}</strong><span>con error</span></div>
          <div><strong>{counts.skipped}</strong><span>omitidas</span></div>
        </div>
        {counts.failed ? <p><TriangleAlert /> Hay entregas fallidas que requieren revisión.</p> : null}
      </article>
    </div>

    <article className="card pad">
      <div className="card-head"><div><p className="eyebrow">Canales externos</p><h2>Estado real de conexiones</h2></div><ShieldCheck /></div>
      <div className="integration-grid">
        {[{ key: "email", label: "Email", Icon: Mail }, { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle }].map(({ key, label, Icon }) => {
          const integration = integrationFor(key);
          const ready = externalReady(key);
          return <article className="card pad" key={key}>
            <div className="card-head"><Icon /><span className={`badge ${ready ? "portal" : ""}`}>{ready ? "Disponible" : "Sin conexión verificada"}</span></div>
            <h3>{label}</h3>
            <p>{ready ? "Conexión y dispatcher verificados." : integration?.last_error || "P27 no generará un falso envío por este canal mientras no exista una integración real."}</p>
          </article>;
        })}
      </div>
    </article>

    <section className="admin-stack">
      <header className="admin-section-head"><div><h2>Reglas automáticas</h2><p>Activa o silencia cada tipo de aviso. Las horas silenciosas se conservan para canales externos cuando estén disponibles.</p></div></header>
      <div className="notification-rule-list">
        {rules.map((rule) => <article className="card notification-rule" key={rule.event_key}>
          <div><BellRing /><span><strong>{rule.label}</strong><small>{rule.channels.map(channelLabel).join(" · ")}</small></span></div>
          <label className="field"><span>Anticipación</span><input type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={rule.anticipation_minutes} onBlur={(event) => {
            const value = integerInRange(event.currentTarget.value, 0, 525600);
            if (value === null) {
              event.currentTarget.value = String(rule.anticipation_minutes);
              notify("Indica una anticipación entre 0 y 525600 minutos.");
              return;
            }
            void updateRule(rule, { anticipation_minutes: value }, `anticipation-${rule.event_key}`);
          }} /></label>
          <label className="field"><span>Silencio desde</span><input type="time" defaultValue={String(rule.quiet_hours_start).slice(0, 5)} onBlur={(event) => void updateRule(rule, { quiet_hours_start: event.currentTarget.value }, `quiet-start-${rule.event_key}`)} /></label>
          <label className="field"><span>Silencio hasta</span><input type="time" defaultValue={String(rule.quiet_hours_end).slice(0, 5)} onBlur={(event) => void updateRule(rule, { quiet_hours_end: event.currentTarget.value }, `quiet-end-${rule.event_key}`)} /></label>
          <Switch checked={rule.enabled} label={`Activar ${rule.label}`} onChange={(checked) => void updateRule(rule, { enabled: checked }, `enabled-${rule.event_key}`)} />
        </article>)}
      </div>
    </section>

    {deliveries.length ? <article className="card pad">
      <div className="card-head"><div><p className="eyebrow">Trazabilidad</p><h2>Entregas recientes</h2></div><Clock3 /></div>
      <div className="audit-list">
        {deliveries.slice(0, 12).map((delivery) => <div key={delivery.id}>
          <span>{channelLabel(delivery.channel)} · {delivery.status}</span>
          <strong>{delivery.event_key}</strong>
          <small>{delivery.last_error || new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(delivery.sent_at ?? delivery.queued_at))}</small>
        </div>)}
      </div>
    </article> : null}
  </section>;
}
