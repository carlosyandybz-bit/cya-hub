"use client";

import { getRuntimeAccessToken } from "./supabase-runtime";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
export const VIDEO_COMPRESSION_MIN_BYTES = 1;
export const VIDEO_COMPRESSION_MAX_BYTES = 4 * GIB;
const DRIVE_UPLOAD_MAX_BYTES = GIB;
const MIN_SAVINGS_RATIO = 0.02;
const XHR_UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;

export type VideoPreparationReason = "compressed" | "not-video" | "small-file" | "large-file" | "unsupported" | "not-smaller" | "failed";
export type PreparedUpload = { blob: Blob; name: string; mimeType: string; originalSize: number; finalSize: number; compressed: boolean; savingsPercent: number; reason: VideoPreparationReason };
export type UploadProgress = { stage: "preparing" | "compressing" | "uploading" | "finalizing" | "done"; progress: number; message: string };
type DirectUploadSession = { uploadUrl: string; ticket: string; error?: string };
type UploadedDriveFile = { id: string; name?: string; mimeType?: string; webViewLink?: string; requestId?: number };
type XhrResult = { ok: boolean; status: number; text: string };

function report(onProgress: ((progress: UploadProgress) => void) | undefined, progress: UploadProgress) {
  onProgress?.(progress);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<UploadProgress>("cya:drive-upload-progress", { detail: progress }));
}

function original(file: File, reason: VideoPreparationReason): PreparedUpload {
  return { blob: file, name: file.name, mimeType: file.type || "application/octet-stream", originalSize: file.size, finalSize: file.size, compressed: false, savingsPercent: 0, reason };
}

function mp4Name(name: string) {
  return `${name.replace(/\.[^.]+$/, "").trim() || "video"}.mp4`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function xhrUpload(url: string, method: "POST" | "PUT", headers: Record<string, string>, body: Blob, onProgress?: (value: number) => void): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = XHR_UPLOAD_TIMEOUT_MS;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(clamp(event.loaded / event.total));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText || "" });
    xhr.onerror = () => reject(new Error("La conexión se interrumpió durante la subida."));
    xhr.onabort = () => reject(new Error("La subida se canceló antes de terminar."));
    xhr.ontimeout = () => reject(new Error("La subida ha tardado demasiado. Vuelve a intentarlo; la pantalla ya no quedará bloqueada."));
    xhr.send(body);
  });
}

export async function prepareVideoForUpload(file: File, onProgress?: (progress: UploadProgress) => void): Promise<PreparedUpload> {
  if (!file.type.startsWith("video/")) return original(file, "not-video");
  report(onProgress, { stage: "preparing", progress: 0, message: "Analizando vídeo…" });
  if (file.size > VIDEO_COMPRESSION_MAX_BYTES) return original(file, "large-file");
  try {
    const { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } = await import("mediabunny");
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: async (track) => {
        const width = await track.getDisplayWidth();
        const height = await track.getDisplayHeight();
        const longSide = Math.max(width, height);
        const shortSide = Math.min(width, height);
        const resize = longSide > 1920
          ? width >= height ? { width: 1920 } : { height: 1920 }
          : {};
        const bitrate = longSide <= 1280 && shortSide <= 720 ? 2_000_000 : 3_200_000;
        return { codec: "avc", bitrate, forceTranscode: true, hardwareAcceleration: "prefer-hardware", ...resize };
      },
      audio: { codec: "aac", bitrate: 96_000 },
      showWarnings: false,
    });
    if (!conversion.isValid) {
      report(onProgress, { stage: "preparing", progress: 1, message: "Este vídeo no se puede recomprimir en este dispositivo; se conservará el original." });
      return original(file, "unsupported");
    }
    conversion.onProgress = (value) => {
      const progress = clamp(value);
      report(onProgress, { stage: "compressing", progress, message: `Comprimiendo vídeo… ${Math.round(progress * 100)}%` });
    };
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer) return original(file, "failed");
    const blob = new Blob([buffer], { type: "video/mp4" });
    const savings = 1 - blob.size / file.size;
    if (!Number.isFinite(savings) || savings < MIN_SAVINGS_RATIO) {
      report(onProgress, { stage: "compressing", progress: 1, message: "El original ya estaba muy optimizado; se conservará para no aumentar su peso." });
      return original(file, "not-smaller");
    }
    const prepared = { blob, name: mp4Name(file.name), mimeType: "video/mp4", originalSize: file.size, finalSize: blob.size, compressed: true, savingsPercent: Math.round(savings * 100), reason: "compressed" as const };
    report(onProgress, { stage: "compressing", progress: 1, message: `Vídeo comprimido · ${prepared.savingsPercent}% menos` });
    return prepared;
  } catch {
    report(onProgress, { stage: "preparing", progress: 1, message: "No se pudo recomprimir en este dispositivo; se conservará el original." });
    return original(file, "failed");
  }
}

async function directPut(uploadUrl: string, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  return xhrUpload(uploadUrl, "PUT", { "content-type": prepared.mimeType }, prepared.blob, (value) => {
    report(onProgress, { stage: "uploading", progress: value, message: `Subiendo a Drive… ${Math.round(value * 100)}%` });
  });
}

async function proxyTeachingUpload(token: string, prepared: PreparedUpload, scope: "teaching" | "class_video", onProgress?: (progress: UploadProgress) => void) {
  const response = await xhrUpload("/api/google-drive/upload", "POST", {
    authorization: `Bearer ${token}`,
    "content-type": prepared.mimeType,
    "x-cya-file-name": encodeURIComponent(prepared.name),
    "x-cya-file-size": String(prepared.finalSize),
    "x-cya-media-scope": scope,
    "x-cya-upload-bypass-guard": "1",
  }, prepared.blob, (value) => {
    report(onProgress, { stage: "uploading", progress: value, message: `Subiendo a Drive… ${Math.round(value * 100)}%` });
  });
  const payload = JSON.parse(response.text || "null") as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el archivo a Drive.");
  return payload;
}

async function confirmTeachingUpload(token: string, ticket: string, onProgress?: (progress: UploadProgress) => void) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    report(onProgress, { stage: "finalizing", progress: attempt / 6, message: attempt ? "Confirmando archivo en Drive…" : "Verificando subida…" });
    const complete = await fetch("/api/google-drive/upload-session", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (complete.ok && payload?.id) return payload;
    if (complete.status !== 409) throw new Error(payload?.error || "No se pudo confirmar la subida directa.");
    await sleep(450 + attempt * 350);
  }
  throw new Error("Drive recibió el vídeo pero tardó demasiado en confirmarlo. Inténtalo de nuevo; el cierre ya no quedará bloqueado.");
}

export async function uploadPreparedToDrive(prepared: PreparedUpload, scope: "teaching" | "class_video" = "teaching", onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");
  if (prepared.finalSize > DRIVE_UPLOAD_MAX_BYTES) throw new Error("El vídeo sigue superando 1 GB después de optimizarlo. Grábalo con una calidad inferior o divídelo antes de subirlo.");
  report(onProgress, { stage: "uploading", progress: 0, message: "Preparando subida a Drive…" });
  let session: DirectUploadSession | null = null;
  let uploadReachedDrive = false;
  try {
    const create = await fetch("/api/google-drive/upload-session", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize, scope }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No se pudo preparar la subida directa.");
    const upload = await directPut(session.uploadUrl, prepared, onProgress);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    uploadReachedDrive = true;
    const payload = await confirmTeachingUpload(token, session.ticket, onProgress);
    report(onProgress, { stage: "done", progress: 1, message: "Subido correctamente a Drive ✓" });
    return payload;
  } catch (error) {
    if (session?.ticket) await cancelDirectUpload(token, "/api/google-drive/upload-session", session.ticket);
    if (uploadReachedDrive) throw error;
    const payload = await proxyTeachingUpload(token, prepared, scope, onProgress);
    report(onProgress, { stage: "done", progress: 1, message: "Subido correctamente a Drive ✓" });
    return payload;
  }
}

export async function uploadPreparedFeedback(requestId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");
  if (prepared.finalSize > DRIVE_UPLOAD_MAX_BYTES) throw new Error("El vídeo sigue superando 1 GB después de optimizarlo.");
  report(onProgress, { stage: "uploading", progress: 0, message: "Preparando subida de vídeo…" });
  let session: DirectUploadSession | null = null;
  try {
    const create = await fetch("/api/feedback-online/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ requestId, name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No se pudo preparar la subida del Feedback.");
    const upload = await directPut(session.uploadUrl, prepared, onProgress);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    report(onProgress, { stage: "finalizing", progress: 1, message: "Finalizando vídeo…" });
    const complete = await fetch("/api/feedback-online/upload", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ticket: session.ticket }) });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (!complete.ok || !payload?.id) throw new Error(payload?.error || "No se pudo confirmar el vídeo.");
    report(onProgress, { stage: "done", progress: 1, message: "Vídeo subido correctamente ✓" });
    return payload;
  } catch {
    if (session?.ticket) await cancelDirectUpload(token, "/api/feedback-online/upload", session.ticket);
    const payload = await proxyFeedbackUpload(token, requestId, prepared, onProgress);
    report(onProgress, { stage: "done", progress: 1, message: "Vídeo subido correctamente ✓" });
    return payload;
  }
}

export async function uploadPreparedClassPreparation(classId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado. Vuelve a entrar para enviarnos el vídeo.");
  if (prepared.finalSize > DRIVE_UPLOAD_MAX_BYTES) throw new Error("El vídeo sigue superando 1 GB después de optimizarlo.");
  report(onProgress, { stage: "uploading", progress: 0, message: "Preparando envío del vídeo…" });
  let session: DirectUploadSession | null = null;
  try {
    const create = await fetch("/api/class-preparation/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ classId, name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No hemos podido preparar la subida del vídeo.");
    const upload = await directPut(session.uploadUrl, prepared, onProgress);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    report(onProgress, { stage: "finalizing", progress: 1, message: "Guardando el vídeo en tu próxima clase…" });
    const complete = await fetch("/api/class-preparation/upload", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket: session.ticket }),
    });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (!complete.ok || !payload?.id || !payload.requestId) throw new Error(payload?.error || "No hemos podido vincular el vídeo con tu próxima clase.");
    report(onProgress, { stage: "done", progress: 1, message: "Vídeo enviado correctamente ✓" });
    return payload;
  } catch {
    if (session?.ticket) await cancelDirectUpload(token, "/api/class-preparation/upload", session.ticket);
    const payload = await proxyClassPreparationUpload(token, classId, prepared, onProgress);
    report(onProgress, { stage: "done", progress: 1, message: "Vídeo enviado correctamente ✓" });
    return payload;
  }
}

async function proxyFeedbackUpload(token: string, requestId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const response = await xhrUpload("/api/feedback-online/upload", "PUT", {
    authorization: `Bearer ${token}`,
    "content-type": prepared.mimeType,
    "x-cya-feedback-request-id": String(requestId),
    "x-cya-file-name": encodeURIComponent(prepared.name),
    "x-cya-file-size": String(prepared.finalSize),
  }, prepared.blob, (value) => report(onProgress, { stage: "uploading", progress: value, message: `Subiendo vídeo… ${Math.round(value * 100)}%` }));
  const payload = JSON.parse(response.text || "null") as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el vídeo de Feedback.");
  return payload;
}

async function proxyClassPreparationUpload(token: string, classId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const response = await xhrUpload("/api/class-preparation/upload", "PUT", {
    authorization: `Bearer ${token}`,
    "content-type": prepared.mimeType,
    "x-cya-class-id": String(classId),
    "x-cya-file-name": encodeURIComponent(prepared.name),
    "x-cya-file-size": String(prepared.finalSize),
  }, prepared.blob, (value) => report(onProgress, { stage: "uploading", progress: value, message: `Subiendo vídeo… ${Math.round(value * 100)}%` }));
  const payload = JSON.parse(response.text || "null") as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id || !payload.requestId) throw new Error(payload?.error || "No hemos podido subir el vídeo esta vez. Puedes probar de nuevo o dejarnos un enlace.");
  return payload;
}

async function cancelDirectUpload(token: string, endpoint: string, ticket: string) {
  try { await fetch(endpoint, { method: "DELETE", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ticket }) }); } catch { /* best effort */ }
}
