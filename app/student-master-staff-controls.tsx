"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Clock3, MapPin, Settings2, Sparkles, Target, UsersRound, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./student-master-staff-controls.module.css";

type PersonLite = { id: number; display_name: string; email: string | null; phone: string | null };
type Term = { id: number; label: string; taxonomy: string };
type Preferences = {
  person_id: number;
  default_location_term_id: number | null;
  default_location_text: string | null;
  default_style_term_id: number | null;
  default_role_term_id: number | null;
  default_duration_minutes: number | null;
  default_class_type: "individual" | "pair" | null;
  default_partner_person_id: number | null;
};
type StaffProfile = {
  teacher_notes: string | null;
  teaching_approach: string | null;
  work_priorities: string | null;
  strengths: string | null;
};

type PortalTarget = { host: Element; name: string };

function clean(value: string) { return value.trim(); }
function text(node: Element | null) { return node?.textContent?.trim() ?? ""; }

function findMasterTarget(): PortalTarget | null {
  const title = document.getElementById("student-master-title");
  if (!title) return null;
  const dialog = title.closest('[role="dialog"][aria-modal="true"]');
  const header = title.closest("header");
  if (!dialog || !header) return null;
  const candidates = Array.from(header.querySelectorAll("div"));
  const host = candidates.find((item) => {
    const buttons = Array.from(item.querySelectorAll(":scope > button"));
    return buttons.some((button) => /programar/i.test(text(button))) && buttons.some((button) => /bono/i.test(text(button)));
  });
  return host ? { host, name: text(title) } : null;
}

async function resolvePerson(client: SupabaseClient, displayName: string) {
  const result = await client.from("people").select("id,display_name,email,phone").eq("display_name", displayName).eq("active", true).limit(3);
  if (result.error) throw result.error;
  const rows = (result.data ?? []) as PersonLite[];
  if (rows.length !== 1) throw new Error(rows.length ? "Hay varias personas con este mismo nombre. Abre la ficha desde un registro inequívoco antes de editar sus preferencias." : "No se ha podido resolver el alumno de esta ficha.");
  return rows[0];
}

export function StudentMasterStaffControls() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [target, setTarget] = useState<PortalTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<PersonLite | null>(null);
  const [people, setPeople] = useState<PersonLite[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile>({ teacher_notes: null, teaching_approach: null, work_priorities: null, strengths: null });
  const [locationText, setLocationText] = useState("");
  const [styleId, setStyleId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [duration, setDuration] = useState("60");
  const [classType, setClassType] = useState<"individual" | "pair">("individual");
  const [partnerId, setPartnerId] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [teachingApproach, setTeachingApproach] = useState("");
  const [workPriorities, setWorkPriorities] = useState("");
  const [strengths, setStrengths] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const stylesTerms = useMemo(() => terms.filter((term) => term.taxonomy === "dance_style"), [terms]);
  const roleTerms = useMemo(() => terms.filter((term) => term.taxonomy === "dance_role"), [terms]);

  useEffect(() => {
    setClient(getRuntimeSupabaseClient());
    const scan = () => setTarget(findMasterTarget());
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!open || !client || !target) return;
    let alive = true;
    setBusy("loading"); setError(""); setNotice("");
    void (async () => {
      try {
        const currentPerson = await resolvePerson(client, target.name);
        const [prefResult, profileResult, peopleResult, termsResult] = await Promise.all([
          client.rpc("get_student_class_preferences", { p_person_id: currentPerson.id }),
          client.from("student_profiles").select("teacher_notes,teaching_approach,work_priorities,strengths").eq("person_id", currentPerson.id).maybeSingle(),
          client.from("people").select("id,display_name,email,phone").eq("active", true).order("display_name"),
          client.from("catalog_terms").select("id,label,taxonomy").in("taxonomy", ["dance_style", "dance_role"]).eq("active", true).order("sort_order"),
        ]);
        if (!alive) return;
        const failed = [prefResult, profileResult, peopleResult, termsResult].find((result) => result.error)?.error;
        if (failed) throw failed;
        const pref = (prefResult.data ?? { person_id: currentPerson.id }) as Preferences;
        const profile = (profileResult.data ?? {}) as StaffProfile;
        setPerson(currentPerson);
        setPreferences(pref);
        setStaffProfile(profile);
        setPeople((peopleResult.data ?? []) as PersonLite[]);
        setTerms((termsResult.data ?? []) as Term[]);
        setLocationText(pref.default_location_text ?? "");
        setStyleId(pref.default_style_term_id ? String(pref.default_style_term_id) : "");
        setRoleId(pref.default_role_term_id ? String(pref.default_role_term_id) : "");
        setDuration(String(pref.default_duration_minutes ?? 60));
        setClassType(pref.default_class_type ?? "individual");
        setPartnerId(pref.default_partner_person_id ? String(pref.default_partner_person_id) : "");
        setTeacherNotes(profile.teacher_notes ?? "");
        setTeachingApproach(profile.teaching_approach ?? "");
        setWorkPriorities(profile.work_priorities ?? "");
        setStrengths(profile.strengths ?? "");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No se han podido cargar las preferencias.");
      } finally { if (alive) setBusy(""); }
    })();
    return () => { alive = false; };
  }, [client, open, target]);

  async function savePreferences() {
    if (!client || !person) return;
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 15 || minutes > 480) return setError("La duración debe estar entre 15 y 480 minutos.");
    if (classType === "pair" && !partnerId) return setError("Selecciona la pareja predeterminada para una clase de pareja.");
    setBusy("preferences"); setError(""); setNotice("");
    const changedLocation = clean(locationText) !== clean(preferences?.default_location_text ?? "") || Boolean(preferences?.default_location_term_id);
    const result = await client.rpc("save_student_class_preferences", {
      p_person_id: person.id,
      p_location_term_id: changedLocation ? null : preferences?.default_location_term_id ?? null,
      p_location_text: clean(locationText) || null,
      p_style_term_id: styleId ? Number(styleId) : null,
      p_role_term_id: roleId ? Number(roleId) : null,
      p_duration_minutes: minutes,
      p_class_type: classType,
      p_set_location: true,
      p_set_style: true,
      p_set_role: true,
      p_set_duration: true,
      p_set_class_type: true,
    });
    if (result.error) { setError(result.error.message); setBusy(""); return; }
    const partnerResult = await client.rpc("set_student_default_partner", { p_person_id: person.id, p_partner_person_id: classType === "pair" ? Number(partnerId) : null });
    if (partnerResult.error) setError(partnerResult.error.message);
    else {
      setPreferences((partnerResult.data ?? result.data) as Preferences);
      setNotice("Preferencias de clase guardadas. Se aplicarán automáticamente al programar y preparar clases.");
    }
    setBusy("");
  }

  async function saveStaffProfile() {
    if (!client || !person) return;
    setBusy("staff"); setError(""); setNotice("");
    const result = await client.rpc("save_student_staff_teaching_profile", {
      p_person_id: person.id,
      p_teacher_notes: clean(teacherNotes) || null,
      p_teaching_approach: clean(teachingApproach) || null,
      p_work_priorities: clean(workPriorities) || null,
      p_strengths: clean(strengths) || null,
    });
    if (result.error) setError(result.error.message);
    else {
      setStaffProfile((result.data ?? {}) as StaffProfile);
      setNotice("Perfil docente interno guardado.");
    }
    setBusy("");
  }

  if (!target) return null;

  const trigger = createPortal(<button type="button" onClick={() => setOpen(true)} aria-label="Abrir preferencias de clase"><Settings2 /> Preferencias</button>, target.host);
  if (!open) return trigger;

  const panel = <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="student-preferences-title">
      <header className={styles.header}><div><span>Ficha maestra · Solo equipo</span><h2 id="student-preferences-title">Preferencias de clase</h2><p>{person?.display_name ?? target.name}</p></div><button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Cerrar preferencias"><X /></button></header>
      {busy === "loading" ? <div className={styles.loading}>Cargando configuración…</div> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {person && busy !== "loading" ? <div className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}><Settings2 /><div><span>Valores predeterminados</span><h3>Cómo suele ser su clase</h3><p>Se precargan automáticamente, pero siempre pueden cambiarse para una clase concreta.</p></div></div>
          <div className={styles.grid}>
            <label className={styles.field}><span><MapPin /> Ubicación predeterminada</span><input value={locationText} onChange={(event) => setLocationText(event.target.value)} placeholder="Ej. Málaga, academia, domicilio…" /></label>
            <label className={styles.field}><span><Sparkles /> Estilo predeterminado</span><select value={styleId} onChange={(event) => setStyleId(event.target.value)}><option value="">Sin predeterminar</option>{stylesTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
            <label className={styles.field}><span><UsersRound /> Rol predeterminado</span><select value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Sin predeterminar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
            <label className={styles.field}><span><Clock3 /> Duración habitual</span><input type="number" min={15} max={480} step={15} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          </div>
          <div className={styles.segmented} role="group" aria-label="Tipo de clase predeterminado"><button type="button" className={classType === "individual" ? styles.active : ""} onClick={() => { setClassType("individual"); setPartnerId(""); }}>Individual</button><button type="button" className={classType === "pair" ? styles.active : ""} onClick={() => setClassType("pair")}>Pareja</button></div>
          {classType === "pair" ? <label className={styles.field}><span><UsersRound /> Pareja predeterminada</span><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)}><option value="">Seleccionar persona…</option>{people.filter((candidate) => candidate.id !== person.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.display_name}</option>)}</select><small>La relación es bidireccional: al cambiarla, CYA mantiene ambas fichas coherentes.</small></label> : null}
          <button type="button" className={styles.primary} disabled={busy === "preferences"} onClick={() => void savePreferences()}>{busy === "preferences" ? "Guardando…" : "Guardar preferencias de clase"}</button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}><BookOpen /><div><span>Perfil docente interno</span><h3>Cómo enseñarle mejor</h3><p>Información propia del alumno. No pertenece a una clase y no es visible para el alumno.</p></div></div>
          <label className={styles.field}><span>Observaciones sobre cómo enseñarle</span><textarea rows={4} value={teachingApproach} onChange={(event) => setTeachingApproach(event.target.value)} placeholder="Aquí debemos escribir cuál creemos que es la mejor forma de enseñar a este alumno." /></label>
          <div className={styles.grid}>
            <label className={styles.field}><span><Target /> Prioridades a trabajar</span><textarea rows={4} value={workPriorities} onChange={(event) => setWorkPriorities(event.target.value)} placeholder="Qué conviene priorizar en su aprendizaje." /></label>
            <label className={styles.field}><span><Sparkles /> Fortalezas del alumno</span><textarea rows={4} value={strengths} onChange={(event) => setStrengths(event.target.value)} placeholder="Qué hace especialmente bien o aprende con facilidad." /></label>
          </div>
          <label className={styles.field}><span>Observaciones internas del alumno</span><textarea rows={4} value={teacherNotes} onChange={(event) => setTeacherNotes(event.target.value)} placeholder="Notas internas generales para Carlos & Andy." /></label>
          <button type="button" className={styles.primary} disabled={busy === "staff"} onClick={() => void saveStaffProfile()}>{busy === "staff" ? "Guardando…" : "Guardar perfil docente"}</button>
        </section>
      </div> : null}
    </section>
  </div>;

  return <>{trigger}{createPortal(panel, document.body)}</>;
}
