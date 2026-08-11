"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { RuntimeForm } from "./runtime-form";

export type EditablePersonIdentity = {
  id: number;
  auth_user_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  country_code: string | null;
};

export type EditableStudentProfile = {
  goals: string | null;
  teacher_notes: string | null;
  health_notes?: string | null;
};

type StudentIdentityEditorProps = {
  client: SupabaseClient;
  person: EditablePersonIdentity;
  profile: EditableStudentProfile | null;
  close: () => void;
  saved: () => Promise<void>;
};

export function StudentIdentityEditor({ client, person, profile, close, saved }: StudentIdentityEditorProps) {
  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="person-editor-title">
      <header className="modal-head"><div><p className="eyebrow">Alumnado</p><h2 id="person-editor-title">Editar ficha</h2></div><button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
      <div className="modal-body">
        <RuntimeForm
          client={client}
          formKey="student_personal"
          personId={person.id}
          mode="edit"
          submitLabel="Guardar ficha"
          unavailableFallback={<LegacyStudentIdentityForm client={client} person={person} profile={profile} saved={saved} close={close} />}
          onSaved={async () => { await saved(); close(); }}
        />
        <p className="modal-intro">Los datos conocidos se editan en su fuente real. El envío conserva la versión utilizada, pero no duplica nombre, teléfono, objetivos ni otros hechos canónicos.</p>
      </div>
    </section>
  </div>;
}

type LegacyStudentIdentityFormProps = {
  client: SupabaseClient;
  person: EditablePersonIdentity;
  profile: EditableStudentProfile | null;
  saved: () => Promise<void>;
  close: () => void;
};

function LegacyStudentIdentityForm({ client, person, profile, saved, close }: LegacyStudentIdentityFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const first = String(form.get("first_name") ?? "").trim();
    if (!first) return setError("El nombre es obligatorio.");
    setBusy(true); setError("");
    try {
      const result = await client.rpc("save_person_identity", {
        p_person_id: person.id,
        p_first_name: first,
        p_last_name: String(form.get("last_name") ?? "").trim() || null,
        p_email: String(form.get("email") ?? "").trim() || null,
        p_phone: String(form.get("phone") ?? "").trim() || null,
        p_country_code: String(form.get("country_code") ?? "").trim() || null,
        p_goals: String(form.get("goals") ?? "").trim() || null,
        p_teacher_notes: String(form.get("teacher_notes") ?? "").trim() || null,
        p_health_notes: String(form.get("health_notes") ?? "").trim() || null,
      });
      if (result.error) throw result.error;
      await saved();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la ficha.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form" onSubmit={submit}>
    <p className="modal-intro">La nueva versión de formularios está desplegándose. Mientras termina el cambio, esta ficha usa el guardado seguro anterior.</p>
    <div className="fields-2">
      <label className="field"><span>Nombre *</span><input name="first_name" defaultValue={person.first_name ?? ""} required /></label>
      <label className="field"><span>Apellidos</span><input name="last_name" defaultValue={person.last_name ?? ""} /></label>
      <label className="field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={person.phone ?? ""} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" defaultValue={person.email ?? ""} /></label>
      <label className="field"><span>País</span><input name="country_code" maxLength={2} defaultValue={person.country_code ?? ""} placeholder="ES" /></label>
      <label className="field field-wide"><span>Objetivos</span><textarea name="goals" rows={3} defaultValue={profile?.goals ?? ""} /></label>
      <label className="field field-wide"><span>Salud / a tener en cuenta</span><textarea name="health_notes" rows={3} defaultValue={profile?.health_notes ?? ""} /></label>
      <label className="field field-wide"><span>Notas internas</span><textarea name="teacher_notes" rows={3} defaultValue={profile?.teacher_notes ?? ""} /></label>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    <div className="actions"><button className="btn" disabled={busy}><CheckCircle2 size={17}/>{busy ? "Guardando…" : "Guardar ficha"}</button></div>
  </form>;
}

type QuickProvisionalStudentModalProps = {
  client: SupabaseClient;
  close: () => void;
  created: (person: EditablePersonIdentity) => Promise<void>;
};

export function QuickProvisionalStudentModal({ client, close, created }: QuickProvisionalStudentModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const first = String(form.get("first_name") ?? "").trim();
    const last = String(form.get("last_name") ?? "").trim();
    if (!first) return setError("Escribe al menos el nombre.");
    setBusy(true); setError("");
    try {
      const result = await client.rpc("create_student", {
        p_display_name: [first,last].filter(Boolean).join(" "),
        p_first_name: first,
        p_last_name: last || null,
        p_email: String(form.get("email") ?? "").trim() || null,
        p_phone: String(form.get("phone") ?? "").trim() || null,
        p_country_code: String(form.get("country_code") ?? "").trim() || null,
      });
      if (result.error) throw result.error;
      const row = (Array.isArray(result.data) ? result.data[0] : result.data) as EditablePersonIdentity | null;
      if (!row?.id) throw new Error("No se pudo recuperar la ficha creada.");
      await created(row);
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el provisional.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="quick-provisional-title">
      <header className="modal-head"><div><p className="eyebrow">Dar clase</p><h2 id="quick-provisional-title">Crear alumno provisional</h2></div><button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button></header>
      <form className="modal-body" onSubmit={submit}>
        <p className="modal-intro">Se crea o reutiliza una única persona y vuelves directamente a seleccionar alumno.</p>
        <div className="fields-2">
          <label className="field"><span>Nombre *</span><input name="first_name" required autoFocus /></label>
          <label className="field"><span>Apellidos</span><input name="last_name" /></label>
          <label className="field"><span>Teléfono</span><input name="phone" type="tel" /></label>
          <label className="field"><span>Email</span><input name="email" type="email" /></label>
          <label className="field"><span>País</span><input name="country_code" maxLength={2} placeholder="ES" /></label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><Plus size={17} /> {busy ? "Creando…" : "Crear y seleccionar"}</button></div>
      </form>
    </section>
  </div>;
}
