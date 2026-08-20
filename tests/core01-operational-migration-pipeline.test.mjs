import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CORE01_REPOSITORY,
  safeErrorMessage,
  validateVerificationRun,
} from "../scripts/core01-provenance.mjs";
import {
  CORE02_DEPLOYMENT_WORKFLOW,
  CORE02_DEPLOYMENT_WORKFLOW_PATH,
  CORE02_STAGING_PROJECT_REF,
  assertCore02LedgerAbsent,
  assertCore02TrustedContext,
  buildCore02AtomicApplySql,
  parseCore02DeployRef,
  parseCore02VerifyRef,
  validateCore02DeploymentAuthority,
  validateCore02LedgerRow,
  validateCore02MigrationSql,
  validateCore02SourceData,
} from "../scripts/verify-migration-source-data.mjs";

const RECORD_SCHEMA = JSON.parse(readFileSync(resolve("docs/CORE_01_MIGRATION_PROVENANCE.schema.json"), "utf8"));
const TRUSTED_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SOURCE_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MIGRATION_PATH = "supabase/migrations/20260820195300_person_lifecycle_student_predicate.sql";
const BLOB_SHA = "cccccccccccccccccccccccccccccccccccccccc";
const SQL = "create table private.core02_probe(id bigint);";

function record(overrides = {}) {
  const r = {
    path: MIGRATION_PATH,
    migration_version: "20260820195300",
    operational_class: "CANONICA",
    applied_state: "PREPARADA_NO_APLICADA",
    provenance: {
      schema_version: 3,
      lifecycle_phase: "AUTHORING",
      owner: "TEST / CORE-02",
      func_id: "FUNC-0040",
      authorship: { repository: CORE01_REPOSITORY, base_sha: TRUSTED_SHA, pr_number: 124 },
      intended_targets: [{ environment: "staging", project_ref: CORE02_STAGING_PROJECT_REF }],
      recovery: { strategy: "forward_fix", plan: "Forward-fix with a later canonical migration; never mutate applied history." },
      application_evidence: null,
    },
  };
  return Object.assign(r, overrides);
}
function registry(records = [record()]) {
  return { schema_version: 3, record_schema: "docs/CORE_01_MIGRATION_PROVENANCE.schema.json", evidence_schema: "docs/CORE_01_POST_APPLY_EVIDENCE.schema.json", contract: "CORE-01", func_id: "FUNC-0211", grandfathering: { historical_inventory: "docs/CORE_01_MIGRATION_INVENTORY.json", base_sha: "9bd740fa9b7dd153e937c1bff2eb32d3828c2954", rule: "Historical artifacts remain classified." }, migrations: records };
}
function content(path, text, sha = BLOB_SHA) { return { path, type: "file", encoding: "base64", content: Buffer.from(text).toString("base64"), sha }; }
function pull(overrides = {}) {
  return {
    number: 124,
    state: "open",
    head: { sha: SOURCE_SHA, repo: { full_name: CORE01_REPOSITORY } },
    base: { ref: "staging", sha: TRUSTED_SHA, repo: { full_name: CORE01_REPOSITORY } },
    ...overrides,
  };
}
function files(extra = []) { return [{ filename: MIGRATION_PATH, status: "added", sha: BLOB_SHA }, { filename: "docs/CORE_01_MIGRATION_PROVENANCE.json", status: "modified", sha: "dddddddddddddddddddddddddddddddddddddddd" }, ...extra]; }
function adapters(options = {}) {
  const reg = options.registry ?? registry();
  const pr = options.pull ?? pull();
  const prFiles = options.files ?? files();
  const sqlSha = options.sqlSha ?? BLOB_SHA;
  return {
    getCommit: async () => ({ sha: options.commitSha ?? SOURCE_SHA }),
    getPullRequest: async () => pr,
    listPullRequestFiles: async () => prFiles,
    getContent: async (path) => path === "docs/CORE_01_MIGRATION_PROVENANCE.json" ? content(path, JSON.stringify(reg), "dddddddddddddddddddddddddddddddddddddddd") : content(path, options.sql ?? SQL, sqlSha),
  };
}
async function sourceData(options = {}) {
  return validateCore02SourceData({ sourceCommitSha: options.sourceCommitSha ?? SOURCE_SHA, prNumber: 124, trustedBaseSha: TRUSTED_SHA, projectRef: options.projectRef ?? CORE02_STAGING_PROJECT_REF, requireCurrentPrBase: true, recordSchema: RECORD_SCHEMA, rootDir: process.cwd() }, adapters(options));
}
function deployRun(overrides = {}) { return { id: 9001, repository: { full_name: CORE01_REPOSITORY }, name: CORE02_DEPLOYMENT_WORKFLOW, path: CORE02_DEPLOYMENT_WORKFLOW_PATH, event: "push", status: "completed", conclusion: "success", head_sha: TRUSTED_SHA, workflow_id: 77, ...overrides }; }
function deployArtifact(overrides = {}) { return { repository: CORE01_REPOSITORY, environment: "staging", project_ref: CORE02_STAGING_PROJECT_REF, trusted_pipeline_sha: TRUSTED_SHA, deployment: { run_id: 9001, workflow_id: 77 }, ...overrides }; }

// Required CORE-02 operational contract probes.
test("CORE02 01 positive: provenance is loaded as source-SHA data and validates", async () => { const data = await sourceData(); assert.equal(data.migrationPath, MIGRATION_PATH); assert.equal(data.sourceCommitSha, SOURCE_SHA); });
test("CORE02 02 negative: missing source provenance is rejected", async () => assert.rejects(() => sourceData({ registry: registry([]) }), /provenance AUTHORING ausente/));
test("CORE02 03 negative: provenance from another PR is rejected", async () => { const r = record(); r.provenance.authorship.pr_number = 999; await assert.rejects(() => sourceData({ registry: registry([r]) }), /pr_number/); });
test("CORE02 04 negative: mutable/invalid source SHA is rejected", async () => { assert.throws(() => parseCore02DeployRef("refs/tags/core01-staging-deploy-pr-124-sha-staging"), /40hex|trigger deployment/); await assert.rejects(() => sourceData({ sourceCommitSha: "main" }), /40 hex|40hex|SHA-1/); });
test("CORE02 05 negative: provenance migration path different from PR migration is rejected", async () => { const r = record({ path: "supabase/migrations/20260820195400_other.sql", migration_version: "20260820195400" }); await assert.rejects(() => sourceData({ registry: registry([r]) }), /provenance AUTHORING ausente/); });
test("CORE02 06 negative: SQL blob different from PR-declared blob is rejected", async () => assert.rejects(() => sourceData({ sqlSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }), /blob SQL/));
test("CORE02 07 negative: repository mismatch is rejected", async () => assert.rejects(() => sourceData({ pull: pull({ head: { sha: SOURCE_SHA, repo: { full_name: "other/repo" } } }) }), /otro repositorio/));
test("CORE02 08 negative: project_ref mismatch is rejected", async () => { const r=record(); r.provenance.intended_targets=[{environment:"staging",project_ref:"abcdefghijklmnopqrst"}]; await assert.rejects(() => sourceData({ registry: registry([r]) }), /target debe ser exclusivamente/); });
test("CORE02 09 negative: deployment workflow ID not allowlisted is rejected", () => assert.ok(validateCore02DeploymentAuthority(deployRun(), deployArtifact(), { deploymentRunId: 9001, trustedPipelineSha: TRUSTED_SHA }, new Set([88])).some(e => e.includes("allowlisted"))));
test("CORE02 10 negative: failed deployment run is rejected", () => assert.ok(validateCore02DeploymentAuthority(deployRun({ conclusion: "failure" }), deployArtifact(), { deploymentRunId: 9001, trustedPipelineSha: TRUSTED_SHA }, new Set([77])).some(e => e.includes("completed/success"))));
test("CORE02 11 negative: ledger missing row is rejected", () => assert.throws(() => validateCore02LedgerRow(null, { migrationVersion:"20260820195300", migrationName:"person_lifecycle_student_predicate" }), /sin fila/));
test("CORE02 12 negative: correct ledger version with wrong name is rejected", () => assert.throws(() => validateCore02LedgerRow({version:"20260820195300",name:"wrong"},{migrationVersion:"20260820195300",migrationName:"person_lifecycle_student_predicate"}), /name/));
test("CORE02 13 negative: double application is blocked before apply", () => assert.throws(() => assertCore02LedgerAbsent({version:"20260820195300",name:"person_lifecycle_student_predicate"}), /Doble aplicación/));
test("CORE02 14 negative: more than one canonical migration in PR is rejected", async () => assert.rejects(() => sourceData({ files: files([{filename:"supabase/migrations/20260820195400_second.sql",status:"added",sha:"ffffffffffffffffffffffffffffffffffffffff"}]) }), /exactamente una migración/));
test("CORE02 15 negative: no arbitrary SQL input/dispatch exists in deployment workflow", () => { const wf=readFileSync(".github/workflows/core01-deploy-migration.yml","utf8"); assert.doesNotMatch(wf,/workflow_dispatch|inputs\.sql|arbitrary_sql|migration_sql:/i); assert.match(wf,/verify-migration-deployment\.mjs --apply/); });
test("CORE02 16 negative: consumer PR modification of trusted workflow is rejected", async () => assert.rejects(() => sourceData({ files: files([{filename:".github/workflows/core01-deploy-migration.yml",status:"modified",sha:"ffffffffffffffffffffffffffffffffffffffff"}]) }), /modifica trusted CORE-01 code/));
test("CORE02 17 negative: source SHA is never checkout ref in secret-bearing workflows", () => { for(const path of [".github/workflows/core01-deploy-migration.yml",".github/workflows/core01-post-apply-trusted.yml"]){ const wf=readFileSync(path,"utf8"); assert.doesNotMatch(wf,/ref:\s*\$\{\{[^}]*source/i); assert.match(wf,/ref:\s*\$\{\{\s*github\.sha\s*\}\}/); } });
test("CORE02 18 positive: caller/reusable/verifier/evidence identity stays exact", () => { const env={GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"push",GITHUB_REPOSITORY:CORE01_REPOSITORY,GITHUB_REF_TYPE:"tag",GITHUB_REF:`refs/tags/core01-staging-verify-run-9001-pr-124-sha-${SOURCE_SHA}`,GITHUB_WORKFLOW:"CORE-01 Post-Apply Verification",GITHUB_SHA:TRUSTED_SHA,GITHUB_WORKFLOW_SHA:TRUSTED_SHA}; const parsed=assertCore02TrustedContext(env,"verify"); assert.equal(parsed.trustedPipelineSha,TRUSTED_SHA); const caller=readFileSync(".github/workflows/core01-post-apply-verification.yml","utf8"); const trusted=readFileSync(".github/workflows/core01-post-apply-trusted.yml","utf8"); assert.match(caller,/uses:\s*\.\/\.github\/workflows\/core01-post-apply-trusted\.yml/); assert.equal((trusted.match(/ref:\s*\$\{\{\s*github\.sha\s*\}\}/g)??[]).length,2); const verifier=readFileSync("scripts/verify-migration-post-apply.mjs","utf8"); assert.match(verifier,/trusted_verifier_sha:context\.trustedPipelineSha/); });
test("CORE02 19 negative: rerun/TOCTOU workflow SHA mismatch is rejected", () => { const env={GITHUB_ACTIONS:"true",GITHUB_EVENT_NAME:"push",GITHUB_REPOSITORY:CORE01_REPOSITORY,GITHUB_REF_TYPE:"tag",GITHUB_REF:`refs/tags/core01-staging-deploy-pr-124-sha-${SOURCE_SHA}`,GITHUB_WORKFLOW:CORE02_DEPLOYMENT_WORKFLOW,GITHUB_SHA:TRUSTED_SHA,GITHUB_WORKFLOW_SHA:"cccccccccccccccccccccccccccccccccccccccc"}; assert.throws(()=>assertCore02TrustedContext(env,"deploy"),/mismo commit exacto/); });
test("CORE02 20 negative: secret redaction covers database URL and bearer token", () => { const text=safeErrorMessage(new Error("postgresql://user:secret@db/x Bearer abc.def-123")); assert.doesNotMatch(text,/user:secret|abc\.def/); assert.match(text,/REDACTED/); });

// Additional atomicity and backward-compatible APPLIED corroboration probes.
test("CORE02 atomic apply SQL has advisory lock, ledger guard and exact ledger insert", async () => { const source=await sourceData(); const sql=buildCore02AtomicApplySql(source); assert.match(sql,/pg_advisory_xact_lock/); assert.match(sql,/CORE-02 migration version already applied/); assert.match(sql,/insert into supabase_migrations\.schema_migrations/); assert.ok(sql.includes(SQL)); });
test("CORE02 migration runner rejects psql meta commands and explicit transaction control", () => { assert.throws(()=>validateCore02MigrationSql("\\i /tmp/x.sql"),/meta-comandos/); assert.throws(()=>validateCore02MigrationSql("BEGIN; select 1; COMMIT;"),/controlar transacciones/); });
test("CORE02 verification ref parser binds deployment run, PR and immutable source SHA", () => assert.deepEqual(parseCore02VerifyRef(`refs/tags/core01-staging-verify-run-9001-pr-124-sha-${SOURCE_SHA}`),{deploymentRunId:9001,prNumber:124,sourceCommitSha:SOURCE_SHA}));
test("CORE02 APPLIED checker accepts authoritative tag-push verification run while legacy remains supported", () => { assert.deepEqual(validateVerificationRun({id:9101,repository:{full_name:CORE01_REPOSITORY},name:"CORE-01 Post-Apply Verification",path:".github/workflows/core01-post-apply-verification.yml",event:"push",status:"completed",conclusion:"success",head_branch:`core01-staging-verify-run-9001-pr-124-sha-${SOURCE_SHA}`,head_sha:TRUSTED_SHA},9101),[]); });
