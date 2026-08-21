#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CORE01_REPOSITORY,
  compileJsonSchema,
  safeErrorMessage,
  validateEvidenceArtifactSchema,
} from "./core01-provenance.mjs";
import {
  CORE02_DEPLOYMENT_EVIDENCE_FILE,
  CORE02_DEPLOYMENT_WORKFLOW,
  CORE02_DEPLOYMENT_WORKFLOW_PATH,
  CORE02_STAGING_PROJECT_REF,
  CORE02_SOURCE_REGISTRY_PATH,
  assertCore02TrustedContext,
  assertCore02LedgerAbsent,
  validateCore02LedgerRow,
  buildCore02AtomicApplySql,
  core02DeploymentArtifactName,
  validateCore02SourceData,
} from "./verify-migration-source-data.mjs";

const RECORD_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const DEPLOYMENT_SCHEMA_PATH = "docs/CORE_01_DEPLOYMENT_EVIDENCE.schema.json";

function required(value, label) { if (!value) throw new Error(`${label} es obligatorio.`); return value; }
function githubHeaders(token) { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }; }
async function githubJson(url, token, label) { const response = await fetch(url, { headers: githubHeaders(token) }); if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`); return response.json(); }
async function githubCommit(sha, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/commits/${sha}`, token, "source commit no corroborable"); }
async function githubPull(pr, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/pulls/${pr}`, token, `PR #${pr} no corroborable`); }
async function githubPullFiles(pr, token, apiUrl) {
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/pulls/${pr}/files?per_page=100&page=${page}`, token, `archivos PR #${pr} no corroborables`);
    if (!Array.isArray(batch)) throw new Error("GitHub no devolvió files[] para el PR.");
    files.push(...batch);
    if (batch.length < 100) return files;
  }
  throw new Error("PR excede el límite CORE-02 de 1000 archivos.");
}
async function githubContent(path, sha, token, apiUrl) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/contents/${encoded}?ref=${encodeURIComponent(sha)}`, token, `${path} no corroborable en source SHA`);
}
async function githubBranchStaging(token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/branches/staging`, token, "staging ref no corroborable"); }
async function githubRun(runId, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}`, token, `run ${runId} no corroborable`); }

function checkoutSha(rootDir) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function queryLedger(databaseUrl, version) {
  const sql = `select version::text || E'\\t' || name::text from supabase_migrations.schema_migrations where version::text = '${version}' order by version limit 1;`;
  try {
    const output = execFileSync("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1", "--command", sql], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PGDATABASE: databaseUrl },
    }).trim();
    if (!output) return null;
    const [rowVersion, rowName] = output.split("\t");
    return { version: rowVersion, name: rowName };
  } catch { throw new Error("No se pudo consultar el ledger STAGING."); }
}

function applyAtomic(databaseUrl, sql) {
  try {
    execFileSync("psql", ["--no-psqlrc", "--set=ON_ERROR_STOP=1", "--single-transaction", "--command", sql], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PGDATABASE: databaseUrl },
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch { throw new Error("La aplicación atómica de la migración falló; la transacción fue abortada."); }
}

async function loadSource(rootDir, context, token, apiUrl) {
  const recordSchema = JSON.parse(readFileSync(resolve(rootDir, RECORD_SCHEMA_PATH), "utf8"));
  const compiledRecordValidator = compileJsonSchema(recordSchema, rootDir);
  return validateCore02SourceData({
    sourceCommitSha: context.sourceCommitSha,
    prNumber: context.prNumber,
    trustedBaseSha: context.trustedPipelineSha,
    projectRef: CORE02_STAGING_PROJECT_REF,
    requireCurrentPrBase: true,
    recordSchema,
    compiledRecordValidator,
    rootDir,
  }, {
    getCommit: (sha) => githubCommit(sha, token, apiUrl),
    getPullRequest: (pr) => githubPull(pr, token, apiUrl),
    listPullRequestFiles: (pr) => githubPullFiles(pr, token, apiUrl),
    getContent: (path, sha) => githubContent(path, sha, token, apiUrl),
  });
}

async function assertTrustedStagingIsCurrent(context, token, apiUrl) {
  const branch = await githubBranchStaging(token, apiUrl);
  if (branch?.name !== "staging" || branch?.commit?.sha !== context.trustedPipelineSha) throw new Error("El tag Release no apunta al HEAD actual de staging; deployment cancelado antes de secretos/SQL.");
}

async function preflight(rootDir, context, token, apiUrl) {
  if (checkoutSha(rootDir) !== context.trustedPipelineSha) throw new Error("Checkout trusted no coincide con GITHUB_SHA/GITHUB_WORKFLOW_SHA.");
  await assertTrustedStagingIsCurrent(context, token, apiUrl);
  const source = await loadSource(rootDir, context, token, apiUrl);
  console.log(`CORE-02 PRE-APPLY: PASS ${source.migrationPath}`);
  console.log(`Source: PR #${source.prNumber} @ ${source.sourceCommitSha}`);
  console.log(`Target: staging/${CORE02_STAGING_PROJECT_REF}`);
  return source;
}

async function apply(rootDir, context, token, apiUrl) {
  const source = await preflight(rootDir, context, token, apiUrl);
  const databaseUrl = required(process.env.CORE01_STAGING_DATABASE_URL, "CORE01_STAGING_DATABASE_URL");
  const before = queryLedger(databaseUrl, source.migrationVersion);
  assertCore02LedgerAbsent(before);
  const atomicSql = buildCore02AtomicApplySql(source);
  applyAtomic(databaseUrl, atomicSql);
  const after = queryLedger(databaseUrl, source.migrationVersion);
  validateCore02LedgerRow(after, source);

  const runIdText = required(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  if (!/^[1-9][0-9]*$/.test(runIdText)) throw new Error("GITHUB_RUN_ID inválido.");
  const runId = Number(runIdText);
  if (!Number.isSafeInteger(runId)) throw new Error("GITHUB_RUN_ID fuera de rango.");
  const run = await githubRun(runId, token, apiUrl);
  if (Number(run?.id) !== runId || run?.repository?.full_name !== CORE01_REPOSITORY) throw new Error("Deployment run no pertenece al repositorio/run esperado.");
  if (run?.name !== CORE02_DEPLOYMENT_WORKFLOW || run?.path !== CORE02_DEPLOYMENT_WORKFLOW_PATH || run?.event !== "push") throw new Error("Deployment run no corresponde al workflow trusted CORE-02.");
  if (run?.head_sha !== context.trustedPipelineSha) throw new Error("Deployment run head_sha no coincide con trusted pipeline SHA.");
  const workflowId = Number(run?.workflow_id);
  if (!Number.isSafeInteger(workflowId) || workflowId <= 0) throw new Error("Deployment workflow_id real inválido.");

  const artifact = {
    contract: "CORE-02-DEPLOYMENT-EVIDENCE",
    schema_version: 1,
    artifact_name: core02DeploymentArtifactName(runId),
    repository: CORE01_REPOSITORY,
    environment: "staging",
    project_ref: CORE02_STAGING_PROJECT_REF,
    pr_number: source.prNumber,
    source_commit_sha: source.sourceCommitSha,
    migration_path: source.migrationPath,
    migration_version: source.migrationVersion,
    migration_name: source.migrationName,
    source_blob_sha: source.sourceBlobSha,
    source_sha256: source.sourceSha256,
    trusted_pipeline_sha: context.trustedPipelineSha,
    trigger_ref: context.triggerRef,
    deployment: { kind: "github_actions", run_id: runId, workflow_id: workflowId, workflow: CORE02_DEPLOYMENT_WORKFLOW, workflow_path: CORE02_DEPLOYMENT_WORKFLOW_PATH },
    ledger: { version: after.version, name: after.name },
    recovery: "forward_fix",
    applied_at: new Date().toISOString(),
  };
  const schema = JSON.parse(readFileSync(resolve(rootDir, DEPLOYMENT_SCHEMA_PATH), "utf8"));
  const compiled = compileJsonSchema(schema, rootDir);
  const schemaErrors = validateEvidenceArtifactSchema(artifact, schema, rootDir, compiled);
  if (schemaErrors.length) throw new Error(`Deployment evidence inválida: ${schemaErrors.join(" | ")}`);
  writeFileSync(resolve(rootDir, CORE02_DEPLOYMENT_EVIDENCE_FILE), `${JSON.stringify(artifact, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`CORE-02 APPLY: PASS ${source.migrationPath}`);
  console.log(`Ledger: ${after.version}/${after.name}`);
  console.log(`Deployment run: ${runId}; workflow_id: ${workflowId}`);
}

async function main() {
  const mode = process.argv[2];
  if (!new Set(["--preflight", "--apply"]).has(mode)) throw new Error("Uso: verify-migration-deployment.mjs --preflight|--apply");
  const context = assertCore02TrustedContext(process.env, "deploy");
  const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const rootDir = process.cwd();
  if (mode === "--preflight") await preflight(rootDir, context, token, apiUrl);
  else await apply(rootDir, context, token, apiUrl);
}

try { await main(); }
catch (error) { console.error("CORE-02 DEPLOYMENT: FAIL"); console.error(safeErrorMessage(error)); process.exit(1); }
