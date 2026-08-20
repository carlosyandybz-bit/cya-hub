import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";

export const CORE01_REPOSITORY = "carlosyandybz-bit/cya-hub";
export const CORE01_POST_APPLY_WORKFLOW = "CORE-01 Post-Apply Verification";
export const CORE01_POST_APPLY_WORKFLOW_PATH = ".github/workflows/core01-post-apply-verification.yml";
export const CORE01_SCHEMA_VERSION = 2;

const CANONICAL_PATH_RE = /^supabase\/migrations\/(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;

export function canonicalParts(path) {
  const match = CANONICAL_PATH_RE.exec(path ?? "");
  return match ? { version: match[1], name: match[2] } : { version: null, name: null };
}

export function compileProvenanceSchema(schema, rootDir = process.cwd()) {
  const toolsPackage = resolve(rootDir, "tools/core01-validator/package.json");
  const require = createRequire(toolsPackage);
  const Ajv2020Module = require("ajv/dist/2020");
  const addFormatsModule = require("ajv-formats");
  const Ajv2020 = Ajv2020Module.default ?? Ajv2020Module;
  const addFormats = addFormatsModule.default ?? addFormatsModule;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addKeyword({ keyword: "x-cya-schema-version", schemaType: "number", valid: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

export function formatSchemaErrors(path, errors = []) {
  return errors.map((error) => {
    const where = error.instancePath || "/";
    return `${path}: JSON Schema ${where} ${error.message ?? "invalid"} [${error.keyword}]`;
  });
}

export function validateRecordSchema(record, schema, rootDir = process.cwd(), compiledValidator = null) {
  const validate = compiledValidator ?? compileProvenanceSchema(schema, rootDir);
  const ok = validate(record);
  return ok ? [] : formatSchemaErrors(record?.path ?? "<sin path>", validate.errors);
}

export function validateRecordSemantics(record) {
  const errors = [];
  const path = record?.path ?? "<sin path>";
  const prefix = `${path}:`;
  const { version, name } = canonicalParts(record?.path);

  if (version && record?.migration_version !== version) {
    errors.push(`${prefix} migration_version debe coincidir exactamente con el timestamp del path (${version}).`);
  }

  const targets = record?.provenance?.intended_targets;
  const evidence = record?.provenance?.application_evidence;
  if (record?.applied_state === "APLICADA" && Array.isArray(evidence)) {
    for (const [index, item] of evidence.entries()) {
      const itemPrefix = `${prefix} application_evidence[${index}]`;
      if (version && item?.ledger?.version !== version) errors.push(`${itemPrefix}.ledger.version debe coincidir con ${version}.`);
      if (name && item?.ledger?.name !== name) errors.push(`${itemPrefix}.ledger.name debe coincidir con ${name}.`);
      if (Array.isArray(targets) && !targets.some((target) => target.environment === item?.environment && target.project_ref === item?.project_ref)) errors.push(`${itemPrefix}: environment/project_ref aplicado debe existir previamente en intended_targets.`);
    }
  }
  return errors;
}

export function gitCommitExists(sha, cwd = process.cwd()) {
  try { execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd, stdio: "ignore" }); return true; }
  catch { return false; }
}

export function gitCommitContainsPath(sha, path, cwd = process.cwd()) {
  try { execFileSync("git", ["cat-file", "-e", `${sha}:${path}`], { cwd, stdio: "ignore" }); return true; }
  catch { return false; }
}

export function parseAuthorizedTargets(raw) {
  if (!raw) return [];
  let value;
  try { value = JSON.parse(raw); }
  catch { throw new Error("CORE01_AUTHORIZED_TARGETS_JSON no contiene JSON válido."); }
  if (!Array.isArray(value)) throw new Error("CORE01_AUTHORIZED_TARGETS_JSON debe ser un array.");
  return value;
}

export function loadGitHubAuthoringContext({ env = process.env, readJsonFile } = {}) {
  const read = readJsonFile ?? ((path) => JSON.parse(execFileSync("cat", [path], { encoding: "utf8" })));
  let event = null;
  if (env.GITHUB_EVENT_PATH) {
    try { event = read(env.GITHUB_EVENT_PATH); }
    catch (error) { throw new Error(`No se pudo leer GITHUB_EVENT_PATH: ${error.message}`); }
  }
  const pull = event?.pull_request ?? null;
  return {
    repository: env.GITHUB_REPOSITORY ?? null,
    eventName: env.GITHUB_EVENT_NAME ?? null,
    prNumber: pull?.number ?? event?.number ?? null,
    prBaseSha: pull?.base?.sha ?? null,
    prHeadSha: pull?.head?.sha ?? null,
    authorizedTargets: parseAuthorizedTargets(env.CORE01_AUTHORIZED_TARGETS_JSON ?? "[]"),
    githubToken: env.GITHUB_TOKEN ?? null,
    githubApiUrl: env.GITHUB_API_URL ?? "https://api.github.com"
  };
}

function targetKey(target) { return `${target?.environment ?? ""}:${target?.project_ref ?? ""}`; }

export async function fetchWorkflowRunFromGitHub(runId, context) {
  if (!context.githubToken) throw new Error("GITHUB_TOKEN ausente; no puede corroborarse un run de Release.");
  const response = await fetch(`${context.githubApiUrl}/repos/${CORE01_REPOSITORY}/actions/runs/${runId}`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${context.githubToken}`, "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (!response.ok) throw new Error(`GitHub Actions run ${runId} no pudo corroborarse: HTTP ${response.status}.`);
  return response.json();
}

export async function validateContextualProvenance(record, context, options = {}) {
  const errors = [];
  const path = record?.path ?? "<sin path>";
  const prefix = `${path}:`;
  const authorship = record?.provenance?.authorship ?? {};
  const commitExists = options.commitExists ?? ((sha) => gitCommitExists(sha, options.cwd));
  const commitContainsPath = options.commitContainsPath ?? ((sha, candidatePath) => gitCommitContainsPath(sha, candidatePath, options.cwd));
  const getWorkflowRun = options.getWorkflowRun ?? ((runId) => fetchWorkflowRunFromGitHub(runId, context));
  const isNewMigration = options.isNewMigration === true;

  if (!context?.repository) errors.push(`${prefix} contexto GitHub sin repository; no puede corroborarse authoring.`);
  else if (authorship.repository !== context.repository || context.repository !== CORE01_REPOSITORY) errors.push(`${prefix} authorship.repository no coincide con el repositorio real del workflow (${context.repository}).`);

  if (typeof authorship.base_sha === "string" && !(await commitExists(authorship.base_sha))) errors.push(`${prefix} authorship.base_sha ${authorship.base_sha} no existe como commit Git corroborable.`);

  if (isNewMigration && context?.eventName === "pull_request") {
    if (authorship.pr_number !== context.prNumber) errors.push(`${prefix} authorship.pr_number=${authorship.pr_number} no coincide con el PR real #${context.prNumber}.`);
    if (authorship.base_sha !== context.prBaseSha) errors.push(`${prefix} authorship.base_sha no coincide con la base SHA real del PR (${context.prBaseSha}).`);
  }

  const authorized = new Set((context?.authorizedTargets ?? []).map(targetKey));
  for (const target of record?.provenance?.intended_targets ?? []) if (!authorized.has(targetKey(target))) errors.push(`${prefix} intended target ${targetKey(target)} no está autorizado/corroborado por la configuración CI del entorno.`);

  if (record?.applied_state === "APLICADA") {
    for (const [index, item] of (record?.provenance?.application_evidence ?? []).entries()) {
      const itemPrefix = `${prefix} application_evidence[${index}]`;
      if (!(await commitExists(item.source_commit_sha))) {
        errors.push(`${itemPrefix}.source_commit_sha ${item.source_commit_sha} no existe como commit Git corroborable.`);
        continue;
      }
      if (!(await commitContainsPath(item.source_commit_sha, record.path))) errors.push(`${itemPrefix}.source_commit_sha no contiene ${record.path}.`);
      if (!authorized.has(targetKey(item))) errors.push(`${itemPrefix}: target aplicado ${targetKey(item)} no está autorizado/corroborado por CI.`);

      const verificationRunId = item?.release_verification?.run_id;
      if (Number.isInteger(verificationRunId)) {
        try {
          const run = await getWorkflowRun(verificationRunId);
          const expectedTitle = `CORE-01 post-apply ${record.path} @ ${item.source_commit_sha}`;
          if (run?.repository?.full_name && run.repository.full_name !== CORE01_REPOSITORY) errors.push(`${itemPrefix}: verification run pertenece a ${run.repository.full_name}, no a ${CORE01_REPOSITORY}.`);
          if (run?.name !== CORE01_POST_APPLY_WORKFLOW) errors.push(`${itemPrefix}: verification run no pertenece al workflow ${CORE01_POST_APPLY_WORKFLOW}.`);
          if (run?.path && !String(run.path).endsWith(CORE01_POST_APPLY_WORKFLOW_PATH)) errors.push(`${itemPrefix}: verification run usa un workflow path no autorizado (${run.path}).`);
          if (run?.event !== "workflow_dispatch") errors.push(`${itemPrefix}: verification run debe proceder de workflow_dispatch autorizado.`);
          if (run?.conclusion !== "success" || run?.status !== "completed") errors.push(`${itemPrefix}: verification run ${verificationRunId} no está completado con success.`);
          if (run?.display_title !== expectedTitle) errors.push(`${itemPrefix}: verification run ${verificationRunId} no corresponde inequívocamente a path/source_commit declarados.`);
        } catch (error) { errors.push(`${itemPrefix}: verification run ${verificationRunId} no pudo corroborarse (${error.message}).`); }
      }
    }
  }
  return errors;
}

export async function verifyPostApplyFacts(input, adapters) {
  const { record, environment, projectRef, sourceCommitSha, deploymentRunId, verificationRunId } = input;
  const { version, name } = canonicalParts(record?.path);
  if (!version || !name) throw new Error("migration_path no es canónico.");
  if (record?.applied_state !== "PREPARADA_NO_APLICADA" || record?.provenance?.lifecycle_phase !== "AUTHORING") throw new Error("Post-apply verification parte de un registro AUTHORING/PREPARADA_NO_APLICADA, no de una declaración APLICADA autocontenida.");
  if (!record.provenance.intended_targets.some((target) => target.environment === environment && target.project_ref === projectRef)) throw new Error("El target real de Release no estaba declarado en intended_targets.");
  if (!(await adapters.commitExists(sourceCommitSha))) throw new Error("source_commit_sha no existe en Git.");
  if (!(await adapters.commitContainsPath(sourceCommitSha, record.path))) throw new Error("source_commit_sha no contiene la migración indicada.");

  const deployment = await adapters.getDeploymentRun(deploymentRunId);
  if (deployment?.repository?.full_name && deployment.repository.full_name !== CORE01_REPOSITORY) throw new Error("El deployment run pertenece a otro repositorio.");
  if (deployment?.conclusion !== "success" || deployment?.status !== "completed") throw new Error("El deployment run no terminó con success.");
  if (deployment?.head_sha !== sourceCommitSha) throw new Error("El deployment run no corresponde a source_commit_sha.");
  if (!adapters.authorizedDeploymentWorkflowIds.has(Number(deployment?.workflow_id))) throw new Error(`workflow_id ${deployment?.workflow_id} no está autorizado por Release.`);

  const ledgerRow = await adapters.queryLedger(version);
  if (!ledgerRow || ledgerRow.version !== version || ledgerRow.name !== name) throw new Error(`Ledger real no confirma ${version}/${name}.`);

  return {
    environment,
    project_ref: projectRef,
    source_commit_sha: sourceCommitSha,
    ledger: { version: ledgerRow.version, name: ledgerRow.name },
    deployment: { kind: "github_actions", run_id: Number(deploymentRunId) },
    release_verification: { workflow: CORE01_POST_APPLY_WORKFLOW, run_id: Number(verificationRunId) },
    verified_at: adapters.now().toISOString()
  };
}
