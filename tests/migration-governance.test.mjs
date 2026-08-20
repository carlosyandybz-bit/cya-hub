import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNameStatus,
  validateChanges,
  validateInventory,
  validateCanonicalTimestamps,
} from "../scripts/check-migration-governance.mjs";

function manifest(extra = []) {
  return {
    canonical_contract: { future_route: "supabase/migrations" },
    staging_ledger_summary: { source: "supabase_migrations.schema_migrations", last_version: "20260819175828" },
    inventory: {
      "db/migrations": { historical_operational_class: "COMPATIBILIDAD", states: { APLICADA: ["v1_old.sql"] } },
      "supabase/migrations": { historical_operational_class: "COMPATIBILIDAD", states: { APLICADA: ["v2_old.sql"], DESCONOCIDA: { "20260819002100_old_timestamp.sql": {} } } },
    },
    canonical_pending: extra.map((a) => ({ path: a.path })),
  };
}

test("parses name-status including renames", () => {
  assert.deepEqual(parseNameStatus("A\ta.sql\nR100\told.sql\tnew.sql\n"), [
    { status: "A", paths: ["a.sql"] },
    { status: "R100", paths: ["old.sql", "new.sql"] },
  ]);
});

test("accepts a registered canonical future migration", () => {
  const path = "supabase/migrations/20260820010101_add_safe_thing.sql";
  const errors = validateChanges(
    [{ status: "A", paths: [path] }],
    manifest([{ route: "supabase/migrations", path, operational_class: "CANONICA", applied_state: "PREPARADA_NO_APLICADA" }]),
  );
  assert.deepEqual(errors, []);
});

test("rejects a new legacy db migration", () => {
  const errors = validateChanges([{ status: "A", paths: ["db/migrations/v999_bad.sql"] }], manifest());
  assert.ok(errors.some((e) => e.includes("db/migrations está congelado")));
});

test("rejects a new non-timestamped Supabase migration", () => {
  const path = "supabase/migrations/v999_bad.sql";
  const errors = validateChanges([{ status: "A", paths: [path] }], manifest());
  assert.ok(errors.some((e) => e.includes("YYYYMMDDHHMMSS")));
});

test("rejects mutation of existing canonical/legacy migration SQL", () => {
  const errors = validateChanges([{ status: "M", paths: ["supabase/migrations/v2_old.sql"] }], manifest());
  assert.ok(errors.some((e) => e.includes("inmutables")));
});

test("rejects root bootstrap SQL changes", () => {
  const errors = validateChanges([{ status: "M", paths: ["supabase/v47_p19_persona_unica.sql"] }], manifest());
  assert.ok(errors.some((e) => e.includes("bootstrap/compatibilidad")));
});

test("rejects applied-history as a second authoring route", () => {
  const errors = validateChanges([{ status: "A", paths: ["supabase/applied-history/20260820-x.sql"] }], manifest());
  assert.ok(errors.some((e) => e.includes("segunda ruta")));
});

test("rejects migrations older than the real staging ledger head", () => {
  const path = "supabase/migrations/20260819120000_backdated.sql";
  const errors = validateChanges(
    [{ status: "A", paths: [path] }],
    manifest([{ route: "supabase/migrations", path, operational_class: "CANONICA", applied_state: "PREPARADA_NO_APLICADA" }]),
  );
  assert.ok(errors.some((e) => e.includes("retrodatadas")));
});

test("rejects an invalid UTC timestamp even when it has 14 digits", () => {
  const path = "supabase/migrations/20261332010101_invalid_date.sql";
  const errors = validateChanges(
    [{ status: "A", paths: [path] }],
    manifest([{ route: "supabase/migrations", path, operational_class: "CANONICA", applied_state: "PREPARADA_NO_APLICADA" }]),
  );
  assert.ok(errors.some((e) => e.includes("fecha/hora UTC válida")));
});

test("inventory requires every SQL in both governed routes to be declared", () => {
  const errors = validateInventory({
    "db/migrations": ["db/migrations/v1_old.sql", "db/migrations/v2_untracked.sql"],
    "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql"],
  }, manifest());
  assert.ok(errors.some((e) => e.includes("v2_untracked.sql")));
});

test("inventory rejects artifacts without a governed classification", () => {
  const bad = manifest();
  bad.inventory["db/migrations"].historical_operational_class = undefined;
  const errors = validateInventory({
    "db/migrations": ["db/migrations/v1_old.sql"],
    "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql"],
  }, bad);
  assert.ok(errors.some((e) => e.includes("operational_class")));
});

test("inventory rejects an invalid applied state", () => {
  const bad = manifest();
  bad.inventory["db/migrations"].states = { NO_ES_ESTADO: ["v1_old.sql"] };
  const errors = validateInventory({
    "db/migrations": ["db/migrations/v1_old.sql"],
    "supabase/migrations": ["supabase/migrations/v2_old.sql", "supabase/migrations/20260819002100_old_timestamp.sql"],
  }, bad);
  assert.ok(errors.some((e) => e.includes("applied_state")));
});

test("duplicate canonical timestamps are rejected", () => {
  const errors = validateCanonicalTimestamps([
    "supabase/migrations/20260820010101_first.sql",
    "supabase/migrations/20260820010101_second.sql",
  ]);
  assert.equal(errors.length, 1);
});
