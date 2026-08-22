# ATTENDANCE M1 FORWARD-FIX

Status: AUTHORING / PREPARADA_NO_APLICADA.

Base staging: `9033ee5e06313b5af2461f82aba18d14cd54805e`.

Applied immutable M1 source reference: PR #126 HEAD `a9f417379427b276386efbb6e9ad29e4e6c5bd10`, blob `15dd9eb55ce699123729471d65dbb8e5707e7c85`.

M2 remains WAIT and is not modified or applied.

This forward-fix changes only the security boundary and ACL of the existing administrative finish chain. `administratively_finish_class_v2` becomes the sole SECURITY DEFINER trusted boundary owned by postgres with an empty search_path. v3-v6 remain SECURITY INVOKER. The private attendance helper remains sealed from PUBLIC, anon, authenticated and service_role. No attendance, billing, reopen, record/correct, People, Bonus or UI business logic is rewritten.

No migration application evidence exists yet. Runtime certification belongs to independent QA after governed application.
