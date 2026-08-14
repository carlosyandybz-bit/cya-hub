import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read=(path)=>readFileSync(path,"utf8");
const notifications=read("app/p27-notifications-admin.tsx");
const forms=read("app/admin-form-library.tsx");
const reset=read("app/admin-data-reset.tsx");
const transfer=read("app/admin-data-transfer.tsx");
const appearance=read("app/p31-appearance-admin.tsx");
const integrations=read("app/p31-integrations-admin.tsx");
const statistics=read("app/statistics-explorer.tsx");
const calendarServer=read("app/google-calendar-server.ts");
const driveServer=read("app/google-drive-server.ts");

test("final notification copy does not expose implementation jargon",()=>{
  for(const token of ["P27 · MOTOR AUTOMÁTICO","Motor de notificaciones","idempotente","dispatcher"]) assert.ok(!notifications.includes(token),token);
  assert.match(notifications,/NOTIFICACIONES AUTOMÁTICAS/);
  assert.match(notifications,/Cada aviso aparece una sola vez por acción pendiente/);
});

test("administration copy explains behavior instead of deployment internals",()=>{
  for(const token of ["Motor P20 preparado para despliegue","formulario JSON genérico","PostgreSQL revierte","Supabase Auth","CSS arbitrario","binarios almacenados en Postgres"]) {
    assert.ok(!forms.includes(token) && !reset.includes(token) && !transfer.includes(token) && !appearance.includes(token),token);
  }
  assert.match(forms,/Edición avanzada no disponible/);
  assert.match(reset,/no se aplicará ningún cambio parcial/);
});

test("integration and statistics surfaces use product language",()=>{
  for(const token of ["Sin API verificada","dispatcher\/API","conexión API de Meta","Los binarios permanecen","catálogo y motor"]) {
    assert.ok(!integrations.includes(token) && !statistics.includes(token),token);
  }
  assert.match(integrations,/Sin automatización/);
  assert.match(statistics,/Consulta aquí todas las métricas disponibles/);
});

test("server errors that may reach UI do not expose Supabase internals",()=>{
  assert.doesNotMatch(calendarServer,/Supabase respondió/);
  assert.doesNotMatch(driveServer,/Supabase RPC/);
});
