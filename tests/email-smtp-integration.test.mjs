import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync("app/email-smtp-server.ts", "utf8");
const status = fs.readFileSync("app/api/email/status/route.ts", "utf8");
const send = fs.readFileSync("app/api/email/test/route.ts", "utf8");
const ui = fs.readFileSync("app/email-integration.tsx", "utf8");
const integrations = fs.readFileSync("app/p31-integrations-admin.tsx", "utf8");
const env = fs.readFileSync(".env.example", "utf8");

test("email SMTP credentials stay server-side", () => {
  assert.match(server, /EMAIL_SMTP_PASSWORD/);
  assert.doesNotMatch(server, /NEXT_PUBLIC_EMAIL_/);
  assert.match(env, /EMAIL_SMTP_PASSWORD=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_EMAIL_SMTP_PASSWORD/);
});

test("email SMTP requires encrypted TLS transport", () => {
  assert.match(server, /tls\.connect/);
  assert.match(server, /rejectUnauthorized:\s*true/);
  assert.match(server, /secure:\s*Boolean|secure,/);
  assert.match(server, /AUTH LOGIN/);
});

test("email API is authenticated and admin-gated", () => {
  for (const source of [status, send]) {
    assert.match(source, /bearerToken\(request\)/);
    assert.match(source, /requireStaff\(accessToken\)/);
    assert.match(source, /app_member_roles/);
    assert.match(source, /item\.role === "admin" \|\| item\.role === "teacher_admin"/);
  }
});

test("admin integrations exposes verification and real test send", () => {
  assert.match(integrations, /<EmailIntegration client=\{client\} notify=\{notify\} \/>/);
  assert.match(ui, /\/api\/email\/status/);
  assert.match(ui, /\/api\/email\/test/);
  assert.match(ui, /Enviar correo de prueba/);
  assert.match(ui, /La contraseña SMTP permanece únicamente en el servidor/);
});
