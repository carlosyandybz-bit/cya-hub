"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, Plus, UserPlus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { CountrySelect } from "./country-field";

type Props = {
  client: SupabaseClient;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
};

type InviteResponse = {
  ok?: boolean;
  invitation_sent?: boolean;
  account_reused?: boolean;
  person_reused?: boolean;
  message?: string;
  error?: string;
};

export function AdminTeacherOnboarding({ client, refresh, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [country, setCountry] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<InviteResponse | null>(null);

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
    setSuccess(null);
    setCountry("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setSuccess(null);
    try {
      const { data, error: invokeError } = await client.functions.invoke("teacher-invite", {
        body: {
          first_name: String(form.get("first_name") ?? "").trim(),
          last_name: String(form.get("last_name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          phone: String(form.get("phone") ?? "").trim(),
          country_code: country,
        },
      });
      if (invokeError) throw invokeError;
      const result = (data ?? {}) as InviteResponse;
      if (!result.ok) throw new Error(result.error || "No se pudo añadir el profesor.");
      setSuccess(result);
      await refresh();
      notify(result.message || "Profesor añadido al equipo.");
      event.currentTarget.reset();
      setCountry("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo añadir el profesor.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="btn" onClick={() => setOpen(true)}><UserPlus size={17} /> Añadir profesor</button>
    {open ? <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="teacher-onboarding-title">
        <header className="modal-head">
          <div><p className="eyebrow">Equipo</p><h2 id="teacher-onboarding-title">Añadir profesor</h2></div>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={close}><X /></button>
        </header>
        <form className="modal-body form" onSubmit={submit}>
          <p className="modal-intro">CYA reutilizará su ficha si ya existe. Tendrá acceso de profesor y también su espacio de alumno para usar su propia formación y evaluaciones.</p>
          <div className="fields-2">
            <label className="field"><span>Nombre *</span><input name="first_name" required autoFocus autoComplete="given-name" /></label>
            <label className="field"><span>Apellidos</span><input name="last_name" autoComplete="family-name" /></label>
            <label className="field"><span>Email *</span><input name="email" type="email" required autoComplete="email" /></label>
            <label className="field"><span>Teléfono</span><input name="phone" type="tel" autoComplete="tel" /></label>
            <label className="field field-wide"><span>País</span><CountrySelect value={country} onChange={setCountry} /></label>
          </div>
          {error ? <p className="error" role="alert">{error}</p> : null}
          {success ? <div className="card pad">
            <div className="card-head"><div><p className="eyebrow">Listo</p><h3>{success.invitation_sent ? "Invitación enviada" : "Cuenta activada"}</h3></div><CheckCircle2 /></div>
            <p className="modal-intro">{success.invitation_sent ? "Recibirá un email para entrar en CYA Hub." : "La cuenta ya existía y ahora tiene acceso como profesor."}</p>
            {success.person_reused ? <small>Se ha reutilizado su ficha existente para no duplicar información.</small> : null}
          </div> : null}
          <div className="actions">
            <button type="button" className="btn ghost" onClick={close} disabled={busy}>Cerrar</button>
            <button type="submit" className="btn" disabled={busy}><Plus size={17} /> {busy ? "Añadiendo…" : "Añadir profesor"}</button>
          </div>
        </form>
      </section>
    </div> : null}
  </>;
}
