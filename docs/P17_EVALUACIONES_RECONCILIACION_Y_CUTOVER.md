# P17 — Evaluaciones: reconciliación y corte final

Fecha: 2026-08-11
Estado: **EN CURSO · preparación técnica completa; corte de producción bloqueado por evidencia de runtime Hostinger**

## 1. Qué se ha reconciliado

P17 compara cuatro fuentes que habían divergido:

1. `main` actual.
2. PR #1 / `feat/point12r-evaluation-engine`.
3. Supabase producción real.
4. SQL preparados `v35c` y `v41c`.

La PR #1 no es fusionable como bloque: está históricamente divergida respecto de `main` y su propio objetivo era validar un rediseño anterior. Las capacidades válidas que perseguía ya evolucionaron en `main` mediante el modelo guiado actual.

## 2. Superficie frontend real en main

El modelo visible actual ya es el final:

- `InitialEvaluationClassGate` para la primera evaluación guiada durante una clase activa.
- `EvaluationPostClassGate` para la revisión posterior a la parte administrativa.
- `evaluation-final-model.css` retira de la experiencia la antigua pestaña numérica `Evaluar` y la antigua tarjeta de alta manual.

El JSX heredado y algunas llamadas numéricas antiguas siguen físicamente en archivos históricos, pero son superficie muerta/oculta. Su eliminación física se pospone a P21, cuando se modifica de forma amplia Dar clase; no se justifica reescribir ahora el monolito solo para borrar código inaccesible.

## 3. Estado real de Supabase producción antes de v43

### Activo correctamente

- `start_initial_evaluation`
- `review_evaluation_question`
- `complete_initial_evaluation`
- `prepare_post_class_evaluation`
- `prepare_post_class_evaluations`
- `complete_post_class_evaluation`
- revisión dual Bachata/Bachazouk presente en el esquema real.

### Deuda todavía activa

Producción todavía mantiene permisos de `authenticated` sobre RPC heredadas:

- `save_class_evaluation`
- `save_class_evaluation_v2`
- `save_evaluation_score`
- `start_student_evaluation`
- `complete_evaluation_session`

También sigue presente `trg_complete_class_evaluation_sessions`, que puede autocompletar sesiones históricas al cerrar pedagógicamente una clase.

El singular `prepare_post_class_evaluation` todavía puede crear una sesión `initial` postclase cuando no existe evaluación previa. P17 elimina ese fallback.

## 4. Datos reales preservados

Antes del cutover existen:

- 6 sesiones de evaluación.
- 5 completadas.
- 1 borrador.
- 48 filas de evaluación.

La sesión borrador está ligada a la clase 23, Bachata · Leader · Avanzado. La clase está administrativamente terminada pero no cerrada pedagógicamente.

**Regla P17:** v43 no borra, no completa y no altera esa sesión. Debe resolverse mediante el flujo pedagógico explícito.

## 5. v43 — resultado diseñado

`supabase/v43-evaluation-final-cutover.sql`:

1. comprueba que existen todas las RPC finales antes de cambiar nada;
2. revoca de `public`, `anon` y `authenticated` las superficies numéricas heredadas;
3. elimina el trigger de autocompletado antiguo;
4. impide crear una evaluación inicial después de clase;
5. preserva cualquier borrador existente;
6. instala `trg_require_final_evaluation` antes del cierre pedagógico;
7. exige que cada participante tenga su evaluación/revisión completada;
8. exige ambos estilos cuando el alumno ya tiene Bachata + Bachazouk para el mismo rol;
9. mantiene únicamente las RPC finales como API autenticada del modelo actual.

## 6. Validación preparada

Se añade:

- `tests/p17-evaluation-cutover.test.mjs`
- `.github/workflows/validate-p17-evaluation-cutover.yml`

La regresión comprueba:

- montaje de los dos gates finales;
- ocultación de la superficie numérica antigua;
- revocación de las RPC heredadas;
- ausencia de fallback de evaluación inicial postclase;
- ausencia de borrado/autocompletado de sesiones;
- guard de cierre pedagógico;
- revisión dual Bachata/Bachazouk;
- disponibilidad de las RPC finales.

## 7. Gate que impide aplicar v43 todavía

La documentación del repositorio dice que Hostinger despliega automáticamente los pushes de `main`, pero todavía no disponemos en esta sesión de evidencia independiente del commit exacto que está sirviendo el runtime público.

Como v43 es deliberadamente incompatible con un frontend que todavía use RPC numéricas, **no debe aplicarse a producción por inferencia**.

Secuencia segura:

1. PR P17 pasa CI.
2. Fusionar P17 a `main`.
3. demostrar que Hostinger sirve un build compatible con los gates finales.
4. aplicar v43 en Supabase producción.
5. ejecutar smoke SQL autenticado y comprobar permisos/trigger.
6. resolver o completar explícitamente la sesión borrador de la clase 23 mediante la aplicación, no por SQL de limpieza.
7. cerrar PR #1 como supersedida cuando P17 quede absorbido.

## 8. Qué no reabre P17

P17 no redefine desde cero los puntos funcionales 12–15 ya implementados. Mantiene:

- escala discreta interna;
- evaluación inicial guiada;
- revisión postclase;
- histórico;
- radar;
- resumen de progreso;
- configuración administrativa de hitos/descriptores.

Los cambios futuros de UX sobre cómo se evalúa dentro del flujo general de una clase se harán en P21 sin volver a activar RPC numéricas antiguas.