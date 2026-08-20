#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CORE01_EVIDENCE_FILE,
  CORE01_REPOSITORY,
  CORE01_TRUSTED_REF,
  assertTrustedReleaseContext,
  compileJsonSchema,
  safeErrorMessage,
  validateEvidenceArtifactSchema,
  validatePostApplyInputs,
  validateRecordSchema,
  validateRecordSemantics,
  verifyPostApplyFacts,
} from "./core01-provenance.mjs";

const REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
const RECORD_SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
const EVIDENCE_SCHEMA_PATH = "docs/CORE_01_POST_APPLY_EVIDENCE.schema.json";
const STAGING_ENVIRONMENT = "staging";
const STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";

function required(value, label) { if (!value) throw new Error(`${label} es obligatorio.`); return value; }
function githubHeaders(token) { return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }; }
async function githubJson(url, token, label) { const response = await fetch(url, { headers: githubHeaders(token) }); if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`); return response.json(); }
async function githubCommit(sha, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/commits/${sha}`, token, "source_commit_sha no pudo corroborarse"); }
async function githubFile(path, sha, token, apiUrl) { const encodedPath = path.split("/").map(encodeURIComponent).join("/"); const response = await githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/contents/${encodedPath}?ref=${encodeURIComponent(sha)}`, token, "migration_path no pudo corroborarse en source_commit_sha"); if (response?.path !== path) throw new Error("GitHub devolvió un path distinto al solicitado."); return response; }
async function githubRun(runId, token, apiUrl) { return githubJson(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}`, token, `deployment run ${runId} no pudo corroborarse`); }
function parseWorkflowAllowlist(raw) { const values = String(required(raw, "CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS")).split(",").map((value) => value.trim()); if (values.some((value) => !/^[1-9][0-9]*$/.test(value))) throw new Error("CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS debe contener únicamente IDs enteros positivos separados por coma."); const ids = values.map(Number); if (ids.some((value) => !Number.isSafeInteger(value) || value <= 0)) throw new Error("CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS contiene un ID fuera de rango."); return new Set(ids); }
function queryLedger(databaseUrl, version) { const sql = `select version::text || E'\\t' || name::text from supabase_migrations.schema_migrations where version::text = '${version}' order by version limit 1;`; try { const output = execFileSync("psql", ["--no-psqlrc", "--tuples-only", "--no-align", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", PGDATABASE: databaseUrl } }).trim(); if (!output) return null; const [rowVersion, rowName] = output.split("\t"); return { version: rowVersion, name: rowName }; } catch { throw new Error("No se pudo consultar el ledger de migraciones en modo lectura."); } }

async function main() {
  const { migrationPath, sourceCommitSha, deploymentRunId } = validatePostApplyInputs({ migrationPath: process.env.CORE01_INPUT_MIGRATION_PATH, sourceCommitSha: process.env.CORE01_INPUT_SOURCE_COMMIT_SHA, deploymentRunId: process.env.CORE01_INPUT_DEPLOYMENT_RUN_ID });
  const trusted = assertTrustedReleaseContext(process.env);
  const rootDir = process.cwd();
  const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (checkoutSha !== trusted.trustedVerifierSha) throw new Error("El checkout del verifier no coincide con el SHA trusted del workflow.");
  const environment = required(process.env.CORE01_RELEASE_ENVIRONMENT, "CORE01_RELEASE_ENVIRONMENT");
  const projectRef = required(process.env.CORE01_RELEASE_PROJECT_REF, "CORE01_RELEASE_PROJECT_REF");
  if (environment !== STAGING_ENVIRONMENT || projectRef !== STAGING_PROJECT_REF) throw new Error("Target post-apply no coincide con staging autorizado por Release.");
  if (process.env.GITHUB_REF !== CORE01_TRUSTED_REF) throw new Error("Ref post-apply no autorizada.");
  const databaseUrl = required(process.env.CORE01_DATABASE_URL, "CORE01_DATABASE_URL");
  const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const verificationRunIdRaw = required(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID");
  if (!/^[1-9][0-9]*$/.test(verificationRunIdRaw)) throw new Error("GITHUB_RUN_ID inválido.");
  const verificationRunId = Number(verificationRunIdRaw);
  if (!Number.isSafeInteger(verificationRunId)) throw new Error("GITHUB_RUN_ID fuera de rango.");
  const workflowIds = parseWorkflowAllowlist(process.env.CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS);
  const registry = JSON.parse(readFileSync(resolve(rootDir, REGISTRY_PATH), "utf8"));
  const recordSchema = JSON.parse(readFileSync(resolve(rootDir, RECORD_SCHEMA_PATH), "utf8"));
  const evidenceSchema = JSON.parse(readFileSync(resolve(rootDir, EVIDENCE_SCHEMA_PATH), "utf8"));
  const record = registry.migrations?.find((candidate) => candidate.path === migrationPath);
  if (!record) throw new Error(`${migrationPath} no está registrado en ${REGISTRY_PATH}.`);
  const recordValidator = compileJsonSchema(recordSchema, rootDir);
  const recordErrors = [...validateRecordSchema(record, recordSchema, rootDir, recordValidator), ...validateRecordSemantics(record)];
  if (recordErrors.length) throw new Error(`Registro AUTHORING inválido: ${recordErrors.join(" | ")}`);
  const artifact = await verifyPostApplyFacts({ record, environment, projectRef, sourceCommitSha, deploymentRunId, verification: { runId: verificationRunId, trustedVerifierSha: trusted.trustedVerifierSha } }, { getSourceCommit: async (sha) => githubCommit(sha, token, apiUrl), getSourceFile: async (path, sha) => githubFile(path, sha, token, apiUrl), getDeploymentRun: async (runId) => githubRun(runId, token, apiUrl), authorizedDeploymentWorkflowIds: workflowIds, queryLedger: async (version) => queryLedger(databaseUrl, version), now: () => new Date() });
  const evidenceValidator = compileJsonSchema(evidenceSchema, rootDir);
  const evidenceErrors = validateEvidenceArtifactSchema(artifact, evidenceSchema, rootDir, evidenceValidator);
  if (evidenceErrors.length) throw new Error(`Evidence artifact generado no cumple schema: ${evidenceErrors.join(" | ")}`);
  const outputPath = resolve(rootDir, CORE01_EVIDENCE_FILE);
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(`CORE-01 POST-APPLY VERIFICATION: PASS ${migrationPath}`);
  console.log(`Target: ${environment}/${projectRef}`);
  console.log(`Ledger: ${artifact.ledger.version}/${artifact.ledger.name}`);
  console.log(`Deployment run: ${artifact.deployment.run_id}; verification run: ${artifact.verification.run_id}`);
  console.log(`Evidence file: ${CORE01_EVIDENCE_FILE}`);
}

try { await main(); } catch (error) { console.error("CORE-01 POST-APPLY VERIFICATION: FAIL"); console.error(safeErrorMessage(error)); process.exit(1); }
