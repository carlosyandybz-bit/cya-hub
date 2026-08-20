#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CORE01_REPOSITORY,
  compileProvenanceSchema,
  gitCommitContainsPath,
  gitCommitExists,
  validateRecordSchema,
  validateRecordSemantics,
  verifyPostApplyFacts,
} from "./core01-provenance.mjs";

const REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
const SCHEMA_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.schema.json";
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : null; }
function required(value, label) { if (!value) throw new Error(`${label} es obligatorio.`); return value; }

async function githubRun(runId, token, apiUrl) {
  const response = await fetch(`${apiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (!response.ok) throw new Error(`No se pudo corroborar deployment run ${runId}: HTTP ${response.status}.`);
  return response.json();
}

function queryLedger(databaseUrl, version) {
  const sql = `select version::text || E'\\t' || name::text from supabase_migrations.schema_migrations where version::text = '${version}' order by version limit 1;`;
  const output = execFileSync("psql", ["--dbname", databaseUrl, "--no-psqlrc", "--tuples-only", "--no-align", "--command", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!output) return null;
  const [rowVersion, rowName] = output.split("\t");
  return { version: rowVersion, name: rowName };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") throw new Error("La certificación post-apply solo puede ejecutarse en el workflow_dispatch autorizado de Release.");
  if (process.env.GITHUB_REPOSITORY !== CORE01_REPOSITORY) throw new Error("Repositorio GitHub no autorizado.");
  const rootDir = process.cwd();
  const migrationPath = required(arg("--path"), "--path");
  const sourceCommitSha = required(arg("--source-commit"), "--source-commit");
  const deploymentRunId = Number(required(arg("--deployment-run-id"), "--deployment-run-id"));
  if (!Number.isInteger(deploymentRunId) || deploymentRunId <= 0) throw new Error("--deployment-run-id debe ser entero positivo.");

  const environment = required(process.env.CORE01_RELEASE_ENVIRONMENT, "CORE01_RELEASE_ENVIRONMENT");
  const projectRef = required(process.env.CORE01_RELEASE_PROJECT_REF, "CORE01_RELEASE_PROJECT_REF");
  const databaseUrl = required(process.env.CORE01_DATABASE_URL, "CORE01_DATABASE_URL (secret de environment protegido)");
  const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
  const verificationRunId = Number(required(process.env.GITHUB_RUN_ID, "GITHUB_RUN_ID"));
  const workflowIds = new Set(String(required(process.env.CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS, "CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS")).split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0));
  if (workflowIds.size === 0) throw new Error("No existe allowlist válida de deployment workflow IDs administrada por Release.");

  const registry = JSON.parse(readFileSync(resolve(rootDir, REGISTRY_PATH), "utf8"));
  const schema = JSON.parse(readFileSync(resolve(rootDir, SCHEMA_PATH), "utf8"));
  const record = registry.migrations?.find((candidate) => candidate.path === migrationPath);
  if (!record) throw new Error(`${migrationPath} no está registrado en ${REGISTRY_PATH}.`);
  const compiledValidator = compileProvenanceSchema(schema, rootDir);
  const structuralErrors = validateRecordSchema(record, schema, rootDir, compiledValidator);
  const semanticErrors = validateRecordSemantics(record);
  if (structuralErrors.length || semanticErrors.length) throw new Error(`Registro AUTHORING inválido:\n${[...structuralErrors, ...semanticErrors].join("\n")}`);

  const evidence = await verifyPostApplyFacts({ record, environment, projectRef, sourceCommitSha, deploymentRunId, verificationRunId }, {
    commitExists: async (sha) => gitCommitExists(sha, rootDir),
    commitContainsPath: async (sha, path) => gitCommitContainsPath(sha, path, rootDir),
    getDeploymentRun: async (runId) => githubRun(runId, token, process.env.GITHUB_API_URL ?? "https://api.github.com"),
    authorizedDeploymentWorkflowIds: workflowIds,
    queryLedger: async (version) => queryLedger(databaseUrl, version),
    now: () => new Date()
  });

  const outputPath = resolve(rootDir, process.env.CORE01_EVIDENCE_PATH ?? "core01-post-apply-evidence.json");
  writeFileSync(outputPath, `${JSON.stringify({ contract: "CORE-01", migration_path: migrationPath, evidence }, null, 2)}\n`, "utf8");
  console.log(`CORE-01 POST-APPLY VERIFICATION: PASS ${migrationPath}`);
  console.log(`Environment/project_ref: ${environment}/${projectRef}`);
  console.log(`Ledger: ${evidence.ledger.version}/${evidence.ledger.name}`);
  console.log(`Deployment run: ${evidence.deployment.run_id}; verification run: ${evidence.release_verification.run_id}`);
  console.log(`Evidence artifact: ${outputPath}`);
}

try { await main(); }
catch (error) { console.error("CORE-01 POST-APPLY VERIFICATION: FAIL"); console.error(error.message); process.exit(1); }
