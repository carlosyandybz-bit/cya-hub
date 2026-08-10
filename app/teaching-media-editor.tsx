"use client";

import { ArrowDown, ArrowUp, Check, Crop, Image as ImageIcon, Link2, Plus, Star, Trash2, Upload, Video, X } from "lucide-react";
import { ChangeEvent, useMemo, useRef, useState } from "react";
import { SecureDriveAsset, useDriveMediaUrl } from "./drive-media";
import { getRuntimeAccessToken, getRuntimeSupabaseClient } from "./supabase-runtime";
import type { TeachingCardMedia } from "./teaching-content-card";
import styles from "./teaching-media-editor.module.css";

export type TeachingMediaDraft = TeachingCardMedia & {
  _key?: string;
  _local_url?: string;
};

type ReusableClassVideo = {
  id: number;
  external_file_id: string;
  title: string | null;
  mime_type: string | null;
  created_at: string;
};

const groupSuggestions = ["Explicación", "Ejemplos", "Para mejorar", "Demostración", "Variantes", "Detalles"];

function fileTitle(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Recurso";
}

function driveId(value: string) {
  const trimmed = value.trim();
  const pathMatch = trimmed.match(/\/d\/([^/?#]+)/), queryMatch = trimmed.match(/[?&]id=([^&#]+)/);
  return decodeURIComponent(pathMatch?.[1] ?? queryMatch?.[1] ?? trimmed);
}

async function uploadToDrive(file: Blob, name: string, mimeType: string) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");
  const response = await fetch("/api/google-drive/upload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": mimeType || "application/octet-stream",
      "x-cya-file-name": encodeURIComponent(name),
      "x-cya-file-size": String(file.size),
    },
    body: file,
  });
  const payload = await response.json().catch(() => null) as { id?: string; name?: string; mimeType?: string; error?: string } | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el archivo a Drive.");
  return payload;
}

function LocalOrDriveAsset({ item, controls = false }: { item: TeachingMediaDraft; controls?: boolean }) {
  if (item._local_url) {
    return item.media_type === "image"
      ? <img src={item._local_url} alt={item.title || "Recurso"} />
      : <video src={item._local_url} controls={controls} muted={!controls} playsInline preload="metadata" />;
  }
  return <SecureDriveAsset fileId={item.external_file_id} mediaType={item.media_type} title={item.title} thumbnailFileId={item.thumbnail_external_file_id} controls={controls} />;
}

function FramePicker({ item, close, saved }: { item: TeachingMediaDraft; close: () => void; saved: (fileId: string, mimeType: string) => void }) {
  const remote = useDriveMediaUrl(item._local_url ? null : item.external_file_id);
  const src = item._local_url || remote.url;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0), [time, setTime] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");

  function seek(value: number) {
    setTime(value);
    if (videoRef.current) videoRef.current.currentTime = value;
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return setError("Espera a que el vídeo esté preparado.");
    setBusy(true); setError("");
    try {
      const targetRatio = 4 / 3;
      const sourceRatio = video.videoWidth / video.videoHeight;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sourceRatio > targetRatio) {
        sw = video.videoHeight * targetRatio;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = video.videoWidth / targetRatio;
        sy = (video.videoHeight - sh) / 2;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 600;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la miniatura.");
      context.drawImage(video, sx, sy, sw, sh, 0, 0, 800, 600);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo crear el fotograma.")), "image/jpeg", 0.9));
      const uploaded = await uploadToDrive(blob, `miniatura-${Date.now()}.jpg`, "image/jpeg");
      saved(uploaded.id!, uploaded.mimeType || "image/jpeg");
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el fotograma.");
    }
    setBusy(false);
  }

  return <div className={styles.frameBackdrop} onMouseDown={(event) => event.target === event.currentTarget && close()}><section className={styles.frameModal}>
    <header><div><span>Miniatura 4:3</span><strong>Elige el mejor fotograma</strong></div><button type="button" onClick={close} aria-label="Cerrar"><X /></button></header>
    {src ? <div className={styles.frameVideo}><video ref={videoRef} src={src} playsInline muted onLoadedMetadata={(event) => { const value = event.currentTarget.duration || 0; setDuration(value); setTime(Math.min(event.currentTarget.currentTime, value)); }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} /></div> : <div className={styles.frameLoading}>{remote.error || "Preparando vídeo…"}</div>}
    <div className={styles.timeline}><input type="range" min="0" max={Math.max(duration, 0.1)} step="0.05" value={Math.min(time, Math.max(duration, 0.1))} onChange={(event) => seek(Number(event.target.value))} /><span>{time.toFixed(1)} s</span></div>
    {error ? <p className={styles.error}>{error}</p> : null}
    <button type="button" className={styles.primary} disabled={!src || busy} onClick={capture}><Crop /> {busy ? "Guardando…" : "Usar este fotograma"}</button>
  </section></div>;
}

export function TeachingMediaEditor({ value, onChange, onUploadingChange, allowClassVideos = false }: { value: TeachingMediaDraft[]; onChange: (items: TeachingMediaDraft[]) => void; onUploadingChange?: (busy: boolean) => void; allowClassVideos?: boolean }) {
  const [uploading, setUploading] = useState(0), [error, setError] = useState(""), [manualOpen, setManualOpen] = useState(false), [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [manualType, setManualType] = useState<"image" | "video">("video"), [manualTitle, setManualTitle] = useState(""), [manualReference, setManualReference] = useState("");
  const [classVideoOpen, setClassVideoOpen] = useState(false), [classVideoLoading, setClassVideoLoading] = useState(false), [classVideos, setClassVideos] = useState<ReusableClassVideo[]>([]);
  const cover = value.find((item) => item.is_cover) ?? value[0] ?? null;
  const preview = value.find((item) => item.is_preview) ?? null;
  const resourceCount = value.filter((item) => item.display_in_resources !== false).length;
  const groups = useMemo(() => [...new Set([...groupSuggestions, ...value.map((item) => item.group_label || "").filter(Boolean)])], [value]);

  async function toggleClassVideos() {
    if (classVideoOpen) { setClassVideoOpen(false); return; }
    setClassVideoOpen(true); setClassVideoLoading(true); setError("");
    const client = getRuntimeSupabaseClient();
    if (!client) { setError("Sesión no disponible."); setClassVideoLoading(false); return; }
    const result = await client.from("class_video_resources")
      .select("id,external_file_id,title,mime_type,created_at")
      .eq("visibility_scope", "reusable")
      .order("created_at", { ascending: false })
      .limit(100);
    if (result.error) setError(result.error.message);
    else setClassVideos((result.data ?? []) as ReusableClassVideo[]);
    setClassVideoLoading(false);
  }

  function addClassVideo(video: ReusableClassVideo) {
    if (value.some((item) => item.external_file_id === video.external_file_id)) return;
    onChange([...value, {
      _key: `class-video-${video.id}-${Date.now()}`,
      media_type: "video",
      provider: "google_drive",
      external_file_id: video.external_file_id,
      title: video.title || "Vídeo de clase",
      mime_type: video.mime_type,
      group_label: "Vídeos de clase",
      is_cover: false,
      is_preview: false,
      display_in_resources: true,
      thumbnail_external_file_id: null,
      thumbnail_mime_type: null,
      preview_start_seconds: null,
      preview_end_seconds: null,
    }]);
  }

  function setBusy(next: number) {
    setUploading(next);
    onUploadingChange?.(next > 0);
  }

  async function addFiles(files: File[], role: "cover" | "resources") {
    if (!files.length) return;
    setError("");
    let busyCount = 0;
    let working = role === "cover" ? value.map((item) => ({ ...item, is_cover: false })) : [...value];
    setBusy(files.filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/")).length);
    for (const file of files) {
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
      busyCount += 1;
      const localUrl = URL.createObjectURL(file);
      try {
        const uploaded = await uploadToDrive(file, file.name, file.type);
        const hasCover = working.some((item) => item.is_cover);
        const nextItem: TeachingMediaDraft = {
          _key: `${uploaded.id}-${Date.now()}-${busyCount}`,
          _local_url: localUrl,
          media_type: file.type.startsWith("image/") ? "image" : "video",
          provider: "google_drive",
          external_file_id: uploaded.id!,
          title: fileTitle(file.name),
          mime_type: uploaded.mimeType || file.type,
          group_label: role === "cover" ? null : "Recursos",
          is_cover: role === "cover" || !hasCover,
          is_preview: false,
          display_in_resources: role !== "cover",
          thumbnail_external_file_id: null,
          thumbnail_mime_type: null,
          preview_start_seconds: null,
          preview_end_seconds: null,
        };
        working = [...working, nextItem];
        onChange(working);
      } catch (reason) {
        URL.revokeObjectURL(localUrl);
        setError(reason instanceof Error ? reason.message : "No se pudo subir un archivo.");
      }
      setBusy(Math.max(0, files.length - busyCount));
    }
    setBusy(0);
  }

  function update(index: number, changes: Partial<TeachingMediaDraft>) {
    onChange(value.map((item, current) => current === index ? { ...item, ...changes } : item));
  }

  function makeCover(index: number) {
    onChange(value.map((item, current) => ({ ...item, is_cover: current === index })));
  }

  function makePreview(index: number) {
    onChange(value.map((item, current) => ({ ...item, is_preview: current === index ? !item.is_preview : false })));
  }

  function remove(index: number) {
    const removed = value[index];
    if (removed?._local_url) URL.revokeObjectURL(removed._local_url);
    let next = value.filter((_, current) => current !== index);
    if (removed?.is_cover && next.length && !next.some((item) => item.is_cover)) next = next.map((item, current) => ({ ...item, is_cover: current === 0 }));
    onChange(next);
  }

  function move(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addManual() {
    const id = driveId(manualReference);
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) return setError("Pega un enlace o ID válido de Google Drive.");
    const item: TeachingMediaDraft = {
      _key: `${id}-${Date.now()}`,
      media_type: manualType,
      provider: "google_drive",
      external_file_id: id,
      title: manualTitle.trim() || null,
      group_label: "Recursos",
      is_cover: !value.some((entry) => entry.is_cover),
      is_preview: false,
      display_in_resources: true,
    };
    onChange([...value, item]);
    setManualTitle(""); setManualReference(""); setManualOpen(false); setError("");
  }

  return <section className={styles.editor}>
    <header className={styles.editorHead}><div><span>Multimedia</span><h3>Portada, preview y recursos</h3><p>Los archivos se guardan en Google Drive; CYA solo conserva su organización.</p></div><div className={styles.summary}><b>{value.length}</b><span>archivos</span></div></header>

    <div className={styles.coverSection}>
      <div className={styles.coverPreview}>{cover ? <LocalOrDriveAsset item={cover} /> : <div className={styles.emptyCover}><ImageIcon /><span>Portada 4:3</span></div>}</div>
      <div className={styles.coverInfo}><strong>{cover?.title || "Sin portada"}</strong><span>{preview ? `Preview: ${preview.title || "vídeo"}` : "Preview opcional · solo se reproduce cuando la tarjeta está visible"}</span><small>{resourceCount} recursos visibles al desplegar</small></div>
    </div>

    <div className={styles.uploadActions}>
      <label className={styles.uploadButton}><Star /><span>Subir portada</span><input type="file" accept="image/*,video/*" disabled={uploading > 0} onChange={(event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void addFiles(files.slice(0,1), "cover"); }} /></label>
      <label className={styles.uploadButton}><Plus /><span>Añadir recursos</span><input type="file" multiple accept="image/*,video/*" disabled={uploading > 0} onChange={(event: ChangeEvent<HTMLInputElement>) => { const files = [...(event.target.files ?? [])]; event.target.value = ""; void addFiles(files, "resources"); }} /></label>
      <button type="button" className={styles.secondaryButton} onClick={() => setManualOpen((current) => !current)}><Link2 /> Desde Drive</button>
      {allowClassVideos ? <button type="button" className={styles.secondaryButton} onClick={() => void toggleClassVideos()}><Video /> Vídeos de clase</button> : null}
    </div>
    {uploading ? <div className={styles.uploading}><span /><strong>Subiendo {uploading === 1 ? "archivo" : `${uploading} archivos`} a Drive…</strong></div> : null}
    {error ? <p className={styles.error}>{error}</p> : null}

    {manualOpen ? <div className={styles.manualRow}><select value={manualType} onChange={(event) => setManualType(event.target.value as "image" | "video")}><option value="video">Vídeo</option><option value="image">Foto</option></select><input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} placeholder="Título" /><input value={manualReference} onChange={(event) => setManualReference(event.target.value)} placeholder="Enlace o ID de Drive" /><button type="button" onClick={addManual}><Plus /> Añadir</button></div> : null}
    {allowClassVideos && classVideoOpen ? <div className={styles.classVideoPicker}>{classVideoLoading ? <span>Buscando vídeos…</span> : classVideos.length ? classVideos.map((video) => <button key={video.id} type="button" onClick={() => addClassVideo(video)} disabled={value.some((item) => item.external_file_id === video.external_file_id)}><Video /><span><strong>{video.title || "Vídeo de clase"}</strong><small>{new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" }).format(new Date(video.created_at))}</small></span><Plus /></button>) : <span>No hay vídeos reutilizables todavía.</span>}</div> : null}

    {value.length ? <div className={styles.items}>{value.map((item, index) => <article className={styles.item} key={item._key || item.id || `${item.external_file_id}-${index}`}>
      <div className={styles.itemMedia}><LocalOrDriveAsset item={item} /></div>
      <div className={styles.itemFields}>
        <label><span>Título</span><input value={item.title || ""} onChange={(event) => update(index, { title: event.target.value || null })} placeholder="Ejemplo correcto" /></label>
        <label><span>Grupo</span><input list={`media-groups-${index}`} value={item.group_label || ""} onChange={(event) => update(index, { group_label: event.target.value || null })} placeholder="Explicación, Ejemplos…" /><datalist id={`media-groups-${index}`}>{groups.map((group) => <option key={group} value={group} />)}</datalist></label>
        <div className={styles.itemFlags}>
          <button type="button" className={item.is_cover ? styles.selectedFlag : ""} onClick={() => makeCover(index)}><Star /> {item.is_cover ? "Portada" : "Usar portada"}</button>
          {item.media_type === "video" ? <button type="button" className={item.is_preview ? styles.selectedFlag : ""} onClick={() => makePreview(index)}><Video /> {item.is_preview ? "Preview" : "Usar preview"}</button> : null}
          <button type="button" className={item.display_in_resources !== false ? styles.selectedFlag : ""} onClick={() => update(index, { display_in_resources: item.display_in_resources === false })}><Check /> Recursos</button>
        </div>
        {item.media_type === "video" ? <button type="button" className={styles.frameButton} onClick={() => setFrameIndex(index)}><Crop /> {item.thumbnail_external_file_id ? "Cambiar fotograma" : "Elegir fotograma"}</button> : null}
      </div>
      <div className={styles.itemOrder}><button type="button" disabled={index === 0} onClick={() => move(index,-1)} aria-label="Subir"><ArrowUp /></button><button type="button" disabled={index === value.length - 1} onClick={() => move(index,1)} aria-label="Bajar"><ArrowDown /></button><button type="button" className={styles.deleteButton} onClick={() => remove(index)} aria-label="Quitar recurso"><Trash2 /></button></div>
    </article>)}</div> : <div className={styles.emptyState}><Upload /><strong>Añade una portada o recursos</strong><span>Si no subes nada, no aparecerá ningún bloque multimedia.</span></div>}

    {frameIndex !== null && value[frameIndex] ? <FramePicker item={value[frameIndex]} close={() => setFrameIndex(null)} saved={(fileId,mimeType) => update(frameIndex,{ thumbnail_external_file_id:fileId,thumbnail_mime_type:mimeType })} /> : null}
  </section>;
}
