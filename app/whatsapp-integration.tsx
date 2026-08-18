"use client";

import { CheckCircle2, MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

type WhatsAppStatus = {
  configured: boolean;
  sendConfigured: boolean;
  webhookConfigured: boolean;
  missingLabels: string[];
  webhookPath: string;
  error?: string;
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

export function WhatsAppIntegration({ client, notify }: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const sessionToken = useCallback(async () => {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Tu sesión ha caducado.");
    return token;
  }, [client]);

  const check = useCallback(async (announce = false) => {
    setChecking(true);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/whatsapp/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as WhatsAppStatus | null;
      if (!response.ok || !payload) throw new Error(payload?.error || "No se pudo comprobar WhatsApp.");
      setStatus(payload);
      if (announce) {
        notify(payload.configured
          ? "WhatsApp Business está preparado para envío y webhook."
          : payload.sendConfigured
            ? "WhatsApp puede enviar; falta terminar la recepción segura de estados."
            : "WhatsApp todavía necesita completar su configuración externa.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo comprobar WhatsApp.";
      setStatus({ configured: false, sendConfigured: false, webhookConfigured: false, missingLabels: [], webhookPath: "/api/whatsapp/webhook", error: message });
      if (announce) notify(message);
    } finally {
      setChecking(false);
    }
  }, [notify, sessionToken]);

  const sendTestToSelf = useCallback(async () => {
    setSendingTest(true);
    try {
      const token = await sessionToken();
      const response = await fetch("/api/whatsapp/test-self", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; recipient?: string } | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "No se pudo enviar el mensaje de prueba.");
      notify(`Mensaje de prueba enviado a tu usuario${payload.recipient ? ` (${payload.recipient})` : ""}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo enviar el mensaje de prueba por WhatsApp.");
    } finally {
      setSendingTest(false);
    }
  }, [notify, sessionToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(false), 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  const badge = checking
    ? "Comprobando"
    : status?.configured
      ? "Conectada"
      : status?.sendConfigured
        ? "Envío preparado"
        : "No configurada";

  return <article className="card pad">
    <div className="card-head">
      <MessageCircle />
      <span className={`badge ${status?.configured ? "portal" : ""}`}>{badge}</span>
    </div>
    <h3>WhatsApp Business</h3>
    <p>{status?.configured
      ? "CYA puede enviar mensajes mediante WhatsApp Cloud API y validar de forma segura los webhooks de Meta."
      : status?.sendConfigured
        ? "El envío desde CYA está preparado. Falta completar la verificación del webhook para cerrar la integración."
        : status?.error || "El envío manual sigue disponible mientras se completa la conexión de WhatsApp Business."}</p>

    {status?.missingLabels?.length ? <div className="status-list">
      <div><ShieldCheck /><span>Falta configurar: {status.missingLabels.join(", ")}.</span></div>
    </div> : null}

    {status?.configured ? <div className="status-list">
      <div><CheckCircle2 /><span>Los secretos permanecen únicamente en el servidor.</span></div>
    </div> : null}

    <div className="actions">
      <button className="btn ghost" type="button" disabled={checking || sendingTest} onClick={() => void check(true)}>
        <RefreshCw /> {checking ? "Comprobando…" : "Comprobar ahora"}
      </button>
      <button className="btn" type="button" disabled={!status?.sendConfigured || checking || sendingTest} onClick={() => void sendTestToSelf()}>
        <Send /> {sendingTest ? "Enviando…" : "Enviar prueba a mi usuario"}
      </button>
    </div>
  </article>;
}
