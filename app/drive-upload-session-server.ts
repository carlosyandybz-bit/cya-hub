import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { DriveUploadScope } from "./google-drive-server";

export type DriveUploadTicketPayload = {
  purpose: "teaching-upload" | "feedback-upload" | "class-preparation-upload";
  uploadUrl: string;
  name: string;
  mimeType: string;
  size: number;
  scope: DriveUploadScope;
  exp: number;
  requestId?: number;
  personId?: number;
  classId?: number;
  previousFileId?: string | null;
};

type DriveFileMetadata = { id: string; name?: string; mimeType?: string; webViewLink?: string };

function requiredSecret() {
  const value = process.env.CYA_SERVER_SECRET?.trim();
  if (!value) throw new Error("CYA_SERVER_SECRET no está configurada.");
  return value;
}

function key() {
  return createHash("sha256").update(`cya-drive-upload-session:${requiredSecret()}`).digest();
}

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function safeUploadUrl(value: string) {
  return value.startsWith("https://www.googleapis.com/upload/drive/v3/");
}

export function signDriveUploadTicket(input: Omit<DriveUploadTicketPayload, "exp">, ttlSeconds = 2 * 60 * 60) {
  if (!safeUploadUrl(input.uploadUrl)) throw new Error("La sesión de subida no es válida.");
  const payload: DriveUploadTicketPayload = { ...input, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = encode(JSON.stringify(payload));
  const signature = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyDriveUploadTicket(ticket: string, purpose: DriveUploadTicketPayload["purpose"]) {
  const [body, signature] = ticket.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", key()).update(body).digest();
  let received: Buffer;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DriveUploadTicketPayload;
    if (payload.purpose !== purpose || !safeUploadUrl(payload.uploadUrl)) return null;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!Number.isFinite(payload.size) || payload.size <= 0 || payload.size > 1024 * 1024 * 1024) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function queryCompletedDriveUpload(payload: DriveUploadTicketPayload): Promise<DriveFileMetadata | null> {
  const response = await fetch(payload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-length": "0",
      "content-range": `bytes */${payload.size}`,
    },
    cache: "no-store",
  });
  if (response.status === 308) return null;
  const data = await response.json().catch(() => null) as DriveFileMetadata | null;
  if (!response.ok || !data?.id) throw new Error(`No se pudo confirmar la subida a Drive (${response.status}).`);
  return data;
}
