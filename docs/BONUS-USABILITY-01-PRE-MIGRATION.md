# BONUS-USABILITY-01 — Fase 2A pre-migration

**Scope:** R1 Wave 1 · STAGING ONLY · pre-migration implementation.  
**Baseline inspected:** `staging@861d8e584e8dd1ad5aff6f672affd1748f715168`.  
**Migration writer:** reserved by Chat 07 during this phase. No SQL migration is created or applied here.

## Closed contract consumed

- `starts_at` gates usability, but a future start may still qualify as presencial student-intent (DP-14 = 14B).
- Pause/resume is orthogonal to `status`; an active pause blocks usability but does not end presencial intent.
- Paused time freezes validity and extends the effective expiry by the auditable paused duration.
- `usable_bonus`: `active` + `paid|pending` + `starts_at <= at` + not paused + not effectively expired + ledger balance `> 0`.
- Total refund is terminal. Partial refunds are out of R1 contract for now.
- Balance authority remains the append-oriented `credit_movements` ledger, summed by `grant_id`.
- Bonus capacity and price are independently editable.
- Capacity may be corrected only while `new_total_capacity >= current valid/historical consumption`; historical consumption movements are not destroyed.
- Bonuses remain administratively correctable regardless of age/state, subject to explicit terminal-state workflows and audit.
- Historical/import mode may record bonus facts and prior consumption facts but must not fabricate classes, attendance, reservations, payments, or teaching records.
- DP-BONUS-15 = 15A: consumption correction starts from Bonus UX but preserves the original movement and origin. Class-origin corrections coordinate with Classes instead of silently rewriting class facts.
- Billing exposes facts. Personas owns lifecycle and relation mapping.

## Reusable existing foundations

1. `credit_grants` remains the canonical grant record; no second “quick/historical” bonus type is introduced.
2. `credit_grant_members` remains membership linkage for the first migration step, while its legacy lifecycle side effect is removed/neutralized in coordination with Core/Persons.
3. `credit_movements` remains the canonical balance ledger. Corrections/reversals append compensating facts rather than DELETE/rewriting historical movement rows.
4. Existing `status` values (`active|exhausted|cancelled`) are retained; pause is not encoded as another grant status.
5. Existing `payment_status` (`paid|pending|refunded`) is retained; `paid|pending` can qualify, `refunded` cannot.

## Safe code added in Fase 2A

`app/billing/bonus-usability-contract.ts` is a pure policy/DTO contract used to make the closed decisions executable and testable before database materialization. It deliberately states that RPC/database predicates remain authoritative once migrated.

It provides:
- grant/payment/modality/pause/type contracts;
- ledger balance helper;
- active-pause and effective-expiry calculation;
- exact `usable_bonus` policy;
- exact presencial Billing-intent fact per DP-14=14B;
- capacity-edit invariant;
- historical import DTO/validation with provenance and approximate-date flags;
- correction/reversal DTO preserving original movement/origin;
- a migration-gated RPC manifest.

No product screen is wired in 2A because the current credit UI is concentrated in the shared `app/cya-app.tsx` hotspot and its correct behavior depends on server predicates that do not exist until the migration. This avoids parallel writer conflicts and avoids client-side policy becoming authoritative.

## Migration-ready delta — materialize only when the global slot is released

This section is a plan, **not executable SQL**.

### 1. Schema

- Add `credit_grants.starts_at timestamptz` and backfill legacy rows conservatively from `purchased_at`.
- Add auditable pause/resume history keyed to `grant_id`, with pause/resume timestamps, actor, reason, correction/audit provenance and constraints preventing overlapping open periods.
- Preserve base/contractual expiry and calculate effective expiry from accumulated valid paused duration; do not silently erase pause provenance.
- Add the minimum historical-import metadata needed for provenance and approximate dates, including historical prior-consumption facts in the same ledger model.
- Persist the temporary Administration capability/toggle “Permitir alta de bonos históricos” in one canonical settings mechanism. Current `app_module_settings` is not a generic flag store and must not be overloaded as a second truth.
- Add indexes required by person/grant usability and pause lookups after final query shape is fixed.

### 2. Authoritative server predicates/helpers

Private/internal helpers, names subject only to repository naming convention:
- `credit_grant_balance_minutes_unchecked(grant_id)`
- `credit_grant_is_paused_unchecked(grant_id, at)`
- `credit_grant_effective_expires_at_unchecked(grant_id, at)`
- `credit_grant_is_usable_unchecked(grant_id, at)`
- `person_has_usable_presential_bonus_unchecked(person_id, at)`
- `person_has_qualifying_presential_billing_intent_unchecked(person_id, at)`

Controlled public fact surface:
- `billing_person_facts(person_id)` — returns Billing facts only; it must not assign Provisional/Alumno pendiente/Alumno presencial or mutate Personas lifecycle.

### 3. Mutation RPCs

Materialize server-side, authorized and audited workflows for:
- create/edit grant including `starts_at` and expiry;
- pause;
- resume;
- total refund;
- historical import;
- consumption correction/reversal;
- capacity correction with `new total >= valid consumption`;
- price correction independently from capacity.

Every correction/reversal preserves the original ledger fact and appends auditable compensating facts. Class-origin correction must coordinate with Classes and preserve class/origin linkage.

### 4. Existing consumers to reconcile after predicates exist

Route all critical consumers through the authoritative predicates instead of re-implementing fragments:
- class setup / preferred grant validation;
- administrative class finish / consumption;
- individual→pair transfer;
- CRM bonus summary/person-credit facts;
- portal/student bonus views;
- frontend compatible-credit filtering.

This closes the current risk where some paths check active/balance/expiry but do not consistently reject `payment_status='refunded'`.

### 5. Legacy lifecycle side effect

Coordinate with Core/Data/Persons to remove or neutralize the `credit_grant_members` legacy promotion side effect that writes `people.crm_stage` / `student_profiles.student_since`. Billing should emit/serve qualifying facts; it must not decide Personas lifecycle.

Do not fabricate replacement person lifecycle rows as part of Billing migration.

### 6. Security, audit and race safety

- Critical grant/payment/start/expiry/pause/capacity transitions go through authorized server RPCs rather than broad direct row updates.
- Harden unnecessary execute surface while preserving required staff flows.
- Audit create/edit/pause/resume/refund/capacity/price/correction/reactivation/terminal changes with actor, timestamp, before/after, reason and provenance/correlation where applicable.
- Lock/serialize balance-sensitive mutations so consume vs pause/refund/capacity correction cannot violate invariants.
- Pair grants retain one shared grant balance; never double-count per member.

## Required migration validation

Before integration, prove at minimum:
- paid and pending usable when all other predicates pass;
- future start: unusable but qualifying intent;
- active pause: unusable but qualifying intent;
- pause extends effective expiry exactly by paused duration;
- refunded/cancelled/exhausted/zero/expired: neither usable nor intent;
- no-expiry grant can remain usable;
- capacity equality with consumed amount is valid; below consumed is rejected;
- price edit never changes capacity automatically and capacity edit never changes price automatically;
- historical import creates no class/attendance/payment artifacts;
- class/historical corrections preserve original movement and provenance;
- legacy CRM/student_since mutation no longer occurs from bonus membership alone;
- authorization/RLS and concurrent mutation cases hold.

## Functional traceability

Primary: `FUNC-0225`, `FUNC-0226`, `FUNC-0227`, `FUNC-0228`.  
Also affected: `FUNC-0041`, `FUNC-0042`, `FUNC-0064`, `FUNC-0108`, `FUNC-0111`, `FUNC-0208`, `FUNC-0222`.

## Gate

Fase 2A intentionally stops before schema/RPC materialization. Once Chat 07 releases the global migration writer, this package is **READY FOR MIGRATION SLOT**.
