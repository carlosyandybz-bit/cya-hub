# BONUS-AUTHORITY-HARDENING-01 — Phase 2A Billing Core

Status: **IMPLEMENTADO / NO VALIDADO**  
Environment: **STAGING ONLY**  
Base SHA: `fa5e67b912e1ec2bacf03f0f993337fec83cc578`  
Supabase target for later controlled execution: `qlngfkzmncihtdzktcmd`  
Migration: `20260822235000_bonus_authority_hardening_01.sql`  
Apply state: **PREPARADA_NO_APLICADA**

## Scope

This candidate implements only Billing-owned authority primitives. It does not modify Classes, CRM, Personas, Portal, frontend, Mission/Notification, Attendance, main or production.

It preserves the closed BONUS-USABILITY-01 contract and does not implement BILLING-DEBT / REGULARIZATION.

## Billing Core implemented

### Idempotent movement provenance

`credit_movements.source_operation_key` is introduced as a nullable server-side idempotency key. Existing historical movements remain `NULL`. Non-null keys must be nonblank and are unique.

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
- locks the grant and source movement;
- only accepts a negative class movement with a real `class_id`;
- refuses `refunded` or `cancelled` terminal grants;
- calculates remaining effective consumption after prior append-only corrections/reversals;
- appends a positive `adjustment` referencing `reverses_movement_id`;
- preserves original class/person/provenance;
- can restore `exhausted -> active` only for nonterminal grants with positive balance;
- writes explicit audit evidence;
- exact retries are idempotent.

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
- drop `movements_staff_insert`;
- drop `grant_members_staff_insert`.

Final hardening order is mandatory:

1. apply/validate the Billing primitives when authorized;
2. migrate cross-domain consumers to those primitives/facts;
3. prove no legitimate direct writer remains;
4. create/review a final forward-fix;
5. REVOKE direct DML;
6. remove legacy write policies;
7. verify ACL/RLS fail-closed.

## Cross-domain integration queue

### Classes owner

- `public.administratively_finish_class_v2` and callers v3/v4/v5/v6: replace direct movement/grant writes with canonical consumption.
- `public.reopen_administratively_finished_class`: replace direct compensating movement/grant reactivation with canonical reversal.
- `public.save_class_setup`: consume canonical Bonus eligibility rather than status/payment/raw-expiry fragments.
- class-side quick compatibility seam (`p_quick_created_grant_id`): preserve quick UX but stop giving it independent Billing authority.
- `public.transfer_individual_credit_to_pair`: re-home/reconcile its mixed Classes/Billing workflow before direct table DML is revoked.

### CRM owner

- `public.crm_bonus_summary`: replace active+balance reconstruction with canonical Billing summary/facts.

### Portal owner

- availability/usability labels must use canonical summary/facts; raw history may remain raw history.

### Frontend owner

- `compatibleCredits` must not reconstruct usable Bonus rules locally.
- `createQuickBonus -> create_credit_grant` remains compatibility-safe because it creates the same canonical Bonus.

### Mission / Notification owner

- low/expiry decisions must use canonical Billing effective state rather than raw status/balance/base expiry fragments.

### Personas owner

- PERSON-REL must consume `billing_person_facts(...)` and, where balance/state detail is required, `billing_person_bonus_summary(...)`.
- Personas must not rederive Bonus usability or presencial intent.

## quick_bonus

There is no current `credit_grants.grant_type` and no separate quick-bonus entity. `quick_bonus` remains only a legacy compatibility semantic in the class-close path. This candidate does not create a second Bonus type.

## Security / recovery

- New mutation RPCs are `SECURITY DEFINER` with explicit Staff authorization and blank `search_path`.
- Public/anon execution is revoked for the new functions.
- `authenticated` and `service_role` receive EXECUTE, but mutation still requires server-side Staff authorization.
- Existing ledger history remains append-only.
- Migration is forward-only; recovery strategy is `forward_fix`.

## Validation boundary

Implementer structural validation is required, but it is not independent QA and cannot certify the functionality. No Supabase APPLY is part of Phase 2A.
