# ATTENDANCE-START-01 — Start creates real attendance

Status: IMPLEMENTED IN PR / PRE-APPLY / NOT QA VALIDATED.
Target: STAGING only.
Owner: Classes / Workflow.
Primary FUNC-ID: FUNC-0101. Related: FUNC-0073, FUNC-0075, FUNC-0076, FUNC-0082, FUNC-0105.

## Contract delta

When an authorized staff user actually starts a class, every person already included in that session receives one durable `present` attendance fact with `source='session_start'` and `effective_at=classes.started_at`. Merely scheduling/reserving a class, paying, holding a bonus, or cancelling without start does not create attendance.

The class transition and automatic attendance writes are one PostgreSQL transaction. If any attendance write fails, the start transition and earlier writes in that call roll back together.

A repeated `start_class(class_id)` after a committed start is attendance-idempotent: the class is already `active`, so the RPC returns without creating a new start fact. The ledger also enforces one original `session_start` fact per `(class_id, person_id)`. This uniqueness is independent from the current projected status, so a later explicit correction to absent/no-show is not overwritten by a delayed retry of start.

Attendance history remains append-only. `correct_class_attendance` and reopen semantics are not modified. There is no historical start backfill.

## Security

`public.start_class` and `public.start_manual_class` become narrow trusted `SECURITY DEFINER` boundaries owned by `postgres`, with `search_path=''` and the existing `private.is_staff()` authorization guard. PUBLIC/anon cannot execute them; authenticated/service_role retain the existing external RPC execute contract.

`private.record_class_attendance_fact` remains `SECURITY DEFINER`, owner `postgres`, `search_path=''`, and has no direct EXECUTE for PUBLIC, anon, authenticated, or service_role.

## Manual-class retry limitation

The current `start_manual_class(...)` RPC creates a fresh `classes.id` on every invocation and accepts no request/idempotency token. ATTENDANCE-START-01 safely guarantees one start fact per participant inside each successful manual-class transaction, but cannot safely infer that two separate invocations are the same request. Therefore repeated whole-RPC manual creation can still create two different classes, each with its own valid attendance facts.

No time/student heuristic is introduced. Closing request-level manual creation idempotency requires a separate explicit contract (for example a durable idempotency key) or product convergence on `create_manual_class_draft -> save_class_setup -> start_class`.

## Migration

`20260822200930_attendance_start_01`

- incremental forward migration;
- no modification of applied Attendance migrations 20260821170000 / 20260821170500 / 20260821171000;
- no Bonus/Personas mutation;
- no ledger repair;
- no backfill;
- PREPARADA_NO_APLICADA until Release/CORE applies it.
