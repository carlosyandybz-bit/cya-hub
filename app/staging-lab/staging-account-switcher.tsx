"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, GraduationCap, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import type { ExperienceContext } from "../v14-types";
import styles from "./staging-account-switcher.module.css";

const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";
const STAGING_HOSTS = new Set(["desarrollo.carlosyandy.com", "localhost", "127.0.0.1"]);

type AccountKey = "teacher" | "student" | "admin";

type ManualAccount = {
  key: AccountKey;
  label: string;
  shortLabel: string;
  email: string;
  experience: ExperienceContext;
  Icon: typeof GraduationCap;
};

const accounts: ManualAccount[] = [
  {
    key: "teacher",
    label: "Profesor",
    shortLabel: "Profesor",
    email: "carlosyandybz+staging-profesor@gmail.com",
    experience: "teacher",
    Icon: GraduationCap,
  },
  {
    key: "student",
    label: "Alumno",
    shortLabel: "Alumno",
    email: "carlosyandybz+staging-alumno@gmail.com",
    experience: "student",
    Icon: UserRound,
  },
  {
    key: "admin",
    label: "Profesor administrador",
    shortLabel: "Admin",
    email: "carlosyandybz+staging-admin@gmail.com",
    experience: "admin",
    Icon: ShieldCheck,
  },
];

function clientProjectRef(client: SupabaseClient) {
  const supabaseUrl = (client as SupabaseClient & { supabaseUrl?: string }).supabaseUrl ?? "";
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function isStagingRuntime(client: SupabaseClient) {
  if (typeof window === "undefined") return false;
  return clientProjectRef(client) === STAGING_PROJECT_REF && STAGING_HOSTS.has(window.location.hostname.toLowerCase());
}

export function StagingAccountSwitcher({
  client,
  currentEmail,
  experience,
}: {
  client: SupabaseClient;
  currentEmail: string;
  experience: ExperienceContext;
}) {
  const [busy, setBusy] = useState<AccountKey | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!isStagingRuntime(client)) return null;

  async function activateExperience(account: ManualAccount) {
    window.localStorage.setItem("cya:experience", account.experience);
    const preference = await client.rpc("set_experience_context", { p_context: account.experience });
    if (preference.error) throw preference.error;
    window.dispatchEvent(new CustomEvent("cya:experience-change", { detail: account.experience }));
    window.dispatchEvent(new CustomEvent("cya:auth-change"));
    window.location.reload();
  }

  async function switchAccount(account: ManualAccount) {
    if (busy) return;
    setBusy(account.key);
    setError("");
    setMessage("");

    try {
      const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
      if (normalizedCurrentEmail === account.email.toLowerCase()) {
        await activateExperience(account);
        return;
      }

      window.localStorage.setItem("cya:experience", account.experience);
      const result = await client.auth.signInWithOtp({
        email: account.email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/staging-lab/accounts`,
        },
      });
      if (result.error) throw result.error;

      setMessage(`Acceso enviado para ${account.label}. Abre el enlace de un solo uso recibido por email.`);
      setBusy(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido preparar el acceso de staging.");
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-label="Acceso rápido de staging">
      <div className={styles.panelHead}>
        <div><span>Solo staging</span><strong>Cambiar cuenta</strong></div>
        <small>Acceso passwordless · identidades fijas de prueba</small>
      </div>
      <p className={styles.note}>Selecciona una identidad. Si no es tu sesión actual, recibirás un enlace de acceso de un solo uso en el buzón de staging.</p>
      <div className={styles.accounts}>
        {accounts.map((account) => {
          const active = currentEmail.trim().toLowerCase() === account.email.toLowerCase() && experience === account.experience;
          const Icon = account.Icon;
          const loading = busy === account.key;
          return (
            <button
              key={account.key}
              type="button"
              className={`${styles.account} ${active ? styles.active : ""}`}
              onClick={() => void switchAccount(account)}
              disabled={Boolean(busy)}
              aria-current={active ? "true" : undefined}
              aria-label={active ? `${account.label} activa` : `Acceder como ${account.label}`}
            >
              <span className={styles.icon}>{loading ? <LoaderCircle className={styles.spinner} /> : <Icon />}</span>
              <strong>{account.shortLabel}</strong>
              {active ? <Check className={styles.check} /> : <Mail className={styles.check} />}
            </button>
          );
        })}
      </div>
      {message ? <p className={styles.note} role="status">{message}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
