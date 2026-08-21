import { createHash } from "node:crypto";
import {
  CORE01_REPOSITORY,
  CORE01_SHA_RE,
  canonicalParts,
  validateRecordSchema,
  validateRecordSemantics,
} from "./core01-provenance.mjs";

export const CORE02_STAGING_PROJECT_REF = "qlngfkzmncihtdzktcmd";
export const CORE02_TRUSTED_BASE_REF = "refs/heads/staging";
export const CORE02_DEPLOYMENT_WORKFLOW = "CORE-02 Staging Migration Deployment";
export const CORE02_DEPLOYMENT_WORKFLOW_PATH = ".github/workflows/core01-deploy-migration.yml";
export const CORE02_DEPLOYMENT_EVIDENCE_FILE = "core01-deployment-evidence.json";
export const CORE02_SOURCE_REGISTRY_PATH = "docs/CORE_01_MIGRATION_PROVENANCE.json";
export const CORE02_MAX_SOURCE_BYTES = 512 * 1024;

const DEPLOY_TAG_RE = /^refs\/tags\/core01-staging-deploy-pr-([1-9][0-9]*)-sha-([0-9a-f]{40})$/;
const VERIFY_TAG_RE = /^refs\/tags\/core01-staging-verify-run-([1-9][0-9]*)-pr-([1-9][0-9]*)-sha-([0-9a-f]{40})$/;
const CANONICAL_MIGRATION_RE = /^supabase\/migrations\/\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;
const TRUSTED_CHANGE_PATTERNS = [
  /^\.github\/workflows\/core01-/,
  /^scripts\/verify-migration-/,
  /^scripts\/check-migration-/,
  /^scripts\/core01-/,
  /^docs\/CORE_01_/,
];

function strictPositiveInteger(value, label) {
  const text = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(text)) throw new Error(`${label} debe ser un entero decimal positivo estricto.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} está fuera del rango entero seguro.`);
  return parsed;
}

function strictSourceSha(value, label = "source_commit_sha") {
  if (!CORE01_SHA_RE.test(value ?? "")) throw new Error(`${label} debe ser un SHA-1 Git exacto de 40 hex minúsculas; branches/tags no son válidos.`);
  return value;
}

export function parseCore02DeployRef(ref) {
  const match = DEPLOY_TAG_RE.exec(ref ?? "");
  if (!match) throw new Error("El trigger deployment debe usar core01-staging-deploy-pr-<PR>-sha-<40hex>.");
  return { prNumber: strictPositiveInteger(match[1], "PR"), sourceCommitSha: strictSourceSha(match[2]) };
}

export function parseCore02VerifyRef(ref) {
  const match = VERIFY_TAG_RE.exec(ref ?? "");
  if (!match) throw new Error("El trigger verification debe usar core01-staging-verify-run-<RUN>-pr-<PR>-sha-<40hex>.");
  return {
    deploymentRunId: strictPositiveInteger(match[1], "deployment_run_id"),
    prNumber: strictPositiveInteger(match[2], "PR"),
    sourceCommitSha: strictSourceSha(match[3]),
  };
}

export function assertCore02TrustedContext(env, kind) {
  if (env.GITHUB_ACTIONS !== "true") throw new Error("CORE-02 solo puede ejecutarse dentro de GitHub Actions.");
  if (env.GITHUB_EVENT_NAME !== "push") throw new Error("CORE-02 exige un push de tag de Release, no workflow_dispatch/PR.");
  if (env.GITHUB_REPOSITORY !== CORE01_REPOSITORY) throw new Error("Repositorio CORE-02 no autorizado.");
  const sha = strictSourceSha(env.GITHUB_SHA, "GITHUB_SHA trusted");
  if (!CORE01_SHA_RE.test(env.GITHUB_WORKFLOW_SHA ?? "")) throw new Error("GITHUB_WORKFLOW_SHA trusted inválido.");
  if (env.GITHUB_WORKFLOW_SHA !== sha) throw new Error("El workflow debe proceder del mismo commit exacto que GITHUB_SHA; no se admite resolución posterior mutable.");
  if (env.GITHUB_REF_TYPE && env.GITHUB_REF_TYPE !== "tag") throw new Error("CORE-02 exige un tag de Release.");
  const expectedWorkflow = kind === "deploy" ? CORE02_DEPLOYMENT_WORKFLOW : "CORE-01 Post-Apply Verification";
  if (env.GITHUB_WORKFLOW !== expectedWorkflow) throw new Error(`Workflow CORE-02 no autorizado: ${env.GITHUB_WORKFLOW}.`);
  const parsed = kind === "deploy" ? parseCore02DeployRef(env.GITHUB_REF) : parseCore02VerifyRef(env.GITHUB_REF);
  return { ...parsed, trustedPipelineSha: sha, triggerRef: env.GITHUB_REF };
}

function isTrustedCodeChange(path) {
  if (path === CORE02_SOURCE_REGISTRY_PATH) return false;
  return TRUSTED_CHANGE_PATTERNS.some((pattern) => pattern.test(path));
}

function decodeGitHubContent(file, expectedPath) {
  if (!file || file.type !== "file" || file.path !== expectedPath) throw new Error(`${expectedPath}: GitHub no devolvió el archivo exacto.`);
  if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error(`${expectedPath}: GitHub Content API debe devolver base64.`);
  const bytes = Buffer.from(file.content.replace(/\n/g, ""), "base64");
  if (!bytes.length || bytes.byteLength > CORE02_MAX_SOURCE_BYTES) throw new Error(`${expectedPath}: tamaño fuente inválido o excesivo.`);
  return bytes;
}

function exactStagingTarget(record, projectRef) {
  const targets = record?.provenance?.intended_targets ?? [];
  return targets.length === 1 && targets[0]?.environment === "staging" && targets[0]?.project_ref === projectRef;
}

export async function validateCore02SourceData(input, adapters) {
  const sourceCommitSha = strictSourceSha(input.sourceCommitSha);
  const prNumber = strictPositiveInteger(input.prNumber, "pr_number");
  const trustedBaseSha = strictSourceSha(input.trustedBaseSha, "trusted_base_sha");
  const projectRef = input.projectRef ?? CORE02_STAGING_PROJECT_REF;
  if (projectRef !== CORE02_STAGING_PROJECT_REF) throw new Error("project_ref no coincide con STAGING autorizado.");

  const commit = await adapters.getCommit(sourceCommitSha);
  if (commit?.sha !== sourceCommitSha) throw new Error("GitHub no corroboró source_commit_sha exactamente.");

  const pull = await adapters.getPullRequest(prNumber);
  if (Number(pull?.number) !== prNumber || pull?.state !== "open") throw new Error(`PR #${prNumber} no existe o no está abierto.`);
  if (pull?.head?.repo?.full_name !== CORE01_REPOSITORY || pull?.base?.repo?.full_name !== CORE01_REPOSITORY) throw new Error("PR pertenece a otro repositorio.");
  if (pull?.head?.sha !== sourceCommitSha) throw new Error("PR HEAD no coincide con source_commit_sha exacto.");
  if (pull?.base?.ref !== "staging") throw new Error("PR consumidor no apunta a staging.");
  if (input.requireCurrentPrBase !== false && pull?.base?.sha !== trustedBaseSha) throw new Error("PR base SHA no coincide con el trusted staging SHA autorizado.");

  const files = await adapters.listPullRequestFiles(prNumber);
  if (!Array.isArray(files) || files.length === 0) throw new Error("PR sin archivos corroborables.");
  for (const file of files) {
    if (isTrustedCodeChange(file?.filename ?? "")) throw new Error(`PR consumidor modifica trusted CORE-01 code: ${file.filename}.`);
  }
  const migrations = files.filter((file) => file?.status === "added" && CANONICAL_MIGRATION_RE.test(file?.filename ?? ""));
  if (migrations.length !== 1) throw new Error(`CORE-02 exige exactamente una migración canónica añadida; detectadas ${migrations.length}.`);
  const migrationFile = migrations[0];
  const migrationPath = migrationFile.filename;
  const { version, name } = canonicalParts(migrationPath);
  if (!version || !name) throw new Error("migration_path canónico inválido.");

  const registryFile = await adapters.getContent(CORE02_SOURCE_REGISTRY_PATH, sourceCommitSha);
  const registryBytes = decodeGitHubContent(registryFile, CORE02_SOURCE_REGISTRY_PATH);
  let registry;
  try { registry = JSON.parse(registryBytes.toString("utf8")); }
  catch { throw new Error("Provenance fuente no contiene JSON válido."); }
  if (!Array.isArray(registry?.migrations)) throw new Error("Provenance fuente no contiene migrations[].");
  const matching = registry.migrations.filter((record) => record?.path === migrationPath);
  if (matching.length !== 1) throw new Error(`${migrationPath}: provenance AUTHORING ausente o duplicada en source SHA.`);
  const record = matching[0];
  const schemaErrors = [
    ...validateRecordSchema(record, input.recordSchema, input.rootDir, input.compiledRecordValidator ?? null),
    ...validateRecordSemantics(record),
  ];
  if (schemaErrors.length) throw new Error(`Provenance AUTHORING inválida: ${schemaErrors.join(" | ")}`);
  if (record.applied_state !== "PREPARADA_NO_APLICADA" || record?.provenance?.lifecycle_phase !== "AUTHORING" || record?.provenance?.application_evidence !== null) throw new Error("La migración debe estar PREPARADA_NO_APLICADA/AUTHORING sin evidence futura.");
  if (record.migration_version !== version) throw new Error("migration_version no coincide con migration_path.");
  if (record.operational_class !== "CANONICA") throw new Error("La migración a desplegar debe ser CANONICA.");
  const authorship = record?.provenance?.authorship ?? {};
  if (authorship.repository !== CORE01_REPOSITORY) throw new Error("AUTHORING repository incorrecto.");
  if (authorship.pr_number !== prNumber) throw new Error("AUTHORING pr_number no coincide con el PR real.");
  if (authorship.base_sha !== trustedBaseSha) throw new Error("AUTHORING base_sha no coincide con trusted staging SHA.");
  if (!exactStagingTarget(record, projectRef)) throw new Error("AUTHORING target debe ser exclusivamente staging/project_ref autorizado.");
  if (record?.provenance?.recovery?.strategy !== "forward_fix") throw new Error("Recovery debe ser forward_fix.");

  const sqlFile = await adapters.getContent(migrationPath, sourceCommitSha);
  const sqlBytes = decodeGitHubContent(sqlFile, migrationPath);
  if (!CORE01_SHA_RE.test(sqlFile.sha ?? "") || !CORE01_SHA_RE.test(migrationFile.sha ?? "")) throw new Error("El blob SQL debe tener SHA Git exacto corroborable.");
  if (sqlFile.sha !== migrationFile.sha) throw new Error("El blob SQL en source SHA no coincide con el blob exacto declarado por el PR.");
  const migrationSql = sqlBytes.toString("utf8");
  const sourceSha256 = createHash("sha256").update(sqlBytes).digest("hex");

  return {
    prNumber,
    sourceCommitSha,
    trustedBaseSha,
    migrationPath,
    migrationVersion: version,
    migrationName: name,
    migrationSql,
    sourceBlobSha: sqlFile.sha,
    sourceSha256,
    record,
  };
}

function stripNonCode(sql) {
  let out = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2); i = end === -1 ? sql.length : end; out += "\n"; continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2); if (end === -1) throw new Error("SQL contiene comentario de bloque sin cerrar."); i = end + 2; out += " "; continue;
    }
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch; out += " "; i++;
      while (i < sql.length) {
        if (sql[i] === quote) { if (sql[i + 1] === quote) { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "$" && /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.test(sql.slice(i))) {
      const tag = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)[0];
      const end = sql.indexOf(tag, i + tag.length); if (end === -1) throw new Error("SQL contiene dollar-quote sin cerrar.");
      i = end + tag.length; out += " "; continue;
    }
    out += ch; i++;
  }
  return out;
}

export function validateCore02MigrationSql(sql) {
  if (typeof sql !== "string" || !sql.trim()) throw new Error("Migration SQL vacío.");
  if (Buffer.byteLength(sql, "utf8") > CORE02_MAX_SOURCE_BYTES) throw new Error("Migration SQL excede el límite CORE-02.");
  if (sql.includes("\0")) throw new Error("Migration SQL contiene NUL.");
  if (/^\s*\\/m.test(sql)) throw new Error("Migration SQL contiene meta-comandos psql no permitidos.");
  const code = stripNonCode(sql);
  if (/(^|;)\s*(begin\b|start\s+transaction\b|commit\b|rollback\b|savepoint\b|release\s+savepoint\b)/im.test(code)) throw new Error("Migration SQL no puede controlar transacciones; CORE-02 controla la transacción atómica.");
  if (/\bcopy\b[\s\S]*\bprogram\b/i.test(code)) throw new Error("COPY PROGRAM no está permitido en CORE-02.");
  return true;
}

function chooseDollarTag(sql, prefix) {
  let index = 0;
  while (index < 1000) {
    const tag = `$${prefix}${index}$`;
    if (!sql.includes(tag)) return tag;
    index++;
  }
  throw new Error("No se pudo construir delimitador SQL seguro.");
}

export function buildCore02AtomicApplySql(source) {
  validateCore02MigrationSql(source.migrationSql);
  const version = source.migrationVersion;
  const name = source.migrationName;
  if (!/^\d{14}$/.test(version) || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) throw new Error("version/name no son canónicos.");
  const bodyTag = chooseDollarTag(source.migrationSql, "cya_sql_");
  const guardTag = "$cya_guard$";
  if (source.migrationSql.includes(guardTag)) throw new Error("Migration SQL colisiona con guard delimiter reservado.");
  return [
    "select pg_advisory_xact_lock(hashtextextended('cya_core01_migration_apply', 0));",
    `do ${guardTag} begin if exists (select 1 from supabase_migrations.schema_migrations where version::text = '${version}') then raise exception 'CORE-02 migration version already applied'; end if; end ${guardTag};`,
    `${source.migrationSql.trim()}\n;`,
    `insert into supabase_migrations.schema_migrations(version, name, statements) values ('${version}', '${name}', array[${bodyTag}${source.migrationSql}${bodyTag}]::text[]);`,
  ].join("\n");
}

export function core02DeploymentArtifactName(runId) {
  return `core01-deployment-evidence-${strictPositiveInteger(runId, "deployment_run_id")}`;
}

export function validateCore02DeploymentAuthority(run, artifact, context, authorizedWorkflowIds) {
  const errors = [];
  const runId = Number(context?.deploymentRunId);
  const workflowId = Number(run?.workflow_id);
  if (!Number.isSafeInteger(runId) || runId <= 0 || Number(run?.id) !== runId) errors.push("deployment_run_id no coincide con run real.");
  if (run?.repository?.full_name !== CORE01_REPOSITORY) errors.push("deployment repository incorrecto.");
  if (run?.name !== CORE02_DEPLOYMENT_WORKFLOW || run?.path !== CORE02_DEPLOYMENT_WORKFLOW_PATH || run?.event !== "push") errors.push("deployment workflow/path/event incorrecto.");
  if (run?.status !== "completed" || run?.conclusion !== "success") errors.push("deployment no terminó completed/success.");
  if (run?.head_sha !== context?.trustedPipelineSha) errors.push("deployment head_sha no coincide con trusted pipeline SHA.");
  if (!Number.isSafeInteger(workflowId) || workflowId <= 0) errors.push("deployment workflow_id inválido.");
  if (authorizedWorkflowIds && !authorizedWorkflowIds.has(workflowId)) errors.push("deployment workflow_id no está allowlisted.");
  if (artifact) {
    if (artifact.deployment?.run_id !== runId || artifact.deployment?.workflow_id !== workflowId) errors.push("deployment artifact no está ligado al run/workflow real.");
    if (artifact.trusted_pipeline_sha !== run?.head_sha) errors.push("deployment artifact trusted_pipeline_sha no coincide.");
    if (artifact.repository !== CORE01_REPOSITORY || artifact.environment !== "staging" || artifact.project_ref !== CORE02_STAGING_PROJECT_REF) errors.push("deployment artifact target/repository incorrecto.");
  }
  return errors;
}

export function assertCore02LedgerAbsent(row) {
  if (row) throw new Error(`Doble aplicación bloqueada: ledger ya contiene ${row.version}/${row.name}.`);
  return true;
}

export function validateCore02LedgerRow(row, source) {
  if (!row) throw new Error("Ledger sin fila para la migración esperada.");
  if (row.version !== source?.migrationVersion) throw new Error("Ledger version no coincide.");
  if (row.name !== source?.migrationName) throw new Error("Ledger name no coincide.");
  return true;
}
