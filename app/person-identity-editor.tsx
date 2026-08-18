"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, GitMerge, Instagram, Plus, Search, X } from "lucide-react";
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

type MergeCandidate = {
  person_id: number;
  display_name: string;
  email: string | null;
  phone: string | null;
  lifecycle_status: string;
};

export function StudentIdentityEditor({ client, person, profile, close, saved }: StudentIdentityEditorProps) {
  const [mergeOpen, setMergeOpen] = useState(false);

  return <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="person-editor-title">
      <header className="modal-head">
        <div><p className="eyebrow">Alumnado</p><h2 id="person-editor-title">Editar ficha</h2></div>
        <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar"><X /></button>
      </header>
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

        <InstagramIdentityField client={client} personId={person.id} saved={saved} />

        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => setMergeOpen((value) => !value)}>
            <GitMerge size={17}/> Fusionar
          </button>
        </div>
        {mergeOpen ? <SimpleIdentityMerge client={client} person={person} saved={saved} close={close} /> : null}
      </div>
    </section>
  </div>;
}

function InstagramIdentityField({ client, personId, saved }: { client: SupabaseClient; personId: number; saved: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void client.from("people").select("instagram_handle").eq("id", personId).maybeSingle().then(({ data }) => {
      if (!active) return;
      setValue(typeof data?.instagram_handle === "string" ? data.instagram_handle : "");
      setLoaded(true);
    });
    return () => { active = false; };
  }, [client, personId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.rpc("save_person_instagram", {
        p_person_id: personId,
        p_instagram: value.trim() || null,
      });
      if (result.error) throw result.error;
      setValue(typeof result.data === "string" ? result.data : "");
      setMessage("Instagram guardado.");
      await saved().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar Instagram.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form" onSubmit={submit} aria-label="Instagram del alumno">
    <label className="field field-wide">
      <span>Instagram</span>
      <div style={{display:"flex", gap:8, alignItems:"center"}}>
        <Instagram size={18} aria-hidden="true" />
        <input
          value={value}
          onChange={(event) => { setValue(event.target.value); setMessage(""); setError(""); }}
          placeholder="@usuario o enlace de Instagram"
          autoComplete="off"
          disabled={!loaded || busy}
        />
        <button className="btn ghost" disabled={!loaded || busy}>{busy ? "Guardando…" : "Guardar"}</button>
      </div>
    </label>
    {message ? <p className="notice success" role="status">{message}</p> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </form>;
}

function SimpleIdentityMerge({ client, person, saved, close }: { client: SupabaseClient; person: EditablePersonIdentity; saved: () => Promise<void>; close: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MergeCandidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return setError("Escribe un nombre, teléfono o email.");
    setBusy(true); setError(""); setResults([]);
    try {
      const result = await client.rpc("admin_search_person_merge_candidates", {
        p_source_person_id: person.id,
        p_query: value,
      });
      if (result.error) throw result.error;
      setResults((result.data ?? []) as MergeCandidate[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo realizar la búsqueda.");
    } finally {
      setBusy(false);
    }
  }

  async function accept(candidate: MergeCandidate) {
    setMergingId(candidate.person_id); setError("");
    try {
      const result = await client.rpc("admin_merge_people_auto", {
        p_person_a_id: person.id,
        p_person_b_id: candidate.person_id,
      });
      if (result.error) throw result.error;
      const canonicalId = Number(result.data) || candidate.person_id;
      await saved().catch(() => undefined);
      window.dispatchEvent(new CustomEvent("cya:person-merged", { detail: { personId: canonicalId } }));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron fusionar las fichas.");
    } finally {
      setMergingId(null);
    }
  }

  return <section className="form" aria-label="Fusionar ficha">
    <div>
      <h3>Fusionar ficha</h3>
      <p className="modal-intro">Busca la otra ficha de esta misma persona y pulsa Aceptar.</p>
    </div>
    <form onSubmit={search} className="form">
      <label className="field field-wide">
        <span>Buscar persona</span>
        <div style={{display:"flex", gap:8}}>
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setResults([]); setError(""); }}
            placeholder="Nombre, teléfono o email"
            autoFocus
          />
          <button className="btn ghost" disabled={busy} aria-label="Buscar"><Search size={17}/>{busy ? "Buscando…" : "Buscar"}</button>
        </div>
      </label>
    </form>

    {results.length ? <div className="form">
      {results.map((candidate) => <div className="notice" key={candidate.person_id}>
        <strong>{candidate.display_name}</strong>
        <p>{[candidate.phone, candidate.email].filter(Boolean).join(" · ") || "Sin teléfono ni email"}</p>
        <div className="actions">
          <button type="button" className="btn" onClick={() => void accept(candidate)} disabled={mergingId !== null}>
            <CheckCircle2 size={17}/>{mergingId === candidate.person_id ? "Fusionando…" : "Aceptar"}
          </button>
        </div>
      </div>)}
    </div> : (!busy && query.trim() ? <p className="modal-intro">No hay coincidencias.</p> : null)}
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
        <div className="actions"><button className="btn ghost" type="button" onClick={close}>Cancelar</button><button className="btn" disabled={busy}><Plus size={17}/> {busy ? "Creando…" : "Crear y seleccionar"}</button></div>
      </form>
    </section>
  </div>;
}
