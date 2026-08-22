import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const sourcePath="app/billing/bonus-usability-contract.ts";
const source=fs.readFileSync(sourcePath,"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022},fileName:sourcePath}).outputText;
const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),"cya-bonus-contract-"));
const tempModule=path.join(tempDir,"bonus-usability-contract.mjs");
fs.writeFileSync(tempModule,compiled);
const policy=await import(`${pathToFileURL(tempModule).href}?v=${Date.now()}`);
test.after(()=>fs.rmSync(tempDir,{recursive:true,force:true}));

const NOW="2026-08-22T12:00:00.000Z";
const base=(overrides={})=>({status:"active",paymentStatus:"paid",startsAt:"2026-08-01T00:00:00.000Z",expiresAt:"2026-09-01T00:00:00.000Z",balanceMinutes:60,pausePeriods:[],...overrides});

test("paid and pending are usable when every other predicate passes",()=>{
  assert.equal(policy.isUsableBonusAt(base(),NOW),true);
  assert.equal(policy.isUsableBonusAt(base({paymentStatus:"pending"}),NOW),true);
});

test("future start, pause, expiry, zero, exhausted, cancelled and refunded are not usable",()=>{
  for (const snapshot of [
    base({startsAt:"2026-08-23T00:00:00.000Z"}),
    base({pausePeriods:[{pausedAt:"2026-08-21T00:00:00.000Z",resumedAt:null}]}),
    base({expiresAt:NOW}),base({balanceMinutes:0}),base({status:"exhausted"}),base({status:"cancelled"}),base({paymentStatus:"refunded"}),
  ]) assert.equal(policy.isUsableBonusAt(snapshot,NOW),false);
});

test("balance is exactly SUM movement deltas",()=>{
  assert.equal(policy.ledgerBalanceMinutes([{deltaMinutes:600},{deltaMinutes:-60},{deltaMinutes:15}]),555);
});

test("pause extends effective validity",()=>{
  const snapshot=base({expiresAt:"2026-08-22T10:00:00.000Z",pausePeriods:[{pausedAt:"2026-08-20T00:00:00.000Z",resumedAt:"2026-08-21T00:00:00.000Z"}]});
  assert.equal(policy.effectiveExpiryAt(snapshot,NOW),"2026-08-23T10:00:00.000Z");
  assert.equal(policy.isUsableBonusAt(snapshot,NOW),true);
});

test("DP-14=14B future-start and paused can qualify intent while terminal/expired cannot",()=>{
  const future=base({startsAt:"2026-08-23T00:00:00.000Z"});
  const paused=base({pausePeriods:[{pausedAt:"2026-08-21T00:00:00.000Z",resumedAt:null}]});
  assert.equal(policy.qualifiesPresentialBillingIntentAt(future,NOW),true);
  assert.equal(policy.qualifiesPresentialBillingIntentAt(paused,NOW),true);
  for (const snapshot of [base({status:"exhausted"}),base({status:"cancelled"}),base({paymentStatus:"refunded"}),base({balanceMinutes:0}),base({expiresAt:NOW})]) {
    assert.equal(policy.qualifiesPresentialBillingIntentAt(snapshot,NOW),false);
  }
});

test("capacity cannot fall below valid consumption and price is an independent field",()=>{
  assert.doesNotThrow(()=>policy.validateCapacityEdit({currentValidConsumptionMinutes:120,newTotalCapacityMinutes:120}));
  assert.throws(()=>policy.validateCapacityEdit({currentValidConsumptionMinutes:120,newTotalCapacityMinutes:119}),/capacity_below/);
  assert.match(source,/totalMinutes: number/);
  assert.match(source,/priceCents: number/);
  assert.doesNotMatch(source,/pricePerMinute|recalculatePrice|minutesPerPrice/i);
});

test("historical import validates provenance without class attendance or payment ids",()=>{
  const draft={personIds:[7],modality:"individual",totalMinutes:600,priceCents:12000,purchasedAt:"2025-01-01T00:00:00.000Z",purchaseDateApproximate:true,startsAt:"2025-01-01T00:00:00.000Z",expiresAt:null,paymentStatus:"paid",priorConsumption:[{minutes:180,occurredAt:"2025-02-01T00:00:00.000Z",dateApproximate:true,provenance:"legacy-ledger"}],provenance:"legacy-import",reason:"Migración documentada"};
  assert.doesNotThrow(()=>policy.validateHistoricalBonusImport(draft));
  for (const key of ["classId","attendanceId","paymentId"]) assert.equal(Object.hasOwn(draft,key),false);
});

test("DP-BONUS-15=15A correction requires original source and reason",()=>{
  assert.doesNotThrow(()=>policy.validateConsumptionCorrection({originalMovementId:22,originalOrigin:{kind:"class",classId:9},replacementConsumedMinutes:45,reason:"Corrección documentada"}));
  assert.doesNotThrow(()=>policy.validateConsumptionCorrection({originalMovementId:23,originalOrigin:{kind:"historical_import",provenance:"legacy-import"},replacementConsumedMinutes:30,reason:"Corrección documentada"}));
  assert.throws(()=>policy.validateConsumptionCorrection({originalMovementId:22,originalOrigin:{kind:"class",classId:9},replacementConsumedMinutes:45,reason:""}),/missing_correction_reason/);
});

test("RPC contract has total refund and no partial-refund surface",()=>{
  assert.equal(policy.BONUS_RPC_CONTRACTS.refundCreditGrantTotal,"refund_credit_grant_total");
  assert.equal(Object.values(policy.BONUS_RPC_CONTRACTS).some((name)=>/partial/i.test(name)),false);
});
