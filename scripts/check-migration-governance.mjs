#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CORE01_EVIDENCE_SCHEMA_VERSION,
  CORE01_SCHEMA_VERSION,
  compileJsonSchema,
  gitCommitExists,
  loadGitHubAuthoringContext,
  validateAppliedEvidenceAgainstArtifact,
  validateAuthoringContext,
  validateAuthoringPreservation,
  validateAuthoritativeAppliedEvidence,
  validateEvidenceArtifactSchema,
  validateRecordSchema,
  validateRecordSemantics,
} from "./core01-provenance.mjs";

export const CANONICAL_RE = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MANIFEST_PATH = "docs/CORE_01_MIGRATION_INVENTORY.json";
const PROVENANCE_REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
const PROVENANCE_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const EVIDENCE_SCHEMA_PATH = "docs/CORE_01_POST_APPLY_EVIDENCE.schema.json";
const ROUTES = ["db/migrations", "supabase/migrations"];

function registryMigrations(registry) {
  return Array.isArray(registry?.migrations) ? registry.migrations : [];
}

export function manifestArtifacts(manifest, provenanceRegistry = { migrations: [] }) {
  const artifacts = [];
  for (const [route, routeInfo] of Object.entries(manifest.inventory ?? {})) {
    const operationalClass = routeInfo.historical_operational_class;
    for (const [state, entries] of Object.entries(routeInfo.states ?? {})) {
      if (Array.isArray(entries)) {
        for (const file of entries) artifacts.push({ route, path: `${route}/${file}`, operational_class: operationalClass, applied_state: state, historical: true });
      } else {
        for (const [file, details] of Object.entries(entries ?? {})) artifacts.push({ route, path: `${route}/${file}`, operational_class: details.operational_class ?? operationalClass, applied_state: state, historical: true, ...details });
      }
    }
  }
  for (const record of registryMigrations(provenanceRegistry)) artifacts.push({ route: "supabase/migrations", historical: false, ...record });
  return artifacts;
}

function posix(path) { return path.split(sep).join("/"); }
function walkSql(rootDir, relDir) {
  const absolute = resolve(rootDir, relDir);
  let entries;
  try { entries = readdirSync(absolute); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    const full = resolve(absolute, entry);
    const rel = posix(relative(rootDir, full));
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walkSql(rootDir, rel));
    else if (entry.endsWith(".sql")) files.push(rel);
  }
  return files.sort();
}

export function parseNameStatus(output) {
  if (!output.trim()) return [];
  return output.trim().split(/\r?\n/).map((line) => {
    const parts = line.split("\t");
    const status = parts[0];
    if (status.startsWith("R") || status.startsWith("C")) return { status, paths: [parts[1], parts[2]].filter(Boolean) };
    return { status, paths: [parts[1]].filter(Boolean) };
  });
}

function isRootSupabaseSql(path) { return /^supabase\/[^/]+\.sql$/.test(path); }
function isUnder(path, prefix) { return path === prefix || path.startsWith(`${prefix}/`); }
function canonicalTimestamp(path) { return /^supabase\/migrations\/(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(path)?.[1] ?? null; }
function validUtcTimestamp(value) {
  if (!/^\d{14}$/.test(value ?? "")) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

export function validateProvenanceRecord(record, provenanceSchema, options = {}) {
  if (!provenanceSchema) throw new Error("validateProvenanceRecord exige JSON Schema real.");
  return [
    ...validateRecordSchema(record, provenanceSchema, options.rootDir ?? process.cwd(), options.compiledValidator ?? null),
    ...validateRecordSemantics(record),
  ];
}

export function validateProvenanceRegistry(registry, schema, evidenceSchema, options = {}) {
  const errors = [];
  if (registry?.schema_version !== CORE01_SCHEMA_VERSION) errors.push(`${PROVENANCE_REGISTRY_PATH}: schema_version debe ser ${CORE01_SCHEMA_VERSION}.`);
  if (registry?.record_schema !== PROVENANCE_SCHEMA_PATH) errors.push(`${PROVENANCE_REGISTRY_PATH}: record_schema debe apuntar a ${PROVENANCE_SCHEMA_PATH}.`);
  if (registry?.evidence_schema !== EVIDENCE_SCHEMA_PATH) errors.push(`${PROVENANCE_REGISTRY_PATH}: evidence_schema debe apuntar a ${EVIDENCE_SCHEMA_PATH}.`);
  if (schema?.["x-cya-schema-version"] !== CORE01_SCHEMA_VERSION) errors.push(`${PROVENANCE_SCHEMA_PATH}: x-cya-schema-version debe ser ${CORE01_SCHEMA_VERSION}.`);
  if (evidenceSchema?.["x-cya-schema-version"] !== CORE01_EVIDENCE_SCHEMA_VERSION) errors.push(`${EVIDENCE_SCHEMA_PATH}: x-cya-schema-version debe ser ${CORE01_EVIDENCE_SCHEMA_VERSION}.`);
  if (schema?.title !== "CORE-01 post-contract migration provenance") errors.push(`${PROVENANCE_SCHEMA_PATH}: title inesperado.`);
  if (evidenceSchema?.title !== "CORE-01 authoritative post-apply evidence artifact") errors.push(`${EVIDENCE_SCHEMA_PATH}: title inesperado.`);
  if (!Array.isArray(registry?.migrations)) return [...errors, `${PROVENANCE_REGISTRY_PATH}: migrations debe ser un array.`];

  let compiledValidator = options.compiledValidator ?? null;
  let compiledEvidenceValidator = options.compiledEvidenceValidator ?? null;
  try {
    compiledValidator ??= compileJsonSchema(schema, options.rootDir ?? process.cwd());
    compiledEvidenceValidator ??= compileJsonSchema(evidenceSchema, options.rootDir ?? process.cwd());
  } catch (error) {
    return [...errors, `JSON Schema Draft 2020-12 no compilable con Ajv: ${error.message}`];
  }

  const paths = registry.migrations.map((record) => record?.path).filter(Boolean);
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
  if (duplicates.length) errors.push(`${PROVENANCE_REGISTRY_PATH}: rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);
  for (const record of registry.migrations) errors.push(...validateProvenanceRecord(record, schema, { ...options, compiledValidator }));
  return errors;
}

export function validateChanges(changes, manifest, provenanceRegistry, provenanceSchema, evidenceSchema, options = {}) {
  const errors = [...validateProvenanceRegistry(provenanceRegistry, provenanceSchema, evidenceSchema, options)];
  const artifacts = manifestArtifacts(manifest, provenanceRegistry);
  const artifactByPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const addedCanonical = [];
  for (const change of changes) {
    for (const path of change.paths) {
      if (!path) continue;
      if (isUnder(path, "db/migrations")) { errors.push(`${path}: db/migrations está congelado; no admite altas, cambios, renombres ni borrados.`); continue; }
      if (isUnder(path, "supabase/applied-history")) { errors.push(`${path}: applied-history documental está congelado y no puede actuar como segunda ruta de migración.`); continue; }
      if (isRootSupabaseSql(path)) { errors.push(`${path}: SQL raíz de Supabase es bootstrap/compatibilidad y está congelado para nueva autoría de migraciones.`); continue; }
      if (isUnder(path, "supabase/migrations") && path.endsWith(".sql")) {
        if (change.status.startsWith("A")) {
          const file = path.slice("supabase/migrations/".length);
          if (!CANONICAL_RE.test(file)) { errors.push(`${path}: toda migración nueva debe llamarse YYYYMMDDHHMMSS_descripcion_snake_case.sql.`); continue; }
          const timestamp = canonicalTimestamp(path);
          if (!validUtcTimestamp(timestamp)) { errors.push(`${path}: el prefijo debe ser una fecha/hora UTC válida (YYYYMMDDHHMMSS).`); continue; }
          const artifact = artifactByPath.get(path);
          if (!artifact) { errors.push(`${path}: falta registrar la nueva migración en ${PROVENANCE_REGISTRY_PATH}.`); continue; }
          if (artifact.operational_class !== "CANONICA") errors.push(`${path}: una migración nueva debe clasificarse CANONICA.`);
          if (artifact.applied_state !== "PREPARADA_NO_APLICADA") errors.push(`${path}: una migración añadida en este PR debe comenzar PREPARADA_NO_APLICADA; APLICADA solo puede promoverse tras Release/post-apply.`);
          addedCanonical.push(path);
        } else errors.push(`${path}: las migraciones existentes son inmutables; corrige hacia delante con una nueva migración canónica.`);
      }
    }
  }
  const addedTimestamps = addedCanonical.map(canonicalTimestamp).filter(Boolean);
  if (new Set(addedTimestamps).size !== addedTimestamps.length) errors.push("Las nuevas migraciones reutilizan un timestamp UTC de 14 dígitos.");
  const historicalTimestamps = artifacts.filter((artifact) => artifact.path.startsWith("supabase/migrations/") && !addedCanonical.includes(artifact.path)).map((artifact) => canonicalTimestamp(artifact.path)).filter(Boolean);
  const floor = [historicalTimestamps.sort().at(-1) ?? null, manifest?.staging_ledger_summary?.last_version ?? null].filter((value) => /^\d{14}$/.test(value ?? "")).sort().at(-1) ?? null;
  if (floor) for (const timestamp of addedTimestamps) if (timestamp <= floor) errors.push(`Timestamp ${timestamp}: debe ser posterior al máximo histórico/ledger ${floor}; no se admiten migraciones nuevas retrodatadas.`);
  return [...new Set(errors)];
}

export function validateInventory(actualByRoute, manifest, provenanceRegistry, provenanceSchema, evidenceSchema, options = {}) {
  const errors = [...validateProvenanceRegistry(provenanceRegistry, provenanceSchema, evidenceSchema, options)];
  if (Array.isArray(manifest?.canonical_pending) && manifest.canonical_pending.length > 0) errors.push("canonical_pending ya no es una vía válida: toda migración post-CORE-01 debe vivir en el registro machine-readable de provenance.");
  const artifacts = manifestArtifacts(manifest, provenanceRegistry);
  const paths = artifacts.map((artifact) => artifact.path);
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
  if (duplicates.length) errors.push(`Manifiesto/registro con rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);
  for (const route of ROUTES) {
    const actual = [...(actualByRoute[route] ?? [])].sort();
    const declared = artifacts.filter((artifact) => artifact.route === route).map((artifact) => artifact.path).sort();
    const actualSet = new Set(actual);
    const declaredSet = new Set(declared);
    for (const path of actual) if (!declaredSet.has(path)) errors.push(`${path}: SQL presente en ${route} pero ausente del inventario combinado histórico/provenance.`);
    for (const path of declared) if (!actualSet.has(path)) errors.push(`${path}: declarado en inventario/provenance pero ausente del repositorio.`);
  }
  const allowedOperational = new Set(["CANONICA", "BOOTSTRAP", "COMPATIBILIDAD", "DUPLICADO_DOCUMENTAL", "RETIRADA", "DESCONOCIDA"]);
  const allowedApplied = new Set(["APLICADA", "PREPARADA_NO_APLICADA", "DESCONOCIDA"]);
  for (const artifact of artifacts) {
    if (!allowedOperational.has(artifact.operational_class)) errors.push(`${artifact.path}: operational_class inválida o ausente.`);
    if (!allowedApplied.has(artifact.applied_state)) errors.push(`${artifact.path}: applied_state inválido o ausente.`);
  }
  if (manifest?.canonical_contract?.future_route !== "supabase/migrations") errors.push("El manifiesto debe declarar supabase/migrations como única ruta canónica futura.");
  if (manifest?.staging_ledger_summary?.source !== "supabase_migrations.schema_migrations") errors.push("El manifiesto debe identificar supabase_migrations.schema_migrations como applied-history real de STAGING.");
  const totals = manifest?.inventory_totals;
  if (totals) {
    const historical = manifestArtifacts(manifest, { migrations: [] });
    const states = Object.fromEntries(["APLICADA", "PREPARADA_NO_APLICADA", "DESCONOCIDA"].map((state) => [state, historical.filter((artifact) => artifact.applied_state === state).length]));
    if (totals.artifacts !== historical.length) errors.push(`inventory_totals.artifacts=${totals.artifacts} no coincide con snapshot histórico ${historical.length}.`);
    for (const [state, count] of Object.entries(states)) if (totals[state] !== count) errors.push(`inventory_totals.${state}=${totals[state]} no coincide con snapshot histórico ${count}.`);
  }
  return [...new Set(errors)];
}

export function validateCanonicalTimestamps(files) {
  const errors = [];
  const timestamps = new Map();
  for (const path of files) {
    const timestamp = canonicalTimestamp(path);
    if (!timestamp) continue;
    const previous = timestamps.get(timestamp);
    if (previous) errors.push(`Timestamp canónico duplicado ${timestamp}: ${previous} y ${path}`);
    else timestamps.set(timestamp, path);
  }
  return errors;
}

export function validateContextAgainstGitHub(records, changes, context, options = {}) {
  const addedPaths = new Set();
  for (const change of changes) for (const path of change.paths) if (change.status.startsWith("A") && isUnder(path, "supabase/migrations") && path.endsWith(".sql")) addedPaths.add(path);
  const commitExists = options.commitExists ?? ((sha) => gitCommitExists(sha, options.cwd));
  const errors = [];
  for (const record of records) errors.push(...validateAuthoringContext(record, context, { commitExists, isNewMigration: addedPaths.has(record.path) }));
  return [...new Set(errors)];
}

function evidenceStartIndex(before) {
  if (!before) return null;
  if (before.applied_state === "PREPARADA_NO_APLICADA") return 0;
  if (before.applied_state === "APLICADA") return before?.provenance?.application_evidence?.length ?? 0;
  return null;
}

export async function validateAppliedPromotions(previousRegistry, currentRegistry, context, evidenceSchema, options = {}) {
  const errors = [...validateAuthoringPreservation(previousRegistry, currentRegistry)];
  const previous = new Map(registryMigrations(previousRegistry).map((record) => [record.path, record]));
  for (const record of registryMigrations(currentRegistry)) {
    if (record.applied_state !== "APLICADA") continue;
    const before = previous.get(record.path);
    const start = evidenceStartIndex(before);
    if (start == null) { errors.push(`${record.path}: APLICADA exige un registro AUTHORING/APPLIED previo en la base del PR.`); continue; }
    const evidence = record?.provenance?.application_evidence ?? [];
    for (const item of evidence.slice(start)) {
      errors.push(...await validateAuthoritativeAppliedEvidence(record, item, context, evidenceSchema, options));
    }
  }
  return [...new Set(errors)];
}

function gitChanges(base) {
  return parseNameStatus(execFileSync("git", ["diff", "--name-status", "-M", `${base}...HEAD`], { encoding: "utf8" }));
}
function gitJsonAtRef(ref, path) {
  try { return JSON.parse(execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })); }
  catch { return { migrations: [] }; }
}

function githubHeaders(context) {
  if (!context?.githubToken) throw new Error("GITHUB_TOKEN ausente para corroborar evidence.");
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${context.githubToken}`, "X-GitHub-Api-Version": "2022-11-28" };
}
async function githubJson(path, context) {
  const response = await fetch(`${context.githubApiUrl}/repos/carlosyandybz-bit/cya-hub${path}`, { headers: githubHeaders(context) });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}.`);
  return response.json();
}
async function githubRun(runId, context) { return githubJson(`/actions/runs/${runId}`, context); }
async function githubArtifacts(runId, context) { return (await githubJson(`/actions/runs/${runId}/artifacts?per_page=100`, context)).artifacts ?? []; }
async function githubArtifactZip(artifactId, context) {
  const response = await fetch(`${context.githubApiUrl}/repos/carlosyandybz-bit/cya-hub/actions/artifacts/${artifactId}/zip`, { headers: githubHeaders(context), redirect: "follow" });
  if (!response.ok) throw new Error(`GitHub artifact ${artifactId}: HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function main() {
  const rootDir = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(rootDir, MANIFEST_PATH), "utf8"));
  const provenanceRegistry = JSON.parse(readFileSync(resolve(rootDir, PROVENANCE_REGISTRY_PATH), "utf8"));
  const provenanceSchema = JSON.parse(readFileSync(resolve(rootDir, PROVENANCE_SCHEMA_PATH), "utf8"));
  const evidenceSchema = JSON.parse(readFileSync(resolve(rootDir, EVIDENCE_SCHEMA_PATH), "utf8"));
  let compiledValidator;
  let compiledEvidenceValidator;
  try {
    compiledValidator = compileJsonSchema(provenanceSchema, rootDir);
    compiledEvidenceValidator = compileJsonSchema(evidenceSchema, rootDir);
  } catch (error) {
    console.error(`CORE-01 MIGRATION GOVERNANCE: FAIL\n- JSON Schema Draft 2020-12 no compilable con Ajv: ${error.message}`);
    process.exit(1);
  }
  const validationOptions = { rootDir, compiledValidator, compiledEvidenceValidator };
  const actualByRoute = Object.fromEntries(ROUTES.map((route) => [route, walkSql(rootDir, route)]));
  let errors = [
    ...validateInventory(actualByRoute, manifest, provenanceRegistry, provenanceSchema, evidenceSchema, validationOptions),
    ...validateCanonicalTimestamps(actualByRoute["supabase/migrations"]),
  ];
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : null;
  let changes = [];
  let previousRegistry = { migrations: [] };
  if (baseIndex >= 0 && !base) errors.push("--base requiere SHA/ref.");
  if (base) {
    changes = gitChanges(base);
    previousRegistry = gitJsonAtRef(base, PROVENANCE_REGISTRY_PATH);
    errors.push(...validateChanges(changes, manifest, provenanceRegistry, provenanceSchema, evidenceSchema, validationOptions));
    errors.push(...validateAuthoringPreservation(previousRegistry, provenanceRegistry));
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    try {
      const context = loadGitHubAuthoringContext();
      errors.push(...validateContextAgainstGitHub(registryMigrations(provenanceRegistry), changes, context, { cwd: rootDir }));
      if (base) errors.push(...await validateAppliedPromotions(previousRegistry, provenanceRegistry, context, evidenceSchema, {
        ...validationOptions,
        getWorkflowRun: githubRun,
        listArtifacts: githubArtifacts,
        downloadArtifact: githubArtifactZip,
      }));
    } catch (error) { errors.push(`Contexto Git/GitHub/evidence no corroborable: ${error.message}`); }
  } else if (base) {
    const previous = new Map(registryMigrations(previousRegistry).map((record) => [record.path, record]));
    for (const record of registryMigrations(provenanceRegistry)) {
      const before = previous.get(record.path);
      if (record.applied_state === "APLICADA" && before?.applied_state !== "APLICADA") errors.push(`${record.path}: una promoción APPLIED requiere GitHub Actions para corroborar el artifact autoritativo.`);
    }
  }
  errors = [...new Set(errors)];
  if (errors.length) {
    console.error("CORE-01 MIGRATION GOVERNANCE: FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  const counts = Object.fromEntries(ROUTES.map((route) => [route, actualByRoute[route].length]));
  console.log("CORE-01 MIGRATION GOVERNANCE: PASS");
  console.log(`JSON Schema: Draft 2020-12 / Ajv / provenance v${CORE01_SCHEMA_VERSION} + evidence v${CORE01_EVIDENCE_SCHEMA_VERSION}`);
  console.log(`Canonical future route: ${manifest.canonical_contract.future_route}`);
  console.log(`Historical inventory: db/migrations=${counts["db/migrations"]}; supabase/migrations=${counts["supabase/migrations"]}`);
  console.log(`Post-CORE-01 provenance records: ${registryMigrations(provenanceRegistry).length}`);
  if (process.env.GITHUB_ACTIONS === "true") console.log("Authoring uses Git/GitHub facts; APPLIED additions require exact trusted post-apply artifact binding.");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) await main();
