# P17 — Evaluaciones: reconciliación y corte seguro

Fecha: 2026-08-11
Estado: **EN CURSO · P17.1 reconciliado · v43 preparada y dry-run validado · aplicación permanente bloqueada por runtime Hostinger**

## 1. Fuentes reconciliadas

P17 compara:

1. `main` actual;
2. PR #1 / rama histórica Point12R;
3. Supabase producción real;
4. SQL preparados `v35c` / `v41c`;
5. el informe concurrente `docs/P17_EVALUATION_RECONCILIATION.md`.

La PR #1 no debe fusionarse como bloque. Parte de una arquitectura anterior y sus conceptos válidos ya han evolucionado en `main`.

## 2. Corrección sobre el informe P17.1 anterior

El informe P17.1 entró en `main` mientras esta reconciliación estaba en curso y auditó un baseline anterior. Conserva hallazgos útiles, pero dos afirmaciones de frontend ya no representan el estado visible actual:

- `app/page.tsx` sí monta `InitialEvaluationClassGate`;
- `app/page.tsx` sí monta `EvaluationPostClassGate`;
- `evaluation-final-model.css` retira de la experiencia la pestaña numérica genérica de Dar clase y la antigua tarjeta de alta manual de evaluación.

Por tanto, el **frontend visible ya utiliza el modelo guiado final**.

Lo que sí permanece como deuda física:

- `app/cya-app.tsx` conserva JSX/callbacks heredados de la pestaña numérica aunque la UI esté retirada;
- `app/student-detail.tsx` conserva el motor manual/reevaluación por sesiones detrás de una superficie actualmente retirada visualmente.

La eliminación física del JSX muerto de Dar clase se hará cuando P21 reestructure ese archivo. No se fuerza ahora una reescritura masiva del monolito.

## 3. Distinción crítica: wrapper heredado vs motor moderno por sesiones

La reconciliación de P17.1 demuestra una distinción que debe preservarse:

### Compatibilidad heredada de puntuación directa de clase

- `save_class_evaluation`
- `save_class_evaluation_v2`

`save_class_evaluation_v2` crea/reutiliza sesión y delega finalmente en el motor moderno. Es el wrapper que permite mantener el antiguo evaluador genérico de clase y es la superficie que v43 retira.

### Motor moderno por sesiones

- `start_student_evaluation`
- `save_evaluation_score`
- `complete_evaluation_session`

Este motor soporta evaluación manual/reevaluación por sesiones y **no se revoca en v43**. El producto no ha decidido eliminar esa capacidad y P17 no debe hacerlo por inferencia.

### Flujo guiado final de clase

- `start_initial_evaluation`
- `review_evaluation_question`
- `complete_initial_evaluation`
- `prepare_post_class_evaluation`
- `prepare_post_class_evaluations`
- `complete_post_class_evaluation`

Estas RPC se mantienen como superficie guiada para la clase.

## 4. Estado real de Supabase producción antes de v43

### Activo correctamente

- motor moderno por sesiones;
- evaluación inicial guiada;
- revisión postclase guiada;
- revisión dual Bachata/Bachazouk presente en el esquema real.

### Deuda todavía activa

- `save_class_evaluation` y `save_class_evaluation_v2` siguen disponibles;
- `trg_complete_class_evaluation_sessions` sigue presente;
- `prepare_post_class_evaluation` todavía puede fabricar una sesión `initial` postclase si no existe una previa;
- la aplicación física aún conserva código heredado oculto de la antigua pestaña numérica.

## 5. Esquema real frente al ledger de migraciones

La revisión dual Bachata/Bachazouk está físicamente presente en producción aunque `v41b` no aparece reconciliada de forma fiable en el ledger de migraciones.

Regla añadida al Plan Maestro: en cambios sensibles se contrasta siempre:

1. ledger;
2. funciones/triggers/policies reales;
3. código de `main`;
4. datos existentes.

## 6. Datos reales preservados

Antes del cutover:

- `evaluation_sessions`: 6;
- completadas: 5;
- borradores: 1;
- `student_evaluations`: 48.

El borrador corresponde a la clase 23, Bachata · Leader · Avanzado. La clase está administrativamente terminada y todavía no cerrada pedagógicamente.

**Regla P17:** v43 no borra, no completa y no altera esa sesión. Debe resolverse explícitamente mediante el flujo pedagógico.

## 7. v43 corregida — resultado diseñado

`supabase/v43-evaluation-final-cutover.sql`:

1. comprueba que existen las RPC que debe preservar/utilizar;
2. revoca solo `save_class_evaluation` y `save_class_evaluation_v2` de `public`, `anon` y `authenticated`;
3. conserva y concede explícitamente el motor moderno por sesiones;
4. elimina `trg_complete_class_evaluation_sessions`;
5. impide crear una evaluación inicial postclase como fallback;
6. preserva cualquier borrador existente;
7. instala `trg_require_final_evaluation` antes del cierre pedagógico;
8. exige evaluación/revisión completada por participante;
9. mantiene la revisión dual Bachata/Bachazouk cuando ambos contextos existen;
10. mantiene las RPC guiadas finales para `authenticated`.

Esta versión es deliberadamente más conservadora que el antiguo `v41c`, porque no elimina evaluación manual/reevaluación sin una decisión funcional expresa.

## 8. Dry-run transaccional contra producción

El 11/08/2026 se ejecutó el cuerpo de v43 dentro de:

`BEGIN → DDL/funciones/grants/verificaciones → ROLLBACK`.

Resultado:

- precondiciones de funciones: correctas;
- revocaciones: válidas;
- reemplazo de `prepare_post_class_evaluation`: válido;
- reemplazo del guard final: válido;
- trigger final: válido dentro de la transacción;
- verificaciones internas: correctas;
- `ROLLBACK`: correcto;
- después del rollback siguen 6 sesiones y 48 evaluaciones;
- el trigger legado y la RPC heredada siguen presentes en producción, demostrando que **el dry-run no dejó cambios persistentes**.

## 9. Validación de repositorio

PR #8 incorpora:

- `tests/p17-evaluation-cutover.test.mjs`;
- `.github/workflows/validate-p17-evaluation-cutover.yml`;
- `supabase/v43-evaluation-final-cutover.sql`;
- Plan Maestro v3.1.

La regresión comprueba:

- montaje de ambos gates finales;
- retirada visual del evaluador genérico;
- revocación exclusiva de wrappers heredados;
- conservación del motor moderno por sesiones;
- ausencia de fallback inicial postclase;
- ausencia de borrado/autocompletado;
- guard de cierre pedagógico;
- revisión dual;
- disponibilidad de RPC guiadas.

## 10. Gate que impide aplicar v43 permanentemente

La documentación del repositorio indica despliegue automático desde `main`, pero en esta sesión no existe una herramienta Hostinger Node/hosting que demuestre el commit exacto servido por el runtime público.

Por rigor, **v43 no se aplica permanentemente a producción por inferencia**.

Secuencia segura:

1. CI de la revisión corregida verde;
2. fusionar PR #8 a `main`;
3. demostrar runtime Hostinger compatible;
4. aplicar v43 como migración incremental en Supabase;
5. smoke test de permisos, trigger y flujos;
6. resolver explícitamente la sesión borrador de clase 23 desde la aplicación cuando corresponda;
7. cerrar PR #1 como supersedida cuando P17 quede absorbido.

## 11. Qué no reabre P17

P17 no redefine desde cero P12–P15. Mantiene:

- escala discreta 0/25/50/75/100;
- evaluación inicial guiada;
- motor de sesiones para evaluación manual/reevaluación;
- revisión postclase;
- histórico;
- radar;
- resumen de progreso.

Los cambios de UX general de Dar clase y la eliminación física del JSX muerto se integran en P21, sin reactivar los wrappers `save_class_evaluation(_v2)`.