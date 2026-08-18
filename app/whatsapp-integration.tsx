"use client";

import { CheckCircle2, Link2, MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

const META_ALLOWED_ORIGIN = "https://app.carlosyandy.com";
const WHATSAPP_OAUTH_CALLBACK_KEY = "cya:whatsapp:oauth:callback";

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

type WhatsAppOAuthCallbackPayload = {
  type?: string;
  ok?: boolean;
  message?: string;
  at?: number;
};

function parseOAuthCallback(raw: unknown) {
  let payload = raw;
  if (typeof raw === "string") {
    try { payload = JSON.parse(raw); } catch { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as WhatsAppOAuthCallbackPayload;
  if (record.type !== "CYA_WHATSAPP_OAUTH_CALLBACK" || typeof record.message !== "string") return null;
  if (record.at && Date.now() - record.at > 15 * 60 * 1000) return null;
  return record;
}

export function WhatsAppIntegration({ client, notify }: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

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

  const consumeOAuthCallback = useCallback((raw: unknown) => {
    const payload = parseOAuthCallback(raw);
    if (!payload) return;
    try { window.localStorage.removeItem(WHATSAPP_OAUTH_CALLBACK_KEY); } catch { /* noop */ }
    setOnboarding(false);
    notify(payload.message || "Meta terminó la autorización.");
    if (payload.ok) void check(false);
  }, [check, notify]);

  const launchEmbeddedSignup = useCallback(async () => {
    const currentOrigin = window.location.origin.replace(/\/$/, "");
    if (currentOrigin !== META_ALLOWED_ORIGIN) {
      notify(`CYA está abierto desde ${currentOrigin}. Para activar coexistencia abre ${META_ALLOWED_ORIGIN}.`);
      return;
    }

    // Abrimos la ventana inmediatamente durante el gesto del usuario para evitar que
    // Safari/Chrome la consideren un popup asíncrono y la bloqueen.
    const popup = window.open("about:blank", "cya-whatsapp-meta", "popup=yes,width=560,height=760,resizable=yes,scrollbars=yes");
    setOnboarding(true);

    try {
      const token = await sessionToken();
      const response = await fetch("/api/whatsapp/embedded-signup/start", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; authUrl?: string; error?: string } | null;
      if (!response.ok || !payload?.ok || !payload.authUrl) {
        throw new Error(payload?.error || "No se pudo iniciar la autorización manual de Meta.");
      }

      if (popup && !popup.closed) {
        popup.location.replace(payload.authUrl);
        popup.focus();
      } else {
        // Si iOS decide abrir el flujo en la misma pestaña, el callback global de CYA
        // puede terminar igualmente la autorización al volver al dominio.
        window.location.assign(payload.authUrl);
      }
    } catch (error) {
      try { popup?.close(); } catch { /* noop */ }
      setOnboarding(false);
      notify(error instanceof Error ? error.message : "No se pudo iniciar la coexistencia con Meta.");
    }
  }, [notify, sessionToken]);

  useEffect(() => {
    const current = window.localStorage.getItem(WHATSAPP_OAUTH_CALLBACK_KEY);
    if (current) consumeOAuthCallback(current);

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== META_ALLOWED_ORIGIN) return;
      consumeOAuthCallback(event.data);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== WHATSAPP_OAUTH_CALLBACK_KEY || !event.newValue) return;
      consumeOAuthCallback(event.newValue);
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
    };
  }, [consumeOAuthCallback]);

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

    <div className="status-list">
      <div><Link2 /><span>Coexistencia: conecta el mismo número con Cloud API sin eliminar WhatsApp Business del teléfono.</span></div>
    </div>

    <div className="actions">
      <button className="btn ghost" type="button" disabled={checking || sendingTest || onboarding} onClick={() => void check(true)}>
        <RefreshCw /> {checking ? "Comprobando…" : "Comprobar ahora"}
      </button>
      <button className="btn" type="button" disabled={onboarding} onClick={() => void launchEmbeddedSignup()}>
        <Link2 /> {onboarding ? "Conectando con Meta…" : "Activar coexistencia"}
      </button>
      <button className="btn" type="button" disabled={!status?.sendConfigured || checking || sendingTest || onboarding} onClick={() => void sendTestToSelf()}>
        <Send /> {sendingTest ? "Enviando…" : "Enviar prueba a mi usuario"}
      </button>
    </div>
  </article>;
}
