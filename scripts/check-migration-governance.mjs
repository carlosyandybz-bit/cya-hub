#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_RE = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MANIFEST_PATH = "docs/CORE_01_MIGRATION_INVENTORY.json";
const PROVENANCE_REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
const PROVENANCE_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const ROUTES = ["db/migrations", "supabase/migrations"];
const REPOSITORY = "carlosyandybz-bit/cya-hub";
const SHA_RE = /^[0-9a-f]{40}$/i;
const PROJECT_REF_RE = /^[a-z0-9]{20}$/;
const FUNC_ID_RE = /^FUNC-\d{4}$/;

function registryMigrations(registry) {
  return Array.isArray(registry?.migrations) ? registry.migrations : [];
}

export function manifestArtifacts(manifest, provenanceRegistry = { migrations: [] }) {
  const artifacts = [];
  for (const [route, routeInfo] of Object.entries(manifest.inventory ?? {})) {
    const operationalClass = routeInfo.historical_operational_class;
    for (const [state, entries] of Object.entries(routeInfo.states ?? {})) {
      if (Array.isArray(entries)) {
        for (const file of entries) {
          artifacts.push({ route, path: `${route}/${file}`, operational_class: operationalClass, applied_state: state, historical: true });
        }
      } else {
        for (const [file, details] of Object.entries(entries ?? {})) {
          artifacts.push({
            route,
            path: `${route}/${file}`,
            operational_class: details.operational_class ?? operationalClass,
            applied_state: state,
            historical: true,
            ...details,
          });
        }
      }
    }
  }
  for (const record of registryMigrations(provenanceRegistry)) {
    artifacts.push({ route: "supabase/migrations", historical: false, ...record });
  }
  return artifacts;
}

function posix(path) {
  return path.split(sep).join("/");
}

function walkSql(rootDir, relDir) {
  const absolute = resolve(rootDir, relDir);
  let entries;
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
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
    if (status.startsWith("R") || status.startsWith("C")) {
      return { status, paths: [parts[1], parts[2]].filter(Boolean) };
    }
    return { status, paths: [parts[1]].filter(Boolean) };
  });
}

function isRootSupabaseSql(path) {
  return /^supabase\/[^/]+\.sql$/.test(path);
}

function isUnder(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function canonicalTimestamp(path) {
  const match = /^supabase\/migrations\/(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(path);
  return match?.[1] ?? null;
}

function canonicalMigrationName(path) {
  const file = basename(path);
  const match = /^\d{14}_(.+)\.sql$/.exec(file);
  return match?.[1] ?? null;
}

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
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validSha(value) {
  return SHA_RE.test(value ?? "") && !/^0{40}$/.test(value);
}

function validDateTime(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function validateProvenanceRecord(record) {
  const errors = [];
  const path = record?.path ?? "<sin path>";
  const prefix = `${path}:`;
  const version = canonicalTimestamp(path);
  const expectedName = canonicalMigrationName(path);

  if (!nonEmptyString(record?.path) || !record.path.startsWith("supabase/migrations/") || !CANONICAL_RE.test(basename(record.path))) {
    errors.push(`${prefix} provenance.path debe ser una migración canónica timestamped en supabase/migrations.`);
  }
  if (!validUtcTimestamp(record?.migration_version) || record.migration_version !== version) {
    errors.push(`${prefix} migration_version debe coincidir exactamente con el timestamp UTC del path.`);
  }
  if (record?.operational_class !== "CANONICA") {
    errors.push(`${prefix} operational_class debe ser CANONICA para registros post-CORE-01.`);
  }
  if (!new Set(["PREPARADA_NO_APLICADA", "APLICADA"]).has(record?.applied_state)) {
    errors.push(`${prefix} applied_state post-CORE-01 debe ser PREPARADA_NO_APLICADA o APLICADA.`);
  }

  const provenance = record?.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    errors.push(`${prefix} falta provenance machine-readable obligatoria.`);
    return errors;
  }
  if (provenance.schema_version !== 1) errors.push(`${prefix} provenance.schema_version debe ser 1.`);
  if (!new Set(["AUTHORING", "APPLIED"]).has(provenance.lifecycle_phase)) {
    errors.push(`${prefix} provenance.lifecycle_phase debe ser AUTHORING o APPLIED.`);
  }
  if (!nonEmptyString(provenance.owner)) errors.push(`${prefix} provenance.owner es obligatorio.`);
  if (!FUNC_ID_RE.test(provenance.func_id ?? "")) errors.push(`${prefix} provenance.func_id debe usar formato FUNC-0000.`);

  const authorship = provenance.authorship;
  if (!authorship || typeof authorship !== "object" || Array.isArray(authorship)) {
    errors.push(`${prefix} provenance.authorship es obligatorio.`);
  } else {
    if (authorship.repository !== REPOSITORY) errors.push(`${prefix} authorship.repository debe ser ${REPOSITORY}.`);
    if (!validSha(authorship.base_sha)) errors.push(`${prefix} authorship.base_sha debe ser un SHA real de 40 hex, no placeholder.`);
    if (!Number.isInteger(authorship.pr_number) || authorship.pr_number <= 0) errors.push(`${prefix} authorship.pr_number debe ser entero positivo.`);
  }

  const recovery = provenance.recovery;
  if (!recovery || typeof recovery !== "object" || Array.isArray(recovery)) {
    errors.push(`${prefix} provenance.recovery es obligatorio.`);
  } else {
    if (!new Set(["forward_fix", "rollback", "not_applicable"]).has(recovery.strategy)) {
      errors.push(`${prefix} recovery.strategy inválida.`);
    }
    if (!nonEmptyString(recovery.plan)) errors.push(`${prefix} recovery.plan es obligatorio y no puede estar vacío.`);
  }

  const targets = provenance.intended_targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    errors.push(`${prefix} provenance.intended_targets debe declarar al menos un target previsto.`);
  } else {
    for (const [index, target] of targets.entries()) {
      if (!nonEmptyString(target?.environment)) errors.push(`${prefix} intended_targets[${index}].environment es obligatorio.`);
      if (!PROJECT_REF_RE.test(target?.project_ref ?? "")) errors.push(`${prefix} intended_targets[${index}].project_ref inválido.`);
    }
  }

  if (record?.applied_state === "PREPARADA_NO_APLICADA") {
    if (provenance.lifecycle_phase !== "AUTHORING") {
      errors.push(`${prefix} PREPARADA_NO_APLICADA exige lifecycle_phase=AUTHORING.`);
    }
    if (provenance.application_evidence !== null) {
      errors.push(`${prefix} PREPARADA_NO_APLICADA exige application_evidence=null; no se admite evidencia futura inventada.`);
    }
  }

  if (record?.applied_state === "APLICADA") {
    if (provenance.lifecycle_phase !== "APPLIED") {
      errors.push(`${prefix} APLICADA exige lifecycle_phase=APPLIED.`);
    }
    const evidence = provenance.application_evidence;
    if (!Array.isArray(evidence) || evidence.length === 0) {
      errors.push(`${prefix} APLICADA exige application_evidence con al menos una aplicación confirmada.`);
    } else {
      for (const [index, item] of evidence.entries()) {
        const itemPrefix = `${prefix} application_evidence[${index}]`;
        if (!nonEmptyString(item?.environment)) errors.push(`${itemPrefix}.environment es obligatorio.`);
        if (!PROJECT_REF_RE.test(item?.project_ref ?? "")) errors.push(`${itemPrefix}.project_ref inválido.`);
        if (!validSha(item?.source_commit_sha)) errors.push(`${itemPrefix}.source_commit_sha debe ser un SHA real de 40 hex, no placeholder.`);
        if (item?.ledger?.version !== version) errors.push(`${itemPrefix}.ledger.version debe coincidir con ${version}.`);
        if (item?.ledger?.name !== expectedName) errors.push(`${itemPrefix}.ledger.name debe coincidir con ${expectedName}.`);
        if (!new Set(["github_actions", "manual_release"]).has(item?.deployment?.kind)) errors.push(`${itemPrefix}.deployment.kind inválido.`);
        if (!nonEmptyString(item?.deployment?.reference)) errors.push(`${itemPrefix}.deployment.reference es obligatorio.`);
        if (item?.deployment?.result !== "SUCCESS") errors.push(`${itemPrefix}.deployment.result debe ser SUCCESS.`);
        if (!validDateTime(item?.verified_at)) errors.push(`${itemPrefix}.verified_at debe ser fecha/hora válida.`);
        if (Array.isArray(targets) && !targets.some((target) => target.environment === item?.environment && target.project_ref === item?.project_ref)) {
          errors.push(`${itemPrefix}: entorno/project_ref aplicado debe existir previamente en intended_targets.`);
        }
      }
    }
  }

  return errors;
}

export function validateProvenanceRegistry(registry, schema) {
  const errors = [];
  if (registry?.schema_version !== 1) errors.push(`${PROVENANCE_REGISTRY_PATH}: schema_version debe ser 1.`);
  if (registry?.record_schema !== PROVENANCE_SCHEMA_PATH) errors.push(`${PROVENANCE_REGISTRY_PATH}: record_schema debe apuntar a ${PROVENANCE_SCHEMA_PATH}.`);
  if (schema?.["x-cya-schema-version"] !== 1) errors.push(`${PROVENANCE_SCHEMA_PATH}: x-cya-schema-version debe ser 1.`);
  if (schema?.title !== "CORE-01 post-contract migration provenance") errors.push(`${PROVENANCE_SCHEMA_PATH}: title inesperado; contrato machine-readable no reconocido.`);
  if (!Array.isArray(registry?.migrations)) {
    errors.push(`${PROVENANCE_REGISTRY_PATH}: migrations debe ser un array.`);
    return errors;
  }
  const paths = registry.migrations.map((record) => record?.path).filter(Boolean);
  const duplicates = paths.filter((path, index) => paths.indexOf(path) !== index);
  if (duplicates.length) errors.push(`${PROVENANCE_REGISTRY_PATH}: rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);
  for (const record of registry.migrations) errors.push(...validateProvenanceRecord(record));
  return errors;
}

export function validateChanges(changes, manifest, provenanceRegistry = { schema_version: 1, record_schema: PROVENANCE_SCHEMA_PATH, migrations: [] }, provenanceSchema = { "x-cya-schema-version": 1, title: "CORE-01 post-contract migration provenance" }) {
  const errors = [...validateProvenanceRegistry(provenanceRegistry, provenanceSchema)];
  const artifacts = manifestArtifacts(manifest, provenanceRegistry);
  const artifactByPath = new Map(artifacts.map((a) => [a.path, a]));
  const addedCanonical = [];

  for (const change of changes) {
    for (const path of change.paths) {
      if (!path) continue;

      if (isUnder(path, "db/migrations")) {
        errors.push(`${path}: db/migrations está congelado; no admite altas, cambios, renombres ni borrados.`);
        continue;
      }

      if (isUnder(path, "supabase/applied-history")) {
        errors.push(`${path}: applied-history documental está congelado y no puede actuar como segunda ruta de migración.`);
        continue;
      }

      if (isRootSupabaseSql(path)) {
        errors.push(`${path}: SQL raíz de Supabase es bootstrap/compatibilidad y está congelado para nueva autoría de migraciones.`);
        continue;
      }

      if (isUnder(path, "supabase/migrations") && path.endsWith(".sql")) {
        if (change.status.startsWith("A")) {
          const file = path.slice("supabase/migrations/".length);
          if (!CANONICAL_RE.test(file)) {
            errors.push(`${path}: toda migración nueva debe llamarse YYYYMMDDHHMMSS_descripcion_snake_case.sql.`);
            continue;
          }
          const timestamp = canonicalTimestamp(path);
          if (!validUtcTimestamp(timestamp)) {
            errors.push(`${path}: el prefijo debe ser una fecha/hora UTC válida (YYYYMMDDHHMMSS).`);
            continue;
          }
          const artifact = artifactByPath.get(path);
          if (!artifact) {
            errors.push(`${path}: falta registrar la nueva migración en el inventario machine-readable ${PROVENANCE_REGISTRY_PATH}.`);
            continue;
          }
          if (artifact.operational_class !== "CANONICA") {
            errors.push(`${path}: una migración nueva debe clasificarse CANONICA.`);
          }
          if (artifact.applied_state !== "PREPARADA_NO_APLICADA") {
            errors.push(`${path}: una migración añadida en este PR debe comenzar PREPARADA_NO_APLICADA; la evidencia APLICADA se registra después de la aplicación real.`);
          }
          errors.push(...validateProvenanceRecord(artifact));
          addedCanonical.push(path);
        } else {
          errors.push(`${path}: las migraciones existentes son inmutables; corrige hacia delante con una nueva migración canónica.`);
        }
      }
    }
  }

  const addedTimestamps = addedCanonical.map(canonicalTimestamp).filter(Boolean);
  const unique = new Set(addedTimestamps);
  if (unique.size !== addedTimestamps.length) {
    errors.push("Las nuevas migraciones reutilizan un timestamp UTC de 14 dígitos.");
  }

  const historicalTimestamps = artifacts
    .filter((a) => a.path.startsWith("supabase/migrations/") && !addedCanonical.includes(a.path))
    .map((a) => canonicalTimestamp(a.path))
    .filter(Boolean);
  const maxHistorical = historicalTimestamps.sort().at(-1) ?? null;
  const ledgerFloor = manifest?.staging_ledger_summary?.last_version ?? null;
  const floor = [maxHistorical, ledgerFloor].filter((value) => /^\d{14}$/.test(value ?? "")).sort().at(-1) ?? null;
  if (floor) {
    for (const ts of addedTimestamps) {
      if (ts <= floor) {
        errors.push(`Timestamp ${ts}: debe ser posterior al máximo histórico/ledger ${floor}; no se admiten migraciones nuevas retrodatadas.`);
      }
    }
  }

  return [...new Set(errors)];
}

export function validateInventory(actualByRoute, manifest, provenanceRegistry = { schema_version: 1, record_schema: PROVENANCE_SCHEMA_PATH, migrations: [] }, provenanceSchema = { "x-cya-schema-version": 1, title: "CORE-01 post-contract migration provenance" }) {
  const errors = [...validateProvenanceRegistry(provenanceRegistry, provenanceSchema)];
  if (Array.isArray(manifest?.canonical_pending) && manifest.canonical_pending.length > 0) {
    errors.push("canonical_pending ya no es una vía válida: toda migración post-CORE-01 debe vivir en el registro machine-readable de provenance.");
  }
  const artifacts = manifestArtifacts(manifest, provenanceRegistry);
  const paths = artifacts.map((a) => a.path);
  const duplicates = paths.filter((path, idx) => paths.indexOf(path) !== idx);
  if (duplicates.length) errors.push(`Manifiesto/registro con rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);

  for (const route of ROUTES) {
    const actual = [...(actualByRoute[route] ?? [])].sort();
    const declared = artifacts.filter((a) => a.route === route).map((a) => a.path).sort();
    const actualSet = new Set(actual);
    const declaredSet = new Set(declared);

    for (const path of actual) {
      if (!declaredSet.has(path)) errors.push(`${path}: SQL presente en ${route} pero ausente del inventario combinado histórico/provenance.`);
    }
    for (const path of declared) {
      if (!actualSet.has(path)) errors.push(`${path}: declarado en inventario/provenance pero ausente del repositorio.`);
    }
  }

  const allowedOperational = new Set(["CANONICA", "BOOTSTRAP", "COMPATIBILIDAD", "DUPLICADO_DOCUMENTAL", "RETIRADA", "DESCONOCIDA"]);
  const allowedApplied = new Set(["APLICADA", "PREPARADA_NO_APLICADA", "DESCONOCIDA"]);
  for (const artifact of artifacts) {
    if (!allowedOperational.has(artifact.operational_class)) {
      errors.push(`${artifact.path}: operational_class inválida o ausente.`);
    }
    if (!allowedApplied.has(artifact.applied_state)) {
      errors.push(`${artifact.path}: applied_state inválido o ausente.`);
    }
  }

  const futureRoute = manifest?.canonical_contract?.future_route;
  if (futureRoute !== "supabase/migrations") {
    errors.push("El manifiesto debe declarar supabase/migrations como única ruta canónica futura.");
  }
  if (manifest?.staging_ledger_summary?.source !== "supabase_migrations.schema_migrations") {
    errors.push("El manifiesto debe identificar supabase_migrations.schema_migrations como applied-history real de STAGING.");
  }
  const totals = manifest?.inventory_totals;
  if (totals) {
    const historical = manifestArtifacts(manifest, { migrations: [] });
    const states = Object.fromEntries(["APLICADA", "PREPARADA_NO_APLICADA", "DESCONOCIDA"].map((state) => [state, historical.filter((a) => a.applied_state === state).length]));
    if (totals.artifacts !== historical.length) errors.push(`inventory_totals.artifacts=${totals.artifacts} no coincide con snapshot histórico ${historical.length}.`);
    for (const [state, count] of Object.entries(states)) {
      if (totals[state] !== count) errors.push(`inventory_totals.${state}=${totals[state]} no coincide con snapshot histórico ${count}.`);
    }
  }

  return [...new Set(errors)];
}

export function validateCanonicalTimestamps(files) {
  const errors = [];
  const timestamps = new Map();
  for (const path of files) {
    const ts = canonicalTimestamp(path);
    if (!ts) continue;
    const previous = timestamps.get(ts);
    if (previous) errors.push(`Timestamp canónico duplicado ${ts}: ${previous} y ${path}`);
    else timestamps.set(ts, path);
  }
  return errors;
}

function gitChanges(base) {
  const output = execFileSync("git", ["diff", "--name-status", "-M", `${base}...HEAD`], { encoding: "utf8" });
  return parseNameStatus(output);
}

function main() {
  const rootDir = process.cwd();
  const manifest = JSON.parse(readFileSync(resolve(rootDir, MANIFEST_PATH), "utf8"));
  const provenanceRegistry = JSON.parse(readFileSync(resolve(rootDir, PROVENANCE_REGISTRY_PATH), "utf8"));
  const provenanceSchema = JSON.parse(readFileSync(resolve(rootDir, PROVENANCE_SCHEMA_PATH), "utf8"));
  const actualByRoute = Object.fromEntries(ROUTES.map((route) => [route, walkSql(rootDir, route)]));

  let errors = [
    ...validateInventory(actualByRoute, manifest, provenanceRegistry, provenanceSchema),
    ...validateCanonicalTimestamps(actualByRoute["supabase/migrations"]),
  ];

  const baseIndex = process.argv.indexOf("--base");
  if (baseIndex >= 0) {
    const base = process.argv[baseIndex + 1];
    if (!base) errors.push("--base requiere SHA/ref.");
    else errors = [...errors, ...validateChanges(gitChanges(base), manifest, provenanceRegistry, provenanceSchema)];
  }

  errors = [...new Set(errors)];
  if (errors.length) {
    console.error("CORE-01 MIGRATION GOVERNANCE: FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const counts = Object.fromEntries(ROUTES.map((route) => [route, actualByRoute[route].length]));
  console.log("CORE-01 MIGRATION GOVERNANCE: PASS");
  console.log(`Canonical future route: ${manifest.canonical_contract.future_route}`);
  console.log(`Historical inventory: db/migrations=${counts["db/migrations"]}; supabase/migrations=${counts["supabase/migrations"]}`);
  console.log(`Post-CORE-01 provenance records: ${registryMigrations(provenanceRegistry).length}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
