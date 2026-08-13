import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v66_p28_data_transfer_closure.sql", "utf8");
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
});

test("P28 legacy and v2 flat import surfaces are admin-only and preview-first", () => {
  assert.match(migration, /Solo un administrador puede previsualizar importaciones/);
  assert.match(migration, /Solo un administrador puede aplicar importaciones/);
  assert.match(migration, /status='validated'/);
  assert.match(migration, /for update/);
  assert.match(migration, /validation_version','p28-v66'/);
  assert.match(migration, /apply_version','p28-v66'/);
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
  assert.match(migration, /notification_channels/);
  assert.match(migration, /failure_behavior/);
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
