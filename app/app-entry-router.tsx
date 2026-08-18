"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import CyaApp from "./cya-app";
import { RegistrationProfileGate, type RegistrationProfileStatus } from "./registration-profile-gate";
import { StudentPortalPrf } from "./student-portal-prf";
import { getRuntimeSupabaseClient, setRuntimeSupabaseClient } from "./supabase-runtime";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import styles from "./app-entry-router.module.css";

const WHATSAPP_OAUTH_STATE_PREFIX = "cya_wa_";
const WHATSAPP_OAUTH_CALLBACK_KEY = "cya:whatsapp:oauth:callback";

let routerClient: SupabaseClient | null = null;
let routerClientPromise: Promise<SupabaseClient> | null = null;

async function loadRuntimeConfig() {
  const response = await fetch("/api/runtime-config", { cache: "no-store", headers: { accept: "application/json" } });
  const config = await response.json().catch(() => null) as { configured?: boolean; supabaseUrl?: string; supabasePublishableKey?: string } | null;
  if (!response.ok || !config?.configured || !config.supabaseUrl || !config.supabasePublishableKey) {
    throw new Error("CYA Hub no ha podido conectar con sus datos.");
  }
  return config;
}

async function connectRouterClient() {
  if (routerClient) return routerClient;
  if (!routerClientPromise) {
    routerClientPromise = loadRuntimeConfig()
      .then((config) => {
        routerClient = createClient(config.supabaseUrl!, config.supabasePublishableKey!, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        setRuntimeSupabaseClient(routerClient);
        return routerClient;
      })
      .catch((error) => {
        routerClientPromise = null;
        throw error;
      });
  }
  return routerClientPromise;
}

async function connectOAuthCallbackClient() {
  const config = await loadRuntimeConfig();
  return createClient(config.supabaseUrl!, config.supabasePublishableKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

function allowed(identity: IdentityContext, value: ExperienceContext) {
  return value === "student" ? identity.can_study : value === "teacher" ? identity.can_teach : identity.can_admin;
}

function preferredExperience(identity: IdentityContext, preferred: string | null | undefined): ExperienceContext {
  const candidates = [preferred, typeof window !== "undefined" ? window.localStorage.getItem("cya:experience") : null]
    .filter((value): value is ExperienceContext => value === "teacher" || value === "student" || value === "admin");
  const firstAllowed = candidates.find((value) => allowed(identity, value));
  if (firstAllowed) return firstAllowed;
  if (identity.can_study && !identity.can_teach && !identity.can_admin) return "student";
  if (identity.can_teach) return "teacher";
  if (identity.can_admin) return "admin";
  return "student";
}

function staffHistoryState(experience: Exclude<ExperienceContext, "student">) {
  return {
    cyaHub: true,
    view: experience === "admin" ? "admin" : "home",
    experience,
    selectedId: null,
    overlay: null,
    modalStudentId: null,
    liveClassId: null,
  };
}

function StaffExperienceBridge({ experience }: { experience: Exclude<ExperienceContext, "student"> }) {
  useEffect(() => {
    const state = staffHistoryState(experience);
    window.history.replaceState(state, "", window.location.href);

    const deliver = () => {
      window.history.replaceState(state, "", window.location.href);
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    };

    if (document.querySelector(".shell")) {
      deliver();
      return;
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(".shell")) return;
      observer.disconnect();
      deliver();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [experience]);

  return <CyaApp />;
}

type ActiveStudentState = {
  client: SupabaseClient;
  identity: IdentityContext;
  email: string;
  experience: ExperienceContext;
};

type RegistrationGateState = {
  client: SupabaseClient;
  email: string;
  status: RegistrationProfileStatus;
};

type WhatsAppOAuthCallbackPayload = {
  type: "CYA_WHATSAPP_OAUTH_CALLBACK";
  ok: boolean;
  message: string;
  at: number;
};

function isWhatsAppOAuthCallback() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (params.get("state") || "").startsWith(WHATSAPP_OAUTH_STATE_PREFIX);
}

function publishWhatsAppOAuthCallback(payload: WhatsAppOAuthCallbackPayload) {
  try {
    window.localStorage.setItem(WHATSAPP_OAUTH_CALLBACK_KEY, JSON.stringify(payload));
  } catch {
    // El postMessage sigue cubriendo la ventana principal aunque localStorage esté restringido.
  }

  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch {
    // Si el navegador aísla el opener, la señal persistida queda como respaldo.
  }
}

export default function AppEntryRouter() {
  const [studentState, setStudentState] = useState<ActiveStudentState | null>(null);
  const [registrationGate, setRegistrationGate] = useState<RegistrationGateState | null>(null);
  const [staffExperience, setStaffExperience] = useState<Exclude<ExperienceContext, "student"> | null>(null);
  const [checking, setChecking] = useState(true);
  const [whatsappOAuthCallback] = useState(() => isWhatsAppOAuthCallback());
  const [whatsappOAuthMessage, setWhatsAppOAuthMessage] = useState("Terminando la conexión segura con Meta…");
  const aliveRef = useRef(true);

  const inspect = useCallback(async () => {
    try {
      const client = getRuntimeSupabaseClient() ?? await connectRouterClient();
      const sessionResult = await client.auth.getSession();
      const session = sessionResult.data.session;
      if (!session) {
        if (aliveRef.current) { setStudentState(null); setRegistrationGate(null); setStaffExperience(null); setChecking(false); }
        return;
      }
      const [identityResult, preferenceResult] = await Promise.all([
        client.rpc("identity_context"),
        client.from("user_preferences").select("preferred_context").eq("user_id", session.user.id).maybeSingle(),
      ]);
      if (identityResult.error || !identityResult.data) throw new Error(identityResult.error?.message || "No se ha podido leer tu perfil.");
      const identity = identityResult.data as IdentityContext;
      const studentOnly = identity.can_study && !identity.can_teach && !identity.can_admin;
      let incompleteProfile: RegistrationProfileStatus | null = null;

      if (studentOnly) {
        const profileResult = await client.rpc("registration_profile_status");
        if (!profileResult.error && profileResult.data) {
          const profileStatus = profileResult.data as RegistrationProfileStatus;
          if (profileStatus.complete === false) incompleteProfile = profileStatus;
        }
      }

      if (incompleteProfile) {
        if (aliveRef.current) {
          setStudentState(null);
          setStaffExperience(null);
          setRegistrationGate({ client, email: session.user.email ?? "", status: incompleteProfile });
          setChecking(false);
        }
        return;
      }

      const experience = preferredExperience(identity, preferenceResult.data?.preferred_context ?? null);
      if (typeof window !== "undefined") window.localStorage.setItem("cya:experience", experience);
      if (aliveRef.current) {
        setRegistrationGate(null);
        if (experience === "student" && identity.can_study) {
          setStaffExperience(null);
          setStudentState({ client, identity, email: session.user.email ?? "", experience });
        } else {
          setStudentState(null);
          setStaffExperience(experience === "admin" ? "admin" : "teacher");
        }
        setChecking(false);
      }
    } catch {
      if (aliveRef.current) { setStudentState(null); setRegistrationGate(null); setStaffExperience(null); setChecking(false); }
    }
  }, []);

  useEffect(() => {
    if (!whatsappOAuthCallback) return;
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const state = params.get("state") || "";
      const code = params.get("code") || "";
      const metaError = params.get("error_description") || params.get("error_message") || params.get("error") || "";

      try {
        if (metaError) throw new Error(metaError);
        if (!code) throw new Error("Meta volvió a CYA sin un código de autorización.");

        const client = await connectOAuthCallbackClient();
        const sessionResult = await client.auth.getSession();
        const token = sessionResult.data.session?.access_token;
        if (!token) throw new Error("La sesión de CYA Hub no está disponible para terminar la conexión.");

        const response = await fetch("/api/whatsapp/embedded-signup/complete", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ code, state }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as {
          ok?: boolean;
          error?: string;
          displayPhoneNumber?: string | null;
          needsPhoneNumberEnvUpdate?: boolean;
        } | null;
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Meta terminó OAuth, pero CYA no pudo cerrar la conexión.");

        const message = payload.needsPhoneNumberEnvUpdate
          ? "Coexistencia completada. Meta ha seleccionado otro Phone Number ID; actualiza WHATSAPP_PHONE_NUMBER_ID antes de enviar."
          : `Coexistencia de WhatsApp completada${payload.displayPhoneNumber ? ` (${payload.displayPhoneNumber})` : ""}.`;
        const callbackPayload: WhatsAppOAuthCallbackPayload = {
          type: "CYA_WHATSAPP_OAUTH_CALLBACK",
          ok: true,
          message,
          at: Date.now(),
        };
        publishWhatsAppOAuthCallback(callbackPayload);
        if (!cancelled) setWhatsAppOAuthMessage(`${message} Ya puedes volver a CYA Hub.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo terminar la conexión con Meta.";
        publishWhatsAppOAuthCallback({
          type: "CYA_WHATSAPP_OAUTH_CALLBACK",
          ok: false,
          message,
          at: Date.now(),
        });
        if (!cancelled) setWhatsAppOAuthMessage(`${message} Vuelve a CYA Hub para intentarlo de nuevo.`);
      } finally {
        const cleanUrl = `${window.location.origin}${window.location.pathname}`;
        window.history.replaceState({}, "", cleanUrl);
        if (window.opener && !window.opener.closed) {
          window.setTimeout(() => window.close(), 700);
        } else {
          window.setTimeout(() => window.location.replace(cleanUrl), 1800);
        }
      }
    };

    void finish();
    return () => { cancelled = true; };
  }, [whatsappOAuthCallback]);

  useEffect(() => {
    if (whatsappOAuthCallback) return;
    aliveRef.current = true;
    const initialInspection = window.setTimeout(() => void inspect(), 0);
    const onCanonicalContextChange = () => void inspect();
    window.addEventListener("cya:experience-change", onCanonicalContextChange);
    window.addEventListener("cya:auth-change", onCanonicalContextChange);
    return () => {
      aliveRef.current = false;
      window.clearTimeout(initialInspection);
      window.removeEventListener("cya:experience-change", onCanonicalContextChange);
      window.removeEventListener("cya:auth-change", onCanonicalContextChange);
    };
  }, [inspect, whatsappOAuthCallback]);

  async function changeExperience(value: ExperienceContext) {
    if (!studentState) return;
    if (!allowed(studentState.identity, value)) throw new Error("No tienes acceso a esa vista.");

    const result = await studentState.client.rpc("set_experience_context", { p_context: value });
    if (result.error) throw new Error(result.error.message);

    const identity = (result.data ?? studentState.identity) as IdentityContext;
    if (!allowed(identity, value)) throw new Error("No tienes acceso a esa vista.");

    window.localStorage.setItem("cya:experience", value);
    if (value === "student") {
      setStaffExperience(null);
      setStudentState((current) => current ? { ...current, identity: { ...current.identity, ...identity }, experience: value } : current);
    } else {
      setStudentState(null);
      setStaffExperience(value);
    }
  }

  function patchIdentity(patch: Partial<IdentityContext>) {
    setStudentState((current) => current ? { ...current, identity: { ...current.identity, ...patch } } : current);
  }

  if (whatsappOAuthCallback) return <div className={styles.loading} role="status"><strong>WhatsApp + CYA</strong><span>{whatsappOAuthMessage}</span></div>;
  if (checking) return <div className={styles.loading} role="status"><strong>CYA</strong><span>Preparando tu espacio…</span></div>;
  if (registrationGate) return <RegistrationProfileGate
    client={registrationGate.client}
    status={registrationGate.status}
    email={registrationGate.email}
    completed={inspect}
  />;
  if (studentState) return <StudentPortalPrf
    client={studentState.client}
    identity={studentState.identity}
    email={studentState.email}
    experience={studentState.experience}
    onExperience={changeExperience}
    onIdentityPatch={patchIdentity}
  />;
  if (staffExperience) return <StaffExperienceBridge experience={staffExperience} />;
  return <CyaApp />;
}
