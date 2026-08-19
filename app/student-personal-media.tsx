"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Image as ImageIcon, Pencil, Plus, Upload, Video, X } from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { SecureDriveAsset } from "./drive-media";
import { getRuntimeAccessToken, getRuntimeSupabaseClient } from "./supabase-runtime";
import styles from "./student-personal-media.module.css";

type StudentMedia = {
  id: number;
  person_id: number;
  media_type: "image" | "video";
  external_file_id: string;
  title: string | null;
  note: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type PersonSummary = { id: number; display_name: string };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function currentStudentId() {
  if (typeof window === "undefined") return null;
  const state = window.history.state as { selectedId?: unknown; modalStudentId?: unknown } | null;
  const value = Number(state?.selectedId ?? state?.modalStudentId ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function StudentPersonalMediaOverlay({ close, personId: personIdOverride = null, readOnly = false }: {
  close: () => void;
  personId?: number | null;
  readOnly?: boolean;
}) {
  const client = getRuntimeSupabaseClient();
  const [personId] = useState<number | null>(() => personIdOverride || currentStudentId());
  const [person, setPerson] = useState<PersonSummary | null>(null);
  const [items, setItems] = useState<StudentMedia[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState<number | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async (supabase: SupabaseClient, id: number) => {
    const [personResult, mediaResult] = await Promise.all([
      supabase.from("people").select("id,display_name").eq("id", id).maybeSingle(),
      supabase.from("student_media_resources")
        .select("id,person_id,media_type,external_file_id,title,note,mime_type,size_bytes,created_at")
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (personResult.error) throw personResult.error;
    if (mediaResult.error) throw mediaResult.error;
    setPerson((personResult.data ?? null) as PersonSummary | null);
    setItems((mediaResult.data ?? []) as StudentMedia[]);
  }, []);

  useEffect(() => {
    if (!client || !personId) {
      setError("No se ha podido identificar la ficha del alumno.");
      return;
    }
    void load(client, personId).catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la multimedia."));
  }, [client, personId, load]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>, expectedType: "image" | "video") {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setError("");
    if (!selected) return;
    if (!selected.type.startsWith(`${expectedType}/`)) {
      setError(expectedType === "video" ? "Selecciona un archivo de vídeo válido." : "Selecciona una imagen válida.");
      return;
    }
    if (selected.size <= 0 || selected.size > 1024 * 1024 * 1024) {
      setError("El archivo debe ser menor de 1 GB.");
      return;
    }
    setFile(selected);
    setTitle(selected.name.replace(/\.[^.]+$/, ""));
  }

  function clearSelectedFile() {
    setFile(null);
    setTitle("");
    setNote("");
    if (videoInputRef.current) videoInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function closeAddSheet() {
    if (busy) return;
    setAddOpen(false);
    clearSelectedFile();
    setError("");
  }

  async function upload() {
    if (readOnly || !client || !personId || !file || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const accessToken = await getRuntimeAccessToken();
      if (!accessToken) throw new Error("Tu sesión ha caducado. Vuelve a entrar para subir el archivo.");
      const safePerson = (person?.display_name || `Alumno ${personId}`).replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
      const driveName = `${safePerson} - ${file.name}`.slice(0, 180);
      const response = await fetch("/api/google-drive/upload", {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": file.type || "application/octet-stream",
          "x-cya-file-name": encodeURIComponent(driveName),
          "x-cya-file-size": String(file.size),
        },
        body: file,
      });
      const payload = await response.json().catch(() => null) as { id?: string; error?: string } | null;
      if (!response.ok || !payload?.id) throw new Error(payload?.error || "Google Drive no pudo guardar el archivo.");

      const insert = await client.from("student_media_resources").insert({
        person_id: personId,
        media_type: file.type.startsWith("video/") ? "video" : "image",
        external_file_id: payload.id,
        title: title.trim() || file.name,
        note: note.trim() || null,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (insert.error) throw new Error(`El archivo está en Drive, pero no se pudo vincular a la ficha: ${insert.error.message}`);

      clearSelectedFile();
      setAddOpen(false);
      await load(client, personId);
      setMessage("Contenido guardado en Drive y vinculado a este alumno.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir el contenido.");
    } finally {
      setBusy(false);
    }
  }

  function startEditing(item: StudentMedia) {
    setEditingId(item.id);
    setTitleDraft(item.title || "");
    setError("");
    setMessage("");
  }

  function cancelEditing() {
    setEditingId(null);
    setTitleDraft("");
  }

  async function saveTitle(item: StudentMedia) {
    if (readOnly || !client || savingTitle === item.id) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setError("El título no puede quedar vacío.");
      return;
    }
    setSavingTitle(item.id);
    setError("");
    setMessage("");
    const result = await client.from("student_media_resources").update({ title: nextTitle }).eq("id", item.id).eq("person_id", item.person_id);
    if (result.error) {
      setError(result.error.message);
    } else {
      setItems((current) => current.map((value) => value.id === item.id ? { ...value, title: nextTitle } : value));
      setEditingId(null);
      setTitleDraft("");
      setMessage("Título actualizado.");
    }
    setSavingTitle(null);
  }

  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="student-personal-media-title">
      <header className={styles.header}>
        <div><span>MULTIMEDIA PERSONAL</span><h2 id="student-personal-media-title">{readOnly ? "Mis archivos" : person?.display_name || "Alumno"}</h2><p>{readOnly ? "Fotos y vídeos que CYA ha compartido directamente contigo." : "Contenido multimedia vinculado directamente a esta persona y guardado de forma privada en Google Drive."}</p></div>
        <button type="button" onClick={close} aria-label="Cerrar"><X /></button>
      </header>

      {error && !addOpen ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <section className={styles.library}>
        <div className={styles.libraryHead}>
          <div><span>{readOnly ? "COMPARTIDO CONTIGO" : "ASIGNADO DIRECTAMENTE"}</span><h3>{readOnly ? "Multimedia personal" : "Contenido personal"}</h3></div>
          <div className={styles.libraryActions}><strong>{items.length}</strong>{!readOnly ? <button type="button" className={styles.addButton} onClick={() => { setError(""); setMessage(""); setAddOpen(true); }} aria-label="Añadir contenido"><Plus /></button> : null}</div>
        </div>
        {items.length ? <div className={styles.grid}>{items.map((item) => <article key={item.id}>
          <SecureDriveAsset fileId={item.external_file_id} mediaType={item.media_type} title={item.title} controls={item.media_type === "video"} className={styles.asset} />
          <div className={styles.meta}>
            <span className={styles.mediaDate}>{item.media_type === "video" ? <Video /> : <ImageIcon />}{dateLabel(item.created_at)}</span>
            {editingId === item.id && !readOnly ? <div className={styles.titleEditor}>
              <input autoFocus value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={180} onKeyDown={(event) => { if (event.key === "Enter") void saveTitle(item); if (event.key === "Escape") cancelEditing(); }} />
              <button type="button" className={styles.saveTitle} disabled={savingTitle === item.id} onClick={() => void saveTitle(item)} aria-label="Guardar título"><Check /></button>
              <button type="button" className={styles.cancelTitle} onClick={cancelEditing} aria-label="Cancelar edición"><X /></button>
            </div> : <div className={styles.titleRow}><strong>{item.title || "Sin título"}</strong>{!readOnly ? <button type="button" onClick={() => startEditing(item)} aria-label={`Editar título de ${item.title || "archivo"}`}><Pencil /><span>Editar</span></button> : null}</div>}
            {item.note ? <p>{item.note}</p> : null}
          </div>
        </article>)}</div> : <div className={styles.empty}><Upload /><span>{readOnly ? "Todavía no tienes archivos compartidos directamente contigo." : "Aún no has enviado contenido directamente a esta persona."}</span>{!readOnly ? <small>Pulsa + para añadir una foto o un vídeo.</small> : null}</div>}
      </section>
    </section>

    {!readOnly && addOpen ? <div className={styles.sheetBackdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAddSheet()}>
      <section className={styles.addSheet} role="dialog" aria-modal="true" aria-labelledby="student-media-add-title">
        <div className={styles.sheetHandle} />
        <header className={styles.sheetHeader}><div><span>AÑADIR CONTENIDO</span><h3 id="student-media-add-title">{file ? "Preparar archivo" : "¿Qué quieres subir?"}</h3></div><button type="button" onClick={closeAddSheet} aria-label="Cerrar"><X /></button></header>
        <input ref={videoInputRef} className={styles.hiddenInput} type="file" accept="video/*" onChange={(event) => chooseFile(event, "video")} />
        <input ref={imageInputRef} className={styles.hiddenInput} type="file" accept="image/*" onChange={(event) => chooseFile(event, "image")} />

        {!file ? <div className={styles.sheetChoices}>
          <button type="button" className={styles.sheetChoicePrimary} onClick={() => videoInputRef.current?.click()}><span className={styles.choiceIcon}><Video /></span><span><strong>Subir vídeo</strong><small>Selecciona desde Fotos o Archivos</small></span></button>
          <button type="button" className={styles.sheetChoice} onClick={() => imageInputRef.current?.click()}><span className={styles.choiceIcon}><ImageIcon /></span><span><strong>Subir foto</strong><small>Selecciona una imagen</small></span></button>
        </div> : <>
          <div className={styles.selectedFile}><span className={styles.selectedIcon}>{file.type.startsWith("video/") ? <Video /> : <ImageIcon />}</span><div><small>ARCHIVO SELECCIONADO</small><strong>{file.name}</strong><span>{file.type.startsWith("video/") ? "Vídeo" : "Imagen"} · {(file.size / 1024 / 1024).toFixed(file.size > 10 * 1024 * 1024 ? 0 : 1)} MB</span></div><button type="button" onClick={clearSelectedFile} aria-label="Cambiar archivo"><X /></button></div>
          <div className={styles.fields}>
            <label><span>Título visible</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Ej. Referencia de musicalidad" /></label>
            <label><span>Nota para el alumno</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} placeholder="Opcional: qué quieres que observe o recuerde" /></label>
          </div>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.primary} type="button" onClick={() => void upload()} disabled={busy || !personId}>{busy ? "Subiendo a Drive…" : "Compartir con este alumno"}</button>
        </>}
      </section>
    </div> : null}
  </div>;
}
