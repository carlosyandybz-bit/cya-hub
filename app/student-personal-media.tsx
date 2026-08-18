"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Image as ImageIcon, Upload, Video, X } from "lucide-react";
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

function currentModalPersonId() {
  if (typeof window === "undefined") return null;
  const state = window.history.state as { modalStudentId?: unknown } | null;
  const value = Number(state?.modalStudentId ?? 0);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function StudentPersonalMediaOverlay({ close }: { close: () => void }) {
  const client = getRuntimeSupabaseClient();
  const [personId] = useState<number | null>(() => currentModalPersonId());
  const [person, setPerson] = useState<PersonSummary | null>(null);
  const [items, setItems] = useState<StudentMedia[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      setError("No se ha podido identificar la ficha del alumno abierta.");
      return;
    }
    void load(client, personId).catch((reason) => setError(reason instanceof Error ? reason.message : "No se pudo cargar la multimedia."));
  }, [client, personId, load]);

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setMessage("");
    setError("");
    if (!selected) return setFile(null);
    if (!selected.type.startsWith("image/") && !selected.type.startsWith("video/")) {
      setFile(null);
      setError("Selecciona una foto o un vídeo.");
      return;
    }
    if (selected.size <= 0 || selected.size > 1024 * 1024 * 1024) {
      setFile(null);
      setError("El archivo debe ser menor de 1 GB.");
      return;
    }
    setFile(selected);
    if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
  }

  async function upload() {
    if (!client || !personId || !file || busy) return;
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

      setFile(null);
      setTitle("");
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      await load(client, personId);
      setMessage("Contenido guardado en Drive y vinculado a este alumno.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo subir el contenido.");
    } finally {
      setBusy(false);
    }
  }

  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="student-personal-media-title">
      <header className={styles.header}>
        <div><span>MULTIMEDIA PERSONAL</span><h2 id="student-personal-media-title">{person?.display_name || "Alumno"}</h2><p>Sube una foto o vídeo directamente para esta persona. El archivo vive en Google Drive y CYA Hub conserva únicamente el vínculo seguro.</p></div>
        <button type="button" onClick={close} aria-label="Cerrar"><X /></button>
      </header>

      <div className={styles.uploadCard}>
        <div className={styles.uploadIntro}><Upload /><div><strong>Subir contenido para este alumno</strong><span>No necesita pertenecer a una clase ni a un contenido pedagógico existente.</span></div></div>
        <label className={styles.filePicker}><input ref={inputRef} type="file" accept="image/*,video/*" onChange={chooseFile} /><span>{file ? file.name : "Seleccionar foto o vídeo"}</span></label>
        <div className={styles.fields}>
          <label><span>Título</span><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} placeholder="Ej. Referencia de musicalidad" /></label>
          <label><span>Nota para el alumno</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={1000} placeholder="Opcional: por qué se lo envías o qué debe observar" /></label>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.success}>{message}</p> : null}
        <button className={styles.primary} type="button" onClick={() => void upload()} disabled={!file || busy || !personId}>{busy ? "Subiendo a Drive…" : "Guardar para este alumno"}</button>
      </div>

      <section className={styles.library}>
        <div className={styles.libraryHead}><div><span>ASIGNADO DIRECTAMENTE</span><h3>Contenido personal</h3></div><strong>{items.length}</strong></div>
        {items.length ? <div className={styles.grid}>{items.map((item) => <article key={item.id}>
          <SecureDriveAsset fileId={item.external_file_id} mediaType={item.media_type} title={item.title} controls={item.media_type === "video"} className={styles.asset} />
          <div className={styles.meta}><span>{item.media_type === "video" ? <Video /> : <ImageIcon />}{dateLabel(item.created_at)}</span><strong>{item.title || "Sin título"}</strong>{item.note ? <p>{item.note}</p> : null}</div>
        </article>)}</div> : <div className={styles.empty}><Upload /><span>Aún no has enviado contenido directamente a esta persona.</span></div>}
      </section>
    </section>
  </div>;
}
