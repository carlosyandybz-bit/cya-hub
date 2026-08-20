#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const CANONICAL_RE = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MANIFEST_PATH = "docs/CORE_01_MIGRATION_INVENTORY.json";
const ROUTES = ["db/migrations", "supabase/migrations"];

export function manifestArtifacts(manifest) {
  if (Array.isArray(manifest.artifacts)) return manifest.artifacts;
  const artifacts = [];
  for (const [route, routeInfo] of Object.entries(manifest.inventory ?? {})) {
    const operationalClass = routeInfo.historical_operational_class;
    for (const [state, entries] of Object.entries(routeInfo.states ?? {})) {
      if (Array.isArray(entries)) {
        for (const file of entries) {
          artifacts.push({ route, path: `${route}/${file}`, operational_class: operationalClass, applied_state: state });
        }
      } else {
        for (const [file, details] of Object.entries(entries ?? {})) {
          artifacts.push({
            route,
            path: `${route}/${file}`,
            operational_class: details.operational_class ?? operationalClass,
            applied_state: state,
            ...details,
          });
        }
      }
    }
  }
  for (const pending of manifest.canonical_pending ?? []) {
    artifacts.push({ route: "supabase/migrations", operational_class: "CANONICA", applied_state: "PREPARADA_NO_APLICADA", ...pending });
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

export function validateChanges(changes, manifest) {
  const errors = [];
  const artifacts = manifestArtifacts(manifest);
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
            errors.push(`${path}: falta registrar la nueva migración en ${MANIFEST_PATH}.`);
            continue;
          }
          if (artifact.operational_class !== "CANONICA") {
            errors.push(`${path}: una migración nueva debe clasificarse CANONICA en el manifiesto.`);
          }
          if (artifact.applied_state !== "PREPARADA_NO_APLICADA") {
            errors.push(`${path}: antes de aplicación debe constar PREPARADA_NO_APLICADA.`);
          }
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

  return errors;
}

export function validateInventory(actualByRoute, manifest) {
  const errors = [];
  const artifacts = manifestArtifacts(manifest);
  const paths = artifacts.map((a) => a.path);
  const duplicates = paths.filter((path, idx) => paths.indexOf(path) !== idx);
  if (duplicates.length) errors.push(`Manifiesto con rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);

  for (const route of ROUTES) {
    const actual = [...(actualByRoute[route] ?? [])].sort();
    const declared = artifacts.filter((a) => a.route === route).map((a) => a.path).sort();
    const actualSet = new Set(actual);
    const declaredSet = new Set(declared);

    for (const path of actual) {
      if (!declaredSet.has(path)) errors.push(`${path}: SQL presente en ${route} pero ausente del manifiesto.`);
    }
    for (const path of declared) {
      if (!actualSet.has(path)) errors.push(`${path}: declarado en manifiesto pero ausente del repositorio.`);
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
    const states = Object.fromEntries(["APLICADA", "PREPARADA_NO_APLICADA", "DESCONOCIDA"].map((state) => [state, artifacts.filter((a) => a.applied_state === state).length]));
    if (totals.artifacts !== artifacts.length) errors.push(`inventory_totals.artifacts=${totals.artifacts} no coincide con ${artifacts.length}.`);
    for (const [state, count] of Object.entries(states)) {
      if (totals[state] !== count) errors.push(`inventory_totals.${state}=${totals[state]} no coincide con ${count}.`);
    }
  }

  return errors;
}

export function validateCanonicalTimestamps(files) {
  const errors = [];
  const timestamps = new Map();
  for (const path of files) {
    const ts = canonicalTimestamp(path);
    if (!ts) continue; // grandfathered historical v*.sql
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
  const actualByRoute = Object.fromEntries(ROUTES.map((route) => [route, walkSql(rootDir, route)]));

  let errors = [
    ...validateInventory(actualByRoute, manifest),
    ...validateCanonicalTimestamps(actualByRoute["supabase/migrations"]),
  ];

  const baseIndex = process.argv.indexOf("--base");
  if (baseIndex >= 0) {
    const base = process.argv[baseIndex + 1];
    if (!base) errors.push("--base requiere SHA/ref.");
    else errors = [...errors, ...validateChanges(gitChanges(base), manifest)];
  }

  if (errors.length) {
    console.error("CORE-01 MIGRATION GOVERNANCE: FAIL");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  const counts = Object.fromEntries(ROUTES.map((route) => [route, actualByRoute[route].length]));
  console.log("CORE-01 MIGRATION GOVERNANCE: PASS");
  console.log(`Canonical future route: ${manifest.canonical_contract.future_route}`);
  console.log(`Inventory: db/migrations=${counts["db/migrations"]}; supabase/migrations=${counts["supabase/migrations"]}`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) main();
