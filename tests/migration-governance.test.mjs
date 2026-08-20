import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNameStatus,
  validateChanges,
  validateInventory,
  validateCanonicalTimestamps,
  validateProvenanceRecord,
} from "../scripts/check-migration-governance.mjs";

const PROVENANCE_SCHEMA = { "x-cya-schema-version": 1, title: "CORE-01 post-contract migration provenance" };
const BASE_SHA = "9bd740fa9b7dd153e937c1bff2eb32d3828c2954";
const TEST_APPLIED_COMMIT = "1234567890abcdef1234567890abcdef12345678";

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

function pendingRecord(path = "supabase/migrations/20260820010101_add_safe_thing.sql") {
  return {
    path,
    migration_version: path.match(/(\d{14})_/)?.[1],
    operational_class: "CANONICA",
    applied_state: "PREPARADA_NO_APLICADA",
    provenance: {
      schema_version: 1,
      lifecycle_phase: "AUTHORING",
      owner: "CORE/Data",
      func_id: "FUNC-0211",
      authorship: {
        repository: "carlosyandybz-bit/cya-hub",
        base_sha: BASE_SHA,
        pr_number: 123,
      },
      intended_targets: [{ environment: "staging", project_ref: "qlngfkzmncihtdzktcmd" }],
      recovery: {
        strategy: "forward_fix",
        plan: "If application later fails, preserve the ledger and correct forward with a later canonical migration.",
      },
      application_evidence: null,
    },
  };
}

function appliedRecord(path = "supabase/migrations/20260820010101_add_safe_thing.sql") {
  const record = pendingRecord(path);
  record.applied_state = "APLICADA";
  record.provenance.lifecycle_phase = "APPLIED";
  record.provenance.application_evidence = [{
    environment: "staging",
    project_ref: "qlngfkzmncihtdzktcmd",
    source_commit_sha: TEST_APPLIED_COMMIT,
    ledger: { version: record.migration_version, name: "add_safe_thing" },
    deployment: { kind: "github_actions", reference: "test-fixture-run-1", result: "SUCCESS" },
    verified_at: "2026-08-20T05:30:00Z",
  }];
  return record;
}

function registry(records = []) {
  return {
    schema_version: 1,
    record_schema: "docs/CORE_01_MIGRATION_PROVENANCE.schema.json",
    migrations: records,
  };
}

function actual(records = []) {
  return {
    "db/migrations": ["db/migrations/v1_old.sql"],
    "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql", ...records.map((r) => r.path)],
  };
}

test("parses name-status including renames", () => {
  assert.deepEqual(parseNameStatus("A\ta.sql\nR100\told.sql\tnew.sql\n"), [
    { status: "A", paths: ["a.sql"] },
    { status: "R100", paths: ["old.sql", "new.sql"] },
  ]);
});

test("POSITIVE: accepts a new PREPARADA_NO_APLICADA migration with honest AUTHORING provenance", () => {
  const record = pendingRecord();
  const errors = validateChanges([{ status: "A", paths: [record.path] }], baseManifest(), registry([record]), PROVENANCE_SCHEMA);
  assert.deepEqual(errors, []);
});

test("NEGATIVE: rejects a new migration without provenance", () => {
  const record = pendingRecord();
  delete record.provenance;
  const errors = validateChanges([{ status: "A", paths: [record.path] }], baseManifest(), registry([record]), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("falta provenance")));
});

test("NEGATIVE: rejects partial authoring provenance", () => {
  const record = pendingRecord();
  delete record.provenance.authorship.pr_number;
  delete record.provenance.recovery.plan;
  const errors = validateChanges([{ status: "A", paths: [record.path] }], baseManifest(), registry([record]), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("pr_number")));
  assert.ok(errors.some((e) => e.includes("recovery.plan")));
});

test("NEGATIVE: rejects APLICADA without ledger/environment deployment evidence", () => {
  const record = pendingRecord();
  record.applied_state = "APLICADA";
  record.provenance.lifecycle_phase = "APPLIED";
  record.provenance.application_evidence = null;
  const errors = validateProvenanceRecord(record);
  assert.ok(errors.some((e) => e.includes("APLICADA exige application_evidence")));
});

test("NEGATIVE: PREPARADA_NO_APLICADA rejects fabricated future application evidence", () => {
  const record = pendingRecord();
  record.provenance.application_evidence = appliedRecord().provenance.application_evidence;
  const errors = validateProvenanceRecord(record);
  assert.ok(errors.some((e) => e.includes("application_evidence=null")));
});

test("POSITIVE: accepts a structurally complete APPLIED lifecycle representation without executing SQL", () => {
  assert.deepEqual(validateProvenanceRecord(appliedRecord()), []);
});

test("NEGATIVE nominal: new supabase/migrations SQL absent from the combined inventory is rejected", () => {
  const path = "supabase/migrations/20260820010101_add_safe_thing.sql";
  const errors = validateChanges([{ status: "A", paths: [path] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("ausente") || e.includes("falta registrar")));
});

test("grandfathered historical inventory does not require fabricated provenance", () => {
  assert.deepEqual(validateInventory(actual(), baseManifest(), registry(), PROVENANCE_SCHEMA), []);
});

test("rejects legacy canonical_pending as a provenance bypass", () => {
  const manifest = baseManifest();
  manifest.canonical_pending = [{ path: "supabase/migrations/20260820010101_bypass.sql" }];
  const errors = validateInventory(actual(), manifest, registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("canonical_pending ya no es una vía válida")));
});

test("rejects a new legacy db migration", () => {
  const errors = validateChanges([{ status: "A", paths: ["db/migrations/v999_bad.sql"] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("db/migrations está congelado")));
});

test("rejects a new non-timestamped Supabase migration", () => {
  const path = "supabase/migrations/v999_bad.sql";
  const errors = validateChanges([{ status: "A", paths: [path] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("YYYYMMDDHHMMSS")));
});

test("rejects mutation of existing canonical/legacy migration SQL", () => {
  const errors = validateChanges([{ status: "M", paths: ["supabase/migrations/v2_old.sql"] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("inmutables")));
});

test("rejects root bootstrap SQL changes", () => {
  const errors = validateChanges([{ status: "M", paths: ["supabase/v47_p19_persona_unica.sql"] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("bootstrap/compatibilidad")));
});

test("rejects applied-history as a second authoring route", () => {
  const errors = validateChanges([{ status: "A", paths: ["supabase/applied-history/20260820-x.sql"] }], baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("segunda ruta")));
});

test("rejects migrations older than the real staging ledger head", () => {
  const record = pendingRecord("supabase/migrations/20260819120000_backdated.sql");
  const errors = validateChanges([{ status: "A", paths: [record.path] }], baseManifest(), registry([record]), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("retrodatadas")));
});

test("rejects an invalid UTC timestamp even when it has 14 digits", () => {
  const record = pendingRecord("supabase/migrations/20261332010101_invalid_date.sql");
  const errors = validateChanges([{ status: "A", paths: [record.path] }], baseManifest(), registry([record]), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("fecha/hora UTC válida")));
});

test("inventory requires every SQL in both governed routes to be declared", () => {
  const errors = validateInventory({
    "db/migrations": ["db/migrations/v1_old.sql", "db/migrations/v2_untracked.sql"],
    "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql"],
  }, baseManifest(), registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("v2_untracked.sql")));
});

test("inventory rejects artifacts without a governed classification", () => {
  const bad = baseManifest();
  bad.inventory["db/migrations"].historical_operational_class = undefined;
  const errors = validateInventory(actual(), bad, registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("operational_class")));
});

test("inventory rejects an invalid applied state", () => {
  const bad = baseManifest();
  bad.inventory["db/migrations"].states = { NO_ES_ESTADO: ["v1_old.sql"] };
  const errors = validateInventory(actual(), bad, registry(), PROVENANCE_SCHEMA);
  assert.ok(errors.some((e) => e.includes("applied_state")));
});

test("duplicate canonical timestamps are rejected", () => {
  const errors = validateCanonicalTimestamps([
    "supabase/migrations/20260820010101_first.sql",
    "supabase/migrations/20260820010101_second.sql",
  ]);
  assert.equal(errors.length, 1);
});
