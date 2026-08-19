"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { CountrySelect } from "./country-field";
import styles from "./app-entry-router.module.css";

export type RegistrationProfileStatus = {
  available?: boolean;
  complete?: boolean;
  person_id?: number | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  country_code?: string | null;
  missing?: string[];
  merge_required?: boolean;
  merge_case_id?: number | null;
};

type Props = {
  client: SupabaseClient;
  status: RegistrationProfileStatus;
  email: string;
  completed: () => Promise<void>;
};

export function RegistrationProfileGate({ client, status, email, completed }: Props) {
  const [country, setCountry] = useState(status.country_code ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const first = String(form.get("first_name") ?? "").trim();
    const last = String(form.get("last_name") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    if (!first || !last || !phone || !country) {
      setError("Completa todos los datos obligatorios para continuar.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await client.rpc("complete_registration_profile", {
        p_first_name: first,
        p_last_name: last,
        p_phone: phone,
        p_country_code: country,
      });
      if (result.error) throw result.error;
      const data = result.data as RegistrationProfileStatus | null;
      if (data?.merge_required) {
        setError("CYA ha encontrado una ficha anterior que probablemente es tuya. Hemos creado una incidencia de fusión para administración y no vamos a crear otro perfil ni perder los datos anteriores.");
        return;
      }
      await completed();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se ha podido completar tu perfil.";
      setError(message.includes("ficha existente")
        ? "Ese teléfono ya está asociado a una ficha que CYA tenía creada. No crearemos un duplicado: administración debe fusionar ambas fichas."
        : message);
    } finally {
      setBusy(false);
    }
  }

  return <main className={styles.profileGate}>
    <section className={styles.profileCard} aria-labelledby="complete-profile-title">
      <div className={styles.profileIcon}><ShieldCheck aria-hidden="true" /></div>
      <p className={styles.profileEyebrow}>Último paso</p>
      <h1 id="complete-profile-title">Completa tus datos personales</h1>
      <p className={styles.profileIntro}>Necesitamos estos datos antes de darte acceso a CYA Hub. Así evitamos fichas incompletas y podemos reconocer tu perfil si ya habías estado con nosotros.</p>
      <form className={styles.profileForm} onSubmit={submit}>
        <div className={styles.profileGrid}>
          <label><span>Nombre *</span><input name="first_name" defaultValue={status.first_name ?? ""} autoComplete="given-name" required /></label>
          <label><span>Apellidos *</span><input name="last_name" defaultValue={status.last_name ?? ""} autoComplete="family-name" required /></label>
          <label><span>Teléfono *</span><input name="phone" type="tel" defaultValue={status.phone ?? ""} autoComplete="tel" required /></label>
          <label><span>Email</span><input value={email} type="email" readOnly aria-readonly="true" /></label>
          <label className={styles.profileWide}><span>País *</span><CountrySelect name="country_code" value={country} onChange={setCountry} /></label>
        </div>
        {error ? <p className={styles.profileError} role="alert">{error}</p> : null}
        <button className={styles.profileSubmit} disabled={busy}>
          <CheckCircle2 size={18} aria-hidden="true" />{busy ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </section>
  </main>;
}
