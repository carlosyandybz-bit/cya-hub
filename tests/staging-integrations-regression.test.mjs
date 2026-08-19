import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  // Integration hub
  "app/p31-integrations-admin.tsx",

  // Email SMTP
  "app/email-integration.tsx",
  "app/email-smtp-server.ts",
  "app/api/email/status/route.ts",
  "app/api/email/test/route.ts",

  // Google Drive
  "app/google-drive-server.ts",
  "app/api/google-drive/status/route.ts",

  // Google Calendar
  "app/google-calendar-sync.tsx",
  "app/google-calendar-server.ts",
  "app/calendar-visual-admin.tsx",
  "app/api/google-calendar/status/route.ts",
  "app/api/google-calendar/connect/route.ts",
  "app/api/google-calendar/callback/route.ts",
  "app/api/google-calendar/sync/route.ts",
  "app/api/google-calendar/disconnect/route.ts",
  "app/api/google-calendar/resolve/route.ts",

  // WhatsApp Cloud API
  "app/whatsapp-integration.tsx",
  "app/whatsapp-server.ts",
  "app/api/whatsapp/status/route.ts",
  "app/api/whatsapp/send/route.ts",
  "app/api/whatsapp/test-self/route.ts",
  "app/api/whatsapp/webhook/route.ts",
  "app/api/integrations/whatsapp/webhook/route.ts",
];

test("staging preserves all integration implementation files", () => {
  const missing = requiredFiles.filter((file) => !exists(file));
  assert.deepEqual(missing, [], `Missing protected integration files: ${missing.join(", ")}`);
});

test("integration admin renders the real integration components", () => {
  const source = read("app/p31-integrations-admin.tsx");
  for (const marker of [
    "EmailIntegration",
    "GoogleCalendarSync",
    "CalendarVisualAdmin",
    "WhatsAppIntegration",
    "/api/google-drive/status",
  ]) {
    assert.ok(source.includes(marker), `Integration admin lost ${marker}`);
  }
  assert.ok(source.includes("Instagram y Facebook siguen disponibles para planificar contenido"), "Meta placeholder contract changed unexpectedly");
});

test("email remains a real verified SMTP integration", () => {
  const ui = read("app/email-integration.tsx");
  const server = read("app/email-smtp-server.ts");
  assert.ok(ui.includes("/api/email/status"));
  assert.ok(ui.includes("/api/email/test"));
  assert.ok(server.includes("AUTH LOGIN"));
  assert.ok(server.includes("EMAIL_SMTP_PASSWORD"));
  assert.ok(server.includes("rejectUnauthorized: true"));
});

test("Google Drive keeps verification, managed folders and protected media support", () => {
  const server = read("app/google-drive-server.ts");
  const status = read("app/api/google-drive/status/route.ts");
  for (const marker of [
    "verifyGoogleDriveConnection",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_TEACHING_FOLDER_ID",
    "GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID",
    "GOOGLE_DRIVE_FEEDBACK_FOLDER_ID",
    "signMediaTicket",
    "verifyMediaTicket",
  ]) assert.ok(server.includes(marker), `Google Drive lost ${marker}`);
  assert.ok(status.includes("verifyGoogleDriveConnection"));
});

test("Google Calendar keeps OAuth, bidirectional sync and conflict handling", () => {
  const ui = read("app/google-calendar-sync.tsx");
  const server = read("app/google-calendar-server.ts");
  for (const marker of [
    "/api/google-calendar/status",
    "/api/google-calendar/connect",
    "/api/google-calendar/sync",
    "/api/google-calendar/disconnect",
    "/api/google-calendar/resolve",
    "two_way",
    "CYA ↔ Google",
  ]) assert.ok(ui.includes(marker), `Google Calendar UI lost ${marker}`);
  assert.ok(server.includes("GOOGLE_CALENDAR_CLIENT_ID"));
  assert.ok(server.includes("GOOGLE_CALENDAR_CLIENT_SECRET"));
  assert.ok(server.includes("CYA_SERVER_SECRET"));
});

test("WhatsApp keeps signed webhook, server send and canonical self-test", () => {
  const server = read("app/whatsapp-server.ts");
  const webhook = read("app/api/whatsapp/webhook/route.ts");
  const selfTest = read("app/api/whatsapp/test-self/route.ts");
  const ui = read("app/whatsapp-integration.tsx");
  assert.ok(server.includes("WHATSAPP_ACCESS_TOKEN"));
  assert.ok(server.includes("WHATSAPP_PHONE_NUMBER_ID"));
  assert.ok(server.includes("WHATSAPP_APP_SECRET"));
  assert.ok(webhook.includes("x-hub-signature-256"));
  assert.ok(selfTest.includes("/rest/v1/people?auth_user_id=eq."));
  assert.ok(selfTest.includes("normalized = `34${normalized}`"));
  assert.ok(ui.includes("/api/whatsapp/test-self"));
});

test("environment contract contains every protected integration variable without secrets", () => {
  const env = read(".env.example");
  const requiredNames = [
    "EMAIL_SMTP_HOST",
    "EMAIL_SMTP_PORT",
    "EMAIL_SMTP_SECURE",
    "EMAIL_SMTP_USER",
    "EMAIL_SMTP_PASSWORD",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_FROM_NAME",
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GOOGLE_DRIVE_TEACHING_FOLDER_ID",
    "GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID",
    "GOOGLE_DRIVE_FEEDBACK_FOLDER_ID",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
    "CYA_SERVER_SECRET",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_GRAPH_API_VERSION",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "NEXT_PUBLIC_SENTRY_DSN",
    "SENTRY_DSN",
    "SENTRY_AUTH_TOKEN",
  ];
  for (const name of requiredNames) assert.ok(env.includes(`${name}=`), `.env.example lost ${name}`);
});
