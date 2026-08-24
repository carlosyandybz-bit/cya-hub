/**
 * BONUS-USABILITY-01 — shared client/test contract.
 * Database predicates/RPCs are authoritative once the migration is applied.
 * This module contains only deterministic policy mirrors and request DTOs.
 */

export type BonusStatus = "active" | "exhausted" | "cancelled";
export type BonusPaymentStatus = "paid" | "pending" | "refunded";
export type BonusModality = "individual" | "pair";

export interface BonusPausePeriod {
  pausedAt: string;
  resumedAt: string | null;
  reason?: string | null;
}

export interface BonusPolicySnapshot {
  status: BonusStatus;
  paymentStatus: BonusPaymentStatus;
  startsAt: string;
  expiresAt: string | null;
  balanceMinutes: number;
  pausePeriods: readonly BonusPausePeriod[];
}

export interface BonusPersonFacts {
  person_id: number;
  at: string;
  has_usable_presential_bonus: boolean;
  has_qualifying_presential_billing_intent: boolean;
}

export interface CreditMovementLike { deltaMinutes: number }
export interface CapacityEditInput { currentValidConsumptionMinutes: number; newTotalCapacityMinutes: number }

export interface BonusEditRequest {
  grantId: number;
  label: string | null;
  totalMinutes: number;
  priceCents: number;
  purchasedAt: string;
  startsAt: string;
  expiresAt: string | null;
  reason: string;
}

export interface HistoricalConsumptionDraft {
  minutes: number;
  occurredAt: string;
  dateApproximate: boolean;
  provenance: string;
  note?: string | null;
}

export interface HistoricalBonusImportDraft {
  personIds: readonly number[];
  modality: BonusModality;
  label?: string | null;
  totalMinutes: number;
  priceCents: number;
  purchasedAt: string;
  purchaseDateApproximate: boolean;
  startsAt: string;
  expiresAt: string | null;
  paymentStatus: Extract<BonusPaymentStatus,"paid"|"pending">;
  priorConsumption: readonly HistoricalConsumptionDraft[];
  provenance: string;
  reason: string;
}

export type BonusConsumptionOrigin =
  | { kind: "class"; classId: number }
  | { kind: "historical_import"; provenance: string };

export interface BonusConsumptionCorrectionDraft {
  originalMovementId: number;
  originalOrigin: BonusConsumptionOrigin;
  replacementConsumedMinutes: number;
  reason: string;
}

export const BONUS_RPC_CONTRACTS = {
  creditGrantIsUsable: "credit_grant_is_usable",
  billingPersonFacts: "billing_person_facts",
  createCreditGrantV2: "create_credit_grant_v2",
  editCreditGrant: "edit_credit_grant",
  pauseCreditGrant: "pause_credit_grant",
  resumeCreditGrant: "resume_credit_grant",
  refundCreditGrantTotal: "refund_credit_grant_total",
  setHistoricalImportEnabled: "set_billing_historical_import_enabled",
  importHistoricalCreditGrant: "import_historical_credit_grant",
  correctCreditConsumption: "correct_credit_consumption",
} as const;

function toMillis(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid_${field}`);
  return parsed;
}

export function validatePausePeriods(periods: readonly BonusPausePeriod[]): void {
  const sorted=periods.map((period)=>({start:toMillis(period.pausedAt,"paused_at"),end:period.resumedAt===null?null:toMillis(period.resumedAt,"resumed_at")})).sort((a,b)=>a.start-b.start);
  let previousEnd=Number.NEGATIVE_INFINITY;
  let open=false;
  for (const period of sorted) {
    if (open) throw new Error("pause_after_open_period");
    if (period.end!==null && period.end<=period.start) throw new Error("invalid_pause_interval");
    if (period.start<previousEnd) throw new Error("overlapping_pause_periods");
    if (period.end===null) open=true; else previousEnd=period.end;
  }
}

export function ledgerBalanceMinutes(movements: readonly CreditMovementLike[]): number {
  return movements.reduce((sum,movement)=>{
    if (!Number.isInteger(movement.deltaMinutes)) throw new Error("invalid_movement_delta_minutes");
    return sum+movement.deltaMinutes;
  },0);
}

export function isBonusPausedAt(snapshot: Pick<BonusPolicySnapshot,"pausePeriods">,at:string):boolean {
  validatePausePeriods(snapshot.pausePeriods);
  const now=toMillis(at,"evaluation_time");
  return snapshot.pausePeriods.some((period)=>{
    const start=toMillis(period.pausedAt,"paused_at");
    const end=period.resumedAt===null?Number.POSITIVE_INFINITY:toMillis(period.resumedAt,"resumed_at");
    return start<=now && now<end;
  });
}

export function effectiveExpiryAt(snapshot: Pick<BonusPolicySnapshot,"expiresAt"|"pausePeriods">,at:string):string|null {
  if (snapshot.expiresAt===null) return null;
  validatePausePeriods(snapshot.pausePeriods);
  const now=toMillis(at,"evaluation_time");
  let expiry=toMillis(snapshot.expiresAt,"expires_at");
  for (const period of [...snapshot.pausePeriods].sort((a,b)=>toMillis(a.pausedAt,"paused_at")-toMillis(b.pausedAt,"paused_at"))) {
    const start=toMillis(period.pausedAt,"paused_at");
    if (start>now) break;
    if (start>=expiry) continue;
    const end=Math.min(period.resumedAt===null?now:toMillis(period.resumedAt,"resumed_at"),now);
    if (end>start) expiry+=end-start;
  }
  return new Date(expiry).toISOString();
}

export function isEffectivelyExpiredAt(snapshot: Pick<BonusPolicySnapshot,"expiresAt"|"pausePeriods">,at:string):boolean {
  const expiry=effectiveExpiryAt(snapshot,at);
  return expiry!==null && toMillis(expiry,"effective_expires_at")<=toMillis(at,"evaluation_time");
}

function operational(snapshot:Pick<BonusPolicySnapshot,"status"|"paymentStatus"|"balanceMinutes">):boolean {
  return snapshot.status==="active" && (snapshot.paymentStatus==="paid"||snapshot.paymentStatus==="pending") && Number.isFinite(snapshot.balanceMinutes) && snapshot.balanceMinutes>0;
}

export function isUsableBonusAt(snapshot:BonusPolicySnapshot,at:string):boolean {
  if (!operational(snapshot)) return false;
  if (toMillis(snapshot.startsAt,"starts_at")>toMillis(at,"evaluation_time")) return false;
  if (isBonusPausedAt(snapshot,at)) return false;
  return !isEffectivelyExpiredAt(snapshot,at);
}

// DP-14 = 14B: future-start and paused qualifying grants still prove presencial intent.
export function qualifiesPresentialBillingIntentAt(snapshot:BonusPolicySnapshot,at:string):boolean {
  return operational(snapshot) && !isEffectivelyExpiredAt(snapshot,at);
}

export function validateCapacityEdit(input:CapacityEditInput):void {
  if (!Number.isInteger(input.currentValidConsumptionMinutes)||input.currentValidConsumptionMinutes<0) throw new Error("invalid_current_consumption_minutes");
  if (!Number.isInteger(input.newTotalCapacityMinutes)||input.newTotalCapacityMinutes<=0) throw new Error("invalid_total_capacity_minutes");
  if (input.newTotalCapacityMinutes<input.currentValidConsumptionMinutes) throw new Error("capacity_below_current_valid_consumption");
}

export function validateHistoricalBonusImport(draft:HistoricalBonusImportDraft):void {
  if (draft.personIds.length!==(draft.modality==="individual"?1:2)) throw new Error("invalid_member_count");
  if (new Set(draft.personIds).size!==draft.personIds.length) throw new Error("duplicate_member");
  const consumed=draft.priorConsumption.reduce((sum,item)=>sum+item.minutes,0);
  validateCapacityEdit({currentValidConsumptionMinutes:consumed,newTotalCapacityMinutes:draft.totalMinutes});
  if (!Number.isInteger(draft.priceCents)||draft.priceCents<0) throw new Error("invalid_price_cents");
  if (!draft.provenance.trim()||!draft.reason.trim()) throw new Error("missing_historical_provenance_or_reason");
  toMillis(draft.purchasedAt,"purchased_at"); toMillis(draft.startsAt,"starts_at");
  if (draft.expiresAt!==null) toMillis(draft.expiresAt,"expires_at");
  for (const item of draft.priorConsumption) {
    if (!Number.isInteger(item.minutes)||item.minutes<=0) throw new Error("invalid_historical_consumption_minutes");
    if (!item.provenance.trim()) throw new Error("missing_historical_consumption_provenance");
    toMillis(item.occurredAt,"historical_consumption_at");
  }
}

export function validateConsumptionCorrection(draft:BonusConsumptionCorrectionDraft):void {
  if (!Number.isInteger(draft.originalMovementId)||draft.originalMovementId<=0) throw new Error("invalid_original_movement_id");
  if (!Number.isInteger(draft.replacementConsumedMinutes)||draft.replacementConsumedMinutes<0) throw new Error("invalid_replacement_consumed_minutes");
  if (!draft.reason.trim()) throw new Error("missing_correction_reason");
  if (draft.originalOrigin.kind==="class" && (!Number.isInteger(draft.originalOrigin.classId)||draft.originalOrigin.classId<=0)) throw new Error("invalid_class_origin");
  if (draft.originalOrigin.kind==="historical_import" && !draft.originalOrigin.provenance.trim()) throw new Error("missing_historical_origin_provenance");
}
