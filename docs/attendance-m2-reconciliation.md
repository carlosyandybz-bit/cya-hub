# CLASS-ATTENDANCE-01 — M2 reconciliation

Status: AUTHORING / PREPARADA_NO_APLICADA / NO APPLY.

Base staging: `fa5e67b912e1ec2bacf03f0f993337fec83cc578`.

Applied immutable database sequence verified in Supabase STAGING `qlngfkzmncihtdzktcmd`:

- `20260821170000` — `class_attendance_real_history` — APPLIED.
- `20260821170500` — `attendance_m1_forward_fix` — APPLIED.
- `20260821171000` — `class_attendance_finalize_compat` — ABSENT / candidate only.

Historical source: PR #126 HEAD `a9f417379427b276386efbb6e9ad29e4e6c5bd10`, migration blob `18ca4ab2e336c38586b31baf8540cf170ac19e33`.

Reconciliation result: the historical M2 remains semantically correct for the confirmed `absent/no_show` durable fact followed by administrative finish with `absent/null`. It reuses the existing durable fact when status matches and the incoming absence reason is omitted, preserves the recorded `no_show`, and still requires `correct_class_attendance()` for a true status mismatch.

Rollback-only runtime proof on class 765 showed administrative finish succeeds with the M2 body, class reaches finished inside the transaction, attendance event count remains 2, max event remains 8, and latest absence reason remains `no_show`; transaction was rolled back.

Security compatibility: M2 keeps `private.record_class_attendance_fact` SECURITY DEFINER with empty search_path. PostgreSQL CREATE OR REPLACE preserves the existing owner/ACL because the signature is unchanged; rollback-only catalog verification confirmed owner postgres and no EXECUTE for PUBLIC, anon, authenticated or service_role. Applied forward-fix v2 remains SECURITY DEFINER; v3-v6 remain SECURITY INVOKER.

No M1, forward-fix, People, Bonus, UI, backfill or ledger repair is included in this candidate.
