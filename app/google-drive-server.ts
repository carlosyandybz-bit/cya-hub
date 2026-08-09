import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}

function signingKey() {
  return createHash("sha256").update(`cya-media:${required("CYA_SERVER_SECRET")}`).digest();
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function parseB64url(value: string) {
  return Buffer.from(value, "base64url");
}

export function driveServerConfigured() {
  return Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim()
    && process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim()
    && process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim()
    && process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim()
    && process.env.CYA_SERVER_SECRET?.trim()
  );
}

export function teachingDriveFolderId() {
  return process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim() || null;
}

export function signMediaTicket(fileId: string, ttlSeconds = 600) {
  const payload = b64url(JSON.stringify({ fileId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyMediaTicket(ticket: string, expectedFileId: string) {
  const [payload, signature] = ticket.split(".");
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", signingKey()).update(payload).digest();
  const received = parseB64url(signature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const decoded = JSON.parse(parseB64url(payload).toString("utf8")) as { fileId?: string; exp?: number };
    return decoded.fileId === expectedFileId && Boolean(decoded.exp && decoded.exp >= Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
}

async function supabaseRpc<T>(name: string, body: Record<string, unknown>, accessToken: string) {
  const base = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Supabase RPC ${name} falló.`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function userCanManageTeaching(accessToken: string) {
  return Boolean(await supabaseRpc<boolean>("current_user_can_manage_teaching", {}, accessToken));
}

export async function userCanAccessTeachingMedia(accessToken: string, fileId: string) {
  return Boolean(await supabaseRpc<boolean>("can_access_teaching_media", { p_external_file_id: fileId }, accessToken));
}

export async function googleAccessToken() {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_DRIVE_CLIENT_ID"),
    client_secret: required("GOOGLE_DRIVE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_DRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json() as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !json.access_token) throw new Error(json.error_description || json.error || "No se pudo renovar el acceso a Google Drive.");
  return json.access_token;
}

export async function createDriveResumableUpload(name: string, mimeType: string, size: number) {
  const token = await googleAccessToken();
  const folderId = required("GOOGLE_DRIVE_TEACHING_FOLDER_ID");
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,webViewLink`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": mimeType,
      "x-upload-content-length": String(size),
    },
    body: JSON.stringify({ name, mimeType, parents: [folderId] }),
  });
  const location = response.headers.get("location");
  if (!response.ok || !location) throw new Error(`No se pudo iniciar la subida a Drive (${response.status}).`);
  return location;
}

export async function proxyDriveMedia(fileId: string, range?: string | null) {
  const token = await googleAccessToken();
  return fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { authorization: `Bearer ${token}`, ...(range ? { range } : {}) },
    cache: "no-store",
  });
}
