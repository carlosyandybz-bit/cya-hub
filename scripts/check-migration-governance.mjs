#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE01_SCHEMA_VERSION, compileProvenanceSchema, loadGitHubAuthoringContext, validateContextualProvenance, validateRecordSchema, validateRecordSemantics } from "./core01-provenance.mjs";

export const CANONICAL_RE = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const MANIFEST_PATH = "docs/CORE_01_MIGRATION_INVENTORY.json";
const PROVENANCE_REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
const PROVENANCE_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const ROUTES = ["db/migrations", "supabase/migrations"];
function registryMigrations(registry) { return Array.isArray(registry?.migrations) ? registry.migrations : []; }

export function manifestArtifacts(manifest, provenanceRegistry = { migrations: [] }) {
  const artifacts = [];
  for (const [route, routeInfo] of Object.entries(manifest.inventory ?? {})) {
    const operationalClass = routeInfo.historical_operational_class;
    for (const [state, entries] of Object.entries(routeInfo.states ?? {})) {
      if (Array.isArray(entries)) for (const file of entries) artifacts.push({ route, path: `${route}/${file}`, operational_class: operationalClass, applied_state: state, historical: true });
      else for (const [file, details] of Object.entries(entries ?? {})) artifacts.push({ route, path: `${route}/${file}`, operational_class: details.operational_class ?? operationalClass, applied_state: state, historical: true, ...details });
    }
  }
  for (const record of registryMigrations(provenanceRegistry)) artifacts.push({ route: "supabase/migrations", historical: false, ...record });
  return artifacts;
}
function posix(path) { return path.split(sep).join("/"); }
function walkSql(rootDir, relDir) {
  const absolute = resolve(rootDir, relDir); let entries;
  try { entries = readdirSync(absolute); } catch { return []; }
  const files = [];
  for (const entry of entries) { const full = resolve(absolute, entry); const rel = posix(relative(rootDir, full)); const st = statSync(full); if (st.isDirectory()) files.push(...walkSql(rootDir, rel)); else if (entry.endsWith(".sql")) files.push(rel); }
  return files.sort();
}
export function parseNameStatus(output) {
  if (!output.trim()) return [];
  return output.trim().split(/\r?\n/).map((line) => { const parts = line.split("\t"); const status = parts[0]; if (status.startsWith("R") || status.startsWith("C")) return { status, paths: [parts[1], parts[2]].filter(Boolean) }; return { status, paths: [parts[1]].filter(Boolean) }; });
}
function isRootSupabaseSql(path) { return /^supabase\/[^/]+\.sql$/.test(path); }
function isUnder(path, prefix) { return path === prefix || path.startsWith(`${prefix}/`); }
function canonicalTimestamp(path) { return /^supabase\/migrations\/(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/.exec(path)?.[1] ?? null; }
function validUtcTimestamp(value) {
  if (!/^\d{14}$/.test(value ?? "")) return false;
  const year=Number(value.slice(0,4)), month=Number(value.slice(4,6)), day=Number(value.slice(6,8)), hour=Number(value.slice(8,10)), minute=Number(value.slice(10,12)), second=Number(value.slice(12,14));
  if (month<1||month>12||day<1||day>31||hour>23||minute>59||second>59) return false;
  const date=new Date(Date.UTC(year,month-1,day,hour,minute,second));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day&&date.getUTCHours()===hour&&date.getUTCMinutes()===minute&&date.getUTCSeconds()===second;
}
export function validateProvenanceRecord(record, provenanceSchema, options={}) {
  if (!provenanceSchema) throw new Error("validateProvenanceRecord exige el JSON Schema real.");
  return [...validateRecordSchema(record, provenanceSchema, options.rootDir??process.cwd(), options.compiledValidator??null), ...validateRecordSemantics(record)];
}
export function validateProvenanceRegistry(registry, schema, options={}) {
  const errors=[];
  if (registry?.schema_version!==CORE01_SCHEMA_VERSION) errors.push(`${PROVENANCE_REGISTRY_PATH}: schema_version debe ser ${CORE01_SCHEMA_VERSION}.`);
  if (registry?.record_schema!==PROVENANCE_SCHEMA_PATH) errors.push(`${PROVENANCE_REGISTRY_PATH}: record_schema debe apuntar a ${PROVENANCE_SCHEMA_PATH}.`);
  if (schema?.["x-cya-schema-version"]!==CORE01_SCHEMA_VERSION) errors.push(`${PROVENANCE_SCHEMA_PATH}: x-cya-schema-version debe ser ${CORE01_SCHEMA_VERSION}.`);
  if (schema?.title!=="CORE-01 post-contract migration provenance") errors.push(`${PROVENANCE_SCHEMA_PATH}: title inesperado; contrato machine-readable no reconocido.`);
  if (!Array.isArray(registry?.migrations)) { errors.push(`${PROVENANCE_REGISTRY_PATH}: migrations debe ser un array.`); return errors; }
  let compiledValidator=options.compiledValidator??null;
  if (!compiledValidator) { try { compiledValidator=compileProvenanceSchema(schema, options.rootDir??process.cwd()); } catch(error) { errors.push(`${PROVENANCE_SCHEMA_PATH}: no pudo compilarse con Ajv Draft 2020-12 (${error.message}).`); return errors; } }
  const paths=registry.migrations.map(r=>r?.path).filter(Boolean), duplicates=paths.filter((p,i)=>paths.indexOf(p)!==i);
  if (duplicates.length) errors.push(`${PROVENANCE_REGISTRY_PATH}: rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);
  for (const record of registry.migrations) errors.push(...validateProvenanceRecord(record,schema,{...options,compiledValidator}));
  return errors;
}
export function validateChanges(changes, manifest, provenanceRegistry, provenanceSchema, options={}) {
  const errors=[...validateProvenanceRegistry(provenanceRegistry,provenanceSchema,options)], artifacts=manifestArtifacts(manifest,provenanceRegistry), artifactByPath=new Map(artifacts.map(a=>[a.path,a])), addedCanonical=[];
  for (const change of changes) for (const path of change.paths) {
    if (!path) continue;
    if (isUnder(path,"db/migrations")) { errors.push(`${path}: db/migrations está congelado; no admite altas, cambios, renombres ni borrados.`); continue; }
    if (isUnder(path,"supabase/applied-history")) { errors.push(`${path}: applied-history documental está congelado y no puede actuar como segunda ruta de migración.`); continue; }
    if (isRootSupabaseSql(path)) { errors.push(`${path}: SQL raíz de Supabase es bootstrap/compatibilidad y está congelado para nueva autoría de migraciones.`); continue; }
    if (isUnder(path,"supabase/migrations")&&path.endsWith(".sql")) {
      if (change.status.startsWith("A")) {
        const file=path.slice("supabase/migrations/".length); if (!CANONICAL_RE.test(file)) { errors.push(`${path}: toda migración nueva debe llamarse YYYYMMDDHHMMSS_descripcion_snake_case.sql.`); continue; }
        const timestamp=canonicalTimestamp(path); if (!validUtcTimestamp(timestamp)) { errors.push(`${path}: el prefijo debe ser una fecha/hora UTC válida (YYYYMMDDHHMMSS).`); continue; }
        const artifact=artifactByPath.get(path); if (!artifact) { errors.push(`${path}: falta registrar la nueva migración en ${PROVENANCE_REGISTRY_PATH}.`); continue; }
        if (artifact.operational_class!=="CANONICA") errors.push(`${path}: una migración nueva debe clasificarse CANONICA.`);
        if (artifact.applied_state!=="PREPARADA_NO_APLICADA") errors.push(`${path}: una migración añadida en este PR debe comenzar PREPARADA_NO_APLICADA; APLICADA solo puede promoverse tras Release/post-apply.`);
        addedCanonical.push(path);
      } else errors.push(`${path}: las migraciones existentes son inmutables; corrige hacia delante con una nueva migración canónica.`);
    }
  }
  const addedTimestamps=addedCanonical.map(canonicalTimestamp).filter(Boolean); if(new Set(addedTimestamps).size!==addedTimestamps.length) errors.push("Las nuevas migraciones reutilizan un timestamp UTC de 14 dígitos.");
  const historicalTimestamps=artifacts.filter(a=>a.path.startsWith("supabase/migrations/")&&!addedCanonical.includes(a.path)).map(a=>canonicalTimestamp(a.path)).filter(Boolean), maxHistorical=historicalTimestamps.sort().at(-1)??null, ledgerFloor=manifest?.staging_ledger_summary?.last_version??null, floor=[maxHistorical,ledgerFloor].filter(v=>/^\d{14}$/.test(v??"")).sort().at(-1)??null;
  if(floor) for(const ts of addedTimestamps) if(ts<=floor) errors.push(`Timestamp ${ts}: debe ser posterior al máximo histórico/ledger ${floor}; no se admiten migraciones nuevas retrodatadas.`);
  return [...new Set(errors)];
}
export function validateInventory(actualByRoute, manifest, provenanceRegistry, provenanceSchema, options={}) {
  const errors=[...validateProvenanceRegistry(provenanceRegistry,provenanceSchema,options)];
  if(Array.isArray(manifest?.canonical_pending)&&manifest.canonical_pending.length>0) errors.push("canonical_pending ya no es una vía válida: toda migración post-CORE-01 debe vivir en el registro machine-readable de provenance.");
  const artifacts=manifestArtifacts(manifest,provenanceRegistry), paths=artifacts.map(a=>a.path), duplicates=paths.filter((p,i)=>paths.indexOf(p)!==i); if(duplicates.length) errors.push(`Manifiesto/registro con rutas duplicadas: ${[...new Set(duplicates)].join(", ")}`);
  for(const route of ROUTES){const actual=[...(actualByRoute[route]??[])].sort(),declared=artifacts.filter(a=>a.route===route).map(a=>a.path).sort(),actualSet=new Set(actual),declaredSet=new Set(declared);for(const path of actual)if(!declaredSet.has(path))errors.push(`${path}: SQL presente en ${route} pero ausente del inventario combinado histórico/provenance.`);for(const path of declared)if(!actualSet.has(path))errors.push(`${path}: declarado en inventario/provenance pero ausente del repositorio.`);}
  const allowedOperational=new Set(["CANONICA","BOOTSTRAP","COMPATIBILIDAD","DUPLICADO_DOCUMENTAL","RETIRADA","DESCONOCIDA"]),allowedApplied=new Set(["APLICADA","PREPARADA_NO_APLICADA","DESCONOCIDA"]);for(const artifact of artifacts){if(!allowedOperational.has(artifact.operational_class))errors.push(`${artifact.path}: operational_class inválida o ausente.`);if(!allowedApplied.has(artifact.applied_state))errors.push(`${artifact.path}: applied_state inválido o ausente.`);}
  if(manifest?.canonical_contract?.future_route!=="supabase/migrations")errors.push("El manifiesto debe declarar supabase/migrations como única ruta canónica futura.");if(manifest?.staging_ledger_summary?.source!=="supabase_migrations.schema_migrations")errors.push("El manifiesto debe identificar supabase_migrations.schema_migrations como applied-history real de STAGING.");
  const totals=manifest?.inventory_totals;if(totals){const historical=manifestArtifacts(manifest,{migrations:[]}),states=Object.fromEntries(["APLICADA","PREPARADA_NO_APLICADA","DESCONOCIDA"].map(state=>[state,historical.filter(a=>a.applied_state===state).length]));if(totals.artifacts!==historical.length)errors.push(`inventory_totals.artifacts=${totals.artifacts} no coincide con snapshot histórico ${historical.length}.`);for(const [state,count] of Object.entries(states))if(totals[state]!==count)errors.push(`inventory_totals.${state}=${totals[state]} no coincide con snapshot histórico ${count}.`);}
  return [...new Set(errors)];
}
export function validateCanonicalTimestamps(files){const errors=[],timestamps=new Map();for(const path of files){const ts=canonicalTimestamp(path);if(!ts)continue;const previous=timestamps.get(ts);if(previous)errors.push(`Timestamp canónico duplicado ${ts}: ${previous} y ${path}`);else timestamps.set(ts,path);}return errors;}
export async function validateContextAgainstGitHub(records,changes,context,options={}){const addedPaths=new Set();for(const change of changes)for(const path of change.paths)if(change.status.startsWith("A")&&isUnder(path,"supabase/migrations")&&path.endsWith(".sql"))addedPaths.add(path);const errors=[];for(const record of records)errors.push(...await validateContextualProvenance(record,context,{...options,isNewMigration:addedPaths.has(record.path)}));return [...new Set(errors)];}
function gitChanges(base){return parseNameStatus(execFileSync("git",["diff","--name-status","-M",`${base}...HEAD`],{encoding:"utf8"}));}
async function main(){const rootDir=process.cwd(),manifest=JSON.parse(readFileSync(resolve(rootDir,MANIFEST_PATH),"utf8")),provenanceRegistry=JSON.parse(readFileSync(resolve(rootDir,PROVENANCE_REGISTRY_PATH),"utf8")),provenanceSchema=JSON.parse(readFileSync(resolve(rootDir,PROVENANCE_SCHEMA_PATH),"utf8"));let compiledValidator;try{compiledValidator=compileProvenanceSchema(provenanceSchema,rootDir);}catch(error){console.error(`CORE-01 MIGRATION GOVERNANCE: FAIL\n- JSON Schema Draft 2020-12 no compilable con Ajv: ${error.message}`);process.exit(1);}const validationOptions={rootDir,compiledValidator},actualByRoute=Object.fromEntries(ROUTES.map(route=>[route,walkSql(rootDir,route)]));let errors=[...validateInventory(actualByRoute,manifest,provenanceRegistry,provenanceSchema,validationOptions),...validateCanonicalTimestamps(actualByRoute["supabase/migrations"])];const baseIndex=process.argv.indexOf("--base"),base=baseIndex>=0?process.argv[baseIndex+1]:null;let changes=[];if(baseIndex>=0&&!base)errors.push("--base requiere SHA/ref.");if(base){changes=gitChanges(base);errors.push(...validateChanges(changes,manifest,provenanceRegistry,provenanceSchema,validationOptions));}if(process.env.GITHUB_ACTIONS==="true"){try{const context=loadGitHubAuthoringContext();errors.push(...await validateContextAgainstGitHub(registryMigrations(provenanceRegistry),changes,context,{cwd:rootDir}));}catch(error){errors.push(`Contexto Git/GitHub no corroborable: ${error.message}`);}}errors=[...new Set(errors)];if(errors.length){console.error("CORE-01 MIGRATION GOVERNANCE: FAIL");for(const error of errors)console.error(`- ${error}`);process.exit(1);}const counts=Object.fromEntries(ROUTES.map(route=>[route,actualByRoute[route].length]));console.log("CORE-01 MIGRATION GOVERNANCE: PASS");console.log(`JSON Schema: Draft 2020-12 / Ajv / schema v${CORE01_SCHEMA_VERSION}`);console.log(`Canonical future route: ${manifest.canonical_contract.future_route}`);console.log(`Historical inventory: db/migrations=${counts["db/migrations"]}; supabase/migrations=${counts["supabase/migrations"]}`);console.log(`Post-CORE-01 provenance records: ${registryMigrations(provenanceRegistry).length}`);if(process.env.GITHUB_ACTIONS==="true")console.log("Authoring provenance: corroborated against Git/GitHub context; APPLIED requires successful post-apply verification run.");}
const isMain=process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url));if(isMain)await main();
