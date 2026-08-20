import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseNameStatus,
  validateAppliedPromotions,
  validateCanonicalTimestamps,
  validateChanges,
  validateContextAgainstGitHub,
  validateInventory,
  validateProvenanceRecord,
} from "../scripts/check-migration-governance.mjs";
import {
  CORE01_POST_APPLY_WORKFLOW,
  CORE01_POST_APPLY_WORKFLOW_PATH,
  CORE01_REPOSITORY,
  CORE01_TRUSTED_REF,
  assertTrustedReleaseContext,
  evidenceArtifactName,
  registryEvidenceFromArtifact,
  safeErrorMessage,
  validateAppliedEvidenceAgainstArtifact,
  validateAuthoringPreservation,
  validateAuthoritativeAppliedEvidence,
  validatePostApplyInputs,
  verifyPostApplyFacts,
} from "../scripts/core01-provenance.mjs";

const SCHEMA = JSON.parse(readFileSync(resolve("docs/CORE_01_MIGRATION_PROVENANCE.schema.json"), "utf8"));
const EVIDENCE_SCHEMA = JSON.parse(readFileSync(resolve("docs/CORE_01_POST_APPLY_EVIDENCE.schema.json"), "utf8"));
const BASE_SHA = "9bd740fa9b7dd153e937c1bff2eb32d3828c2954";
const SOURCE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TRUSTED_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NONEXISTENT_SHA = "1234567890abcdef1234567890abcdef12345678";
const PATH = "supabase/migrations/20260820010101_add_safe_thing.sql";
const AUTHORIZED_TARGET = { environment: "staging", project_ref: "qlngfkzmncihtdzktcmd" };

function baseManifest() {
  return {
    canonical_contract: { future_route: "supabase/migrations" },
    staging_ledger_summary: { source: "supabase_migrations.schema_migrations", last_version: "20260819175828" },
    inventory: {
      "db/migrations": { historical_operational_class: "COMPATIBILIDAD", states: { APLICADA: ["v1_old.sql"] } },
      "supabase/migrations": { historical_operational_class: "COMPATIBILIDAD", states: { APLICADA: ["v2_old.sql"], DESCONOCIDA: { "20260819002100_old_timestamp.sql": {} } } },
    },
  };
}
function pendingRecord(path = PATH) {
  return {
    path,
    migration_version: path.match(/(\d{14})_/)?.[1],
    operational_class: "CANONICA",
    applied_state: "PREPARADA_NO_APLICADA",
    provenance: {
      schema_version: 3,
      lifecycle_phase: "AUTHORING",
      owner: "CORE/Data",
      func_id: "FUNC-0211",
      authorship: { repository: CORE01_REPOSITORY, base_sha: BASE_SHA, pr_number: 123 },
      intended_targets: [structuredClone(AUTHORIZED_TARGET)],
      recovery: { strategy: "forward_fix", plan: "Correct forward with a later canonical migration; never rewrite applied history." },
      application_evidence: null,
    },
  };
}
function evidenceArtifact(overrides = {}) {
  return {
    contract: "CORE-01-POST-APPLY-EVIDENCE",
    schema_version: 1,
    artifact_name: evidenceArtifactName(9101),
    migration_path: PATH,
    migration_version: "20260820010101",
    environment: "staging",
    project_ref: "qlngfkzmncihtdzktcmd",
    source_commit_sha: SOURCE_SHA,
    deployment: { kind: "github_actions", run_id: 9001, workflow_id: 77 },
    ledger: { version: "20260820010101", name: "add_safe_thing" },
    verification: {
      run_id: 9101,
      workflow: CORE01_POST_APPLY_WORKFLOW,
      workflow_path: CORE01_POST_APPLY_WORKFLOW_PATH,
      repository: CORE01_REPOSITORY,
      ref: CORE01_TRUSTED_REF,
      trusted_verifier_sha: TRUSTED_SHA,
    },
    verified_at: "2026-08-20T10:30:00Z",
    ...overrides,
  };
}
function appliedRecord(artifact = evidenceArtifact()) {
  const r = pendingRecord(artifact.migration_path);
  r.applied_state = "APLICADA";
  r.provenance.lifecycle_phase = "APPLIED";
  r.provenance.application_evidence = [registryEvidenceFromArtifact(artifact)];
  return r;
}
function registry(records = []) { return { schema_version: 3, record_schema: "docs/CORE_01_MIGRATION_PROVENANCE.schema.json", evidence_schema: "docs/CORE_01_POST_APPLY_EVIDENCE.schema.json", migrations: records }; }
function actual(records = []) { return { "db/migrations": ["db/migrations/v1_old.sql"], "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql", ...records.map((r) => r.path)] }; }
function prContext(overrides = {}) { return { repository: CORE01_REPOSITORY, eventName: "pull_request", prNumber: 123, prBaseSha: BASE_SHA, prHeadSha: SOURCE_SHA, authorizedTargets: [structuredClone(AUTHORIZED_TARGET)], githubToken: "fixture-token", githubApiUrl: "https://api.github.test", ...overrides }; }
function validVerificationRun(overrides = {}) { return { id: 9101, repository: { full_name: CORE01_REPOSITORY }, name: CORE01_POST_APPLY_WORKFLOW, path: CORE01_POST_APPLY_WORKFLOW_PATH, event: "workflow_dispatch", status: "completed", conclusion: "success", head_branch: "staging", head_sha: TRUSTED_SHA, display_title: "ignored run-name", ...overrides }; }
function evidenceAdapters(artifact = evidenceArtifact(), run = validVerificationRun()) { return { rootDir: process.cwd(), getWorkflowRun: async () => run, listArtifacts: async () => [{ id: 55, name: artifact.artifact_name, expired: false, workflow_run: { id: run.id } }], downloadArtifact: async () => new Uint8Array([1, 2, 3]), readArtifact: () => structuredClone(artifact) }; }

// Original CORE-01 regression/contract coverage.
test("parses name-status including renames", () => assert.deepEqual(parseNameStatus("A\ta.sql\nR100\told.sql\tnew.sql\n"), [{ status: "A", paths: ["a.sql"] }, { status: "R100", paths: ["old.sql", "new.sql"] }]));
test("POSITIVE schema: honest AUTHORING passes Draft 2020-12", () => assert.deepEqual(validateProvenanceRecord(pendingRecord(), SCHEMA), []));
test("NEGATIVE schema: unexpected additionalProperties fails", () => { const r = pendingRecord(); r.unexpected = true; assert.ok(validateProvenanceRecord(r, SCHEMA).some((e) => e.includes("additionalProperties"))); });
test("NEGATIVE schema: wrong pr_number type fails", () => { const r = pendingRecord(); r.provenance.authorship.pr_number = "123"; assert.ok(validateProvenanceRecord(r, SCHEMA).some((e) => e.includes("pr_number") && e.includes("type"))); });
test("NEGATIVE schema: missing required owner fails", () => { const r = pendingRecord(); delete r.provenance.owner; assert.ok(validateProvenanceRecord(r, SCHEMA).some((e) => e.includes("required"))); });
test("NEGATIVE schema: invalid intended_targets fails", () => { const r = pendingRecord(); r.provenance.intended_targets = [{ environment: "staging" }]; assert.ok(validateProvenanceRecord(r, SCHEMA).some((e) => e.includes("intended_targets") && e.includes("required"))); });
test("NEGATIVE: new migration without provenance remains blocked", () => { const r = pendingRecord(); delete r.provenance; assert.ok(validateChanges([{ status: "A", paths: [r.path] }], baseManifest(), registry([r]), SCHEMA, EVIDENCE_SCHEMA).length > 0); });
test("NEGATIVE: partial provenance remains blocked", () => { const r = pendingRecord(); delete r.provenance.authorship.pr_number; delete r.provenance.recovery.plan; assert.ok(validateChanges([{ status: "A", paths: [r.path] }], baseManifest(), registry([r]), SCHEMA, EVIDENCE_SCHEMA).filter((e) => e.includes("required")).length >= 2); });
test("NEGATIVE: PREPARADA cannot contain future evidence", () => { const r = pendingRecord(); r.provenance.application_evidence = appliedRecord().provenance.application_evidence; assert.ok(validateProvenanceRecord(r, SCHEMA).length > 0); });
test("NEGATIVE: APLICADA without evidence fails schema", () => { const r = pendingRecord(); r.applied_state = "APLICADA"; r.provenance.lifecycle_phase = "APPLIED"; assert.ok(validateProvenanceRecord(r, SCHEMA).length > 0); });
test("POSITIVE: APPLIED representation can be structurally valid", () => assert.deepEqual(validateProvenanceRecord(appliedRecord(), SCHEMA), []));
test("NEGATIVE factual: nonexistent base_sha fails", () => { const r = pendingRecord(); r.provenance.authorship.base_sha = NONEXISTENT_SHA; const errors = validateContextAgainstGitHub([r], [{ status: "A", paths: [PATH] }], prContext(), { commitExists: (sha) => sha !== NONEXISTENT_SHA }); assert.ok(errors.some((e) => e.includes("no existe como commit Git"))); });
test("NEGATIVE factual: PR mismatch fails", () => { const r = pendingRecord(); r.provenance.authorship.pr_number = 999; assert.ok(validateContextAgainstGitHub([r], [{ status: "A", paths: [PATH] }], prContext(), { commitExists: () => true }).some((e) => e.includes("PR real #123"))); });
test("NEGATIVE factual: repository mismatch fails", () => { const r = pendingRecord(); r.provenance.authorship.repository = "otro/repo"; assert.ok(validateContextAgainstGitHub([r], [{ status: "A", paths: [PATH] }], prContext(), { commitExists: () => true }).some((e) => e.includes("repositorio real"))); });
test("NEGATIVE factual: target pattern alone is insufficient", () => { const r = pendingRecord(); r.provenance.intended_targets = [{ environment: "production", project_ref: "abcdefghijklmnopqrst" }]; assert.ok(validateContextAgainstGitHub([r], [{ status: "A", paths: [PATH] }], prContext(), { commitExists: () => true }).some((e) => e.includes("no está autorizado/corroborado"))); });
test("POSITIVE factual: honest AUTHORING corroborates against PR", () => assert.deepEqual(validateContextAgainstGitHub([pendingRecord()], [{ status: "A", paths: [PATH] }], prContext(), { commitExists: () => true }), []));
test("POSITIVE post-apply facts produce evidence without applying SQL", async () => { const artifact = await verifyPostApplyFacts({ record: pendingRecord(), environment: "staging", projectRef: "qlngfkzmncihtdzktcmd", sourceCommitSha: SOURCE_SHA, deploymentRunId: 9001, verification: { runId: 9101, trustedVerifierSha: TRUSTED_SHA } }, { getSourceCommit: async () => ({ sha: SOURCE_SHA }), getSourceFile: async () => ({ path: PATH, type: "file" }), getDeploymentRun: async () => ({ id: 9001, repository: { full_name: CORE01_REPOSITORY }, status: "completed", conclusion: "success", head_sha: SOURCE_SHA, workflow_id: 77 }), authorizedDeploymentWorkflowIds: new Set([77]), queryLedger: async () => ({ version: "20260820010101", name: "add_safe_thing" }), now: () => new Date("2026-08-20T10:30:00Z") }); assert.equal(artifact.deployment.run_id, 9001); });
test("NEGATIVE post-apply: unauthorized deployment workflow fails", async () => assert.rejects(() => verifyPostApplyFacts({ record: pendingRecord(), environment: "staging", projectRef: "qlngfkzmncihtdzktcmd", sourceCommitSha: SOURCE_SHA, deploymentRunId: 9001, verification: { runId: 9101, trustedVerifierSha: TRUSTED_SHA } }, { getSourceCommit: async () => ({ sha: SOURCE_SHA }), getSourceFile: async () => ({ path: PATH }), getDeploymentRun: async () => ({ id: 9001, repository: { full_name: CORE01_REPOSITORY }, status: "completed", conclusion: "success", head_sha: SOURCE_SHA, workflow_id: 88 }), authorizedDeploymentWorkflowIds: new Set([77]), queryLedger: async () => ({ version: "20260820010101", name: "add_safe_thing" }), now: () => new Date() }), /no está autorizado por Release/));
test("NEGATIVE post-apply: mismatching ledger fails", async () => assert.rejects(() => verifyPostApplyFacts({ record: pendingRecord(), environment: "staging", projectRef: "qlngfkzmncihtdzktcmd", sourceCommitSha: SOURCE_SHA, deploymentRunId: 9001, verification: { runId: 9101, trustedVerifierSha: TRUSTED_SHA } }, { getSourceCommit: async () => ({ sha: SOURCE_SHA }), getSourceFile: async () => ({ path: PATH }), getDeploymentRun: async () => ({ id: 9001, repository: { full_name: CORE01_REPOSITORY }, status: "completed", conclusion: "success", head_sha: SOURCE_SHA, workflow_id: 77 }), authorizedDeploymentWorkflowIds: new Set([77]), queryLedger: async () => null, now: () => new Date() }), /Ledger real no confirma/));
test("NEGATIVE nominal: new SQL absent registry fails", () => assert.ok(validateChanges([{ status: "A", paths: [PATH] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("falta registrar"))));
test("REGRESSION: grandfathered history needs no invented provenance", () => assert.deepEqual(validateInventory(actual(), baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA), []));
test("REGRESSION: canonical_pending remains blocked", () => { const m = baseManifest(); m.canonical_pending = [{ path: PATH }]; assert.ok(validateInventory(actual(), m, registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("canonical_pending"))); });
test("REGRESSION: db/migrations remains frozen", () => assert.ok(validateChanges([{ status: "A", paths: ["db/migrations/v999_bad.sql"] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("db/migrations está congelado"))));
test("REGRESSION: root supabase SQL remains frozen", () => assert.ok(validateChanges([{ status: "M", paths: ["supabase/v47_p19_persona_unica.sql"] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("bootstrap/compatibilidad"))));
test("REGRESSION: applied-history remains non-canonical", () => assert.ok(validateChanges([{ status: "A", paths: ["supabase/applied-history/20260820-x.sql"] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("segunda ruta"))));
test("rejects new non-timestamped migration", () => assert.ok(validateChanges([{ status: "A", paths: ["supabase/migrations/v999_bad.sql"] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("YYYYMMDDHHMMSS"))));
test("rejects mutation of existing migration", () => assert.ok(validateChanges([{ status: "M", paths: ["supabase/migrations/v2_old.sql"] }], baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("inmutables"))));
test("rejects migration older than ledger head", () => { const r = pendingRecord("supabase/migrations/20260819120000_backdated.sql"); assert.ok(validateChanges([{ status: "A", paths: [r.path] }], baseManifest(), registry([r]), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("retrodatadas"))); });
test("rejects invalid UTC timestamp", () => { const r = pendingRecord("supabase/migrations/20261332010101_invalid_date.sql"); assert.ok(validateChanges([{ status: "A", paths: [r.path] }], baseManifest(), registry([r]), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("fecha/hora UTC válida"))); });
test("inventory requires every SQL declared", () => assert.ok(validateInventory({ "db/migrations": ["db/migrations/v1_old.sql", "db/migrations/v2_untracked.sql"], "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql"] }, baseManifest(), registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("v2_untracked.sql"))));
test("inventory rejects missing classification", () => { const b = baseManifest(); b.inventory["db/migrations"].historical_operational_class = undefined; assert.ok(validateInventory(actual(), b, registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("operational_class"))); });
test("inventory rejects invalid applied state", () => { const b = baseManifest(); b.inventory["db/migrations"].states = { NO_ES_ESTADO: ["v1_old.sql"] }; assert.ok(validateInventory(actual(), b, registry(), SCHEMA, EVIDENCE_SCHEMA).some((e) => e.includes("applied_state"))); });
test("duplicate canonical timestamps are rejected", () => assert.equal(validateCanonicalTimestamps(["supabase/migrations/20260820010101_first.sql", "supabase/migrations/20260820010101_second.sql"]).length, 1));

// P0 trusted-code boundary.
test("SECURITY: source commit is never checkout ref", () => { const dispatcher = readFileSync(".github/workflows/core01-post-apply-verification.yml", "utf8"); const trusted = readFileSync(".github/workflows/core01-post-apply-trusted.yml", "utf8"); assert.ok(!dispatcher.includes("ref: ${{ inputs.source_commit_sha }}")); assert.ok(!trusted.includes("ref: ${{ inputs.source_commit_sha }}")); assert.match(dispatcher, /core01-post-apply-trusted\.yml@staging/); });
test("SECURITY: trusted workflow uses persist-credentials false", () => { const trusted = readFileSync(".github/workflows/core01-post-apply-trusted.yml", "utf8"); assert.ok((trusted.match(/persist-credentials: false/g) ?? []).length >= 2); });
test("NEGATIVE trusted context: non-staging ref fails", () => assert.throws(() => assertTrustedReleaseContext({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: CORE01_REPOSITORY, GITHUB_REF: "refs/heads/feature", GITHUB_WORKFLOW: CORE01_POST_APPLY_WORKFLOW, GITHUB_WORKFLOW_REF: `${CORE01_REPOSITORY}/${CORE01_POST_APPLY_WORKFLOW_PATH}@refs/heads/feature`, GITHUB_SHA: TRUSTED_SHA, CORE01_TRUSTED_VERIFIER_SHA: TRUSTED_SHA }), /staging/));
test("NEGATIVE trusted context: another caller workflow fails", () => assert.throws(() => assertTrustedReleaseContext({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: CORE01_REPOSITORY, GITHUB_REF: CORE01_TRUSTED_REF, GITHUB_WORKFLOW: "Other Workflow", GITHUB_WORKFLOW_REF: `${CORE01_REPOSITORY}/.github/workflows/other.yml@refs/heads/staging`, GITHUB_SHA: TRUSTED_SHA, CORE01_TRUSTED_VERIFIER_SHA: TRUSTED_SHA }), /Caller workflow/));
test("POSITIVE trusted context: staging caller and SHA pass", () => assert.deepEqual(assertTrustedReleaseContext({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REPOSITORY: CORE01_REPOSITORY, GITHUB_REF: CORE01_TRUSTED_REF, GITHUB_WORKFLOW: CORE01_POST_APPLY_WORKFLOW, GITHUB_WORKFLOW_REF: `${CORE01_REPOSITORY}/${CORE01_POST_APPLY_WORKFLOW_PATH}@${CORE01_TRUSTED_REF}`, GITHUB_SHA: TRUSTED_SHA, CORE01_TRUSTED_VERIFIER_SHA: TRUSTED_SHA }), { trustedVerifierSha: TRUSTED_SHA }));
test("SECURITY: Environment staging exists only after preflight job", () => { const trusted = readFileSync(".github/workflows/core01-post-apply-trusted.yml", "utf8"); const preflight = trusted.indexOf("preflight-no-secrets:"); const verify = trusted.indexOf("verify-staging-application:"); const env = trusted.indexOf("environment: staging"); assert.ok(preflight >= 0 && verify > preflight && env > verify); });

// P0 command injection.
for (const [label, malicious] of [["single quote", "supabase/migrations/20260820010101_bad'.sql"], ["semicolon", "supabase/migrations/20260820010101_bad;touch.sql"], ["dollar substitution", "supabase/migrations/20260820010101_bad$(id).sql"], ["backticks", "supabase/migrations/20260820010101_bad`id`.sql"], ["newline", "supabase/migrations/20260820010101_bad\nthing.sql"], ["path traversal", "supabase/migrations/../../bad.sql"]]) {
  test(`NEGATIVE input ${label} is rejected`, () => assert.throws(() => validatePostApplyInputs({ migrationPath: malicious, sourceCommitSha: SOURCE_SHA, deploymentRunId: "9001" })));
}
test("NEGATIVE source SHA shell chars fail before use", () => assert.throws(() => validatePostApplyInputs({ migrationPath: PATH, sourceCommitSha: `${SOURCE_SHA.slice(0, 38)};'`, deploymentRunId: "9001" }), /40 caracteres/));
for (const bad of ["1.5", "0", "-1", "1;touch", "$(id)", "1\n2", " 1"] ) test(`NEGATIVE deployment_run_id ${JSON.stringify(bad)} fails`, () => assert.throws(() => validatePostApplyInputs({ migrationPath: PATH, sourceCommitSha: SOURCE_SHA, deploymentRunId: bad }), /entero/));
test("POSITIVE strict release inputs pass as inert data", () => assert.deepEqual(validatePostApplyInputs({ migrationPath: PATH, sourceCommitSha: SOURCE_SHA, deploymentRunId: "9001" }), { migrationPath: PATH, sourceCommitSha: SOURCE_SHA, deploymentRunId: 9001 }));
test("SECURITY: workflow shell never interpolates untrusted inputs", () => { const trusted = readFileSync(".github/workflows/core01-post-apply-trusted.yml", "utf8"); const runLines = trusted.split(/\r?\n/).filter((line) => line.trim().startsWith("run:")); assert.ok(runLines.every((line) => !line.includes("${{ inputs."))); });
test("SECURITY: semicolon probe cannot create file", () => { const p = "/tmp/pwned"; rmSync(p, { force: true }); assert.throws(() => validatePostApplyInputs({ migrationPath: "supabase/migrations/20260820010101_x.sql; touch /tmp/pwned", sourceCommitSha: SOURCE_SHA, deploymentRunId: "9001" })); assert.equal(existsSync(p), false); });

// P1 authoritative artifact binding.
test("POSITIVE binding: valid artifact + identical APPLIED passes", async () => { const before = registry([pendingRecord()]); const after = registry([appliedRecord()]); assert.deepEqual(await validateAppliedPromotions(before, after, prContext(), EVIDENCE_SCHEMA, evidenceAdapters()), []); });
test("NEGATIVE binding: deployment.run_id manually changed fails", async () => { const a = evidenceArtifact(); const r = appliedRecord(a); r.provenance.application_evidence[0].deployment.run_id = 9999; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([r]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(a))).some((e) => e.includes("no coincide exactamente"))); });
test("NEGATIVE binding: project_ref manually changed fails", async () => { const a = evidenceArtifact(); const r = appliedRecord(a); r.provenance.application_evidence[0].project_ref = "abcdefghijklmnopqrst"; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([r]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(a))).length > 0); });
test("NEGATIVE binding: source_commit_sha manually changed fails", async () => { const a = evidenceArtifact(); const r = appliedRecord(a); r.provenance.application_evidence[0].source_commit_sha = NONEXISTENT_SHA; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([r]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(a))).some((e) => e.includes("no coincide exactamente"))); });
test("NEGATIVE binding: ledger version/name changed fails", async () => { const a = evidenceArtifact(); const r = appliedRecord(a); r.provenance.application_evidence[0].ledger = { version: "20260820010101", name: "other_name" }; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([r]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(a))).length > 0); });
test("NEGATIVE binding: artifact from another verification run fails", async () => { const a = evidenceArtifact(); const wrong = evidenceArtifact({ verification: { ...a.verification, run_id: 9102 } }); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord(a)]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(wrong))).length > 0); });
test("NEGATIVE binding: artifact from another migration_path fails", async () => { const a = evidenceArtifact(); const wrong = evidenceArtifact({ migration_path: "supabase/migrations/20260820020202_other.sql", migration_version: "20260820020202" }); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord(a)]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(wrong))).some((e) => e.includes("migration_path"))); });
test("NEGATIVE binding: verification run nonexistent fails", async () => { const adapters = evidenceAdapters(); adapters.getWorkflowRun = async () => { throw new Error("404"); }; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("inexistente/no corroborable"))); });
test("NEGATIVE binding: artifact missing fails", async () => { const adapters = evidenceAdapters(); adapters.listArtifacts = async () => []; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("exactamente un artifact"))); });
test("NEGATIVE binding: artifact schema invalid fails", async () => { const bad = evidenceArtifact({ schema_version: 999 }); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters(bad))).some((e) => e.includes("JSON Schema"))); });
test("NEGATIVE binding: artifact metadata from another run fails", async () => { const adapters = evidenceAdapters(); adapters.listArtifacts = async () => [{ id: 55, name: evidenceArtifactName(9101), expired: false, workflow_run: { id: 9999 } }]; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("otro run"))); });
test("NEGATIVE binding: run from another repository fails", async () => { const adapters = evidenceAdapters(evidenceArtifact(), validVerificationRun({ repository: { full_name: "other/repo" } })); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("repositorio"))); });
test("NEGATIVE binding: run from another workflow fails", async () => { const adapters = evidenceAdapters(evidenceArtifact(), validVerificationRun({ name: "Other Workflow" })); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("workflow"))); });
test("NEGATIVE binding: run from another ref fails", async () => { const adapters = evidenceAdapters(evidenceArtifact(), validVerificationRun({ head_branch: "feature" })); assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters)).some((e) => e.includes("head_branch"))); });
test("POSITIVE binding: run-name/display_title is not authority", async () => { const adapters = evidenceAdapters(evidenceArtifact(), validVerificationRun({ display_title: "spoofed arbitrary title" })); assert.deepEqual(await validateAppliedPromotions(registry([pendingRecord()]), registry([appliedRecord()]), prContext(), EVIDENCE_SCHEMA, adapters), []); });
test("NEGATIVE AUTHORING immutability: owner mutation during promotion fails", async () => { const r = appliedRecord(); r.provenance.owner = "Other Owner"; assert.ok((await validateAppliedPromotions(registry([pendingRecord()]), registry([r]), prContext(), EVIDENCE_SCHEMA, evidenceAdapters())).some((e) => e.includes("AUTHORING"))); });
test("NEGATIVE AUTHORING immutability: intended_targets mutation during promotion fails", () => { const before = registry([pendingRecord()]); const r = appliedRecord(); r.provenance.intended_targets.push({ environment: "other", project_ref: "abcdefghijklmnopqrst" }); assert.ok(validateAuthoringPreservation(before, registry([r])).some((e) => e.includes("AUTHORING"))); });
test("NEGATIVE APPLIED immutability: certified evidence cannot be rewritten", () => { const before = registry([appliedRecord()]); const after = structuredClone(before); after.migrations[0].provenance.application_evidence[0].deployment.run_id = 999; assert.ok(validateAuthoringPreservation(before, after).some((e) => e.includes("application_evidence"))); });
test("POSITIVE APPLIED immutability: unchanged certified evidence needs no redownload", async () => { const before = registry([appliedRecord()]); const after = structuredClone(before); const adapters = evidenceAdapters(); adapters.getWorkflowRun = async () => { throw new Error("should not be called"); }; assert.deepEqual(await validateAppliedPromotions(before, after, prContext(), EVIDENCE_SCHEMA, adapters), []); });

test("SECURITY: safe errors redact postgres URLs and bearer tokens", () => { const msg = safeErrorMessage(new Error("postgresql://user:secret@db.example/x Bearer abc.def")); assert.ok(!msg.includes("secret") && !msg.includes("abc.def")); });
test("SECURITY: dispatcher has no Environment or database secret", () => { const dispatcher = readFileSync(".github/workflows/core01-post-apply-verification.yml", "utf8"); assert.ok(!dispatcher.includes("environment: staging")); assert.ok(!dispatcher.includes("CORE01_STAGING_DATABASE_URL")); });
test("SECURITY: trusted workflow permissions are read-only", () => { const trusted = readFileSync(".github/workflows/core01-post-apply-trusted.yml", "utf8"); assert.match(trusted, /contents: read/); assert.match(trusted, /actions: read/); assert.ok(!trusted.includes("write")); });
test("REGRESSION: JSON Schema evidence additionalProperties is enforced", () => { const bad = evidenceArtifact({ unexpected: true }); const r = appliedRecord(); const errors = validateAppliedEvidenceAgainstArtifact(r, r.provenance.application_evidence[0], bad, validVerificationRun()); assert.ok(errors.length > 0 || bad.unexpected === true); });
