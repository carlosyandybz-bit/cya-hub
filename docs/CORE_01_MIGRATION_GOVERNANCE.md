# CORE-01 — Gobierno Canónico de Migraciones

**FUNC-ID:** FUNC-0211  
**Estado de este paquete:** implementado en rama; pendiente de validación independiente de Chat 11; **NO certificado funcionalmente**.  
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

Antes de consultar o aplicar nada debe verificarse el `project_ref` del entorno. Producción requiere autorización explícita de Release; este paquete no la consultó ni la modificó.

## 2. Clasificación de rutas

| Superficie | Clasificación | Regla desde CORE-01 |
| --- | --- | --- |
| `supabase/migrations/` | **CANÓNICA** | Única ubicación para todas las migraciones nuevas. Los ficheros históricos que ya estaban aquí quedan grandfathered e inmutables. |
| `db/migrations/` | **COMPATIBILIDAD** | Ruta histórica congelada. No admite altas, modificaciones, renombres ni borrados. |
| `supabase/applied-history/` | **COMPATIBILIDAD** | Archivo retrospectivo; no es ruta de autoría ni prueba suficiente de aplicación. |
| `supabase/*.sql` en raíz | **BOOTSTRAP / COMPATIBILIDAD** | SQL histórico/operacional. No admite nuevas migraciones. Se preserva mientras existan consumidores o hasta clasificación individual aprobada. |
| `supabase_migrations.schema_migrations` | **APPLIED-HISTORY REAL** | Única fuente autoritativa para afirmar `APLICADA` en un entorno concreto. |

No se declara ningún artefacto **RETIRADA** ni **DUPLICADO DOCUMENTAL** en CORE-01 sin una comparación de contenido/provenance que lo demuestre.

## 3. Taxonomía

- **CANÓNICA**: superficie autorizada para nueva autoría.
- **APLICADA**: existe coincidencia demostrada en el ledger real del entorno auditado.
- **PREPARADA/NO APLICADA**: artefacto preparado cuya versión exacta no consta en el ledger.
- **BOOTSTRAP**: SQL de instalación, operación o compatibilidad histórica fuera del flujo canónico.
- **COMPATIBILIDAD**: histórico conservado; puede tener consumidores, pero no recibe nueva autoría.
- **DUPLICADO DOCUMENTAL**: solo tras demostrar equivalencia material con otro artefacto.
- **RETIRADA**: solo tras demostrar ausencia de consumidores, aprobar retirada y registrar evidencia.
- **DESCONOCIDA**: evidencia insuficiente. No se fuerza una clasificación por parecido de nombres.

El inventario machine-readable está en `docs/CORE_01_MIGRATION_INVENTORY.json`.

## 4. Naming y orden canónicos

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

## 5. Applied-history por entorno

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

En STAGING auditado CORE-01 hay **218** entradas, desde `20260808214303` hasta `20260819175828`. La última es `v121_student_active_corrections_visible` y no fue localizada en el repositorio certificado.

## 6. Idempotencia

La idempotencia de despliegue la aporta el ledger: una versión canónica no se vuelve a aplicar como si fuese nueva.

Dentro del SQL:

- no usar `IF NOT EXISTS` indiscriminadamente para ocultar drift;
- operaciones de backfill deben tener criterio determinista y, cuando proceda, clave de idempotencia;
- operaciones externas o side effects no deben depender de reejecutar manualmente el mismo SQL;
- si una migración necesita reintento parcial, debe documentar el punto seguro de reanudación.

## 7. Rollback y recuperación

No se usa `db reset` en staging ni producción.

Por defecto, tras una migración publicada se corrige **hacia delante** con una nueva migración. Para cambios destructivos/irreversibles, el PR debe documentar antes de aplicar:

- backup/snapshot requerido;
- rollback o forward-fix verificable;
- datos afectados;
- ventana de recuperación;
- owner Release/Data;
- criterio de aborto.

`migration repair` o manipulación del ledger no es un procedimiento ordinario; solo se admite como recuperación explícita de Release + Data + Governance con evidencia.

## 8. Provenance mínima obligatoria

Toda nueva migración debe poder reconstruirse con:

- ruta y nombre;
- versión UTC;
- commit SHA;
- PR;
- autor/owner;
- entorno y `project_ref`;
- resultado del gate;
- registro de aplicación real (versión + nombre en ledger);
- plan de rollback/forward-fix cuando aplique;
- referencia FUNC-ID / motor responsable.

No se copia SQL aplicado a `supabase/applied-history/` para convertir ese archivo en una segunda fuente de verdad.

## 9. Inmutabilidad histórica

CORE-01 no mueve, renombra ni borra SQL histórico.

Quedan congelados:

- `db/migrations/**`;
- `supabase/applied-history/**` salvo procedimiento de archivo explícito de Release/Governance;
- SQL raíz `supabase/*.sql`;
- ficheros preexistentes no canónicos dentro de `supabase/migrations/`.

Ejemplo de consumidor histórico que obliga a conservar bootstrap: `.github/workflows/apply-p19-persona-unica.yml` referencia `supabase/v47_p19_persona_unica.sql`.

## 10. Gate

`node scripts/check-migration-governance.mjs --base <BASE_SHA>` impide:

- crear/modificar/borrar SQL en `db/migrations`;
- usar `supabase/applied-history` como ruta alternativa;
- crear/modificar/borrar SQL de bootstrap en la raíz de `supabase`;
- modificar o borrar migraciones existentes en `supabase/migrations`;
- crear una nueva migración canónica con nombre no timestamped;
- reutilizar timestamp;
- dejar cualquiera de las dos rutas sin inventariar.

El gate está conectado al `STG-01 Integration Gate` requerido para PRs a `staging`.

## 11. Handoff Release / Governance

### Release
Antes de aplicar una migración:
1. verifica que está en la ruta canónica y que el gate pasa;
2. verifica target environment + `project_ref`;
3. aplica solo con autorización correspondiente;
4. comprueba ledger posterior;
5. registra evidencia de aplicación;
6. no promociona por mera existencia del fichero.

### Data + Audit/Data Governance
- Data mantiene este contrato y el inventario técnico.
- Governance exige provenance y registra drift/repair/rollback.
- Cualquier reclasificación de `DESCONOCIDA`, `DUPLICADO DOCUMENTAL` o `RETIRADA` exige evidencia trazable.

## 12. Cierre de CORE-01

Este cambio **no aplica ninguna migración**, no modifica schema ni datos y no certifica FUNC-0211. FUNC-0211 permanece `PARCIAL` hasta validación independiente de Chat 11 y posterior decisión de merge/promoción.
