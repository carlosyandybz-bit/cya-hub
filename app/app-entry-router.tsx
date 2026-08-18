"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import CyaApp from "./cya-app";
import { RegistrationProfileGate, type RegistrationProfileStatus } from "./registration-profile-gate";
import { StudentPortalPrf } from "./student-portal-prf";
import { getRuntimeSupabaseClient, setRuntimeSupabaseClient } from "./supabase-runtime";
import type { ExperienceContext, IdentityContext } from "./v14-types";
import styles from "./app-entry-router.module.css";

let routerClient: SupabaseClient | null = null;
let routerClientPromise: Promise<SupabaseClient> | null = null;

async function connectRouterClient() {
  if (routerClient) return routerClient;
  if (!routerClientPromise) {
    routerClientPromise = fetch("/api/runtime-config", { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => {
        const config = await response.json().catch(() => null) as { configured?: boolean; supabaseUrl?: string; supabasePublishableKey?: string } | null;
        if (!response.ok || !config?.configured || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error("CYA Hub no ha podido conectar con sus datos.");
        routerClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
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

export default function AppEntryRouter() {
  const [studentState, setStudentState] = useState<ActiveStudentState | null>(null);
  const [registrationGate, setRegistrationGate] = useState<RegistrationGateState | null>(null);
  const [staffExperience, setStaffExperience] = useState<Exclude<ExperienceContext, "student"> | null>(null);
  const [checking, setChecking] = useState(true);
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
  }, [inspect]);

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
