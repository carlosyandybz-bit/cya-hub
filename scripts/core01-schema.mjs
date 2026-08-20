import { createRequire } from "node:module";
import { resolve } from "node:path";

export const CORE01_REPOSITORY = "carlosyandybz-bit/cya-hub";
export const CORE01_POST_APPLY_WORKFLOW = "CORE-01 Post-Apply Verification";
export const CORE01_POST_APPLY_WORKFLOW_PATH = ".github/workflows/core01-post-apply-verification.yml";
export const CORE01_TRUSTED_POST_APPLY_WORKFLOW = "CORE-01 Trusted Post-Apply Verifier";
export const CORE01_TRUSTED_POST_APPLY_WORKFLOW_PATH = ".github/workflows/core01-post-apply-trusted.yml";
export const CORE01_TRUSTED_REF = "refs/heads/staging";
export const CORE01_SCHEMA_VERSION = 3;
export const CORE01_EVIDENCE_SCHEMA_VERSION = 1;
export const CORE01_EVIDENCE_FILE = "core01-post-apply-evidence.json";
export const CORE01_CANONICAL_PATH_RE = /^supabase\/migrations\/(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
export const CORE01_SHA_RE = /^[0-9a-f]{40}$/;
export const CORE01_PROJECT_REF_RE = /^[a-z0-9]{20}$/;
export const CORE01_POSITIVE_INTEGER_RE = /^[1-9][0-9]*$/;

export function canonicalParts(path) {
  const match = CORE01_CANONICAL_PATH_RE.exec(path ?? "");
  return match ? { version: match[1], name: match[2] } : { version: null, name: null };
}

export function evidenceArtifactName(runId) {
  return `core01-post-apply-evidence-${runId}`;
}

export function compileJsonSchema(schema, rootDir = process.cwd()) {
  const require = createRequire(resolve(rootDir, "tools/core01-validator/package.json"));
  const AjvModule = require("ajv/dist/2020");
  const formatsModule = require("ajv-formats");
  const Ajv2020 = AjvModule.default ?? AjvModule;
  const addFormats = formatsModule.default ?? formatsModule;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  ajv.addKeyword({ keyword: "x-cya-schema-version", schemaType: "number", valid: true });
  addFormats(ajv);
  return ajv.compile(schema);
}
export const compileProvenanceSchema = compileJsonSchema;

function schemaErrors(label, errors = []) {
  return errors.map((error) => `${label}: JSON Schema ${error.instancePath || "/"} ${error.message ?? "invalid"} [${error.keyword}]`);
}

export function validateRecordSchema(record, schema, rootDir = process.cwd(), compiled = null) {
  const validate = compiled ?? compileJsonSchema(schema, rootDir);
  return validate(record) ? [] : schemaErrors(record?.path ?? "<sin path>", validate.errors);
}

export function validateEvidenceArtifactSchema(artifact, schema, rootDir = process.cwd(), compiled = null) {
  const validate = compiled ?? compileJsonSchema(schema, rootDir);
  return validate(artifact) ? [] : schemaErrors("post-apply evidence artifact", validate.errors);
}

export function validateRecordSemantics(record) {
  const errors = [];
  const path = record?.path ?? "<sin path>";
  const { version, name } = canonicalParts(path);
  if (version && record?.migration_version !== version) errors.push(`${path}: migration_version debe coincidir exactamente con ${version}.`);
  const targets = record?.provenance?.intended_targets ?? [];
  const evidence = record?.provenance?.application_evidence;
  if (record?.applied_state !== "APLICADA" || !Array.isArray(evidence)) return errors;
  for (const [index, item] of evidence.entries()) {
    const prefix = `${path}: application_evidence[${index}]`;
    if (version && item?.ledger?.version !== version) errors.push(`${prefix}.ledger.version debe coincidir con ${version}.`);
    if (name && item?.ledger?.name !== name) errors.push(`${prefix}.ledger.name debe coincidir con ${name}.`);
    if (!targets.some((target) => target.environment === item?.environment && target.project_ref === item?.project_ref)) {
      errors.push(`${prefix}: environment/project_ref aplicado debe existir previamente en intended_targets.`);
    }
    const runId = item?.release_verification?.run_id;
    if (Number.isInteger(runId) && item?.release_verification?.artifact_name !== evidenceArtifactName(runId)) {
      errors.push(`${prefix}.release_verification.artifact_name debe ser ${evidenceArtifactName(runId)}.`);
    }
  }
  return errors;
}
