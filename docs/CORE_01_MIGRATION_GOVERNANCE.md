# CORE-01 — Gobierno Canónico de Migraciones

**FUNC-ID:** FUNC-0211  
**Estado de este paquete:** implementado en rama; corrección QA de provenance aplicada; pendiente de revalidación independiente de Chat 11; **NO certificado funcionalmente**.  
**Base auditada:** `staging@9bd740fa9b7dd153e937c1bff2eb32d3828c2954`  
**Supabase STAGING auditado:** `qlngfkzmncihtdzktcmd`  
**Producción / main:** fuera de alcance.

## 1. Autoridad y objetivo

Este contrato elimina la ambigüedad operativa entre `supabase/migrations`, `db/migrations`, SQL bootstrap y archivos retrospectivos. Desde CORE-01:

> **Toda migración nueva de CYA Hub se autoriza exclusivamente en `supabase/migrations/`.**

La presencia de un fichero SQL **nunca prueba** que una migración esté aplicada. La prueba autoritativa por entorno es el ledger de ese proyecto Supabase:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Antes de consultar o aplicar nada debe verificarse el `project_ref` del entorno. Producción requiere autorización explícita de Release; CORE-01 no la consulta ni la modifica.

## 2. Clasificación de rutas

| Superficie | Clasificación | Regla desde CORE-01 |
| --- | --- | --- |
| `supabase/migrations/` | **CANÓNICA** | Única ubicación para todas las migraciones nuevas. Los ficheros históricos que ya estaban aquí quedan grandfathered e inmutables. |
| `db/migrations/` | **COMPATIBILIDAD** | Ruta histórica congelada. No admite altas, modificaciones, renombres ni borrados. |
| `supabase/applied-history/` | **COMPATIBILIDAD** | Archivo retrospectivo; no es ruta de autoría ni prueba suficiente de aplicación. |
| `supabase/*.sql` en raíz | **BOOTSTRAP / COMPATIBILIDAD** | SQL histórico/operacional. No admite nuevas migraciones. Se preserva mientras existan consumidores o hasta clasificación individual aprobada. |
| `supabase_migrations.schema_migrations` | **APPLIED-HISTORY REAL** | Única fuente autoritativa para afirmar `APLICADA` en un entorno concreto. |

No se declara ningún artefacto **RETIRADA** ni **DUPLICADO DOCUMENTAL** sin una comparación de contenido/provenance que lo demuestre.

## 3. Inventario histórico frente a provenance post-CORE-01

Los dos conceptos se separan para no fabricar evidencia que históricamente no existe:

- `docs/CORE_01_MIGRATION_INVENTORY.json`: snapshot clasificado de los 123 artefactos históricos auditados contra STAGING. Mantiene grandfathering y drift/unknowns.
- `docs/CORE_01_MIGRATION_PROVENANCE.json`: registro operativo obligatorio para **toda migración creada después de CORE-01**.
- `docs/CORE_01_MIGRATION_PROVENANCE.schema.json`: contrato machine-readable del registro post-CORE-01.

Los artefactos históricos no están obligados a inventar SHA, PR, deployment o ledger que no puedan demostrarse. Toda nueva migración sí debe incorporarse al registro de provenance desde su PR de autoría.

El antiguo mecanismo auxiliar `canonical_pending` deja de ser una vía válida porque permitía registrar solo `path` y superar el gate con provenance insuficiente.

## 4. Taxonomía

- **CANÓNICA**: superficie autorizada para nueva autoría.
- **APLICADA**: existe coincidencia demostrada en el ledger real del entorno auditado.
- **PREPARADA_NO_APLICADA**: artefacto preparado cuya versión exacta no consta aún aplicada.
- **BOOTSTRAP**: SQL de instalación, operación o compatibilidad histórica fuera del flujo canónico.
- **COMPATIBILIDAD**: histórico conservado; puede tener consumidores, pero no recibe nueva autoría.
- **DUPLICADO_DOCUMENTAL**: solo tras demostrar equivalencia material con otro artefacto.
- **RETIRADA**: solo tras demostrar ausencia de consumidores, aprobar retirada y registrar evidencia.
- **DESCONOCIDA**: evidencia insuficiente. No se fuerza una clasificación por parecido de nombres.

## 5. Naming y orden canónicos

Toda nueva migración:

```text
supabase/migrations/YYYYMMDDHHMMSS_descripcion_snake_case.sql
```

Reglas:

1. timestamp UTC de 14 dígitos;
2. un timestamp por migración, nunca reutilizado;
3. descripción en `snake_case` ASCII minúscula;
4. orden total por timestamp ascendente;
5. el fichero debe existir en Git **antes** de cualquier aplicación al entorno;
6. una migración ya comprometida/aplicada es inmutable; una corrección se hace con una migración posterior;
7. nombres `vNN`, `vNNb`, fechas de 8 dígitos o SQL raíz no son válidos para nueva autoría.

## 6. Applied-history por entorno

### Preflight obligatorio

Registrar:

- entorno lógico (`staging`, `production`, etc.);
- Supabase `project_ref`;
- commit/PR que contiene el SQL;
- versión/nombre esperado.

### Consulta autoritativa

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Para una migración concreta:

```sql
select version, name
from supabase_migrations.schema_migrations
where version = '<YYYYMMDDHHMMSS>';
```

Estados:

- fila exacta versión + nombre → `APLICADA`;
- no existe fila exacta → no está demostrada como aplicada;
- mismo nombre con otra versión → **no** asumir equivalencia; requiere provenance/diff;
- fila de ledger sin SQL localizado → `DESCONOCIDA` y bloqueo de reconstrucción hasta reconciliar.

En STAGING auditado CORE-01 hay **218** entradas, desde `20260808214303` hasta `20260819175828`. La última es `v121_student_active_corrections_visible` y no fue localizada en el repositorio certificado. Ese unknown permanece abierto y fuera de esta corrección QA.

## 7. Idempotencia

La idempotencia de despliegue la aporta el ledger: una versión canónica no se vuelve a aplicar como si fuese nueva.

Dentro del SQL:

- no usar `IF NOT EXISTS` indiscriminadamente para ocultar drift;
- operaciones de backfill deben tener criterio determinista y, cuando proceda, clave de idempotencia;
- operaciones externas o side effects no deben depender de reejecutar manualmente el mismo SQL;
- si una migración necesita reintento parcial, debe documentar el punto seguro de reanudación.

## 8. Rollback y recuperación

No se usa `db reset` en staging ni producción.

Por defecto, tras una migración publicada se corrige **hacia delante** con una nueva migración. Para cambios destructivos/irreversibles, el PR debe documentar antes de aplicar:

- backup/snapshot requerido;
- rollback o forward-fix verificable;
- datos afectados;
- ventana de recuperación;
- owner Release/Data;
- criterio de aborto.

`migration repair` o manipulación del ledger no es un procedimiento ordinario; solo se admite como recuperación explícita de Release + Data + Governance con evidencia.

## 9. Provenance machine-readable y lifecycle

Toda migración post-CORE-01 se registra en `docs/CORE_01_MIGRATION_PROVENANCE.json` y debe validar contra `docs/CORE_01_MIGRATION_PROVENANCE.schema.json` **y** las relaciones semánticas del checker.

### 9.1 Fase AUTHORING — obligatoria desde el PR de autoría

Estado compatible: `PREPARADA_NO_APLICADA`.

Campos obligatorios:

- `path` canónico;
- `migration_version`, idéntico al timestamp del nombre;
- `operational_class=CANONICA`;
- `applied_state=PREPARADA_NO_APLICADA`;
- `provenance.schema_version`;
- `provenance.lifecycle_phase=AUTHORING`;
- `owner`;
- `func_id`;
- `authorship.repository`;
- `authorship.base_sha`: SHA real conocido desde el que se abrió el trabajo; no es un SHA futuro/autorreferencial;
- `authorship.pr_number`;
- `intended_targets[]` con entorno + `project_ref` conocidos;
- `recovery.strategy` y `recovery.plan`;
- `application_evidence=null`.

**Regla:** durante AUTHORING no se rellenan ledger, source commit de aplicación, run/deployment ni fecha de verificación. Esos hechos todavía no han ocurrido y no pueden inventarse para satisfacer CI.

### 9.2 Fase APPLIED — solo después de una aplicación real

Estado compatible: `APLICADA`.

Además de conservar la provenance de autoría, exige `application_evidence[]` con al menos:

- `environment`;
- `project_ref`;
- `source_commit_sha` real del código aplicado;
- `ledger.version`, idéntica a `migration_version`;
- `ledger.name`, idéntico al nombre canónico de la migración sin timestamp/extensión;
- `deployment.kind` (`github_actions` o `manual_release`);
- `deployment.reference`;
- `deployment.result=SUCCESS`;
- `verified_at`.

El entorno/project_ref aplicado debe haber sido declarado previamente en `intended_targets`.

### 9.3 Compatibilidad de estados

El checker rechaza explícitamente:

- `PREPARADA_NO_APLICADA` con fase distinta de `AUTHORING`;
- `PREPARADA_NO_APLICADA` con evidencia de aplicación no nula;
- `APLICADA` con fase distinta de `APPLIED`;
- `APLICADA` sin evidencia ledger/entorno/deployment;
- SHA de 40 ceros u otros placeholders sintácticos;
- ledger/version/name incompatibles con el path;
- aplicación en un target no declarado.

## 10. Inmutabilidad histórica

CORE-01 no mueve, renombra ni borra SQL histórico.

Quedan congelados:

- `db/migrations/**`;
- `supabase/applied-history/**` salvo procedimiento de archivo explícito de Release/Governance;
- SQL raíz `supabase/*.sql`;
- ficheros preexistentes no canónicos dentro de `supabase/migrations/`.

Ejemplo de consumidor histórico que obliga a conservar bootstrap: `.github/workflows/apply-p19-persona-unica.yml` referencia `supabase/v47_p19_persona_unica.sql`.

## 11. Gate

`node scripts/check-migration-governance.mjs --base <BASE_SHA>` impide:

- crear/modificar/borrar SQL en `db/migrations`;
- usar `supabase/applied-history` como ruta alternativa;
- crear/modificar/borrar SQL de bootstrap en la raíz de `supabase`;
- modificar o borrar migraciones existentes en `supabase/migrations`;
- crear una nueva migración canónica con nombre no timestamped o retrodatado;
- reutilizar timestamp;
- dejar SQL de cualquiera de las rutas gobernadas fuera del inventario combinado;
- registrar una nueva migración sin provenance obligatoria de AUTHORING;
- registrar provenance parcial o inválida;
- marcar `APLICADA` sin evidencia posterior suficiente;
- fabricar evidencia futura para una migración todavía preparada;
- usar `canonical_pending` como bypass de provenance.

El gate está conectado al `STG-01 Integration Gate` requerido para PRs a `staging`.

## 12. Handoff Release / Governance

### Release
Antes de aplicar una migración:
1. verifica ruta canónica, naming, registro de provenance en fase AUTHORING y gate verde;
2. verifica target environment + `project_ref` contra `intended_targets`;
3. aplica solo con autorización correspondiente;
4. comprueba el ledger posterior;
5. actualiza el mismo registro a fase APPLIED con evidencia real, nunca anticipada;
6. vuelve a ejecutar el gate;
7. no promociona por mera existencia del fichero.

### Data + Audit/Data Governance
- Data mantiene el contrato, snapshot histórico y registro post-CORE-01.
- Governance exige provenance, conserva drift/unknowns y registra repair/rollback.
- Cualquier reclasificación de `DESCONOCIDA`, `DUPLICADO_DOCUMENTAL` o `RETIRADA` exige evidencia trazable.
- El snapshot histórico no se rellena retroactivamente con provenance inventada.

## 13. Corrección QA del P2 de provenance

Chat 11 demostró que el head `ff75e29463230a7a9eb9c60c625ba0e7a4b458c0` podía aceptar una migración futura con registro insuficiente. Esta corrección elimina ese bypass mediante schema + registro post-CORE-01 + validación lifecycle en `validateInventory`/`validateChanges` y pruebas positivas/negativas dedicadas.

No se modifica SQL, schema, datos, producto, OIDC, P32 ni `cya-app.tsx`. Los fallos heredados de QA E2E OIDC 403 y P32 156/160 permanecen fuera de scope y deben seguir reportándose por separado.

## 14. Estado funcional

Esta corrección **no aplica ninguna migración**, no modifica schema ni datos y no certifica FUNC-0211. Tras el nuevo head, Chat 11 debe realizar exclusivamente revalidación incremental de CORE-01. Hasta entonces, FUNC-0211 permanece **PARCIAL / NO CERTIFICADO FUNCIONALMENTE** y PR #123 no debe fusionarse.
