# P17 — Reconciliación final de Evaluaciones

**Fecha:** 11 de agosto de 2026  
**Baseline auditado:** `485af0343098330019dd81a13a39aad6335b6481`  
**Supabase:** `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)  
**PR histórica contrastada:** #1 `agent/point12r-evaluations`

## Estado ejecutivo

**P17 NO está cerrado todavía.**

La arquitectura de base de datos actual ya contiene la evolución v34–v41 y ha absorbido/superado gran parte del enfoque Point12R, pero el frontend mantiene superficies heredadas que impiden aplicar el cutover final `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` sin romper la aplicación.

La PR #1 sigue abierta, `draft` y no mergeable. Su código usa APIs y estructuras anteriores (`start_evaluation_v3`, `evaluation_questions`, etc.) y no debe fusionarse como bloque sobre el `main` actual.

## Contrato P17 a validar

P17 debe cerrar, de forma conjunta:

- niveles `INICIO / INTERMEDIO / AVANZADO`;
- escala rápida `0 / 25 / 50 / 75 / 100`;
- cinco opciones táctiles por parámetro;
- persistencia estable;
- parámetros configurables;
- radar de profesor;
- radar/progreso alumno;
- historial/evolución;
- reevaluación;
- evaluación inicial guiada;
- revisión postclase;
- reglas Bachata/Bachazouk;
- visibilidad segura al alumno;
- retirada definitiva de superficies heredadas cuando el frontend ya no dependa de ellas.

## Evidencia de producción

### Catálogo

Producción contiene:

- niveles `Inicio`, `Intermedio`, `Avanzado`;
- escala activa de cinco términos con valores `0`, `25`, `50`, `75`, `100`;
- aptitudes activas configuradas mediante `catalog_terms`;
- estilos y roles activos.

### Datos actuales

Corte auditado:

- `evaluation_sessions`: 6;
- sesiones completadas: 5;
- `student_evaluations`: 48;
- `student_aptitude_progress`: 8;
- `evaluation_progress_awards`: 0;
- `evaluation_milestones` activos: 0;
- `evaluation_descriptors` activos: 0.

Esto significa que el motor base funciona con escala/aptitudes, pero la capa avanzada de hitos/descriptores todavía no está poblada.

## Motor de escritura actual

Producción expone dos familias de RPC:

### Familia moderna

- `start_student_evaluation`;
- `save_evaluation_score`;
- `complete_evaluation_session`;
- `start_initial_evaluation`;
- `review_evaluation_question`;
- `complete_initial_evaluation`;
- `prepare_post_class_evaluation`;
- `prepare_post_class_evaluations`;
- `complete_post_class_evaluation`.

### Compatibilidad heredada

- `save_class_evaluation`;
- `save_class_evaluation_v2`.

La auditoría confirma que `save_class_evaluation_v2` **no constituye un segundo motor independiente**: crea/reutiliza `evaluation_sessions` y delega la puntuación en `save_evaluation_score`.

El problema es de contrato y superficie: sigue permitiendo escribir evaluación formal desde el flujo vivo de clase.

## Frontend actual

### Ficha del alumno

`app/student-detail.tsx` ya usa el motor por sesiones:

- inicia con `start_student_evaluation`;
- distingue inicial/seguimiento/reevaluación;
- usa escala 0/25/50/75/100;
- renderiza `EvaluationRadar`;
- conserva histórico.

Esta pantalla depende todavía de RPC que `v41c` revocaría.

### Dar clase

`app/cya-app.tsx` mantiene una pestaña **Evaluar** con:

- selector de nivel;
- radar;
- guardado inmediato;
- llamadas a `save_class_evaluation_v2`.

La evaluación genérica puede ejecutarse mientras la clase sigue activa. Este flujo debe reconciliarse con el modelo final:

1. evaluación inicial guiada durante clase **solo cuando corresponda**;
2. revisiones de seguimiento/reevaluación después del cierre administrativo y antes del cierre pedagógico;
3. ausencia de un evaluador formal genérico abierto durante cualquier clase.

## Revisión postclase v40

La base de datos ya soporta evaluación postclase controlada por profesor:

- `prepare_post_class_evaluation` / `prepare_post_class_evaluations`;
- `review_evaluation_question`;
- `complete_post_class_evaluation`.

Reglas relevantes:

- exige clase `finished`;
- exige `administrative_finished_at`;
- bloquea si `pedagogy_closed_at` ya existe;
- exige que el alumno pertenezca a la clase;
- crea/reutiliza una sesión `followup`;
- el progreso se actualiza mediante la revisión del profesor.

El frontend actual no consume todavía estas RPC.

## Evaluación inicial guiada v41a

La base ya soporta `start_initial_evaluation`, que:

- requiere clase activa;
- requiere participación del alumno;
- exige estilo/rol válidos;
- detecta si ya existe evaluación previa en ese contexto;
- crea/reutiliza sesión `initial`;
- usa progreso + escala configurada.

El frontend actual no consume todavía esta RPC.

## Visibilidad del alumno

v36 aplica una regla segura sin necesidad de columna `released_to_student_at`:

- sesión completada;
- si tiene clase, además exige `pedagogy_closed_at`;
- histórico legado con clase también exige cierre pedagógico;
- staff conserva acceso a borradores.

La proyección `student_portal_snapshot_for` utiliza esta visibilidad filtrada.

**Estado:** la intención de no exponer borradores ya está implementada por estado+cierre pedagógico.

## SQL preparados/no aplicados

### v35c

`v35c-enforce-post-class-evaluation.sql` está preparado para endurecer la evaluación formal postclase, pero no está registrado en producción.

### v41c

`v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` está marcado explícitamente como **PREPARADA, NO APLICAR**.

Su objetivo final es retirar superficies antiguas y dejar como públicas las APIs guiadas finales.

**No puede aplicarse todavía** porque el frontend actual depende de:

- `start_student_evaluation`;
- `save_evaluation_score`;
- `complete_evaluation_session`;
- `save_class_evaluation_v2`.

Aplicarlo ahora provocaría regresiones funcionales.

## Reconciliación de PR #1 Point12R

### Conceptos ya absorbidos o superados

- autoridad de escala/aptitudes en base de datos;
- semántica 0–100;
- radar reusable;
- sesiones persistentes;
- histórico;
- seguridad RLS;
- evolución por contexto;
- modelo inicial/seguimiento/reevaluación;
- capas posteriores v40/v41.

### Código que NO debe recuperarse directamente

La rama Point12R utiliza superficies antiguas (`start_evaluation_v3`, `evaluation_questions`, modelos previos de registry/engine) y parte de una base anterior a v40/v41. Fusionarla íntegramente reintroduciría arquitectura obsoleta.

### Elementos conceptuales que aún deben comprobarse en P17.2

- textos/semántica visual del porcentaje;
- editor administrativo final de parámetros;
- diferenciación visual profesor/alumno;
- cobertura final de Bachata/Bachazouk;
- UX táctil de cinco opciones;
- ausencia de estados/fallbacks engañosos.

## P17.2 — cambio requerido antes del cutover

El siguiente cambio debe:

1. sustituir la pestaña genérica `Evaluar` de Dar clase por **Evaluación inicial guiada** cuando el contexto la necesite;
2. integrar la revisión postclase entre cierre administrativo y pedagógico;
3. migrar la ficha del alumno fuera de las RPC que v41c pretende revocar, o definir una API final compatible para evaluación manual fuera de clase si sigue siendo requisito funcional;
4. mantener radar/histórico/evolución;
5. preservar 0/25/50/75/100;
6. añadir tests que impidan reintroducir `save_class_evaluation_v2` en el flujo vivo;
7. validar las reglas Bachata/Bachazouk;
8. ejecutar build + regresión;
9. solo después evaluar la aplicación de `v41c` en dry-run y producción.

## P17.3 — condición para aplicar v41c

`v41c` solo podrá aplicarse cuando una búsqueda del frontend y tests demuestren **cero dependencias** de las RPC que revoca.

Después:

1. dry-run transaccional;
2. tests de profesor/alumno/admin;
3. aplicar incrementalmente;
4. ejecutar Security/Performance Advisors;
5. verificar portal alumno;
6. actualizar Plan Maestro, Secuencia y Pendientes.

## Estado final de esta auditoría

- **P17.1 Reconciliación/auditoría:** CERRADA.
- **P17.2 Frontend final de Evaluaciones:** PENDIENTE.
- **P17.3 Cutover v41c:** BLOQUEADO por P17.2.
- **PR #1:** referencia histórica; NO fusionar como bloque.
