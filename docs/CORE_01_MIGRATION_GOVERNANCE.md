# CORE-01 — Gobierno Canónico de Migraciones

**FUNC-ID:** FUNC-0211  
**Estado:** implementado en rama; segunda corrección QA de provenance pendiente de revalidación independiente; **PARCIAL / NO CERTIFICADO FUNCIONALMENTE**.  
**Base auditada:** `staging@9bd740fa9b7dd153e937c1bff2eb32d3828c2954`  
**PR:** #123 / `core/core-01-migration-governance`  
**Producción / main:** fuera de alcance.

## 1. Autoridades separadas

CORE-01 no permite que un fichero o JSON sea su propia prueba.

| Capa | Autoridad |
| --- | --- |
| JSON Schema Draft 2020-12 | estructura, tipos, `required`, `additionalProperties`, enums/consts, patrones, formatos y lifecycle declarativo |
| CI / Git / GitHub | repositorio real, PR real, base SHA real, existencia de commits, diff real, target de authoring autorizado y run de verificación existente |
| Release / Supabase | entorno/project_ref de aplicación, deployment autorizado y ledger real `supabase_migrations.schema_migrations` |

La presencia de SQL **no prueba aplicación**. La presencia de `application_evidence` escrita por un autor **tampoco prueba aplicación**.

## 2. Ruta canónica y grandfathering

- Nueva autoría: exclusivamente `supabase/migrations/YYYYMMDDHHMMSS_descripcion_snake_case.sql`.
- `db/migrations/**`: histórico congelado.
- `supabase/*.sql`: bootstrap/compatibilidad congelada para nueva autoría.
- `supabase/applied-history/**`: archivo documental congelado; nunca segunda ruta de migración ni ledger.
- `docs/CORE_01_MIGRATION_INVENTORY.json`: snapshot de los 123 artefactos históricos; grandfathered.
- `docs/CORE_01_MIGRATION_PROVENANCE.json`: solo migraciones post-CORE-01.

Los históricos no deben recibir provenance inventada. El drift conocido, incluido `v121_student_active_corrections_visible`, permanece visible y no se reconstruye en este paquete.

## 3. Schema real

El contrato de registro es `docs/CORE_01_MIGRATION_PROVENANCE.schema.json`, schema version 2.

El Integration Gate instala tooling aislado bajo `tools/core01-validator/` y compila/ejecuta el schema con **Ajv 8 Draft 2020-12 + ajv-formats**. El tooling es CI-only y no forma parte de dependencias/runtime/bundle de la aplicación.

El schema es autoridad para forma exacta, `additionalProperties:false`, required, tipos, patrones, `format: date-time`, estados y lifecycle. El checker añade únicamente relaciones semánticas/contextuales que JSON Schema no puede demostrar.

## 4. AUTHORING GATE

Una migración nueva entra como `CANONICA`, `PREPARADA_NO_APLICADA`, `AUTHORING` y `application_evidence=null`.

En `pull_request`, CI corrobora contra Git/GitHub real: repository, existencia de base SHA, igualdad con `pull_request.base.sha`, PR number real, alta SQL en diff, path/version real y target perteneciente al allowlist CI. El gate de PR **no necesita secretos Supabase, no consulta producción, no aplica migraciones y no consulta ledger**.

En STAGING, el target previsto autorizado por CI es `staging / qlngfkzmncihtdzktcmd`. Esto demuestra destino permitido para authoring, no aplicación.

## 5. RELEASE / POST-APPLY VERIFICATION

`APLICADA` solo es legítimo después de verificación posterior independiente del JSON autoral. CORE-01 incorpora `.github/workflows/core01-post-apply-verification.yml` y `scripts/verify-migration-post-apply.mjs`.

El workflow solo tiene `workflow_dispatch`, corre bajo GitHub Environment protegido `staging`, no aplica SQL y necesita `CORE01_STAGING_DATABASE_URL` como secret de lectura del ledger y `CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS` como allowlist administrado por Release. Falla cerrado si falta configuración.

Corrobora: registro aún AUTHORING/PREPARADA, target declarado, source commit existente que contiene el SQL, deployment run real `completed/success` para ese commit y workflow_id autorizado, y fila exacta `version/name` en `supabase_migrations.schema_migrations`. Solo entonces genera un artifact `core01-post-apply-evidence.json`; no modifica repo ni ledger.

Para promover documentalmente a `APLICADA/APPLIED`, Release incorpora esa evidencia en un cambio posterior. El Authoring Gate vuelve a corroborar source commit, target y que `release_verification.run_id` existe, pertenece al workflow/path exacto, fue `workflow_dispatch`, terminó `success` y su título vincula inequívocamente migration path + source commit. Un JSON autocontenido inventado no basta.

## 6. Dependencia Release pendiente

Antes del primer uso, Chat 13 / Release debe configurar en el GitHub Environment `staging`: secret read-only `CORE01_STAGING_DATABASE_URL` y variable `CORE01_AUTHORIZED_DEPLOYMENT_WORKFLOW_IDS` con los workflow IDs que Release autorice realmente para aplicar migraciones canónicas. CORE-01 no configura secretos ni ejecuta una aplicación real.

## 7. Reglas semánticas adicionales

Fuera del schema: `migration_version == timestamp(path)`; evidence ledger version/name == path; evidence target ∈ intended_targets; timestamps nuevos posteriores al máximo histórico/ledger; timestamps únicos; inventario consistente; `canonical_pending` prohibido; legacy/root/applied-history congelados.

## 8. Applied-history por entorno

La autoridad Supabase es `supabase_migrations.schema_migrations` del `project_ref` realmente consultado. Un JSON o fichero en `applied-history` nunca sustituye esa consulta.

## 9. Recuperación

No `db reset`; no reescritura de migración publicada; default forward-fix. `migration repair`/ledger repair solo mediante procedimiento extraordinario Release + Data + Governance con evidencia.

## 10. CI heredado fuera de alcance

CYA QA E2E OIDC HTTP 403 y P32 156/160 heredado siguen separados. CORE-01 no altera sus contratos para fabricar verde.

## 11. Scope de esta segunda corrección QA

Solo se corrigen veracidad contextual de provenance y enforcement real JSON Schema. No hay SQL nuevo, migración aplicada, schema BD, datos, producto, UI, Personas, Classes, Teaching, Calendar, OIDC, P32, `cya-app.tsx`, main ni producción.

## 12. Estado

PR #123 no se fusiona. Chat 11 debe revalidar incrementalmente el nuevo SHA exacto. Hasta ese veredicto, **FUNC-0211 permanece PARCIAL / NO CERTIFICADO FUNCIONALMENTE**.
