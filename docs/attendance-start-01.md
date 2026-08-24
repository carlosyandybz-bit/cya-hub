# ATTENDANCE-START-01 / CLASS-01-IDEMP-01 — Start creates real attendance

Status: IMPLEMENTED IN PR / PRE-APPLY / NOT QA VALIDATED.
Target: STAGING only.
Owner: Classes / Workflow.
Primary FUNC-ID: FUNC-0101. Related: FUNC-0073, FUNC-0075, FUNC-0076, FUNC-0082, FUNC-0105.

## Contract delta

When an authorized staff user actually starts a class, every person already included in that session receives one durable `present` attendance fact with `source='session_start'` and `effective_at=classes.started_at`. Merely scheduling/reserving a class, paying, holding a bonus, or cancelling without start does not create attendance.

The class transition and automatic attendance writes are one PostgreSQL transaction. If any attendance write fails, the start transition and earlier writes in that call roll back together.

A repeated `start_class(class_id)` after a committed start is attendance-idempotent: the class is already `active`, so the RPC returns without creating a new start fact. The ledger also enforces one original `session_start` fact per `(class_id, person_id)`. This uniqueness is independent from the current projected status, so a later explicit correction to absent/no-show is not overwritten by a delayed retry of start.

Attendance history remains append-only. `correct_class_attendance` and reopen semantics are not modified. There is no historical start backfill.

## CLASS-01-IDEMP-01 — durable manual-start request identity

The canonical manual-start RPC now requires `p_idempotency_key uuid`. The previous non-idempotent runtime overload is removed by the PRE-APPLY migration, so authenticated callers cannot silently fall back to the old behavior after cutover.

`private.manual_class_start_requests` is a sealed request-to-resource mapping only. Its primary key is `request_key`; it records the authenticated actor, the server-canonicalized payload, and the single `classes.id` produced by that logical request. It is not a second source of truth for classes.

The canonical payload is built server-side after preserving the existing input normalizations and contains:

- class type;
- distinct participant IDs sorted ascending;
- scheduled start timestamp;
- duration;
- style term;
- location term;
- notes after `nullif(btrim(...),'')` normalization.

The request key is the only deduplication identity. No student/date/time/duration/style/location/full-payload heuristic is used. Therefore two different keys with identical payload can create two legitimate classes.

### Transaction and concurrency

One PostgreSQL function transaction performs authorization, stable input normalization, request-key claim, class creation, participant creation, `session_start` attendance creation, and request-to-class binding. `request_key` is the table primary key and `INSERT ... ON CONFLICT (request_key) DO NOTHING` is the concurrency primitive.

For two concurrent calls with the same key, PostgreSQL's unique-index conflict handling serializes the claim. If the first transaction commits, the other call validates actor + canonical payload and returns the committed class. If the first transaction rolls back at class, participant, or attendance creation, its claim also rolls back and another contender can become the creator. No durable orphan claim is expected from a failed RPC.

A retry after a lost response reads the committed request mapping and returns the original class. It deliberately does not re-run mutable student/style-active checks after the original commit; otherwise a later profile/catalog state change could make a valid committed retry fail.

Same key + different actor fails closed before payload/class lookup is exposed. Same key + different canonical payload fails closed before any second class/participant/attendance mutation.

## Security

`public.start_class` and keyed `public.start_manual_class` are narrow trusted `SECURITY DEFINER` boundaries owned by `postgres`, with `search_path=''` and `private.is_staff()` authorization. PUBLIC/anon cannot execute them; authenticated/service_role retain the external RPC grant, while an actual authenticated staff actor is still required by the function guard.

`private.record_class_attendance_fact` remains `SECURITY DEFINER`, owner `postgres`, `search_path=''`, and has no direct EXECUTE for PUBLIC, anon, authenticated, or service_role.

`private.manual_class_start_requests` is owned by `postgres` and grants no SELECT/INSERT/UPDATE/DELETE access to PUBLIC, anon, authenticated, or service_role. Its only product mutation path is the trusted manual-start RPC.

## Repo-exhaustive consumer inventory

Evidence on the exact PR checkout is enforced by `git grep -n -F start_manual_class` inside `tests/attendance-start-01.test.mjs`.

The exhaustive literal-reference inventory contains four files. Only one is a historical schema definition; none is a product caller invoking the RPC:

- PRODUCTIVO ACTUAL: 0
- COMPATIBILIDAD: 0 current callers
- LEGACY CONSUMIDO: 0 callers
- TEST: `tests/attendance-start-01.test.mjs`
- LEGACY SCHEMA SOURCE: `supabase/live-class.sql` — historical/bootstrap SQL definition and grants for the pre-idempotency signature; it is not an RPC consumer and is not the forward migration path
- OBSOLETO: firma RPC anterior `start_manual_class(text,bigint[],timestamptz,integer,bigint,bigint,text)`; removed from runtime by this PRE-APPLY migration
- DEFINICIÓN CANÓNICA DELTA: `supabase/migrations/20260822200930_attendance_start_01.sql`
- DOCUMENTACIÓN: this file

`supabase/live-class.sql` is deliberately not rewritten in this P0 because doing so would turn a historical/bootstrap artifact into a second implementation of the forward delta. The migration is the canonical cutover artifact and explicitly drops the old runtime overload. Re-executing that historical standalone script after the migration would be outside the canonical migration path and remains a documented legacy risk to be rejected by release governance.

Because PRODUCTIVO ACTUAL is zero, there is no legitimate UI/network caller to edit in this patch. Introducing an unused client wrapper solely to simulate a caller would widen the P0 and create dead code.

Caller UUID lifecycle: N/A while PRODUCTIVO ACTUAL remains 0. The structural test fails if a new repository consumer appears without being classified. Any future productive caller must generate one opaque UUID once per logical intention, keep it across double-tap/network retry, discard it only on definitive success/cancellation/new intention, and use a new UUID for a new legitimate class even when the form payload is identical.

## Migration

`20260822200930_attendance_start_01`

- incremental forward migration;
- no modification of applied Attendance migrations 20260821170000 / 20260821170500 / 20260821171000;
- no Bonus/Personas/Billing mutation;
- no ledger repair;
- no backfill;
- PREPARADA_NO_APLICADA until Release/CORE applies it;
- implementer evidence does not constitute independent QA.
