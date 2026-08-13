import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("db/migrations/v63_p26_google_calendar_sync.sql");
const server = read("app/google-calendar-server.ts");
const sync = read("app/google-calendar-sync-server.ts");
const connect = read("app/api/google-calendar/connect/route.ts");
const callback = read("app/api/google-calendar/callback/route.ts");
const resolve = read("app/api/google-calendar/resolve/route.ts");
const ui = read("app/google-calendar-sync.tsx");
const agenda = read("app/agenda-view.tsx");
const admin = read("app/admin-view.tsx");
const p31Integrations = read("app/p31-integrations-admin.tsx");
const env = read(".env.example");

test("P26 database model scopes mappings and external visibility by connection owner", () => {
  assert.match(migration, /calendar_external_event_connection_uq/);
  assert.match(migration, /calendar_source_event_connection_uq/);
  assert.match(migration, /credential_reference is null or credential_reference like 'enc:v1:%'/);
  assert.match(migration, /drop policy if exists calendar_events_staff_all/);
  assert.match(migration, /cc\.user_id=\(select auth\.uid\(\)\)/);
  assert.match(migration, /m\.state not in \('cancelled','completed','completed_automatically','not_applicable','expired'\)/);
});

test("P26 sync lock is invoker-only and recoverable", () => {
  for (const fn of ["begin_calendar_sync", "finish_calendar_sync", "fail_calendar_sync"]) {
    assert.match(migration, new RegExp(`function public\\.${fn}`));
  }
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /sync_started_at < now\(\) - interval '15 minutes'/);
  assert.match(migration, /status in \('connected','error'\)/);
  assert.match(migration, /status = 'connected'/);
  assert.match(migration, /revoke all on function public\.begin_calendar_sync\(bigint\) from public, anon/);
  assert.match(migration, /grant execute on function public\.begin_calendar_sync\(bigint\) to authenticated/);
});

test("P26 OAuth is offline, state-bound and never stores a plaintext refresh token", () => {
  assert.match(server, /aes-256-gcm/);
  assert.match(server, /enc:v1:/);
  assert.match(server, /access_type: "offline"/);
  assert.match(server, /prompt: "consent"/);
  assert.match(server, /calendar\.events/);
  assert.match(server, /calendar\.calendarlist\.readonly/);
  assert.match(connect, /httpOnly: true/);
  assert.match(connect, /sameSite: "lax"/);
  assert.match(connect, /randomBytes\(24\)/);
  assert.match(callback, /context\.state !== state/);
  assert.match(callback, /sealCalendarSecret\(tokens\.refresh_token\)/);
  assert.doesNotMatch(callback, /credential_reference:\s*tokens\.refresh_token/);
});

test("P26 uses Google incremental cursors and explicit ETag conflicts", () => {
  assert.match(sync, /syncToken/);
  assert.match(sync, /status === 410/);
  assert.match(sync, /nextSyncToken/);
  assert.match(sync, /"if-match"/);
  assert.match(sync, /status === 412/);
  assert.match(sync, /changed_in_google/);
  assert.match(sync, /deleted_in_google/);
  assert.match(sync, /sync_status: "conflict"/);
  assert.match(resolve, /strategy !== "keep_cya"/);
  assert.match(resolve, /payload_hash: null/);
});

test("P26 never writes Google edits back into CYA class or business-domain rows", () => {
  const mutatingDomainCall = /\/rest\/v1\/(classes|missions|marketing_events)[^`"']*[`"'][\s\S]{0,160}method:\s*"(PATCH|POST|DELETE)"/i;
  assert.doesNotMatch(sync, mutatingDomainCall);
  assert.match(sync, /\/rest\/v1\/classes\?select=id,status/);
  assert.match(sync, /\/rest\/v1\/missions\?select=id,state/);
  assert.match(sync, /\/rest\/v1\/marketing_events\?select=id,status/);
});

test("P26 is wired into Agenda and Administration without duplicate generic Google card", () => {
  assert.match(agenda, /import \{ GoogleCalendarSync \}/);
  assert.match(agenda, /<GoogleCalendarSync client=\{client\} notify=\{notify\} onSynced=\{load\} compact \/>/);
  assert.match(admin, /import \{ P31IntegrationsAdmin \}/);
  assert.match(admin, /<P31IntegrationsAdmin client=\{client\}/);
  assert.match(p31Integrations, /import \{ GoogleCalendarSync \}/);
  assert.match(p31Integrations, /<GoogleCalendarSync client=\{client\} notify=\{notify\} \/>/);
  assert.match(ui, /Conectar Google Calendar/);
  assert.match(ui, /Sincronizar ahora/);
  assert.match(ui, /Mantener CYA/);
  assert.match(ui, /CYA ↔ Google/);
  assert.match(ui, /CYA → Google/);
  assert.match(ui, /Google → Agenda/);
});

test("P26 server configuration stays server-side and documents the callback", () => {
  assert.match(env, /GOOGLE_CALENDAR_CLIENT_ID=/);
  assert.match(env, /GOOGLE_CALENDAR_CLIENT_SECRET=/);
  assert.match(env, /GOOGLE_CALENDAR_REDIRECT_URI=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_SECRET/);
  assert.equal(fs.existsSync("scripts/apply-p26-ui.mjs"), false);
  assert.equal(fs.existsSync(".github/workflows/apply-p26-ui.yml"), false);
});
