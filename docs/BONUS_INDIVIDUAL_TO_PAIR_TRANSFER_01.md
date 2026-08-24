# BONUS-INDIVIDUAL-TO-PAIR-TRANSFER-01 — Transfer Foundation

Status: **IMPLEMENTATION WORKSTREAM / STAGING ONLY / NO APPLY**

Base staging: `fa5e67b912e1ec2bacf03f0f993337fec83cc578`  
Supabase target for later controlled execution: `qlngfkzmncihtdzktcmd`  
FUNC-ID: `FUNC-0113`  
Migration candidate: `20260824115943_bonus_individual_to_pair_transfer_foundation_01.sql`

## Scope

This Foundation implements only the approved individual-credit -> pair-credit transfer authority. It does not implement pair -> individual, conversion, merge/split, redistribution, fee/debt regularization, Attendance, class consumption, visible UI, caller cutover, final REVOKE, main or production.

The existing `public.transfer_individual_credit_to_pair(bigint,bigint,integer,integer)` is classified as **LEGACY CONSUMED / FROZEN UNTIL CUTOVER**. Foundation does not use it, modify it or establish fallback to it. The later caller cutover must activate the new route and disable legacy in the same cutover.

## Canonical model

- `credit_transfer_operations`: append-only canonical operation record with unique request key, source/destination, exact pair, minutes, semantic snapshots, optional class context, actor and reversal linkage.
- `credit_pair_transfer_pools`: marks pair grants created exclusively from transfer-derived balance and binds each pool to one `economic_source_grant_id`. A purchased pair grant or a pool from a different economic source can never be selected as the destination.
- `credit_movements.transfer_id`: links exactly one `transfer_out` and exactly one `transfer_in` to each canonical operation.
- Destination compatibility is evaluated server-side against current canonical semantics **and the exact economic source grant**; incompatible state or provenance creates a separate transfer-derived pool instead of mixing balances.

## Transfer semantics

- Source amount is the locked ledger balance; conversion is 1:1.
- Total and partial transfers are supported; caller supplies explicit minutes.
- `pending`, paused and future-start grants remain transferable.
- Destination preserves payment state, `starts_at`, current canonical effective expiry and pause state without creating a charge or revenue.
- A paused destination remains paused. A future-start destination remains unusable until its inherited `starts_at`.
- Pair = source holder + a distinct active partner.
- `class_id` is optional context only.
- No class financial item, fee, debt, Attendance or consumption fact is created.
- All state changes happen in one PostgreSQL transaction.

## Idempotency and reconciliation

The mutation accepts a nonblank `request_key`. It transaction-locks the key before mutation. Same key + same canonical request + same authenticated actor returns the committed result. Same key with different semantics fails closed with `IDEMPOTENCY_CONFLICT`.

A dedicated reconciliation RPC resolves a committed request by the same key. Lost responses must be reconciled/replayed with that key; no blind retry with a new key.

## Concurrency

Forward transfer:
1. request-key advisory transaction lock;
2. source grant row lock;
3. locked balance recomputation;
4. compatibility advisory transaction lock;
5. deterministic compatible destination row lock or creation;
6. operation + outbound + inbound + audit in the same transaction.

This prevents overspend and concurrent duplicate compatible pools.

## Reversal

Normal reversal is append-only and full-operation only in this Foundation. It is accepted only when mathematically safe. Genuine subsequent incompatible negative use, insufficient balance, terminal incompatibility or a previous reversal fails closed and requires an explicitly separate administrative correction path. A negative `transfer_out` is excluded from that incompatible-use guard only when canonical relational links prove it belongs to a valid `operation_type='reversal'` of another transfer and `reverses_movement_id` points to that transfer's exact destination `transfer_in`; notes/provenance text are never trusted for this decision. No historical row is rewritten or deleted.

## Security

New mutation/preview/reconciliation/reversal RPCs are server-authorized with `private.is_staff()`, PostgreSQL `SECURITY DEFINER`, controlled owner and empty `search_path`. Direct table DML for new transfer tables is not exposed to `PUBLIC`, `anon` or `authenticated`. “Ver como” is not consulted for authorization.

## Apply boundary

**NO APPLY in this workstream.** The migration remains AUTHORING / PREPARADA_NO_APLICADA until independent QA PRE-APPLY inspects the exact Git blob and Release is separately authorized.
