import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourcePath = "app/billing/bonus-usability-contract.ts";
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cya-bonus-contract-"));
const tempModule = path.join(tempDir, "bonus-usability-contract.mjs");
fs.writeFileSync(tempModule, compiled);
const policy = await import(`${pathToFileURL(tempModule).href}?v=${Date.now()}`);

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const NOW = "2026-08-21T12:00:00.000Z";
const base = (overrides = {}) => ({
  status: "active",
  paymentStatus: "paid",
  startsAt: "2026-08-01T00:00:00.000Z",
  expiresAt: "2026-09-01T00:00:00.000Z",
  balanceMinutes: 60,
  pausePeriods: [],
  ...overrides,
});

test("usable bonus implements paid|pending, start, pause, expiry and positive-balance contract", () => {
  assert.equal(policy.isUsableBonusAt(base(), NOW), true);
  assert.equal(policy.isUsableBonusAt(base({ paymentStatus: "pending" }), NOW), true);
  assert.equal(policy.isUsableBonusAt(base({ paymentStatus: "refunded" }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ status: "cancelled" }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ status: "exhausted" }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ balanceMinutes: 0 }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ startsAt: "2026-08-22T00:00:00.000Z" }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ expiresAt: "2026-08-21T12:00:00.000Z" }), NOW), false);
  assert.equal(policy.isUsableBonusAt(base({ expiresAt: null }), NOW), true);
});

test("DP-14=14B: future start and active pause may prove presencial intent but are not usable", () => {
  const future = base({ startsAt: "2026-08-22T00:00:00.000Z" });
  assert.equal(policy.isUsableBonusAt(future, NOW), false);
  assert.equal(policy.qualifiesPresentialBillingIntentAt(future, NOW), true);

  const paused = base({ pausePeriods: [{ pausedAt: "2026-08-20T00:00:00.000Z", resumedAt: null }] });
  assert.equal(policy.isUsableBonusAt(paused, NOW), false);
  assert.equal(policy.qualifiesPresentialBillingIntentAt(paused, NOW), true);
});

test("terminal/payment/balance/expiry states do not qualify presencial intent", () => {
  for (const snapshot of [
    base({ status: "exhausted" }),
    base({ status: "cancelled" }),
    base({ paymentStatus: "refunded" }),
    base({ balanceMinutes: 0 }),
    base({ expiresAt: "2026-08-21T11:59:59.999Z" }),
  ]) {
    assert.equal(policy.qualifiesPresentialBillingIntentAt(snapshot, NOW), false);
  }
});

test("pause freezes validity and accumulated completed pauses extend effective expiry", () => {
  const snapshot = base({
    expiresAt: "2026-08-21T10:00:00.000Z",
    pausePeriods: [
      { pausedAt: "2026-08-10T00:00:00.000Z", resumedAt: "2026-08-11T00:00:00.000Z" },
      { pausedAt: "2026-08-15T00:00:00.000Z", resumedAt: "2026-08-17T00:00:00.000Z" },
    ],
  });
  assert.equal(policy.effectiveExpiryAt(snapshot, NOW), "2026-08-24T10:00:00.000Z");
  assert.equal(policy.isEffectivelyExpiredAt(snapshot, NOW), false);
  assert.equal(policy.isUsableBonusAt(snapshot, NOW), true);
});

test("an open pause extends effective expiry as time elapses without making the bonus usable", () => {
  const snapshot = base({
    expiresAt: "2026-08-21T10:00:00.000Z",
    pausePeriods: [{ pausedAt: "2026-08-20T10:00:00.000Z", resumedAt: null }],
  });
  assert.equal(policy.effectiveExpiryAt(snapshot, NOW), "2026-08-22T12:00:00.000Z");
  assert.equal(policy.isUsableBonusAt(snapshot, NOW), false);
  assert.equal(policy.qualifiesPresentialBillingIntentAt(snapshot, NOW), true);
});

test("invalid pause history is rejected instead of silently double-counting validity", () => {
  assert.throws(
    () => policy.validatePausePeriods([
      { pausedAt: "2026-08-10T00:00:00.000Z", resumedAt: "2026-08-12T00:00:00.000Z" },
      { pausedAt: "2026-08-11T00:00:00.000Z", resumedAt: "2026-08-13T00:00:00.000Z" },
    ]),
    /overlapping_pause_periods/,
  );
  assert.throws(
    () => policy.validatePausePeriods([{ pausedAt: "2026-08-10T00:00:00.000Z", resumedAt: "2026-08-09T00:00:00.000Z" }]),
    /invalid_pause_interval/,
  );
});

test("ledger balance is the sum of immutable movement deltas", () => {
  assert.equal(policy.ledgerBalanceMinutes([{ deltaMinutes: 600 }, { deltaMinutes: -60 }, { deltaMinutes: 30 }]), 570);
  assert.throws(() => policy.ledgerBalanceMinutes([{ deltaMinutes: 1.5 }]), /invalid_movement_delta_minutes/);
});

test("capacity may be corrected down to consumed minutes, never below; price is not coupled", () => {
  assert.doesNotThrow(() => policy.validateCapacityEdit({ currentValidConsumptionMinutes: 120, newTotalCapacityMinutes: 120 }));
  assert.doesNotThrow(() => policy.validateCapacityEdit({ currentValidConsumptionMinutes: 120, newTotalCapacityMinutes: 600 }));
  assert.throws(
    () => policy.validateCapacityEdit({ currentValidConsumptionMinutes: 120, newTotalCapacityMinutes: 119 }),
    /capacity_below_current_valid_consumption/,
  );
  assert.match(source, /totalCapacityMinutes\?: number/);
  assert.match(source, /priceCents\?: number/);
  assert.doesNotMatch(source, /pricePerMinute|minutesPerPrice|recalculatePrice/i);
});

test("historical import records prior consumption facts without class/attendance/payment fabrication", () => {
  const draft = {
    personIds: [7],
    modality: "individual",
    totalCapacityMinutes: 600,
    priceCents: 12000,
    purchasedAt: "2025-01-01T00:00:00.000Z",
    purchaseDateApproximate: true,
    startsAt: "2025-01-01T00:00:00.000Z",
    expiresAt: null,
    paymentStatus: "paid",
    priorConsumption: [{
      minutes: 180,
      occurredAt: "2025-02-01T00:00:00.000Z",
      dateApproximate: true,
      provenance: "legacy-ledger",
    }],
    provenance: "legacy-import",
  };
  assert.doesNotThrow(() => policy.validateHistoricalBonusImport(draft));
  for (const forbiddenField of ["classId", "attendanceId", "paymentId"]) {
    assert.equal(Object.hasOwn(draft, forbiddenField), false);
    assert.equal(Object.hasOwn(draft.priorConsumption[0], forbiddenField), false);
  }
  assert.throws(
    () => policy.validateHistoricalBonusImport({ ...draft, totalCapacityMinutes: 179 }),
    /capacity_below_current_valid_consumption/,
  );
});

test("DP-BONUS-15=15A correction contract targets an original movement and preserves origin", () => {
  assert.doesNotThrow(() => policy.validateConsumptionCorrection({
    originalMovementId: 22,
    originalOrigin: { kind: "class", classId: 9 },
    replacementConsumedMinutes: 45,
    reason: "Corrección administrativa documentada",
  }));
  assert.doesNotThrow(() => policy.validateConsumptionCorrection({
    originalMovementId: 23,
    originalOrigin: { kind: "historical_import", provenance: "legacy-import" },
    replacementConsumedMinutes: 30,
    reason: "Dato histórico corregido",
  }));
  assert.throws(
    () => policy.validateConsumptionCorrection({
      originalMovementId: 22,
      originalOrigin: { kind: "class", classId: 9 },
      replacementConsumedMinutes: 45,
      reason: "",
    }),
    /missing_correction_reason/,
  );
});

test("RPC manifest excludes partial refund and keeps every planned server contract migration-gated", () => {
  const contracts = policy.PLANNED_BONUS_RPC_CONTRACTS;
  assert.equal(Object.hasOwn(contracts, "refundCreditGrantPartial"), false);
  assert.equal(Object.hasOwn(contracts, "refundCreditGrantTotal"), true);
  assert.equal(Object.values(contracts).every((contract) => contract.requiresMigrationSlot === true), true);
  assert.match(contracts.billingPersonFacts.purpose, /facts only/i);
});
