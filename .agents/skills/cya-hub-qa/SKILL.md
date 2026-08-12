---
name: cya-hub-qa
description: Run and interpret CYA Hub browser QA, especially mobile, role-sensitive navigation and Dar clase flows. Use the repository QA Bridge before declaring user-facing fixes complete.
---

# CYA Hub QA

## Default behavior

For user-facing changes, do not stop at lint/build. Use the repository QA Bridge whenever the affected flow can be exercised by Playwright.

## Evidence order

1. GitHub Actions workflow result.
2. Failed job step and decoded logs.
3. Playwright report/test-results artifact.
4. Screenshot/video/trace evidence.
5. Relevant Supabase state when persistence is part of the acceptance criteria.

## Safe baseline

The baseline suite is read-only. Authenticated suites must use dedicated QA credentials supplied through GitHub Actions Secrets.

Never use a real owner/admin password as a test fixture. Never introduce service-role or secret Supabase keys into browser tests.

## Mobile priority

CYA Hub is mobile-first. Run or interpret `iphone-large-chromium` before desktop for navigation, forms, live class, student profile, teaching and account-menu changes.

Check at minimum:

- no unintended horizontal overflow;
- primary actions remain reachable;
- fixed bottom navigation does not cover actionable content;
- overlays/dialogs can be dismissed;
- forms remain usable with touch-sized controls;
- dynamic loading does not leave an empty or broken shell;
- no new console errors or failed application requests attributable to the change.

## Role-sensitive QA

When credentials exist, validate the relevant perspectives separately:

- teacher;
- student;
- admin.

`Ver como` is a presentation context, not permission escalation. A passing teacher view does not prove student/admin authorization behavior.

## Dar clase expansion order

When extending automated coverage for Dar clase, add read-only/navigation coverage before mutating data:

1. enter Dar clase;
2. locate scheduled/manual class entry points;
3. verify active corrections are visible;
4. verify unified search exposes Correcciones, Explicaciones, Ejercicios and Secuencias;
5. verify mobile layout and initial three-minute workflow controls;
6. only then add fixture-backed mutations for assignments, evaluation and class close.

Mutating tests must operate only on dedicated QA fixtures and prove cleanup ownership before deletion.

## Completion report

For each QA-backed change, report:

- branch/PR tested;
- workflow conclusion;
- device/project tested;
- role(s) tested;
- failing step if any;
- root cause/fix if changed;
- any skipped coverage because QA credentials or fixtures are not yet configured.
