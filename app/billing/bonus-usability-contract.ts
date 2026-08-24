/**
 * BONUS-USABILITY-01 — pre-migration contract.
 *
 * IMPORTANT: these are pure policy helpers and DTO contracts. They do not replace
 * the authoritative server/RPC predicates that must be materialized in the
 * database when the migration slot is available.
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

export interface CreditMovementLike {
  deltaMinutes: number;
}

export interface CapacityEditInput {
  currentValidConsumptionMinutes: number;
  newTotalCapacityMinutes: number;
}

export interface BonusEditableFields {
  label?: string | null;
  totalCapacityMinutes?: number;
  priceCents?: number;
  purchasedAt?: string;
  startsAt?: string;
  expiresAt?: string | null;
  adminNotes?: string | null;
}

export interface HistoricalConsumptionDraft {
  minutes: number;
  occurredAt: string;
  dateApproximate: boolean;
  provenance: string;
  notes?: string | null;
}

export interface HistoricalBonusImportDraft {
  personIds: readonly number[];
  modality: BonusModality;
  label?: string | null;
  totalCapacityMinutes: number;
  priceCents: number;
  purchasedAt: string;
  purchaseDateApproximate: boolean;
  startsAt: string;
  expiresAt: string | null;
  paymentStatus: Extract<BonusPaymentStatus, "paid" | "pending">;
  priorConsumption: readonly HistoricalConsumptionDraft[];
  provenance: string;
  notes?: string | null;
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

export interface PlannedRpcContract {
  purpose: string;
  mutation: boolean;
  requiresMigrationSlot: true;
}

export const PLANNED_BONUS_RPC_CONTRACTS = {
  billingPersonFacts: {
    purpose: "Expose Billing facts only: usable presencial bonus and qualifying presencial billing intent.",
    mutation: false,
    requiresMigrationSlot: true,
  },
  editCreditGrant: {
    purpose: "Edit authorized bonus fields while keeping capacity and price independent and preserving ledger history.",
    mutation: true,
    requiresMigrationSlot: true,
  },
  pauseCreditGrant: {
    purpose: "Open an auditable pause period without overloading credit_grants.status.",
    mutation: true,
    requiresMigrationSlot: true,
  },
  resumeCreditGrant: {
    purpose: "Close an auditable pause period; paused time freezes and extends effective validity.",
    mutation: true,
    requiresMigrationSlot: true,
  },
  refundCreditGrantTotal: {
    purpose: "Apply a total terminal refund. Partial refund is intentionally out of contract.",
    mutation: true,
    requiresMigrationSlot: true,
  },
  importHistoricalCreditGrant: {
    purpose: "Import a historical bonus and historical consumption facts without fabricating classes, attendance or payments.",
    mutation: true,
    requiresMigrationSlot: true,
  },
  correctCreditConsumption: {
    purpose: "Append an audited correction/reversal that preserves the original movement and its origin.",
    mutation: true,
    requiresMigrationSlot: true,
  },
} as const satisfies Record<string, PlannedRpcContract>;

function toMillis(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid_${field}`);
  return parsed;
}

function evaluationMillis(at: string): number {
  return toMillis(at, "evaluation_time");
}

export function validatePausePeriods(periods: readonly BonusPausePeriod[]): void {
  const sorted = periods
    .map((period) => ({
      start: toMillis(period.pausedAt, "paused_at"),
      end: period.resumedAt === null ? null : toMillis(period.resumedAt, "resumed_at"),
    }))
    .sort((a, b) => a.start - b.start);

  let previousEnd = Number.NEGATIVE_INFINITY;
  let foundOpenPeriod = false;
  for (const period of sorted) {
    if (foundOpenPeriod) throw new Error("pause_after_open_period");
    if (period.end !== null && period.end <= period.start) throw new Error("invalid_pause_interval");
    if (period.start < previousEnd) throw new Error("overlapping_pause_periods");
    if (period.end === null) {
      foundOpenPeriod = true;
    } else {
      previousEnd = period.end;
    }
  }
}

export function ledgerBalanceMinutes(movements: readonly CreditMovementLike[]): number {
  return movements.reduce((sum, movement) => {
    if (!Number.isInteger(movement.deltaMinutes)) throw new Error("invalid_movement_delta_minutes");
    return sum + movement.deltaMinutes;
  }, 0);
}

export function isBonusPausedAt(snapshot: Pick<BonusPolicySnapshot, "pausePeriods">, at: string): boolean {
  validatePausePeriods(snapshot.pausePeriods);
  const now = evaluationMillis(at);
  return snapshot.pausePeriods.some((period) => {
    const start = toMillis(period.pausedAt, "paused_at");
    const end = period.resumedAt === null ? Number.POSITIVE_INFINITY : toMillis(period.resumedAt, "resumed_at");
    return start <= now && now < end;
  });
}

/**
 * Returns the effective expiry after adding elapsed paused time.
 * expiresAt remains the contractual/base expiry; pause provenance remains in
 * pausePeriods instead of silently rewriting historical meaning.
 */
export function effectiveExpiryAt(
  snapshot: Pick<BonusPolicySnapshot, "expiresAt" | "pausePeriods">,
  at: string,
): string | null {
  if (snapshot.expiresAt === null) return null;
  validatePausePeriods(snapshot.pausePeriods);

  const now = evaluationMillis(at);
  let effectiveExpiry = toMillis(snapshot.expiresAt, "expires_at");
  const periods = [...snapshot.pausePeriods].sort(
    (a, b) => toMillis(a.pausedAt, "paused_at") - toMillis(b.pausedAt, "paused_at"),
  );

  for (const period of periods) {
    const start = toMillis(period.pausedAt, "paused_at");
    if (start > now) break;
    // A pause recorded after effective expiry cannot resurrect an expired grant.
    if (start >= effectiveExpiry) continue;
    const recordedEnd = period.resumedAt === null ? now : toMillis(period.resumedAt, "resumed_at");
    const end = Math.min(recordedEnd, now);
    if (end > start) effectiveExpiry += end - start;
  }

  return new Date(effectiveExpiry).toISOString();
}

export function isEffectivelyExpiredAt(
  snapshot: Pick<BonusPolicySnapshot, "expiresAt" | "pausePeriods">,
  at: string,
): boolean {
  const effectiveExpiry = effectiveExpiryAt(snapshot, at);
  return effectiveExpiry !== null && toMillis(effectiveExpiry, "effective_expires_at") <= evaluationMillis(at);
}

function hasQualifyingOperationalState(snapshot: Pick<BonusPolicySnapshot, "status" | "paymentStatus" | "balanceMinutes">): boolean {
  if (snapshot.status !== "active") return false;
  if (snapshot.paymentStatus !== "paid" && snapshot.paymentStatus !== "pending") return false;
  return Number.isFinite(snapshot.balanceMinutes) && snapshot.balanceMinutes > 0;
}

export function isUsableBonusAt(snapshot: BonusPolicySnapshot, at: string): boolean {
  if (!hasQualifyingOperationalState(snapshot)) return false;
  if (toMillis(snapshot.startsAt, "starts_at") > evaluationMillis(at)) return false;
  if (isBonusPausedAt(snapshot, at)) return false;
  return !isEffectivelyExpiredAt(snapshot, at);
}

/**
 * DP-14 = 14B: Billing returns the presencial-intent fact only.
 * A future starts_at and an active pause may still qualify as intent.
 * Personas remains the owner of lifecycle/classification mapping.
 */
export function qualifiesPresentialBillingIntentAt(snapshot: BonusPolicySnapshot, at: string): boolean {
  if (!hasQualifyingOperationalState(snapshot)) return false;
  return !isEffectivelyExpiredAt(snapshot, at);
}

export function validateCapacityEdit(input: CapacityEditInput): void {
  if (!Number.isInteger(input.currentValidConsumptionMinutes) || input.currentValidConsumptionMinutes < 0) {
    throw new Error("invalid_current_consumption_minutes");
  }
  if (!Number.isInteger(input.newTotalCapacityMinutes) || input.newTotalCapacityMinutes < 0) {
    throw new Error("invalid_total_capacity_minutes");
  }
  if (input.newTotalCapacityMinutes < input.currentValidConsumptionMinutes) {
    throw new Error("capacity_below_current_valid_consumption");
  }
}

export function validateHistoricalBonusImport(draft: HistoricalBonusImportDraft): void {
  if (draft.personIds.length !== (draft.modality === "individual" ? 1 : 2)) throw new Error("invalid_member_count");
  if (new Set(draft.personIds).size !== draft.personIds.length) throw new Error("duplicate_member");
  validateCapacityEdit({
    newTotalCapacityMinutes: draft.totalCapacityMinutes,
    currentValidConsumptionMinutes: draft.priorConsumption.reduce((sum, item) => sum + item.minutes, 0),
  });
  if (!Number.isInteger(draft.priceCents) || draft.priceCents < 0) throw new Error("invalid_price_cents");
  if (draft.provenance.trim() === "") throw new Error("missing_provenance");
  toMillis(draft.purchasedAt, "purchased_at");
  toMillis(draft.startsAt, "starts_at");
  if (draft.expiresAt !== null) toMillis(draft.expiresAt, "expires_at");
  for (const item of draft.priorConsumption) {
    if (!Number.isInteger(item.minutes) || item.minutes <= 0) throw new Error("invalid_historical_consumption_minutes");
    if (item.provenance.trim() === "") throw new Error("missing_historical_consumption_provenance");
    toMillis(item.occurredAt, "historical_consumption_at");
  }
}

export function validateConsumptionCorrection(draft: BonusConsumptionCorrectionDraft): void {
  if (!Number.isInteger(draft.originalMovementId) || draft.originalMovementId <= 0) throw new Error("invalid_original_movement_id");
  if (!Number.isInteger(draft.replacementConsumedMinutes) || draft.replacementConsumedMinutes < 0) {
    throw new Error("invalid_replacement_consumed_minutes");
  }
  if (draft.reason.trim() === "") throw new Error("missing_correction_reason");
  if (draft.originalOrigin.kind === "class" && (!Number.isInteger(draft.originalOrigin.classId) || draft.originalOrigin.classId <= 0)) {
    throw new Error("invalid_class_origin");
  }
  if (draft.originalOrigin.kind === "historical_import" && draft.originalOrigin.provenance.trim() === "") {
    throw new Error("missing_historical_origin_provenance");
  }
}
