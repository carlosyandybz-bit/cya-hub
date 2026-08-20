# CORE-01 — Gobierno Canónico de Migraciones

**FUNC-ID:** FUNC-0211  
**Estado:** cierre P1 TOCTOU reusable workflow implementado en rama; **PARCIAL / NO CERTIFICADO FUNCIONALMENTE** hasta revalidación independiente.  
**Base auditada:** `staging@9bd740fa9b7dd153e937c1bff2eb32d3828c2954`  
**PR:** #123 / `core/core-01-migration-governance`  
**Producción / main:** fuera de alcance.

## Autoridades
JSON Schema valida estructura; CI/Git/GitHub corrobora authoring; Release/Supabase corrobora aplicación real. Un JSON del autor nunca certifica APLICADA.

## Trusted post-apply
El dispatcher `.github/workflows/core01-post-apply-verification.yml` no tiene Environment ni secretos, exige `refs/heads/staging` y llama al reusable same-repo mediante la referencia local exacta:

`uses: ./.github/workflows/core01-post-apply-trusted.yml`

La referencia local es parte del trust boundary: el reusable debe proceder del mismo commit que contiene el caller. Queda prohibido identificar este reusable trusted mediante una rama o tag mutable como `@staging`, `@main`, una feature branch o una release tag. Un SHA explícito de 40 hex sería inmutable, pero el contrato productivo de CORE-01 usa la llamada local same-repo para que no exista resolución posterior mediante una referencia mutable.

### Invariante de identidad exacta
Para todo run post-apply autoritativo debe cumplirse:

`caller commit = reusable workflow commit = checkout trusted verifier commit = trusted_verifier_sha de la evidencia`

La igualdad se implementa así:
1. el caller usa `./.github/workflows/core01-post-apply-trusted.yml`, por lo que caller y reusable pertenecen al mismo commit;
2. los dos checkouts del reusable usan `ref: ${{ github.sha }}` y `persist-credentials:false`;
3. el verifier exporta `CORE01_TRUSTED_VERIFIER_SHA: ${{ github.sha }}` y ese valor se materializa como `trusted_verifier_sha` en el artifact autoritativo;
4. un rerun no puede volver a resolver el reusable desde `staging`, `main`, una branch o un tag distinto del commit del caller.

`tests/core01-reusable-workflow-identity.test.mjs` protege esta invariante y falla ante `@staging`, `@main` o cualquier branch/tag mutable equivalente. El test también comprueba la referencia local real, ambos checkouts a `github.sha` y el binding de `CORE01_TRUSTED_VERIFIER_SHA` al mismo SHA.

El reusable hace `preflight-no-secrets` y solo después abre el job con Environment `staging`. `source_commit_sha` se trata únicamente como dato: se consulta por GitHub REST y nunca se hace checkout ni se ejecuta código, scripts, actions, package.json o SQL de ese commit.

## Command injection
`migration_path`, `source_commit_sha` y `deployment_run_id` se transfieren por `env` y Node los lee desde `process.env`; no se interpolan dentro de `run:`. Se validan con regex canónica exacta, SHA de 40 hex y entero decimal positivo seguro antes de API/ledger.

## Evidence artifact y APPLIED binding
`docs/CORE_01_POST_APPLY_EVIDENCE.schema.json` (v1) define el artifact autoritativo emitido únicamente tras corroborar source commit/file, deployment allowlisted y ledger real `supabase_migrations.schema_migrations`. El artifact contiene path/version, target, source SHA, deployment run/workflow, ledger, verification run/workflow/path/repo/ref/trusted SHA y verified_at.

Durante PREPARADA→APLICADA el checker carga el registro base, preserva path/version/class/owner/FUNC-ID/authorship/intended_targets/recovery, obtiene el verification run real, exige repo/workflow/path/event/status/ref correctos, localiza exactamente un artifact por nombre determinista, lo descarga por artifact ID de GitHub, lee el ZIP sin extraerlo al filesystem, valida evidence schema real con Ajv y compara exactamente `application_evidence` con el artifact. Evidence ya certificada es inmutable; solo puede añadirse nueva evidence al final y cada adición requiere su propio artifact corroborado.

## Seguridad
Token GitHub limitado a `contents:read` y `actions:read`; no `secrets: inherit`; DB URL solo existe en el step verificador y se pasa a psql mediante `PGDATABASE`, no argv; errores sensibles se redactan. Target post-apply fijado a staging. No se ejecuta post-apply real en CORE-01.

## Histórico y scope
Se conservan 123 artefactos grandfathered, 23 DESCONOCIDA y v121 como unknown. `canonical_pending` bloqueado; `db/migrations`, root Supabase SQL y applied-history congelados. 0 SQL funcional, 0 migraciones aplicadas, 0 schema DB, 0 datos, 0 producto, 0 cya-app.tsx, 0 main, 0 producción.

## Release dependency
Antes del primer uso real Chat 13 debe configurar en Environment staging una credencial estrictamente read-only para ledger y el allowlist de deployment workflow IDs, y confirmar la operatividad de workflow_dispatch según configuración GitHub vigente. No se configura ni ejecuta aquí.

PR #123 no se fusiona. Chat 11 debe revalidar únicamente el P1 TOCTOU sobre el SHA exacto publicado. `FUNC-0211` permanece **PARCIAL / NO CERTIFICADO FUNCIONALMENTE**.