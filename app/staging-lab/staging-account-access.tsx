"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { ExperienceContext } from "../v14-types";
import { StagingAccountSwitcher } from "./staging-account-switcher";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function savedExperience(): ExperienceContext {
  if (typeof window === "undefined") return "teacher";
  const value = window.localStorage.getItem("cya:experience");
  return value === "student" || value === "admin" ? value : "teacher";
}

export function StagingAccountAccess() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [email, setEmail] = useState("");
  const [experience, setExperience] = useState<ExperienceContext>("teacher");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function connect() {
      try {
        const response = await fetch("/api/runtime-config", { cache: "no-store", headers: { accept: "application/json" } });
        const config = await response.json().catch(() => null) as { configured?: boolean; supabaseUrl?: string; supabasePublishableKey?: string } | null;
        if (!response.ok || !config?.configured || !config.supabaseUrl || !config.supabasePublishableKey) throw new Error("El laboratorio no puede leer la configuración de staging.");
        const projectRef = new URL(config.supabaseUrl).hostname.split(".")[0] ?? "";
        if (projectRef !== STAGING_PROJECT_REF) throw new Error("Acceso de laboratorio rechazado fuera del Supabase de staging.");

        const nextClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        const session = await nextClient.auth.getSession();
        if (!active) return;
        setClient(nextClient);
        setEmail(session.data.session?.user.email ?? "");
        setExperience(savedExperience());
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "No se ha podido preparar el acceso de pruebas.");
      }
    }

    void connect();
    return () => { active = false; };
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!client) return <p role="status">Preparando identidades de prueba…</p>;
  return <StagingAccountSwitcher client={client} currentEmail={email} experience={experience} />;
}
