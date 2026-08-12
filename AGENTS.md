# CYA Hub — Agent instructions

## Mission

Work on the existing CYA Hub application. Preserve working behavior, complete missing or partial functionality, and verify every material change. Do not rebuild the product from scratch unless explicitly requested.

## Sources of truth

Use these in this order when they conflict:

1. Current production state in Supabase for applied schema/data state.
2. Current repository code on the active branch.
3. `docs/CYA_HUB_SECUENCIA_MAESTRA.md` for consolidated product decisions.
4. `docs/CYA_HUB_PENDIENTES.md` for current pending work.
5. `docs/DATABASE_MIGRATION_BASELINE.md` for database migration history.
6. Historical plugin/report material only to recover functionality that is missing from the web app.

Never infer that a SQL migration is applied merely because a file exists in GitHub.

## Repository and data safety

- `main` is the production branch.
- Never reset, recreate, truncate, or bulk-delete production Supabase data.
- Never apply a production migration unless the user explicitly authorizes that migration or deployment.
- Prefer incremental, idempotent, backwards-compatible migrations.
- Never commit secrets, service-role keys, access tokens, passwords, private URLs with embedded credentials, or `.env` values.
- Supabase is the source of truth for application data. Google Drive is the source of truth for photos/videos; store only IDs/metadata in Supabase.
- Server-side authorization must enforce roles. UI-only role hiding is not security.

## Architecture

- Next.js + React web application.
- Supabase for Auth, database and application data.
- Hostinger is the target production host.
- GitHub is the code/version source of truth.
- Mobile-first. The principal UX reference is iPhone, especially the iPhone 17 Pro Max class of viewport.

## Product navigation

Primary mobile navigation is:

`Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`

`DAR CLASE` is the central, visually dominant action. Do not reintroduce a hamburger menu for core functions.

## Required verification

Before declaring a change complete:

1. Inspect the affected implementation and nearby flows for regressions.
2. Run the narrowest relevant automated checks.
3. Run `npm run lint` for application-code changes.
4. Run `npm run build` for changes that can affect production compilation, routing, server/client boundaries, or configuration.
5. Run `npm test` when the existing rendered-output tests are relevant.
6. For UI, navigation, forms, role behavior, or class-flow changes, use the Playwright MCP browser when available and exercise the real user flow.
7. Check browser console/network failures when the change touches client behavior or APIs.
8. Report exactly what was tested and any verification that could not be completed.

Do not treat successful compilation as proof that a user flow works.

## Browser QA rules

When Playwright MCP tools are available:

- Test the smallest failing flow first, then the surrounding happy path.
- Prefer accessibility/DOM snapshots for deterministic interaction and screenshots for visual evidence.
- Test mobile responsive behavior for user-facing changes.
- For role-sensitive functionality, verify the relevant professor, student, and administrator perspectives rather than assuming shared behavior.
- Never perform destructive production actions merely to test a UI. Use safe existing test data or a dedicated test account/environment when available.
- Capture console and network errors before and after a fix when they are relevant.

For detailed CYA Hub QA coverage, use the repository skill `cya-hub-qa`.

## CYA Hub invariants

- A person may hold multiple real roles (professor, student, and administrator when authorized).
- “Ver como” may change presentation but must never escalate server-side permissions.
- Do not duplicate canonical person/student data across forms when it can be referenced.
- Teaching content types are Correcciones, Explicaciones, Ejercicios and Secuencias; unified search in class flows must not arbitrarily exclude a type.
- Corrections belong to individual people, not to a couple as a single entity.
- Keep pedagogical and financial/class-close operations consistent; do not silently consume credits or change attendance as a side effect of unrelated UI changes.
- Preserve historical data and relationships during migrations/refactors.

## UX quality bar

- Optimize for fast one-handed mobile use during a live class.
- Avoid long, repetitive forms and duplicate questions.
- Prefer compact progressive disclosure over permanently expanded detail.
- Avoid fluorescent yellow.
- Purple buttons must use legible high-contrast text.
- Icons should not gain decorative square backgrounds unless a design explicitly requires them.
- Do not expose technical/debug wording to normal users.

## Change discipline

- Fix root causes rather than adding isolated patches when multiple symptoms share one cause.
- Search for equivalent components/usages before changing a shared component.
- Keep changes scoped; do not opportunistically rewrite unrelated modules.
- If a change alters a documented product rule, update the corresponding project documentation in the same change.
- For significant work, leave the repository in a state another agent can understand without relying on chat history.

## Code review rules

Flag as blocking when a change:

- can expose another user's data through missing/incorrect authorization or RLS assumptions;
- can mutate production data without explicit user intent;
- breaks a core navigation or `DAR CLASE` flow;
- duplicates canonical data in a way that can diverge;
- introduces secrets into client code or the repository;
- reports success without a realistic verification path for a user-facing flow.
