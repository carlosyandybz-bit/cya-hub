"use client";

import { CheckCircle2, Link2, MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

const META_APP_ID = "1585899772877530";
const WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID = "1685844313102933";
const META_SDK_VERSION = "v25.0";
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
  event: string;
};

type EmbeddedSignupMessage =
  | { kind: "finish"; result: EmbeddedSignupResult }
  | { kind: "cancel"; currentStep?: string }
  | { kind: "error"; message: string };

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

function isTrustedMetaOrigin(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (hostname === "facebook.com" || hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

function parseEmbeddedSignupMessage(raw: unknown): EmbeddedSignupMessage | null {
  let payload: unknown = raw;
  if (typeof raw === "string") {
    try { payload = JSON.parse(raw); } catch { return null; }
  }
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (record.type !== "WA_EMBEDDED_SIGNUP") return null;

  const event = String(record.event || "");
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};

  if (event === "ERROR") {
    return { kind: "error", message: String(data.error_message || data.errorMessage || "Meta devolvió un error durante Embedded Signup.") };
  }
  if (event === "CANCEL") {
    const currentStep = String(data.current_step || data.currentStep || "").trim();
    return { kind: "cancel", ...(currentStep ? { currentStep } : {}) };
  }
  if (event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" && !event.startsWith("FINISH")) return null;

  const wabaId = String(data.waba_id || data.wabaId || "").replace(/\D/g, "");
  const phoneNumberId = String(data.phone_number_id || data.phoneNumberId || "").replace(/\D/g, "");
  if (!wabaId) return { kind: "error", message: "Meta terminó Embedded Signup sin devolver el WABA enlazado." };
  return { kind: "finish", result: { wabaId, ...(phoneNumberId ? { phoneNumberId } : {}), event } };
}

export function WhatsAppIntegration({ client, notify }: Props) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [embeddedSignupReady, setEmbeddedSignupReady] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const signupActiveRef = useRef(false);
  const completionStartedRef = useRef(false);
  const completionGraceTimerRef = useRef<number | null>(null);

  const clearCompletionGraceTimer = useCallback(() => {
    if (completionGraceTimerRef.current !== null) {
      window.clearTimeout(completionGraceTimerRef.current);
      completionGraceTimerRef.current = null;
    }
  }, []);

  const resetOnboarding = useCallback(() => {
    clearCompletionGraceTimer();
    signupActiveRef.current = false;
    completionStartedRef.current = false;
    setOnboarding(false);
  }, [clearCompletionGraceTimer]);

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
          ? "La configuración de WhatsApp está presente. Usa Activar coexistencia para comprobar el enlace real con Cloud API."
          : payload.sendConfigured
            ? "WhatsApp tiene datos de envío, pero todavía falta completar la integración."
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

  const completeEmbeddedSignup = useCallback(async (result: EmbeddedSignupResult) => {
    const token = await sessionToken();
    const response = await fetch("/api/whatsapp/embedded-signup/complete", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        wabaId: result.wabaId,
        phoneNumberId: result.phoneNumberId || null,
        event: result.event,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as {
      ok?: boolean;
      error?: string;
      displayPhoneNumber?: string | null;
      isOnBizApp?: boolean | null;
      platformType?: string | null;
    } | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Meta terminó el registro, pero CYA no pudo cerrar la coexistencia.");

    const phone = payload.displayPhoneNumber ? ` (${payload.displayPhoneNumber})` : "";
    notify(`Coexistencia de WhatsApp confirmada${phone}. Business App y Cloud API están enlazados.`);
    await check(false);
  }, [check, notify, sessionToken]);

  const launchEmbeddedSignup = useCallback(() => {
    const currentOrigin = window.location.origin.replace(/\/$/, "");
    if (currentOrigin !== META_ALLOWED_ORIGIN) {
      notify(`CYA está abierto desde ${currentOrigin}. Para activar coexistencia abre ${META_ALLOWED_ORIGIN}.`);
      return;
    }

    if (!initializeFacebookSdk() || !embeddedSignupReady || !window.FB) {
      notify("Meta todavía está cargando Embedded Signup. Espera unos segundos y vuelve a intentarlo.");
      return;
    }

    clearCompletionGraceTimer();
    signupActiveRef.current = true;
    completionStartedRef.current = false;
    setOnboarding(true);

    window.FB.login((response) => {
      if (completionStartedRef.current) return;
      if (!response?.authResponse) {
        resetOnboarding();
        notify("El registro de coexistencia se canceló antes de terminar.");
        return;
      }

      // El evento WA_EMBEDDED_SIGNUP puede llegar justo antes o justo después del callback
      // de FB.login. Damos un breve margen; si no llega, desbloqueamos la interfaz y
      // mostramos un diagnóstico en lugar de dejar CYA eternamente en “Conectando”.
      completionGraceTimerRef.current = window.setTimeout(() => {
        if (!signupActiveRef.current || completionStartedRef.current) return;
        resetOnboarding();
        notify("Meta cerró el diálogo de acceso, pero no devolvió el evento de finalización de Embedded Signup. Vuelve a intentarlo; si se repite, revisaremos la configuración de Facebook Login for Business/Coexistencia.");
      }, 5000);
    }, {
      config_id: WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    });
  }, [clearCompletionGraceTimer, embeddedSignupReady, notify, resetOnboarding]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedMetaOrigin(event.origin)) return;
      const message = parseEmbeddedSignupMessage(event.data);
      if (!message || !signupActiveRef.current) return;

      if (message.kind === "cancel") {
        resetOnboarding();
        notify(message.currentStep
          ? `Meta canceló Embedded Signup en el paso “${message.currentStep}”.`
          : "Meta canceló Embedded Signup antes de terminar.");
        return;
      }

      if (message.kind === "error") {
        resetOnboarding();
        notify(message.message);
        return;
      }

      if (completionStartedRef.current) return;
      clearCompletionGraceTimer();
      completionStartedRef.current = true;
      void completeEmbeddedSignup(message.result)
        .catch((error) => notify(error instanceof Error ? error.message : "No se pudo completar la coexistencia de WhatsApp."))
        .finally(() => resetOnboarding());
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearCompletionGraceTimer, completeEmbeddedSignup, notify, resetOnboarding]);

  useEffect(() => {
    let pollTimer: number | null = null;
    let loadTarget: HTMLElement | null = null;
    const initialize = () => {
      const ready = initializeFacebookSdk();
      if (ready) setEmbeddedSignupReady(true);
      return ready;
    };

    if (initialize()) return;

    window.fbAsyncInit = () => { initialize(); };

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
    return () => clearCompletionGraceTimer();
  }, [clearCompletionGraceTimer]);

  useEffect(() => {
    const timer = window.setTimeout(() => void check(false), 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  const badge = checking
    ? "Comprobando"
    : status?.configured
      ? "Configurada"
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
      ? "CYA tiene la configuración de WhatsApp preparada. La coexistencia se confirma únicamente al completar Embedded Signup de Meta."
      : status?.sendConfigured
        ? "El envío desde CYA tiene variables configuradas. Falta completar o validar la conexión real con Meta."
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
