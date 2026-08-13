import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v66_p28_data_transfer_closure.sql", "utf8");
const followup = readFileSync("db/migrations/v67_p28_data_transfer_validation_followup.sql", "utf8");
const formats = readFileSync("app/data-transfer-formats-safe.ts", "utf8");
const adminTransfer = readFileSync("app/admin-data-transfer.tsx", "utf8");

test("P28 canonical backup includes current functional state", () => {
  for (const table of [
    "daily_quote_assignments",
    "evaluation_sessions",
    "evaluation_milestone_decisions",
    "teaching_content_evaluation_recommendations",
    "class_content_events",
    "class_media_resources",
    "class_pedagogy_summaries",
    "class_preparation_requests",
    "notification_deliveries",
  ]) assert.match(migration, new RegExp(`'${table}'`));
  assert.doesNotMatch(migration, /when 'complete'[\s\S]{0,9000}'sentry_sync_runs'/);
  assert.doesNotMatch(migration, /when 'complete'[\s\S]{0,9000}'admin_reset_jobs'/);
});

test("P28 bulk people import reuses P19 canonical identity and blocks ambiguity", () => {
  assert.match(migration, /private\.match_person_identity\(v_email,v_phone,null\)/);
  assert.match(migration, /private\.match_person_identity\(v_item->>'email',v_item->>'phone',null\)/);
  assert.match(migration, /mismo email o teléfono en varias filas/);
  assert.match(migration, /Varias filas del archivo resuelven a la misma persona existente/);
  assert.match(migration, /cada fila necesita email o teléfono/);
  assert.match(followup, /'new','contacted','interested','booked','student','lost'/);
});

test("P28 legacy and v2 flat import surfaces are admin-only and preview-first", () => {
  assert.match(migration, /Solo un administrador puede previsualizar importaciones/);
  assert.match(migration, /Solo un administrador puede aplicar importaciones/);
  assert.match(migration, /status='validated'/);
  assert.match(migration, /for update/);
  assert.match(migration, /validation_version','p28-v66'/);
  assert.match(migration, /apply_version','p28-v66'/);
  assert.match(followup, /validation_version','p28-v67'/);
  assert.match(followup, /return public\.apply_data_import\(p_job_id\)/);
});

test("P28 never publishes newly imported teaching content", () => {
  assert.match(migration, /'incomplete','draft','staff'/);
  assert.match(migration, /measurement_mode/);
  assert.match(migration, /requires_partner/);
  assert.match(migration, /«Necesita pareja» solo puede utilizarse en Ejercicios/);
});

test("P28 mission-rule imports cannot report success for unknown evaluators", () => {
  assert.match(migration, /La importación configura reglas existentes; no crea evaluadores nuevos/);
  assert.match(migration, /La regla «%» dejó de existir desde la previsualización/);
  assert.match(followup, /normal','priority','urgent/);
  assert.match(followup, /priority_score debe estar entre 0 y 100/);
  assert.match(followup, /estimated_duration_minutes debe estar entre 1 y 1440/);
  assert.match(followup, /valid_days solo admite días 1–7/);
  assert.match(followup, /notification_channels debe ser una lista/);
});

test("P28 marketing rates respect nullable duration and production enums", () => {
  assert.match(followup, /'individual','pair','event','other'/);
  assert.match(followup, /duración debe estar entre 1 y 100000 minutos o quedar vacía/i);
  assert.match(followup, /'\{duration_minutes\}'/);
  assert.match(followup, /'null'::jsonb/);
  assert.match(followup, /'\^\[A-Z\]\{3\}\$'/);
});

test("P28 rejects impossible recurring quote dates before apply", () => {
  assert.match(followup, /to_date\('2000-'\|\|v_text,'YYYY-MM-DD'\)/);
  assert.match(followup, /no corresponde a una fecha real/);
});

test("P28 accepts human teaching spreadsheets without exposing internal enum names", () => {
  assert.match(formats, /descripcion corta/);
  assert.match(formats, /explicacion completa/);
  assert.match(formats, /mide frecuencia/);
  assert.match(formats, /mide importancia/);
  assert.match(formats, /result\.measurement_mode = "both"/);
  assert.match(formats, /result\.content_type = fixedType/);
  assert.match(formats, /requires_partner/);
  for (const domain of ["correction", "explanation", "exercise", "sequence"]) assert.match(adminTransfer, new RegExp(`\\["${domain}"`));
});
