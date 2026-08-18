"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useState } from "react";
import { CheckCircle2, GitMerge, Plus, Search, X } from "lucide-react";
import { CountrySelect } from "./country-field";
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
        {person.auth_user_id ? <IdentityMergePanel client={client} person={person} saved={saved} close={close} /> : null}
        <p className="modal-intro">Los datos que CYA ya conoce se reutilizan automáticamente para que no tengas que escribirlos dos veces.</p>
      </div>
    </section>
  </div>;
}

type MergeCandidate = {
  person_id: number;
  display_name: string;
  email: string | null;
  phone: string | null;
  lifecycle_status: string;
};

function IdentityMergePanel({ client, person, saved, close }: { client: SupabaseClient; person: EditablePersonIdentity; saved: () => Promise<void>; close: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<MergeCandidate | null>(null);
  const [matchEmail, setMatchEmail] = useState("");
  const [matchPhone, setMatchPhone] = useState("");

  async function findCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matchEmail.trim() && !matchPhone.trim()) return setError("Escribe el teléfono o email de la ficha que ya existía.");
    setBusy(true); setError(""); setCandidate(null);
    try {
      const result = await client.rpc("find_person_merge_candidate", {
        p_source_person_id: person.id,
        p_email: matchEmail.trim() || null,
        p_phone: matchPhone.trim() || null,
      });
      if (result.error) throw result.error;
      const row = (Array.isArray(result.data) ? result.data[0] : result.data) as MergeCandidate | null;
      if (!row?.person_id) throw new Error("No hay una única ficha previa sin cuenta que coincida con esos datos.");
      setCandidate(row);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo buscar la ficha previa.");
    } finally {
      setBusy(false);
    }
  }

  async function merge() {
    if (!candidate) return;
    setBusy(true); setError("");
    try {
      const result = await client.rpc("merge_fresh_registered_person", {
        p_source_person_id: person.id,
        p_target_person_id: candidate.person_id,
        p_match_email: matchEmail.trim() || null,
        p_match_phone: matchPhone.trim() || null,
      });
      if (result.error) throw result.error;
      await saved().catch(() => undefined);
      window.dispatchEvent(new CustomEvent("cya:person-merged", { detail: { personId: candidate.person_id } }));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron fusionar las fichas.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <div className="actions"><button type="button" className="btn ghost" onClick={() => setOpen(true)}><GitMerge size={17}/> Fusionar con ficha existente</button></div>;

  return <section className="form" aria-label="Fusionar ficha duplicada">
    <div>
      <p className="eyebrow">Identidad duplicada</p>
      <h3>Fusionar con una ficha previa</h3>
      <p className="modal-intro">Úsalo cuando esta cuenta registrada corresponde a un alumno provisional que ya existía. Busca esa ficha por su teléfono o email.</p>
    </div>
    <form onSubmit={findCandidate} className="form">
      <div className="fields-2">
        <label className="field"><span>Teléfono de la ficha previa</span><input type="tel" value={matchPhone} onChange={(event) => { setMatchPhone(event.target.value); setCandidate(null); }} /></label>
        <label className="field"><span>Email de la ficha previa</span><input type="email" value={matchEmail} onChange={(event) => { setMatchEmail(event.target.value); setCandidate(null); }} /></label>
      </div>
      <div className="actions"><button type="button" className="btn ghost" onClick={() => { setOpen(false); setCandidate(null); setError(""); }}>Cancelar</button><button className="btn ghost" disabled={busy}><Search size={17}/>{busy ? "Buscando…" : "Buscar ficha"}</button></div>
    </form>
    {candidate ? <div className="notice success">
      <strong>{candidate.display_name}</strong>
      <p>{candidate.phone || "Sin teléfono visible"}{candidate.email ? ` · ${candidate.email}` : ""} · {candidate.lifecycle_status === "provisional" ? "Alumno provisional" : "Ficha previa"}</p>
      <p>La cuenta registrada se vinculará a esta ficha y el duplicado recién creado quedará archivado.</p>
      <div className="actions"><button type="button" className="btn" onClick={merge} disabled={busy}><GitMerge size={17}/>{busy ? "Fusionando…" : "Confirmar fusión"}</button></div>
    </div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
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
  const [country, setCountry] = useState(person.country_code ?? "");

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
        p_country_code: country.trim() || null,
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
    <p className="modal-intro">Completa o corrige los datos principales del alumno.</p>
    <div className="fields-2">
      <label className="field"><span>Nombre *</span><input name="first_name" defaultValue={person.first_name ?? ""} required /></label>
      <label className="field"><span>Apellidos</span><input name="last_name" defaultValue={person.last_name ?? ""} /></label>
      <label className="field"><span>Teléfono</span><input name="phone" type="tel" defaultValue={person.phone ?? ""} /></label>
      <label className="field"><span>Email</span><input name="email" type="email" defaultValue={person.email ?? ""} /></label>
      <label className="field"><span>País</span><CountrySelect name="country_code" value={country} onChange={setCountry} /></label>
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
  const [country, setCountry] = useState("");

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
        p_country_code: country.trim() || null,
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
          <label className="field"><span>País</span><CountrySelect name="country_code" value={country} onChange={setCountry} /></label>
        </div>
        {error ? <p className="error">{error}</p> : null}
        <div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><Plus size={17} /> {busy ? "Creando…" : "Crear y seleccionar"}</button></div>
      </form>
    </section>
  </div>;
}
