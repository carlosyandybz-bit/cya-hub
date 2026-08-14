"use client";

import { getRuntimeAccessToken } from "./supabase-runtime";

const MIB = 1024 * 1024;
export const VIDEO_COMPRESSION_MIN_BYTES = 24 * MIB;
export const VIDEO_COMPRESSION_MAX_BYTES = 250 * MIB;
const MIN_SAVINGS_RATIO = 0.08;

export type VideoPreparationReason = "compressed" | "not-video" | "small-file" | "large-file" | "unsupported" | "not-smaller" | "failed";
export type PreparedUpload = { blob: Blob; name: string; mimeType: string; originalSize: number; finalSize: number; compressed: boolean; savingsPercent: number; reason: VideoPreparationReason };
export type UploadProgress = { stage: "preparing" | "compressing" | "uploading" | "finalizing"; progress: number; message: string };
type DirectUploadSession = { uploadUrl: string; ticket: string; error?: string };
type UploadedDriveFile = { id: string; name?: string; mimeType?: string; webViewLink?: string; requestId?: number };

function original(file: File, reason: VideoPreparationReason): PreparedUpload {
  return { blob: file, name: file.name, mimeType: file.type || "application/octet-stream", originalSize: file.size, finalSize: file.size, compressed: false, savingsPercent: 0, reason };
}

function mp4Name(name: string) {
  return `${name.replace(/\.[^.]+$/, "").trim() || "video"}.mp4`;
}

export async function prepareVideoForUpload(file: File, onProgress?: (progress: UploadProgress) => void): Promise<PreparedUpload> {
  if (!file.type.startsWith("video/")) return original(file, "not-video");
  if (file.size < VIDEO_COMPRESSION_MIN_BYTES) return original(file, "small-file");
  if (file.size > VIDEO_COMPRESSION_MAX_BYTES) return original(file, "large-file");
  onProgress?.({ stage: "preparing", progress: 0, message: "Preparando vídeo…" });
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
        const width = await track.getDisplayWidth(), height = await track.getDisplayHeight();
        const resize = width >= height ? width > 1920 ? { width: 1920 } : {} : height > 1920 ? { height: 1920 } : {};
        return { codec: "avc", bitrate: 4_000_000, forceTranscode: true, hardwareAcceleration: "prefer-hardware", ...resize };
      },
      audio: { codec: "aac", bitrate: 128_000 },
      showWarnings: false,
    });
    if (!conversion.isValid) return original(file, "unsupported");
    conversion.onProgress = (value) => onProgress?.({ stage: "compressing", progress: Math.max(0, Math.min(1, value)), message: `Comprimiendo vídeo… ${Math.round(value * 100)}%` });
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer) return original(file, "failed");
    const blob = new Blob([buffer], { type: "video/mp4" });
    const savings = 1 - blob.size / file.size;
    if (!Number.isFinite(savings) || savings < MIN_SAVINGS_RATIO) return original(file, "not-smaller");
    return { blob, name: mp4Name(file.name), mimeType: "video/mp4", originalSize: file.size, finalSize: blob.size, compressed: true, savingsPercent: Math.round(savings * 100), reason: "compressed" };
  } catch {
    return original(file, "failed");
  }
}

async function directPut(uploadUrl: string, prepared: PreparedUpload) {
  return fetch(uploadUrl, { method: "PUT", headers: { "content-type": prepared.mimeType }, body: prepared.blob });
}

async function proxyTeachingUpload(token: string, prepared: PreparedUpload, scope: "teaching" | "class_video") {
  const response = await fetch("/api/google-drive/upload", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": prepared.mimeType,
      "x-cya-file-name": encodeURIComponent(prepared.name),
      "x-cya-file-size": String(prepared.finalSize),
      "x-cya-media-scope": scope,
    },
    body: prepared.blob,
  });
  const payload = await response.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el archivo a Drive.");
  return payload;
}

export async function uploadPreparedToDrive(prepared: PreparedUpload, scope: "teaching" | "class_video" = "teaching", onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");
  onProgress?.({ stage: "uploading", progress: 0, message: "Subiendo a Drive…" });
  let session: DirectUploadSession | null = null;
  try {
    const create = await fetch("/api/google-drive/upload-session", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize, scope }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No se pudo preparar la subida directa.");
    const upload = await directPut(session.uploadUrl, prepared);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    onProgress?.({ stage: "finalizing", progress: 1, message: "Finalizando subida…" });
    const complete = await fetch("/api/google-drive/upload-session", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ticket: session.ticket }) });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (!complete.ok || !payload?.id) throw new Error(payload?.error || "No se pudo confirmar la subida directa.");
    return payload;
  } catch {
    if (session?.ticket) await cancelDirectUpload(token, "/api/google-drive/upload-session", session.ticket);
    return proxyTeachingUpload(token, prepared, scope);
  }
}

export async function uploadPreparedFeedback(requestId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");
  onProgress?.({ stage: "uploading", progress: 0, message: "Subiendo vídeo…" });
  let session: DirectUploadSession | null = null;
  try {
    const create = await fetch("/api/feedback-online/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ requestId, name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No se pudo preparar la subida del Feedback.");
    const upload = await directPut(session.uploadUrl, prepared);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    onProgress?.({ stage: "finalizing", progress: 1, message: "Finalizando vídeo…" });
    const complete = await fetch("/api/feedback-online/upload", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ticket: session.ticket }) });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (!complete.ok || !payload?.id) throw new Error(payload?.error || "No se pudo confirmar el vídeo.");
    return payload;
  } catch {
    if (session?.ticket) await cancelDirectUpload(token, "/api/feedback-online/upload", session.ticket);
    return proxyFeedbackUpload(token, requestId, prepared);
  }
}

export async function uploadPreparedClassPreparation(classId: number, prepared: PreparedUpload, onProgress?: (progress: UploadProgress) => void) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado. Vuelve a entrar para enviarnos el vídeo.");
  onProgress?.({ stage: "uploading", progress: 0, message: "Enviándonos tu vídeo…" });
  let session: DirectUploadSession | null = null;
  try {
    const create = await fetch("/api/class-preparation/upload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ classId, name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize }),
    });
    session = await create.json().catch(() => null) as DirectUploadSession | null;
    if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No hemos podido preparar la subida del vídeo.");
    const upload = await directPut(session.uploadUrl, prepared);
    if (!upload.ok) throw new Error(`Drive respondió ${upload.status}.`);
    onProgress?.({ stage: "finalizing", progress: 1, message: "Guardando el vídeo en tu próxima clase…" });
    const complete = await fetch("/api/class-preparation/upload", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket: session.ticket }),
    });
    const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
    if (!complete.ok || !payload?.id || !payload.requestId) throw new Error(payload?.error || "No hemos podido vincular el vídeo con tu próxima clase.");
    return payload;
  } catch {
    if (session?.ticket) await cancelDirectUpload(token, "/api/class-preparation/upload", session.ticket);
    return proxyClassPreparationUpload(token, classId, prepared);
  }
}

async function proxyFeedbackUpload(token: string, requestId: number, prepared: PreparedUpload) {
  const response = await fetch("/api/feedback-online/upload", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": prepared.mimeType,
      "x-cya-feedback-request-id": String(requestId),
      "x-cya-file-name": encodeURIComponent(prepared.name),
      "x-cya-file-size": String(prepared.finalSize),
    },
    body: prepared.blob,
  });
  const payload = await response.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id) throw new Error(payload?.error || "No se pudo subir el vídeo de Feedback.");
  return payload;
}

async function proxyClassPreparationUpload(token: string, classId: number, prepared: PreparedUpload) {
  const response = await fetch("/api/class-preparation/upload", {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": prepared.mimeType,
      "x-cya-class-id": String(classId),
      "x-cya-file-name": encodeURIComponent(prepared.name),
      "x-cya-file-size": String(prepared.finalSize),
    },
    body: prepared.blob,
  });
  const payload = await response.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
  if (!response.ok || !payload?.id || !payload.requestId) throw new Error(payload?.error || "No hemos podido subir el vídeo esta vez. Puedes probar de nuevo o dejarnos un enlace.");
  return payload;
}

async function cancelDirectUpload(token: string, endpoint: string, ticket: string) {
  try { await fetch(endpoint, { method: "DELETE", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ ticket }) }); } catch { /* best effort */ }
}
