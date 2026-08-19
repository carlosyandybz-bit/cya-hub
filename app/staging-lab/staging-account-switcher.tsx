"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, GraduationCap, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<AccountKey | null>(null);
  const [error, setError] = useState("");

  if (!isStagingRuntime(client)) return null;

  async function switchAccount(account: ManualAccount) {
    if (busy) return;
    setBusy(account.key);
    setError("");

    try {
      const normalizedCurrentEmail = currentEmail.trim().toLowerCase();
      if (normalizedCurrentEmail !== account.email.toLowerCase()) {
        if (!password) throw new Error("Introduce la contraseña de las cuentas de prueba para cambiar de identidad.");
        const login = await client.auth.signInWithPassword({ email: account.email, password });
        if (login.error) throw login.error;
      }

      window.localStorage.setItem("cya:experience", account.experience);
      const preference = await client.rpc("set_experience_context", { p_context: account.experience });
      if (preference.error) throw preference.error;

      setPassword("");
      window.dispatchEvent(new CustomEvent("cya:experience-change", { detail: account.experience }));
      window.dispatchEvent(new CustomEvent("cya:auth-change"));
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se ha podido cambiar la cuenta de staging.");
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel} aria-label="Acceso rápido de staging">
      <div className={styles.panelHead}>
        <div><span>Solo staging</span><strong>Cambiar cuenta</strong></div>
        <small>Identidades fijas de prueba</small>
      </div>
      <label className={styles.passwordField}>
        <span>Contraseña de pruebas</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="No se guarda ni se incluye en el código"
        />
      </label>
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
              aria-label={`Entrar como ${account.label}`}
            >
              <span className={styles.icon}>{loading ? <LoaderCircle className={styles.spinner} /> : <Icon />}</span>
              <strong>{account.shortLabel}</strong>
              {active ? <Check className={styles.check} /> : null}
            </button>
          );
        })}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
