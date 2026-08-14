"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { IdentityContext } from "./v14-types";
import styles from "./academy-online.module.css";

type AcademyProgram = {
  id: number;
  title: string;
  description: string | null;
  style_term_id: number;
  role_term_id: number;
  level_term_id: number;
  price_cents: number | null;
  currency: string;
  publication_status: "draft" | "published" | "archived";
  active: boolean;
  sort_order: number;
  published_at: string | null;
};

type AcademyProgramContent = {
  id: number;
  program_id: number;
  content_id: number;
  position: number;
  required: boolean;
};

type AcademyEnrollment = {
  id: number;
  program_id: number;
  person_id: number;
  status: "active" | "completed" | "cancelled";
  starts_at: string;
  expires_at: string | null;
};

type Term = { id: number; taxonomy: string; label: string; sort_order: number; active: boolean };
type Person = { id: number; display_name: string; active: boolean };
type TeachingContent = {
  id: number;
  title: string;
  content_type: string;
  description: string | null;
  completion_status: string;
  publication_status: string;
  visibility: string;
  active: boolean;
  teaching_content_styles: Array<{ style_term_id: number }>;
  teaching_content_roles: Array<{ role_term_id: number }>;
  teaching_content_levels: Array<{ level_term_id: number }>;
};

type ProgramForm = {
  title: string;
  description: string;
  styleTermId: string;
  roleTermId: string;
  levelTermId: string;
};

const blankForm: ProgramForm = { title: "", description: "", styleTermId: "", roleTermId: "", levelTermId: "" };
const kindLabels: Record<string, string> = { correction: "Corrección", explanation: "Explicación", exercise: "Ejercicio", sequence: "Secuencia" };

function formatMoney(cents: number | null, currency: string) {
  if (cents === null) return "Sin precio";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(cents / 100);
}

function parsePriceCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function AcademyOnlineTeacherView({ client, identity, notify }: {
  client: SupabaseClient;
  identity: IdentityContext;
  notify: (message: string) => void;
}) {
  const [programs, setPrograms] = useState<AcademyProgram[]>([]);
  const [programContents, setProgramContents] = useState<AcademyProgramContent[]>([]);
  const [enrollments, setEnrollments] = useState<AcademyEnrollment[]>([]);
  const [library, setLibrary] = useState<TeachingContent[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<number | null>(null);
  const [form, setForm] = useState<ProgramForm>(blankForm);
  const [price, setPrice] = useState("");
  const [publicationStatus, setPublicationStatus] = useState<AcademyProgram["publication_status"]>("draft");
  const [active, setActive] = useState(false);
  const [contentToAdd, setContentToAdd] = useState("");
  const [personToEnroll, setPersonToEnroll] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [programResult, contentResult, enrollmentResult, libraryResult, termResult, peopleResult] = await Promise.all([
      client.from("academy_programs").select("id,title,description,style_term_id,role_term_id,level_term_id,price_cents,currency,publication_status,active,sort_order,published_at").order("sort_order").order("id"),
      client.from("academy_program_contents").select("id,program_id,content_id,position,required").order("program_id").order("position"),
      client.from("academy_enrollments").select("id,program_id,person_id,status,starts_at,expires_at").order("created_at", { ascending: false }),
      client.from("teaching_contents").select("id,title,content_type,description,completion_status,publication_status,visibility,active,teaching_content_styles(style_term_id),teaching_content_roles(role_term_id),teaching_content_levels(level_term_id)").eq("active", true).order("title"),
      client.from("catalog_terms").select("id,taxonomy,label,sort_order,active").eq("active", true).order("taxonomy").order("sort_order"),
      client.from("people").select("id,display_name,active").eq("active", true).order("display_name"),
    ]);
    const firstError = [programResult, contentResult, enrollmentResult, libraryResult, termResult, peopleResult].find((result) => result.error)?.error;
    if (firstError) notify(firstError.message);
    setPrograms((programResult.data ?? []) as AcademyProgram[]);
    setProgramContents((contentResult.data ?? []) as AcademyProgramContent[]);
    setEnrollments((enrollmentResult.data ?? []) as AcademyEnrollment[]);
    setLibrary((libraryResult.data ?? []) as TeachingContent[]);
    setTerms((termResult.data ?? []) as Term[]);
    setPeople((peopleResult.data ?? []) as Person[]);
    setLoading(false);
  }, [client, notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = programs.find((program) => program.id === selectedProgramId) ?? null;
  const linked = programContents.filter((item) => item.program_id === selectedProgramId).sort((a, b) => a.position - b.position || a.id - b.id);
  const selectedEnrollments = enrollments.filter((item) => item.program_id === selectedProgramId);
  const stylesTerms = terms.filter((term) => term.taxonomy === "dance_style");
  const roleTerms = terms.filter((term) => term.taxonomy === "dance_role");
  const levelTerms = terms.filter((term) => term.taxonomy === "dance_level");
  const termLabel = (id: number) => terms.find((term) => term.id === id)?.label ?? "—";
  const contentById = (id: number) => library.find((item) => item.id === id) ?? null;
  const enrolledName = (personId: number) => people.find((person) => person.id === personId)?.display_name ?? "Alumno";
  const linkedIds = new Set(linked.map((item) => item.content_id));
  const compatibleLibrary = selected ? library.filter((content) =>
    content.completion_status === "complete"
    && content.publication_status === "published"
    && content.visibility === "student"
    && content.teaching_content_styles.some((item) => item.style_term_id === selected.style_term_id)
    && content.teaching_content_roles.some((item) => item.role_term_id === selected.role_term_id)
    && content.teaching_content_levels.some((item) => item.level_term_id === selected.level_term_id)
    && !linkedIds.has(content.id)
  ) : [];

  function openProgram(program: AcademyProgram) {
    setSelectedProgramId(program.id);
    setForm({
      title: program.title,
      description: program.description ?? "",
      styleTermId: String(program.style_term_id),
      roleTermId: String(program.role_term_id),
      levelTermId: String(program.level_term_id),
    });
    setPrice(program.price_cents === null ? "" : (program.price_cents / 100).toFixed(2));
    setPublicationStatus(program.publication_status);
    setActive(program.active);
    setContentToAdd("");
    setPersonToEnroll("");
  }

  function newProgram() {
    setSelectedProgramId(null);
    setForm(blankForm);
    setPrice("");
    setPublicationStatus("draft");
    setActive(false);
    setContentToAdd("");
    setPersonToEnroll("");
  }

  async function saveProgram(event: FormEvent) {
    event.preventDefault();
    const styleTermId = Number(form.styleTermId), roleTermId = Number(form.roleTermId), levelTermId = Number(form.levelTermId);
    if (!form.title.trim() || !styleTermId || !roleTermId || !levelTermId) {
      notify("Completa título, estilo, rol y nivel.");
      return;
    }
    setBusy("program");
    const result = await client.rpc("academy_save_program", {
      p_program_id: selectedProgramId,
      p_title: form.title.trim(),
      p_description: form.description.trim() || null,
      p_style_term_id: styleTermId,
      p_role_term_id: roleTermId,
      p_level_term_id: levelTermId,
    });
    if (result.error) notify(result.error.message);
    else {
      const saved = result.data as AcademyProgram;
      setSelectedProgramId(saved.id);
      await load();
      openProgram(saved);
      notify(selectedProgramId ? "Programa actualizado." : "Programa creado.");
    }
    setBusy("");
  }

  async function addContent() {
    if (!selected || !contentToAdd) return;
    setBusy("content-add");
    const nextPosition = linked.length + 1;
    const result = await client.rpc("academy_set_program_content", {
      p_program_id: selected.id,
      p_content_id: Number(contentToAdd),
      p_position: nextPosition,
      p_required: true,
    });
    if (result.error) notify(result.error.message);
    else { setContentToAdd(""); await load(); notify("Contenido añadido al programa."); }
    setBusy("");
  }

  async function moveContent(item: AcademyProgramContent, index: number, direction: -1 | 1) {
    const newPosition = index + 1 + direction;
    if (newPosition < 1 || newPosition > linked.length) return;
    setBusy(`move-${item.id}`);
    const result = await client.rpc("academy_move_program_content", { p_program_content_id: item.id, p_new_position: newPosition });
    if (result.error) notify(result.error.message); else await load();
    setBusy("");
  }

  async function removeContent(item: AcademyProgramContent) {
    setBusy(`remove-${item.id}`);
    const result = await client.rpc("academy_remove_program_content", { p_program_content_id: item.id });
    if (result.error) notify(result.error.message); else { await load(); notify("Contenido retirado del programa."); }
    setBusy("");
  }

  async function savePublication() {
    if (!selected || !identity.can_admin) return;
    const priceCents = price.trim() === "" ? null : parsePriceCents(price);
    if (price.trim() !== "" && priceCents === null) { notify("Indica un precio válido."); return; }
    setBusy("publication");
    const result = await client.rpc("admin_academy_publish_program", {
      p_program_id: selected.id,
      p_price_cents: priceCents,
      p_currency: selected.currency || "EUR",
      p_active: active,
      p_publication_status: publicationStatus,
    });
    if (result.error) notify(result.error.message); else { await load(); notify("Publicación de Academia actualizada."); }
    setBusy("");
  }

  async function enrollPerson() {
    if (!selected || !identity.can_admin || !personToEnroll) return;
    setBusy("enroll");
    const result = await client.rpc("admin_academy_enroll", {
      p_person_id: Number(personToEnroll),
      p_program_id: selected.id,
      p_starts_at: null,
      p_expires_at: null,
      p_note: null,
    });
    if (result.error) notify(result.error.message); else { setPersonToEnroll(""); await load(); notify("Acceso a Academia concedido."); }
    setBusy("");
  }

  async function cancelEnrollment(enrollment: AcademyEnrollment) {
    if (!identity.can_admin) return;
    setBusy(`cancel-${enrollment.id}`);
    const result = await client.rpc("admin_academy_cancel_enrollment", { p_enrollment_id: enrollment.id, p_note: null });
    if (result.error) notify(result.error.message); else { await load(); notify("Matrícula cancelada."); }
    setBusy("");
  }

  return <section className={styles.shell}>
    <header className={`card pad ${styles.hero}`}>
      <div className={styles.heroText}><p className="eyebrow">Academia Online</p><h1>Programas y formación online</h1><p>Organiza la biblioteca pedagógica existente en programas vendibles sin duplicar explicaciones, ejercicios, secuencias ni evaluaciones.</p></div>
      <GraduationCap />
    </header>

    <div className={styles.metrics}>
      <article className={`card pad ${styles.metric}`}><span>Programas</span><strong>{programs.length}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Publicados</span><strong>{programs.filter((program) => program.active && program.publication_status === "published").length}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Lecciones</span><strong>{programContents.length}</strong></article>
      <article className={`card pad ${styles.metric}`}><span>Matrículas activas</span><strong>{enrollments.filter((item) => item.status === "active").length}</strong></article>
    </div>

    <div className={styles.workspace}>
      <aside className="card pad">
        <div className="card-head"><h2>Programas</h2><button className="icon-btn" type="button" onClick={newProgram} aria-label="Nuevo programa"><Plus /></button></div>
        <div className={styles.programList}>
          {programs.map((program) => <button type="button" key={program.id} className={`card ${styles.programButton} ${selectedProgramId === program.id ? styles.programButtonActive : ""}`} onClick={() => openProgram(program)}>
            <span><strong>{program.title}</strong><small>{termLabel(program.style_term_id)} · {termLabel(program.role_term_id)} · {termLabel(program.level_term_id)}</small></span>
            <span><small>{formatMoney(program.price_cents, program.currency)}</small><small>{program.publication_status === "published" ? program.active ? "Publicado" : "Publicado · pausado" : program.publication_status === "archived" ? "Archivado" : "Borrador"}</small></span>
          </button>)}
          {!programs.length && !loading ? <div className={styles.empty}>Todavía no hay programas.</div> : null}
        </div>
      </aside>

      <div className={styles.shell}>
        <form className="card pad" onSubmit={saveProgram}>
          <div className="card-head"><div><p className="eyebrow">{selected ? "Programa seleccionado" : "Nuevo programa"}</p><h2>{selected?.title ?? "Crear programa"}</h2></div><BookOpen /></div>
          <div className={styles.formGrid}>
            <label className={`field ${styles.formWide}`}><span>Título</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ej. Bachata Leader · Inicio" /></label>
            <label className={`field ${styles.formWide}`}><span>Descripción</span><textarea rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Qué aprenderá el alumno y para quién está pensado." /></label>
            <label className="field"><span>Estilo</span><select value={form.styleTermId} onChange={(event) => setForm((current) => ({ ...current, styleTermId: event.target.value }))}><option value="">Seleccionar</option>{stylesTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
            <label className="field"><span>Rol</span><select value={form.roleTermId} onChange={(event) => setForm((current) => ({ ...current, roleTermId: event.target.value }))}><option value="">Seleccionar</option>{roleTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
            <label className="field"><span>Nivel</span><select value={form.levelTermId} onChange={(event) => setForm((current) => ({ ...current, levelTermId: event.target.value }))}><option value="">Seleccionar</option>{levelTerms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
          </div>
          <div className={styles.actions}><button className="btn" disabled={busy === "program"}><Save /> {selected ? "Guardar cambios" : "Crear programa"}</button></div>
        </form>

        {selected ? <article className="card pad">
          <div className="card-head"><div><p className="eyebrow">Temario</p><h2>{linked.length} contenidos</h2></div><BookOpen /></div>
          <div className={styles.actions}>
            <label className="field" style={{ flex: "1 1 280px" }}><span>Añadir desde Enseñanza</span><select value={contentToAdd} onChange={(event) => setContentToAdd(event.target.value)}><option value="">Selecciona contenido compatible</option>{compatibleLibrary.map((content) => <option key={content.id} value={content.id}>{kindLabels[content.content_type] ?? content.content_type} · {content.title}</option>)}</select></label>
            <button className="btn" type="button" disabled={!contentToAdd || busy === "content-add"} onClick={() => void addContent()}><Plus /> Añadir</button>
          </div>
          <div className={styles.lessonList}>
            {linked.map((item, index) => { const content = contentById(item.content_id); return <div className={`card ${styles.lessonRow}`} key={item.id}>
              <span className={styles.lessonNumber}>{index + 1}</span>
              <span><strong>{content?.title ?? `Contenido #${item.content_id}`}</strong><small>{content ? kindLabels[content.content_type] ?? content.content_type : "Contenido"}{item.required ? " · obligatorio" : " · opcional"}</small></span>
              <div className={styles.rowActions}>
                <button className="icon-btn" type="button" disabled={index === 0 || Boolean(busy)} onClick={() => void moveContent(item, index, -1)} aria-label="Subir"><ArrowUp /></button>
                <button className="icon-btn" type="button" disabled={index === linked.length - 1 || Boolean(busy)} onClick={() => void moveContent(item, index, 1)} aria-label="Bajar"><ArrowDown /></button>
                <button className="icon-btn" type="button" disabled={Boolean(busy)} onClick={() => void removeContent(item)} aria-label="Retirar"><Trash2 /></button>
              </div>
            </div>; })}
            {!linked.length ? <div className={styles.empty}>Añade contenido completo y publicado desde Enseñanza.</div> : null}
          </div>
        </article> : null}

        {selected && identity.can_admin ? <article className="card pad">
          <div className="card-head"><div><p className="eyebrow">Administración</p><h2>Precio y publicación</h2></div><CheckCircle2 /></div>
          <div className={styles.formGrid}>
            <label className="field"><span>Precio (€)</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" /></label>
            <label className="field"><span>Estado</span><select value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value as AcademyProgram["publication_status"])}><option value="draft">Borrador</option><option value="published">Publicado</option><option value="archived">Archivado</option></select></label>
            <label className="field"><span>Disponibilidad</span><select value={active ? "active" : "paused"} onChange={(event) => setActive(event.target.value === "active")}><option value="paused">Pausado</option><option value="active">Activo</option></select></label>
          </div>
          <div className={styles.actions}><button className="btn" type="button" disabled={busy === "publication"} onClick={() => void savePublication()}><Save /> Guardar publicación</button></div>
        </article> : null}

        {selected && identity.can_admin ? <article className="card pad">
          <div className="card-head"><div><p className="eyebrow">Acceso</p><h2>Matrículas</h2></div><UsersRound /></div>
          <div className={styles.actions}>
            <label className="field" style={{ flex: "1 1 260px" }}><span>Conceder acceso a</span><select value={personToEnroll} onChange={(event) => setPersonToEnroll(event.target.value)}><option value="">Selecciona una persona</option>{people.map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}</select></label>
            <button className="btn" type="button" disabled={!personToEnroll || busy === "enroll"} onClick={() => void enrollPerson()}><Plus /> Matricular</button>
          </div>
          <div className={styles.enrollmentList}>
            {selectedEnrollments.map((enrollment) => <div className={`card ${styles.enrollmentRow}`} key={enrollment.id}>
              <span><strong>{enrolledName(enrollment.person_id)}</strong><small>{enrollment.status === "active" ? "Acceso activo" : enrollment.status === "completed" ? "Completado" : "Cancelado"}</small></span>
              {enrollment.status !== "cancelled" ? <button className="btn ghost" type="button" disabled={Boolean(busy)} onClick={() => void cancelEnrollment(enrollment)}>Cancelar acceso</button> : null}
            </div>)}
            {!selectedEnrollments.length ? <div className={styles.empty}>No hay matrículas para este programa.</div> : null}
          </div>
        </article> : null}
      </div>
    </div>
  </section>;
}
