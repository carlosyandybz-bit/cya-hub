"use client";

import { getRuntimeAccessToken } from "./supabase-runtime";

const MIB = 1024 * 1024;
export const VIDEO_COMPRESSION_MIN_BYTES = 24 * MIB;
export const VIDEO_COMPRESSION_MAX_BYTES = 250 * MIB;
const MIN_SAVINGS_RATIO = 0.08;

export type VideoPreparationReason = "compressed" | "not-video" | "small-file" | "large-file" | "unsupported" | "not-smaller" | "failed";

export type PreparedUpload = {
  blob: Blob;
  name: string;
  mimeType: string;
  originalSize: number;
  finalSize: number;
  compressed: boolean;
  savingsPercent: number;
  reason: VideoPreparationReason;
};

export type UploadProgress = {
  stage: "preparing" | "compressing" | "uploading" | "finalizing";
  progress: number;
  message: string;
};

function original(file: File, reason: VideoPreparationReason): PreparedUpload {
  return {
    blob: file,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    originalSize: file.size,
    finalSize: file.size,
    compressed: false,
    savingsPercent: 0,
    reason,
  };
}

function mp4Name(name: string) {
  const stem = name.replace(/\.[^.]+$/, "").trim() || "video";
  return `${stem}.mp4`;
}

export async function prepareVideoForUpload(file: File, onProgress?: (progress: UploadProgress) => void): Promise<PreparedUpload> {
  if (!file.type.startsWith("video/")) return original(file, "not-video");
  if (file.size < VIDEO_COMPRESSION_MIN_BYTES) return original(file, "small-file");
  if (file.size > VIDEO_COMPRESSION_MAX_BYTES) return original(file, "large-file");

  onProgress?.({ stage: "preparing", progress: 0, message: "Preparando vídeo…" });

  try {
    const {
      ALL_FORMATS,
      BlobSource,
      BufferTarget,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
    } = await import("mediabunny");

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
        const resize = width >= height
          ? width > 1920 ? { width: 1920 } : {}
          : height > 1920 ? { height: 1920 } : {};
        return {
          codec: "avc",
          bitrate: 4_000_000,
          forceTranscode: true,
          hardwareAcceleration: "prefer-hardware",
          ...resize,
        };
      },
      audio: { codec: "aac", bitrate: 128_000 },
      showWarnings: false,
    });

    if (!conversion.isValid) return original(file, "unsupported");
    conversion.onProgress = (value) => onProgress?.({
      stage: "compressing",
      progress: Math.max(0, Math.min(1, value)),
      message: `Comprimiendo vídeo… ${Math.round(value * 100)}%`,
    });
    await conversion.execute();
    const buffer = target.buffer;
    if (!buffer) return original(file, "failed");

    const blob = new Blob([buffer], { type: "video/mp4" });
    const savings = 1 - blob.size / file.size;
    if (!Number.isFinite(savings) || savings < MIN_SAVINGS_RATIO) return original(file, "not-smaller");

    return {
      blob,
      name: mp4Name(file.name),
      mimeType: "video/mp4",
      originalSize: file.size,
      finalSize: blob.size,
      compressed: true,
      savingsPercent: Math.round(savings * 100),
      reason: "compressed",
    };
  } catch {
    return original(file, "failed");
  }
}

type DirectUploadSession = { uploadUrl: string; ticket: string; error?: string };
type UploadedDriveFile = { id: string; name?: string; mimeType?: string; webViewLink?: string };

export async function uploadPreparedToDrive(
  prepared: PreparedUpload,
  scope: "teaching" | "class_video" = "teaching",
  onProgress?: (progress: UploadProgress) => void,
) {
  const token = await getRuntimeAccessToken();
  if (!token) throw new Error("Tu sesión ha caducado.");

  const create = await fetch("/api/google-drive/upload-session", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: prepared.name, mimeType: prepared.mimeType, size: prepared.finalSize, scope }),
  });
  const session = await create.json().catch(() => null) as DirectUploadSession | null;
  if (!create.ok || !session?.uploadUrl || !session.ticket) throw new Error(session?.error || "No se pudo preparar la subida a Drive.");

  onProgress?.({ stage: "uploading", progress: 0, message: "Subiendo a Drive…" });
  let upload: Response;
  try {
    upload = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: { "content-type": prepared.mimeType },
      body: prepared.blob,
    });
  } catch (error) {
    void cancelDirectUpload(token, session.ticket);
    throw error;
  }
  if (!upload.ok) {
    void cancelDirectUpload(token, session.ticket);
    throw new Error(`Google Drive no pudo guardar el archivo (${upload.status}).`);
  }

  onProgress?.({ stage: "finalizing", progress: 1, message: "Finalizando subida…" });
  const complete = await fetch("/api/google-drive/upload-session", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ ticket: session.ticket }),
  });
  const payload = await complete.json().catch(() => null) as (UploadedDriveFile & { error?: string }) | null;
  if (!complete.ok || !payload?.id) throw new Error(payload?.error || "No se pudo confirmar la subida a Drive.");
  return payload;
}

async function cancelDirectUpload(token: string, ticket: string) {
  try {
    await fetch("/api/google-drive/upload-session", {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
  } catch {
    // Best-effort cleanup; abandoned resumable sessions expire automatically.
  }
}
