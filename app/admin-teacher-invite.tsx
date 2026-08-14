"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MailPlus, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";

export function AdminTeacherInvite({
  client,
  notify,
  refresh,
}: {
  client: SupabaseClient;
  notify: (message: string) => void;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("full_name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!fullName || !email) return setError("Completa el nombre y el email.");

    setBusy(true);
    setError("");
    try {
      const { data, error: invokeError } = await client.functions.invoke("invite-teacher", {
        body: { full_name: fullName, email },
      });
      if (invokeError) throw invokeError;
      const payload = (data ?? {}) as { error?: string; message?: string };
      if (payload.error) throw new Error(payload.error);
      await refresh();
      event.currentTarget.reset();
      notify(payload.message || "Profesor dado de alta.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "No se pudo dar de alta al profesor.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return <article className="card pad">
    <div className="card-head">
      <div><h3>Invitar profesor</h3><p>Crea el acceso sin duplicar su ficha si ya existe en CYA.</p></div>
      <MailPlus />
    </div>
    <form className="form" onSubmit={submit}>
      <div className="fields-2">
        <label className="field"><span>Nombre *</span><input name="full_name" autoComplete="name" required placeholder="Nombre y apellidos" /></label>
        <label className="field"><span>Email *</span><input name="email" type="email" autoComplete="email" required placeholder="profesor@email.com" /></label>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="actions"><button className="btn" disabled={busy}><UserPlus size={17} />{busy ? "Enviando…" : "Invitar profesor"}</button></div>
    </form>
  </article>;
}
