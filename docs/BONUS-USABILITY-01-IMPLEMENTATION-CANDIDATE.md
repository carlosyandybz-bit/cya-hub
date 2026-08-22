# BONUS-USABILITY-01 — R1 Wave 2 implementation candidate

**Target:** STAGING only.  
**Base:** `fa5e67b912e1ec2bacf03f0f993337fec83cc578`.  
**PR:** #133 DRAFT.  
**Migration:** `20260822152400_bonus_usability_01.sql`.  
**State:** authored / not applied / not merged / not QA-certified.

## Delta audit classification

### CANÓNICO
- `public.credit_grants`: canonical grant header.
- `public.credit_grant_members`: canonical grant↔person membership.
- `public.credit_movements`: canonical minute ledger; balance is always `SUM(delta_minutes)` by `grant_id`.
- `public.audit_events`: durable administrative audit trail.

### COMPATIBILIDAD
- `public.create_credit_grant(...)`: signature preserved and delegated to `create_credit_grant_v2`.
- `public.set_credit_grant_consumed_minutes(...)`: retained for unlinked/manual grants, but source-linked class/historical movements must use the new explicit correction RPC.

### LEGACY CONSUMIDO
- ad-hoc grant eligibility checks in Classes (`save_class_setup`, administrative finish/transfer/incident flows), CRM summaries, portal projections and `app/cya-app.tsx`.
- These consumers currently combine subsets of `active + expiry + balance`; they do not own the new Billing rule and must later consume the canonical predicate without duplicating it.

### OBSOLETO RETIRABLE
- `credit_members_promote_crm_student` trigger on `credit_grant_members`: Bonus membership must stop mutating `people.crm_stage` / `student_profiles.student_since`. The underlying legacy function remains because Classes has a separate trigger and is outside this package.

### NO TOCADO
- Attendance tables/functions/migrations.
- Personas lifecycle implementation.
- PR #126/#130/#132.
- main and production.

## Canonical server contract authored

`usable_bonus` is materialized server-side as:

- `status='active'`;
- `payment_status IN ('paid','pending')`;
- `starts_at <= at`;
- not paused at `at`;
- effective expiry not reached, with paused duration extending validity;
- `SUM(credit_movements.delta_minutes) > 0`.

DP-14=14B is materialized separately: future-start and paused qualifying grants may prove presencial Billing intent, but exhausted/expired/cancelled/refunded/zero-balance grants do not.

## Schema delta

- `credit_grants.starts_at` with legacy backfill from `purchased_at`.
- historical date/provenance metadata on grants.
- `credit_grant_pause_periods` as auditable pause/resume history.
- `credit_movements.occurred_at`, approximate-date metadata, provenance and `reverses_movement_id` for append-only corrections.
- Billing member/movement person FKs target canonical `people(id)` instead of requiring a `student_profiles` lifecycle row.
- dedicated `billing_admin_settings` singleton for the temporary historical-import gate.

## RPCs / helpers

Private authority:
- `credit_grant_balance_minutes_unchecked`
- `credit_grant_is_paused_unchecked`
- `credit_grant_effective_expires_at_unchecked`
- `credit_grant_is_usable_unchecked`
- `person_has_usable_presential_bonus_unchecked`
- `person_has_qualifying_presential_billing_intent_unchecked`

Controlled read surfaces:
- `credit_grant_is_usable`
- `billing_person_facts`

Mutations:
- `create_credit_grant_v2`
- `edit_credit_grant`
- `pause_credit_grant`
- `resume_credit_grant`
- `refund_credit_grant_total`
- `set_billing_historical_import_enabled`
- `import_historical_credit_grant`
- `correct_credit_consumption`

No partial refund RPC is introduced.

## DP-BONUS-15 = 15A

`correct_credit_consumption` never rewrites the original consumption movement. It appends a compensating movement tied through `reverses_movement_id`, preserves original `class_id`, person and provenance, serializes the grant row, and emits before/after audit evidence.

Capacity correction also appends the capacity delta into the ledger, rejects `new total < valid net consumption`, and leaves `price_cents` independent.

## Historical mode

Historical import is:
- admin/teacher_admin only;
- disabled by default;
- explicitly toggleable and audited;
- provenance/reason/date-aware;
- represented in the same grant+ledger model;
- prohibited from fabricating classes, Attendance rows or class payment rows.

## Security

- new mutation RPCs are server-authorized;
- `PUBLIC`/`anon` EXECUTE is revoked;
- helper tables have RLS enabled and no direct client DML surface;
- private unchecked helpers are not executable by API roles;
- current legacy direct staff update policy on `credit_grants` is retained for compatibility because existing Classes functions still depend on it. It is therefore a known compatibility surface, not the canonical path for new Bonus transitions.

## Cross-domain follow-up after Billing application

This migration deliberately does **not** rewrite Classes/CRM/portal/frontend consumers. After Billing is applied and independently validated, their owners should replace duplicated eligibility fragments with the canonical Billing read predicate/facts. Attendance history remains untouched.

## CORE-01 / sequencing

The real remote ledger already contains immutable Attendance versions `20260821170000`, `20260821170500`, `20260821171000`, while those SQL sources are not merged in trusted `staging` Git. Under the R1 Versioned Executor this does not block authoring: PR source SHA + exact SQL blob + provenance are transported independently and the pre-apply gate checks the candidate version against the real ledger. Bonus uses a later unique version and does not copy or repair Attendance.

Provenance is `AUTHORING / PREPARADA_NO_APLICADA`, target `qlngfkzmncihtdzktcmd`, recovery `forward_fix`, `application_evidence=null`.
