import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export type CalendarConnectionRow = {
  id: number;
  user_id: string;
  provider: "google";
  external_calendar_id: string | null;
  display_name: string | null;
  status: "disconnected" | "connecting" | "connected" | "error" | "paused";
  sync_enabled: boolean;
  sync_direction: "two_way" | "cya_to_external" | "external_to_cya";
  credential_reference: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  sync_cursor: string | null;
  sync_started_at?: string | null;
  sync_completed_at?: string | null;
  sync_error_count?: number;
};

export type StaffIdentity = { id: string; email?: string | null };

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} no está configurada.`);
  return value;
}

function googleClientId() {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() || "";
}

function googleClientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() || "";
}

export function calendarServerConfigured() {
  return Boolean(googleClientId() && googleClientSecret() && process.env.CYA_SERVER_SECRET?.trim()
    && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim());
}

function encryptionKey() {
  return createHash("sha256").update(`cya-google-calendar:${required("CYA_SERVER_SECRET")}`).digest();
}

export function sealCalendarSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function openCalendarSecret(envelope: string) {
  if (!envelope.startsWith("enc:v1:")) throw new Error("La credencial de Google Calendar no tiene un formato seguro reconocido.");
  const [ivValue, tagValue, encryptedValue] = envelope.slice("enc:v1:".length).split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("La credencial de Google Calendar está incompleta.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

export function sealOAuthCookie(payload: Record<string, unknown>) {
  return sealCalendarSecret(JSON.stringify(payload));
}

export function openOAuthCookie<T>(value: string) {
  return JSON.parse(openCalendarSecret(value)) as T;
}

function supabaseBase() {
  return required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
}

function supabaseKey() {
  return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export async function supabaseRequest<T>(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseBase()}${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey(),
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `El servicio de calendario respondió ${response.status}.`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function requireStaff(accessToken: string): Promise<StaffIdentity> {
  if (!accessToken) throw new Error("Falta la sesión de CYA Hub.");
  const user = await supabaseRequest<{ id?: string; email?: string | null }>("/auth/v1/user", accessToken);
  if (!user?.id) throw new Error("La sesión de CYA Hub no es válida.");
  const canManage = await supabaseRequest<boolean>("/rest/v1/rpc/current_user_can_manage_teaching", accessToken, {
    method: "POST",
    body: "{}",
  });
  if (!canManage) throw new Error("Tu cuenta no tiene permiso real para conectar calendarios.");
  return { id: user.id, email: user.email };
}

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? "";
}

export function oauthRedirectUri(origin: string) {
  return process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() || `${origin.replace(/\/$/, "")}/api/google-calendar/callback`;
}

export function buildGoogleCalendarAuthUrl(origin: string, state: string) {
  if (!calendarServerConfigured()) throw new Error("Google Calendar no está configurado en el servidor.");
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: oauthRedirectUri(origin),
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCalendarCode(origin: string, code: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    code,
    redirect_uri: oauthRedirectUri(origin),
    grant_type: "authorization_code",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => null) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !json?.access_token) throw new Error(json?.error_description || json?.error || "Google no devolvió un token de acceso.");
  return json;
}

export async function refreshGoogleCalendarAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = await response.json().catch(() => null) as { access_token?: string; error?: string; error_description?: string } | null;
  if (!response.ok || !json?.access_token) throw new Error(json?.error_description || json?.error || "No se pudo renovar el acceso a Google Calendar.");
  return json.access_token;
}

export async function googleCalendarJson<T>(accessToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) as T & { error?: { message?: string } } : null;
  if (!response.ok) {
    const message = body && typeof body === "object" && body.error?.message ? body.error.message : `Google Calendar respondió ${response.status}.`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export async function primaryGoogleCalendar(accessToken: string) {
  const result = await googleCalendarJson<{
    items?: Array<{ id?: string; summary?: string; timeZone?: string; primary?: boolean; accessRole?: string }>;
  }>(accessToken, "/users/me/calendarList?showHidden=false&minAccessRole=writer&maxResults=250");
  const primary = result.items?.find((item) => item.primary) ?? result.items?.[0];
  if (!primary?.id) throw new Error("Google no devolvió un calendario editable.");
  return {
    id: primary.id,
    summary: primary.summary || "Google Calendar",
    timeZone: primary.timeZone || "Europe/Madrid",
  };
}

export function googleCalendarApiBase() {
  return GOOGLE_CALENDAR_API;
}
