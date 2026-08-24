# BONUS-AUTHORITY-HARDENING-01 — Phase 2A Billing Core

Status: **IMPLEMENTADO / NO VALIDADO**  
Environment: **STAGING ONLY**  
Base SHA: `fa5e67b912e1ec2bacf03f0f993337fec83cc578`  
Supabase target for later controlled execution: `qlngfkzmncihtdzktcmd`  
Migration: `20260822235000_bonus_authority_hardening_01.sql`  
Apply state: **PREPARADA_NO_APLICADA**  
Current migration Git blob after post-QA correction: `39ed0d38341b3af5536a813f5edbbefa8cb5a28f`

## Scope

This candidate implements only Billing-owned authority primitives. It does not modify Classes, CRM, Personas, Portal, frontend, Mission/Notification, Attendance, main or production.

It preserves the closed BONUS-USABILITY-01 contract and does not implement BILLING-DEBT / REGULARIZATION.

## Post-QA pre-apply correction — 23/08/2026 02:48 Europe/Madrid

The candidate failed independent PRE-APPLY QA on two defects. Because migration `20260822235000` remained AUTHORING and absent from the STAGING ledger, both defects were corrected in the same unapplied migration identity; no repair migration was created.

### P0 — real transitional policy name

STAGING real exposes the INSERT policy as `credit_movements_staff_insert`, not `movements_staff_insert`.

The candidate now:

- preflights `credit_movements_staff_insert`;
- alters `credit_movements_staff_insert`;
- preserves the pre-existing `private.is_staff()` and `created_by = auth.uid()` checks;
- adds only `source_operation_key IS NULL` to stop legacy direct Staff inserts from minting canonical Billing idempotency keys.

The transitional direct-DML seam remains intentionally open. `GAP-BONUS-DIRECT-DML-01` is therefore still **OPEN** until cross-domain consumers converge and a separately reviewed final REVOKE package is authorized.

### P1 — complete replay equivalence for reversal

For `public.reverse_credit_consumption_for_class(...)`, `p_reason` is now part of canonical replay equivalence.

A reused `source_operation_key` is accepted as an idempotent replay only when the stored canonical reversal matches:

- the same original movement;
- the same grant derived from that movement;
- the same operation type;
- the same positive reversal movement semantics;
- the same normalized reason in `note`;
- the same canonical `provenance.reason`;
- the same canonical operation marker.

Same key + different reason therefore falls through to SQLSTATE `23505` before any new movement, grant update or audit insert. The same reason predicate is present both in the ordinary existing-key replay path and in the `ON CONFLICT DO NOTHING` concurrent replay path.

Lock order remains unchanged: **movement -> grant**.

## Billing Core implemented

### Idempotent movement provenance

`credit_movements.source_operation_key` is introduced as a nullable server-side idempotency key. Existing historical movements remain `NULL`. Non-null keys must be nonblank and are unique.

While cross-domain direct writers still exist, the existing `credit_movements_staff_insert` policy is narrowed so direct Staff INSERT remains compatible only when `source_operation_key IS NULL`, while preserving its existing `created_by = auth.uid()` author constraint. This preserves legacy consumers while preventing them from minting or squatting canonical Billing idempotency keys.

### Canonical class consumption

`public.consume_credit_grant_for_class(...)`:

- `SECURITY DEFINER`, blank `search_path`;
- explicit `private.is_staff()` authorization;
- requires grant/person/class/minutes/idempotency key;
- locks the grant row;
- verifies grant membership;
- delegates business eligibility to `private.credit_grant_is_usable_unchecked(...)`;
- verifies sufficient ledger balance;
- appends a `movement_type='class'` negative movement;
- records provenance and operation key;
- transitions an active grant to `exhausted` only when balance reaches zero;
- records an explicit audit event;
- exact retries return the previously-created movement instead of consuming twice.

Classes remains responsible for proving that the supplied class/person relationship is valid before invoking this Billing primitive.

### Canonical class-consumption reversal

`public.reverse_credit_consumption_for_class(...)`:

- `SECURITY DEFINER`, blank `search_path`;
- explicit Staff authorization;
- locks the source movement first and then the grant, matching the existing `correct_credit_consumption` lock order and avoiding a movement/grant lock inversion;
- only accepts a negative class movement with a real `class_id`;
- refuses `refunded` or `cancelled` terminal grants;
- calculates remaining effective consumption after prior append-only corrections/reversals;
- appends a positive `adjustment` referencing `reverses_movement_id`;
- preserves original class/person/provenance;
- can restore `exhausted -> active` only for nonterminal grants with positive balance;
- writes explicit audit evidence;
- exact retries are idempotent only when the complete canonical request semantics, including `p_reason`, match.

No historical movement is updated or deleted.

### Canonical person summary

`public.billing_person_bonus_summary(...)` exposes an authorized Billing-owned read surface for later consumers. It provides:

- raw grant identity and modality;
- payment/status/start/base-expiry;
- canonical effective expiry;
- pause state;
- canonical ledger balance;
- canonical `is_usable`;
- member IDs;
- total positive balance;
- usable balance;
- `has_usable_presential_bonus`;
- `has_qualifying_presential_billing_intent`.

It uses the same Staff/self authorization model already used by `billing_person_facts(...)`.

`billing_person_facts(...)` is intentionally left signature-compatible for PERSON-REL.

## Authority boundary not yet activated

`GAP-BONUS-DIRECT-DML-01` is **not fully closed by Phase 2A**.

Direct authenticated Staff DML must remain temporarily available because real cross-domain `SECURITY INVOKER` consumers still depend on it. Prematurely revoking it would break legitimate Classes workflows.

Therefore this migration intentionally does **not** yet:

- revoke authenticated INSERT/UPDATE on `credit_grants`;
- revoke authenticated INSERT on `credit_movements`;
- revoke authenticated INSERT on `credit_grant_members`;
- drop `grants_staff_insert`;
- drop `grants_staff_update`;
- drop `credit_movements_staff_insert`;
- drop `grant_members_staff_insert`.

Final hardening order is mandatory:

1. apply/validate the Billing primitives when authorized;
2. migrate cross-domain consumers to those primitives/facts;
3. prove no legitimate direct writer remains;
4. create/review a final forward-fix;
5. REVOKE direct DML;
6. remove legacy write policies;
7. verify ACL/RLS fail-closed.

## quick_bonus

There is no current `credit_grants.grant_type` and no separate quick-bonus entity. `quick_bonus` remains only a legacy compatibility semantic in the class-close path. This candidate does not create a second Bonus type.

## Security / recovery

- New mutation RPCs are `SECURITY DEFINER` with explicit Staff authorization and blank `search_path`.
- Public/anon execution is revoked for the new functions.
- `authenticated` and `service_role` receive EXECUTE, but mutation still requires server-side Staff authorization.
- Existing ledger history remains append-only.
- Migration remains AUTHORING/PREPARADA_NO_APLICADA with `application_evidence = null`.
- Recovery strategy remains `forward_fix` after application; while still unapplied, QA corrections stay in this same candidate identity.

## Validation boundary

Implementer structural validation is required, but it is not independent QA and cannot certify the functionality. No Supabase APPLY is part of Phase 2A.
