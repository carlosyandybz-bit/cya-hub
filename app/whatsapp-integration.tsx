"use client";

import { CheckCircle2, Link2, MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

const META_APP_ID = "1585899772877530";
const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = "886780604243575";
const META_SDK_VERSION = "v26.0";
const META_ALLOWED_ORIGIN = "https://app.carlosyandy.com";

type WhatsAppStatus = {
  configured: boolean;
  sendConfigured: boolean;
  webhookConfigured: boolean;
  missingLabels: string[];
  webhookPath: string;
  error?: string;
};

type EmbeddedSignupResult = {
  wabaId: string;
  phoneNumberId?: string;
};

type Props = {
  client: SupabaseClient;
  notify: (message: string) => void;
};

type FacebookLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

function initializeFacebookSdk() {
  if (!window.FB) return false;
  window.FB.init({
    appId: META_APP_ID,
    cookie: true,
    xfbml: false,
    version: META_SDK_VERSION,
  });
  return true;
}

function parseEmbeddedSignupMessage(raw: unknown): EmbeddedSignupResult | null {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try { payload = JSON.parse(raw); } catch { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== "WA_EMBEDDED_SIGNUP") return null;
  const event = String(record.event || "");
  if (!event.startsWith("FINISH")) return null;
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const wabaId = String(data.waba_id || data.wabaId || "").replace(/\D/g, "");
  const phoneNumberId = String(data.phone_number_id || data.phoneNumberId || "").replace(/\D/g, "");
  return wabaId ? { wabaId, ...(phoneNumberId ? { phoneNumberId } : {}) } : null;
}

export function WhatsAppIntegration({ client, notify }: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [embeddedSignupReady, setEmbeddedSignupReady] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const signupResultRef = useRef<EmbeddedSignupResult | null>(null);

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

  const completeEmbeddedSignup = useCallback(async (input: { code?: string; result?: EmbeddedSignupResult | null }) => {
    const token = await sessionToken();
    const response = await fetch("/api/whatsapp/embedded-signup/complete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        code: input.code || null,
        wabaId: input.result?.wabaId || null,
        phoneNumberId: input.result?.phoneNumberId || null,
        event: input.result ? "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" : "OAUTH_CALLBACK",
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      error?: string;
      displayPhoneNumber?: string | null;
      verificationStatus?: string | null;
      needsPhoneNumberEnvUpdate?: boolean;
    } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Meta terminó el registro, pero CYA no pudo cerrar la conexión.");

    if (payload.needsPhoneNumberEnvUpdate) {
      notify("Coexistencia completada. Meta ha creado/seleccionado otro Phone Number ID; hay que actualizar WHATSAPP_PHONE_NUMBER_ID en Hostinger antes de enviar.");
    } else {
      const phone = payload.displayPhoneNumber ? ` (${payload.displayPhoneNumber})` : "";
      notify(`Coexistencia de WhatsApp completada${phone}. CYA ya está suscrito a la cuenta de WhatsApp Business.`);
    }
    await check(false);
  }, [check, notify, sessionToken]);

  const launchEmbeddedSignup = useCallback(() => {
    const currentOrigin = window.location.origin.replace(/\/$/, "");
    if (currentOrigin !== META_ALLOWED_ORIGIN) {
      notify(`CYA está abierto desde ${currentOrigin}. Para activar coexistencia abre ${META_ALLOWED_ORIGIN}.`);
      return;
    }

    if (!initializeFacebookSdk() || !embeddedSignupReady || !window.FB) {
      notify("Meta todavía está cargando el registro insertado. Espera unos segundos y vuelve a intentarlo.");
      return;
    }

    signupResultRef.current = null;
    setOnboarding(true);

    window.FB.login((response) => {
      const code = response?.authResponse?.code?.trim() || "";
      const result = signupResultRef.current;
      if (!code && !result) {
        setOnboarding(false);
        notify("El registro de WhatsApp se canceló o no llegó a completarse.");
        return;
      }

      void completeEmbeddedSignup({ code, result })
        .catch((error) => notify(error instanceof Error ? error.message : "No se pudo completar la coexistencia de WhatsApp."))
        .finally(() => setOnboarding(false));
    }, {
      config_id: WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
      auth_type: "rerequest",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    });
  }, [completeEmbeddedSignup, embeddedSignupReady, notify]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "https://www.facebook.com" && event.origin !== "https://web.facebook.com") return;
      const result = parseEmbeddedSignupMessage(event.data);
      if (result) signupResultRef.current = result;
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    let pollTimer: number | null = null;
    let loadTarget: HTMLElement | null = null;
    const initialize = () => {
      const ready = initializeFacebookSdk();
      if (ready) setEmbeddedSignupReady(true);
      return ready;
    };

    if (initialize()) return;

    window.fbAsyncInit = () => {
      initialize();
    };

    let script = document.getElementById("facebook-jssdk") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/es_ES/sdk.js";
      document.body.appendChild(script);
    }

    const onLoad = () => initialize();
    loadTarget = script;
    loadTarget.addEventListener("load", onLoad);

    let attempts = 0;
    pollTimer = window.setInterval(() => {
      attempts += 1;
      if (initialize() || attempts >= 40) {
        if (pollTimer !== null) window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }, 100);

    return () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      loadTarget?.removeEventListener("load", onLoad);
    };
  }, []);

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
      <button className="btn" type="button" disabled={onboarding || !embeddedSignupReady} onClick={launchEmbeddedSignup}>
        <Link2 /> {onboarding ? "Conectando con Meta…" : "Activar coexistencia"}
      </button>
      <button className="btn" type="button" disabled={!status?.sendConfigured || checking || sendingTest || onboarding} onClick={() => void sendTestToSelf()}>
        <Send /> {sendingTest ? "Enviando…" : "Enviar prueba a mi usuario"}
      </button>
    </div>
  </article>;
}
