import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
export const DEFAULT_TEACHING_FOLDER_NAME = "CYA Hub - Enseñanza";
export type DriveUploadScope = "teaching" | "class_video";

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
    && process.env.CYA_SERVER_SECRET?.trim()
  );
}

export function teachingFolderMode() {
  return process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim() ? "explicit" : "managed";
}

export function teachingFolderName() {
  return process.env.GOOGLE_DRIVE_TEACHING_FOLDER_NAME?.trim() || DEFAULT_TEACHING_FOLDER_NAME;
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
  if (!response.ok) throw new Error(text || `No se pudo completar la operación de Google Drive.`);
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

export async function verifyGoogleDriveConnection() {
  if (!driveServerConfigured()) {
    return { configured: false, verified: false, error: null as string | null };
  }
  try {
    const token = await googleAccessToken();
    const params = new URLSearchParams({ pageSize: "1", spaces: "drive", fields: "files(id)" });
    const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    if (!response.ok) throw new Error(body?.error?.message || `Google Drive respondió ${response.status}.`);
    return { configured: true, verified: true, error: null as string | null };
  } catch (error) {
    return {
      configured: true,
      verified: false,
      error: error instanceof Error ? error.message : "No se pudo verificar Google Drive.",
    };
  }
}

function driveQueryString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureTeachingFolder(token: string) {
  const explicit = process.env.GOOGLE_DRIVE_TEACHING_FOLDER_ID?.trim();
  if (explicit) return explicit;

  const name = teachingFolderName();
  const params = new URLSearchParams({
    q: `mimeType='application/vnd.google-apps.folder' and name='${driveQueryString(name)}' and trashed=false`,
    spaces: "drive",
    fields: "files(id,name)",
    pageSize: "10",
  });
  const existingResponse = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const existingJson = await existingResponse.json().catch(() => null) as { files?: Array<{ id?: string; name?: string }>; error?: { message?: string } } | null;
  if (!existingResponse.ok) throw new Error(existingJson?.error?.message || `No se pudo localizar la carpeta de CYA Hub en Drive (${existingResponse.status}).`);
  const existing = existingJson?.files?.find((item) => item.id)?.id;
  if (existing) return existing;

  const createResponse = await fetch(`${DRIVE_API}/files?fields=id,name`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
    cache: "no-store",
  });
  const created = await createResponse.json().catch(() => null) as { id?: string; name?: string; error?: { message?: string } } | null;
  if (!createResponse.ok || !created?.id) throw new Error(created?.error?.message || `No se pudo crear la carpeta privada de CYA Hub en Drive (${createResponse.status}).`);
  return created.id;
}

async function uploadFolderId(token: string, scope: DriveUploadScope) {
  if (scope === "class_video") {
    const explicit = process.env.GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID?.trim();
    if (explicit) return explicit;
  }
  return ensureTeachingFolder(token);
}

export async function createDriveResumableUpload(name: string, mimeType: string, size: number, scope: DriveUploadScope = "teaching") {
  const token = await googleAccessToken();
  const folderId = await uploadFolderId(token, scope);
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
