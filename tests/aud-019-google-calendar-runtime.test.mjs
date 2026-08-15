import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const status = read("app/api/google-calendar/status/route.ts");
const connect = read("app/api/google-calendar/connect/route.ts");
const callback = read("app/api/google-calendar/callback/route.ts");
const origin = read("app/server-request-origin.ts");
const ui = read("app/google-calendar-sync.tsx");
const deploy = read("HOSTINGER_DEPLOY.md");

test("AUD-019 reports missing Calendar runtime prerequisites without exposing secret values", () => {
  assert.match(status, /type MissingRequirement = "google_oauth" \| "server_encryption" \| "supabase_runtime"/);
  assert.match(status, /GOOGLE_CALENDAR_CLIENT_ID/);
  assert.match(status, /GOOGLE_DRIVE_CLIENT_ID/);
  assert.match(status, /CYA_SERVER_SECRET/);
  assert.match(status, /missingRequirements/);
  assert.match(status, /configurationMessage/);
  assert.doesNotMatch(status, /clientSecret:\s*process\.env/);
  assert.doesNotMatch(status, /serverSecret:\s*process\.env/);
});

test("AUD-019 shows an actionable readiness message instead of a generic OAuth failure", () => {
  assert.match(ui, /configurationMessage/);
  assert.match(ui, /Google Calendar todavía no está preparado en el servidor/);
  assert.match(ui, /disabled=\{busy === "connect" \|\| configured === false \|\| configured === null\}/);
});

test("AUD-019 derives the public OAuth origin behind Hostinger reverse proxy", () => {
  assert.match(origin, /x-forwarded-host/);
  assert.match(origin, /x-forwarded-proto/);
  assert.match(origin, /request\.headers\.get\("host"\)/);
  assert.match(connect, /externalRequestOrigin\(request\)/);
  assert.doesNotMatch(connect, /buildGoogleCalendarAuthUrl\(request\.nextUrl\.origin/);
  assert.match(connect, /secure:\s*origin\.startsWith\("https:\/\/"\)/);
  assert.match(callback, /exchangeGoogleCalendarCode\(externalRequestOrigin\(request\), code\)/);
  assert.doesNotMatch(callback, /exchangeGoogleCalendarCode\(request\.nextUrl\.origin/);
});

test("AUD-019 deployment contract requires real OAuth certification", () => {
  assert.match(deploy, /Google Calendar — requisitos obligatorios para habilitar la conexión/);
  assert.match(deploy, /CYA_SERVER_SECRET=/);
  assert.match(deploy, /Authorized redirect URI/);
  assert.match(deploy, /calendar_connections/);
  assert.match(deploy, /last_synced_at/);
  assert.match(deploy, /no se considera certificada/i);
});
