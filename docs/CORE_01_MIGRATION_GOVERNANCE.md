# CORE-01 / CORE-02 — Gobierno y pipeline operativo de migraciones

**FUNC-ID:** FUNC-0211  
**Estado funcional:** CORE-01 técnicamente validado e integrado en staging; **CORE-02 IMPLEMENTADO / NO VALIDADO QA** hasta revisión independiente. FUNC-0211 permanece **PARCIAL / NO CERTIFICADO FUNCIONALMENTE**.  
**Base operativa CORE-02:** `staging@58d00e62b83bfebbfb3087b66aaa317d7a255b10`  
**Main / producción:** fuera de alcance.

## 1. Evidencia histórica preservada
CORE-01 estableció la ruta canónica `supabase/migrations/YYYYMMDDHHMMSS_snake_case.sql`, provenance machine-readable, JSON Schema, authoring contextual, inmutabilidad AUTHORING, binding APPLIED↔artifact, separación trusted-code/source-data, redacción de secretos y la invariante:

`caller commit = reusable workflow commit = checkout trusted verifier commit = trusted_verifier_sha`

La certificación histórica de CORE-01 no se borra ni se reinterpreta. El primer uso real posterior reveló gaps **operativos** que no habían sido ejecutados aún: registry AUTHORING solo presente en source SHA, `workflow_dispatch` no operable sin default branch, ausencia de deployment workflow canónico y Environment staging todavía no operacionalizado.

## 2. Incidente real que origina CORE-02
PR consumidor real: `#124` / PERSON-01 / source SHA `acc2db41acc07eb30fe0aa6eadbb61df3ac796bd`.
Migración: `supabase/migrations/20260820195300_person_lifecycle_student_predicate.sql`.
Estado: `PREPARADA_NO_APLICADA / AUTHORING`; **no aplicada**.

El trusted checkout `staging@58d00e62...` tiene `docs/CORE_01_MIGRATION_PROVENANCE.json` con `migrations=[]`; la entrada AUTHORING existe únicamente en el source SHA. CORE-02 corrige el pipeline; no aplica ni modifica PERSON-01.

## 3. Trust model operativo
Se separan cuatro autoridades:

1. **TRUSTED PIPELINE CODE**: workflow/scripts tomados exclusivamente del SHA exacto al que apunta el tag de Release. `GITHUB_WORKFLOW_SHA` debe ser idéntico a `GITHUB_SHA`; los checkouts trusted usan `ref: ${{ github.sha }}` y `persist-credentials:false`.
2. **SOURCE DATA**: `source_commit_sha`, PR, provenance y migration SQL se descargan mediante GitHub API desde un SHA inmutable. Son datos; jamás se hace checkout ni se ejecutan scripts/actions/package.json del source SHA.
3. **DEPLOYMENT AUTHORITY**: un run separado `CORE-02 Staging Migration Deployment` aplica exactamente una migración autorizada y emite `core01-deployment-evidence-<run_id>`.
4. **POST-APPLY AUTHORITY**: un segundo run `CORE-01 Post-Apply Verification` descarga el deployment artifact por GitHub artifact ID, valida el source de nuevo, usa credencial ledger read-only y emite el evidence artifact que puede respaldar una promoción posterior a APPLIED.

Un PR no trusted no puede obtener Environment secrets por modificar el workflow: cualquier cambio en `.github/workflows/core01-*`, `scripts/verify-migration-*`, `scripts/check-migration-*`, `scripts/core01-*` o `docs/CORE_01_*` (salvo el registry de provenance) hace fallar el source-data preflight. El único contenido ejecutable procedente del PR es **el SQL de la única migración canónica autorizada por el tag de Release y el Environment gate**; no se ejecuta ningún otro código del PR.

## 4. Trigger sin bootstrap en main
`workflow_dispatch` se conserva como evidencia histórica de CORE-01 pero **no es el mecanismo operativo CORE-02**, porque GitHub solo permite dispatch si el workflow existe en la default branch.

CORE-02 usa `push` de tags que apuntan al SHA trusted exacto:

### Deployment
`core01-staging-deploy-pr-<PR>-sha-<SOURCE_SHA>`

El tag debe apuntar al SHA exacto del pipeline trusted en staging. El nombre transporta PR/source SHA únicamente como datos. Antes del Environment/secret, el workflow exige repo exacto, event `push`, formato cerrado, `GITHUB_WORKFLOW_SHA == GITHUB_SHA`, checkout exacto y que ese SHA continúe siendo HEAD de `staging`.

### Verification
`core01-staging-verify-run-<DEPLOYMENT_RUN_ID>-pr-<PR>-sha-<SOURCE_SHA>`

Debe apuntar al mismo trusted pipeline SHA que el deployment run. Un rerun conserva el SHA del evento original y no vuelve a resolver `staging`, `main`, branch o tag para cargar código.

**MAIN_BOOTSTRAP_REQUIRED: NO.**

## 5. Source-data preflight
`scripts/verify-migration-source-data.mjs` corrobora por GitHub API:

- source SHA exacto 40-hex; no branch/tag;
- PR exacto, abierto, mismo repo, base `staging`;
- en deployment, `PR.base.sha == trusted staging SHA`;
- exactamente una migración canónica `added` en el PR;
- consumer PR no modifica trusted CORE-01/CORE-02 code;
- provenance JSON leído desde source SHA como DATA;
- registro único para el path real;
- schema v3/semántica usando schema y Ajv del trusted checkout;
- `PREPARADA_NO_APLICADA / AUTHORING / application_evidence=null`;
- repository/base SHA/PR exactos;
- target exclusivamente `staging/qlngfkzmncihtdzktcmd`;
- recovery `forward_fix`;
- SQL Content API path/type/blob SHA exactos contra el blob declarado por el PR;
- SHA-256 del SQL para el deployment artifact.

No existe checkout del source SHA.

## 6. Deployment workflow canónico
`.github/workflows/core01-deploy-migration.yml` aplica **exactamente una** migración por run.

Prohibiciones: no arbitrary SQL input, no glob, no múltiples migraciones, no `db reset`, no `migration repair`, no producción, no main deployment, no source checkout.

Secuencia:
1. preflight completo sin Environment/secrets;
2. Environment `staging`;
3. revalidación completa tras approval y antes del DB secret;
4. preconsulta de `supabase_migrations.schema_migrations`; si existe la versión, falla (idempotencia/doble aplicación);
5. runner trusted valida que el SQL no contenga meta-comandos psql, control explícito de transacciones ni `COPY PROGRAM`;
6. una única ejecución `psql --single-transaction --set=ON_ERROR_STOP=1`, con DB URL exclusivamente en `PGDATABASE`;
7. advisory transaction lock + recheck de ledger + SQL exacto + inserción exacta de version/name/statements en el ledger, dentro de la misma transacción;
8. postquery obliga a version/name exactos;
9. artifact `CORE-02-DEPLOYMENT-EVIDENCE` con repo, target, PR, source SHA, path/version/name, blob SHA, SHA-256, trusted pipeline SHA, trigger ref, run/workflow ID y ledger;
10. recovery únicamente `forward_fix`.

El SQL fuente nunca se registra en logs/artifacts; solo hash/blob identity. Los secretos nunca aparecen en argv, logs o artifacts.

## 7. Post-apply verification
El verifier post-apply ya no busca AUTHORING en el registry vacío del trusted checkout. Descarga source provenance + SQL por API como datos y los vuelve a validar.

Antes del ledger secret descarga por GitHub API el deployment run y exactamente un `core01-deployment-evidence-<run_id>` por artifact ID, valida `docs/CORE_01_DEPLOYMENT_EVIDENCE.schema.json`, y exige binding exacto entre run, workflow path, trusted pipeline SHA, PR/source/path/blob/hash/target y artifact.

Solo en el job con Environment `staging` usa `CORE01_STAGING_LEDGER_DATABASE_URL`, que debe ser estrictamente read-only para `supabase_migrations.schema_migrations`. También exige que el workflow ID real de deployment exista en `CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS`.

La evidencia post-apply conserva `verification.ref = refs/heads/staging` como **trusted base ref contractual**; la identidad del run real se corrobora por GitHub run ID/path/event/head SHA. El checker APPLIED mantiene compatibilidad con evidence histórica `workflow_dispatch/staging` y añade la forma autoritativa CORE-02 `push` por verify tag.

## 8. Environment / administración pendiente
Los conectores disponibles no exponen lectura/escritura de GitHub Environments, secrets ni rulesets/tag protection. No se inventa esa configuración y no se hardcodean credenciales.

Antes del primer deployment real, Release debe configurar manualmente:

1. **Environment `staging`** con required reviewer(s), `prevent self-review` cuando esté disponible y sin bypass administrativo ordinario.
2. Environment deployment tag rules limitadas a `core01-staging-deploy-*` y `core01-staging-verify-*`.
3. **Ruleset/tag protection** para que solo Release/admin autorizado pueda crear, actualizar o borrar esos dos namespaces de tags.
4. Secret `CORE01_STAGING_DATABASE_URL`: conexión STAGING con permisos suficientes exclusivamente para aplicar la migración autorizada y actualizar `supabase_migrations.schema_migrations`; nunca producción.
5. Secret distinto `CORE01_STAGING_LEDGER_DATABASE_URL`: credencial read-only capaz únicamente de consultar el ledger requerido por post-apply.
6. Variable `CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS`: incluir únicamente el workflow ID real de `.github/workflows/core01-deploy-migration.yml` después de que exista en staging.

**ENVIRONMENT_ADMIN_STEP_REQUIRED: YES.** Ningún deployment real debe ejecutarse hasta demostrar estos controles.

## 9. Testing / QA contract
CORE-02 añade probes positivos/negativos para los 20 casos requeridos: provenance source SHA, ausencia, PR mismatch, SHA mutable/inválido, path/blob SQL mismatch, repo/project mismatch, workflow ID allowlist, deployment failure, ledger absent/name mismatch, double apply, >1 migration, no arbitrary SQL input, consumer workflow modification, source checkout con secrets, identidad exacta, rerun TOCTOU y redacción.

También prueba atomic apply SQL y compatibilidad APPLIED con verify-tag. Todos los tests CORE-01 existentes deben permanecer verdes.

## 10. Scope y estado
CORE-02 no modifica `supabase/migrations/20260820195300_person_lifecycle_student_predicate.sql`, PERSON-01, `app/`, `cya-app.tsx`, lógica de dominio, schema/data Supabase real, main ni producción. Durante desarrollo/QA de CORE-02: **SQL aplicado = 0**.

No autocertificar. Tras Integration Gate y Staging Lab boundary verdes, entregar a Chat 11 para QA independiente. Hasta entonces y después de la entrega: **WAIT**.
