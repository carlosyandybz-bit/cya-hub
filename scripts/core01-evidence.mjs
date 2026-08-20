import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  CORE01_CANONICAL_PATH_RE,
  CORE01_EVIDENCE_FILE,
  CORE01_POSITIVE_INTEGER_RE,
  CORE01_POST_APPLY_WORKFLOW,
  CORE01_POST_APPLY_WORKFLOW_PATH,
  CORE01_REPOSITORY,
  CORE01_SHA_RE,
  CORE01_TRUSTED_REF,
  canonicalParts,
  evidenceArtifactName,
  validateEvidenceArtifactSchema,
} from "./core01-schema.mjs";

const MAX_ARTIFACT_BYTES = 1024 * 1024;
const MAX_EVIDENCE_BYTES = 256 * 1024;
const EXPECTED_WORKFLOW_REF = `${CORE01_REPOSITORY}/${CORE01_POST_APPLY_WORKFLOW_PATH}@${CORE01_TRUSTED_REF}`;

export function validatePostApplyInputs({ migrationPath, sourceCommitSha, deploymentRunId }) {
  if (!CORE01_CANONICAL_PATH_RE.test(migrationPath ?? "")) throw new Error("migration_path no cumple la ruta canónica exacta de CORE-01.");
  if (!CORE01_SHA_RE.test(sourceCommitSha ?? "")) throw new Error("source_commit_sha debe contener exactamente 40 caracteres hexadecimales minúsculos.");
  if (!CORE01_POSITIVE_INTEGER_RE.test(deploymentRunId ?? "")) throw new Error("deployment_run_id debe ser un entero decimal positivo estricto.");
  const parsedRunId = Number(deploymentRunId);
  if (!Number.isSafeInteger(parsedRunId) || parsedRunId <= 0) throw new Error("deployment_run_id está fuera del rango entero seguro.");
  return { migrationPath, sourceCommitSha, deploymentRunId: parsedRunId };
}

export function safeErrorMessage(error) {
  return String(error?.message ?? error ?? "Error desconocido")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]");
}

export function assertTrustedReleaseContext(env) {
  if (env.GITHUB_ACTIONS !== "true") throw new Error("Post-apply solo puede ejecutarse dentro de GitHub Actions.");
  if (env.GITHUB_EVENT_NAME !== "workflow_dispatch") throw new Error("Post-apply exige workflow_dispatch autorizado.");
  if (env.GITHUB_REPOSITORY !== CORE01_REPOSITORY) throw new Error("Repositorio post-apply no autorizado.");
  if (env.GITHUB_REF !== CORE01_TRUSTED_REF) throw new Error("Post-apply solo puede ejecutarse desde refs/heads/staging.");
  if (env.GITHUB_WORKFLOW !== CORE01_POST_APPLY_WORKFLOW) throw new Error("Caller workflow post-apply no autorizado.");
  if (env.GITHUB_WORKFLOW_REF !== EXPECTED_WORKFLOW_REF) throw new Error("Caller workflow/ref post-apply no autorizado.");
  if (!CORE01_SHA_RE.test(env.GITHUB_SHA ?? "")) throw new Error("GITHUB_SHA trusted inválido.");
  if (!CORE01_SHA_RE.test(env.CORE01_TRUSTED_VERIFIER_SHA ?? "")) throw new Error("CORE01_TRUSTED_VERIFIER_SHA inválido.");
  if (env.GITHUB_SHA !== env.CORE01_TRUSTED_VERIFIER_SHA) throw new Error("El verifier SHA no coincide con el SHA trusted de staging.");
  return { trustedVerifierSha: env.GITHUB_SHA };
}

export async function verifyPostApplyFacts(input, adapters) {
  const { record, environment, projectRef, sourceCommitSha, deploymentRunId, verification } = input;
  const { version, name } = canonicalParts(record?.path);
  if (!version || !name) throw new Error("migration_path no es canónico.");
  if (record?.applied_state !== "PREPARADA_NO_APLICADA" || record?.provenance?.lifecycle_phase !== "AUTHORING") throw new Error("Post-apply debe partir de AUTHORING/PREPARADA_NO_APLICADA.");
  if (record?.provenance?.application_evidence !== null) throw new Error("AUTHORING no puede contener evidence futura.");
  if (!record.provenance.intended_targets.some((target) => target.environment === environment && target.project_ref === projectRef)) throw new Error("El target real de Release no estaba declarado en intended_targets.");

  const sourceCommit = await adapters.getSourceCommit(sourceCommitSha);
  if (sourceCommit?.sha !== sourceCommitSha) throw new Error("GitHub no corroboró source_commit_sha exactamente.");
  const sourceFile = await adapters.getSourceFile(record.path, sourceCommitSha);
  if (sourceFile?.path !== record.path || (sourceFile?.type && sourceFile.type !== "file")) throw new Error("source_commit_sha no contiene la migración canónica indicada.");

  const deployment = await adapters.getDeploymentRun(deploymentRunId);
  if (Number(deployment?.id) !== deploymentRunId) throw new Error("El deployment run corroborado no coincide con deployment_run_id.");
  if (deployment?.repository?.full_name !== CORE01_REPOSITORY) throw new Error("El deployment run pertenece a otro repositorio.");
  if (deployment?.status !== "completed" || deployment?.conclusion !== "success") throw new Error("El deployment run no terminó completed/success.");
  if (deployment?.head_sha !== sourceCommitSha) throw new Error("El deployment run no corresponde a source_commit_sha.");
  const workflowId = Number(deployment?.workflow_id);
  if (!Number.isSafeInteger(workflowId) || !adapters.authorizedDeploymentWorkflowIds.has(workflowId)) throw new Error(`workflow_id ${deployment?.workflow_id} no está autorizado por Release.`);

  const ledgerRow = await adapters.queryLedger(version);
  if (!ledgerRow || ledgerRow.version !== version || ledgerRow.name !== name) throw new Error(`Ledger real no confirma ${version}/${name}.`);

  const verificationRunId = Number(verification?.runId);
  if (!Number.isSafeInteger(verificationRunId) || verificationRunId <= 0) throw new Error("verification run_id inválido.");
  if (!CORE01_SHA_RE.test(verification?.trustedVerifierSha ?? "")) throw new Error("trusted verifier SHA inválido.");

  return {
    contract: "CORE-01-POST-APPLY-EVIDENCE",
    schema_version: 1,
    artifact_name: evidenceArtifactName(verificationRunId),
    migration_path: record.path,
    migration_version: version,
    environment,
    project_ref: projectRef,
    source_commit_sha: sourceCommitSha,
    deployment: { kind: "github_actions", run_id: deploymentRunId, workflow_id: workflowId },
    ledger: { version: ledgerRow.version, name: ledgerRow.name },
    verification: {
      run_id: verificationRunId,
      workflow: CORE01_POST_APPLY_WORKFLOW,
      workflow_path: CORE01_POST_APPLY_WORKFLOW_PATH,
      repository: CORE01_REPOSITORY,
      ref: CORE01_TRUSTED_REF,
      trusted_verifier_sha: verification.trustedVerifierSha,
    },
    verified_at: adapters.now().toISOString(),
  };
}

export function registryEvidenceFromArtifact(artifact) {
  return {
    environment: artifact.environment,
    project_ref: artifact.project_ref,
    source_commit_sha: artifact.source_commit_sha,
    ledger: { ...artifact.ledger },
    deployment: { ...artifact.deployment },
    release_verification: {
      workflow: artifact.verification.workflow,
      run_id: artifact.verification.run_id,
      artifact_name: artifact.artifact_name,
    },
    verified_at: artifact.verified_at,
  };
}

export function validateAppliedEvidenceAgainstArtifact(record, item, artifact, run) {
  const errors = [];
  const prefix = `${record?.path ?? "<sin path>"}: APPLIED evidence`;
  if (artifact.migration_path !== record?.path) errors.push(`${prefix}: artifact migration_path no coincide.`);
  if (artifact.migration_version !== record?.migration_version) errors.push(`${prefix}: artifact migration_version no coincide.`);
  if (artifact.verification.run_id !== item?.release_verification?.run_id) errors.push(`${prefix}: verification.run_id no coincide.`);
  if (artifact.verification.trusted_verifier_sha !== run?.head_sha) errors.push(`${prefix}: trusted_verifier_sha no coincide con head_sha real del verification run.`);
  if (!isDeepStrictEqual(item, registryEvidenceFromArtifact(artifact))) errors.push(`${prefix}: la entrada APPLIED no coincide exactamente con el artifact autoritativo.`);
  return errors;
}

export function validateVerificationRun(run, expectedRunId) {
  const errors = [];
  if (Number(run?.id) !== expectedRunId) errors.push(`verification run ${expectedRunId}: GitHub devolvió otro run_id.`);
  if (run?.repository?.full_name !== CORE01_REPOSITORY) errors.push(`verification run ${expectedRunId}: repositorio no autorizado.`);
  if (run?.name !== CORE01_POST_APPLY_WORKFLOW) errors.push(`verification run ${expectedRunId}: workflow no autorizado.`);
  if (run?.path !== CORE01_POST_APPLY_WORKFLOW_PATH) errors.push(`verification run ${expectedRunId}: workflow path no autorizado.`);
  if (run?.event !== "workflow_dispatch") errors.push(`verification run ${expectedRunId}: event debe ser workflow_dispatch.`);
  if (run?.status !== "completed" || run?.conclusion !== "success") errors.push(`verification run ${expectedRunId}: no está completed/success.`);
  if (run?.head_branch !== "staging") errors.push(`verification run ${expectedRunId}: head_branch debe ser staging.`);
  if (!CORE01_SHA_RE.test(run?.head_sha ?? "")) errors.push(`verification run ${expectedRunId}: head_sha inválido.`);
  return errors;
}

export function readEvidenceArtifactZip(zipBytes) {
  if (!(zipBytes instanceof Uint8Array) && !Buffer.isBuffer(zipBytes)) throw new Error("Artifact ZIP inválido.");
  if (zipBytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("Artifact ZIP excede el límite CORE-01.");
  const dir = mkdtempSync(join(tmpdir(), "core01-evidence-"));
  const zipPath = join(dir, "artifact.zip");
  try {
    writeFileSync(zipPath, zipBytes, { mode: 0o600 });
    const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 64 * 1024 }).trim().split(/\r?\n/).filter(Boolean);
    if (listing.length !== 1 || listing[0] !== CORE01_EVIDENCE_FILE) throw new Error("Artifact ZIP debe contener únicamente core01-post-apply-evidence.json.");
    const content = execFileSync("unzip", ["-p", zipPath, CORE01_EVIDENCE_FILE], { encoding: "utf8", maxBuffer: MAX_EVIDENCE_BYTES });
    if (Buffer.byteLength(content, "utf8") > MAX_EVIDENCE_BYTES) throw new Error("Evidence JSON excede el límite CORE-01.");
    return JSON.parse(content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function validateAuthoritativeAppliedEvidence(record, item, context, evidenceSchema, options = {}) {
  const errors = [];
  const runId = item?.release_verification?.run_id;
  if (!Number.isInteger(runId) || runId <= 0) return [`${record?.path}: release_verification.run_id inválido.`];
  const getWorkflowRun = options.getWorkflowRun;
  const listArtifacts = options.listArtifacts;
  const downloadArtifact = options.downloadArtifact;
  const readArtifact = options.readArtifact ?? readEvidenceArtifactZip;
  if (!getWorkflowRun || !listArtifacts || !downloadArtifact) throw new Error("Faltan adapters GitHub para corroborar APPLIED.");

  let run;
  try { run = await getWorkflowRun(runId, context); }
  catch (error) { return [`${record.path}: verification run ${runId} inexistente/no corroborable (${safeErrorMessage(error)}).`]; }
  errors.push(...validateVerificationRun(run, runId));
  if (errors.length) return errors;

  const expectedName = evidenceArtifactName(runId);
  if (item.release_verification.artifact_name !== expectedName) return [`${record.path}: artifact_name debe ser ${expectedName}.`];

  let artifacts;
  try { artifacts = await listArtifacts(runId, context); }
  catch (error) { return [`${record.path}: no pudieron listarse artifacts del verification run (${safeErrorMessage(error)}).`]; }
  const candidates = (artifacts ?? []).filter((artifact) => artifact?.name === expectedName && artifact?.expired !== true);
  if (candidates.length !== 1) return [`${record.path}: se esperaba exactamente un artifact autoritativo ${expectedName} en verification run ${runId}.`];
  const artifactMeta = candidates[0];
  if (!Number.isSafeInteger(Number(artifactMeta?.id)) || Number(artifactMeta.id) <= 0) return [`${record.path}: artifact GitHub sin ID autoritativo válido.`];
  if (artifactMeta?.workflow_run?.id != null && Number(artifactMeta.workflow_run.id) !== runId) return [`${record.path}: artifact pertenece a otro run.`];

  let artifact;
  try {
    const zip = await downloadArtifact(Number(artifactMeta.id), context);
    artifact = readArtifact(zip);
  } catch (error) {
    return [`${record.path}: artifact autoritativo no pudo descargarse/leerse (${safeErrorMessage(error)}).`];
  }

  const schemaErrors = validateEvidenceArtifactSchema(artifact, evidenceSchema, options.rootDir ?? process.cwd(), options.compiledEvidenceValidator ?? null);
  errors.push(...schemaErrors);
  if (schemaErrors.length) return errors;
  errors.push(...validateAppliedEvidenceAgainstArtifact(record, item, artifact, run));
  return errors;
}
