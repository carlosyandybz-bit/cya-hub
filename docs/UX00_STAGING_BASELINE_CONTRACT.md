# UX-00 — Baseline y contrato de auditoría UX/UI · STAGING

## Propósito

UX-00 congela el estado observable de CYA Hub en `staging` antes de introducir nuevas modificaciones visuales o de interacción. Esta actualización no cambia la experiencia del usuario; crea una referencia reproducible para medir cada mejora posterior.

## Entorno autorizado

- Rama objetivo: `staging`.
- Supabase: proyecto dedicado CYA Hub Staging.
- Producción: fuera de alcance.
- `main`: fuera de alcance.

## Baseline de apertura

Commit funcional auditado inicialmente: `f906851d4b5159834443b7e8343b8755984e70ab`.
Commit documental inmediatamente posterior: `43a2d4394665642f6a1558515f98c72e3db240ce`.
Run de referencia: GitHub Actions `31950198258`.

Resultado observado:

- 101 pruebas superadas.
- 6 fallos.
- 5 omitidas.
- build correcto.
- lint: 0 errores, 15 warnings.
- auditoría general: sin overflow horizontal crítico en Profesor/Alumno/Administración.
- regresión específica: 1 target táctil `<44×44` en navegación del Alumno a 390 y 430 px.
- regresión funcional/contrato: `functional-class-flow` no encuentra el CTA canónico de preparación del resumen en móvil y escritorio.

## Los seis fallos congelados

1. AUD-020 · Alumno · 390 px · target táctil inferior a 44 px · proyecto iphone-large-chromium.
2. AUD-020 · Alumno · 430 px · target táctil inferior a 44 px · proyecto iphone-large-chromium.
3. Functional class flow · cierre de clase · CTA de resumen no localizado · proyecto iphone-large-chromium.
4. AUD-020 · Alumno · 390 px · target táctil inferior a 44 px · proyecto desktop-chromium.
5. AUD-020 · Alumno · 430 px · target táctil inferior a 44 px · proyecto desktop-chromium.
6. Functional class flow · cierre de clase · CTA de resumen no localizado · proyecto desktop-chromium.

Estos fallos forman parte del baseline y no se deben ocultar, relajar ni convertir en `skip` para obtener un verde artificial.

## Auditor canónico de UX

El helper `qa/tests/ux-audit-utils.ts` centraliza las mediciones que deben reutilizar las pruebas UX posteriores:

- targets táctiles efectivos;
- ancho/alto del control;
- overflow horizontal documental;
- clipping horizontal de interactivos;
- viewport real;
- separación/overlap entre dos piezas seleccionadas.

AUD-020 deja de usar una implementación paralela para targets táctiles y consume este auditor compartido.

## Evidencia que genera UX-00

`qa/tests/ux-00-baseline.spec.ts` crea, para Profesor y Alumno:

- screenshot full-page;
- observación JSON adjunta al reporte Playwright;
- viewport;
- overflow horizontal;
- interactivos horizontalmente recortados;
- targets `<44×44` de navegación;
- bounding boxes del control principal/secundario cuando aplica;
- métrica de clearance marca/acciones cuando los selectores están presentes.

Matriz inicial:

- Profesor: 390×844, 430×844 y 1280×900.
- Alumno: 390×844 y 430×844.

UX-16 ampliará posteriormente esta matriz; UX-00 solo congela un núcleo estable y económico.

## Severidad

### P0 — bloqueante

Se clasifica P0 cuando el defecto impide completar una tarea crítica, puede causar pérdida/corrupción de trabajo, rompe una barrera de seguridad/privacidad o incumple una condición básica de operabilidad móvil que ya forma parte del contrato del producto.

Ejemplos del baseline:

- flujo de cierre de clase no verificable de extremo a extremo;
- control táctil crítico por debajo de 44×44 en navegación principal.

### P1 — alta

Se clasifica P1 cuando la tarea sigue siendo posible, pero existe una degradación clara de comprensión, accesibilidad, disponibilidad, jerarquía o eficiencia que afecta una superficie principal o se reproduce en viewports comunes.

Ejemplos:

- colisión visual de cabecera;
- barra fija que invade espacio útil;
- motion/reduced-motion sin verificación real;
- ausencia de recuperación ante red lenta, error o sesión expirada.

## Reglas de aceptación para las siguientes actualizaciones

Una mejora UX no puede marcarse `VALIDADA` únicamente porque compile. Debe aportar evidencia funcional y visual.

Para cerrar una actualización posterior se exige, según aplique:

1. build correcto;
2. test específico de la mejora;
3. tests afectados existentes sin regresiones nuevas;
4. screenshot antes/después o baseline/diff;
5. 0 overflow/clipping nuevo;
6. targets táctiles >=44×44 en controles móviles interactivos;
7. nombre accesible estable en CTAs críticos;
8. registro del commit de staging y resultado de Actions en el documento vivo.

## Invariantes

- No corregir una prueba reduciendo su exigencia salvo que el contrato de producto haya cambiado explícitamente.
- No sustituir un fallo por `skip`.
- No aceptar un centro matemático como prueba suficiente de composición visual: cuando corresponda se medirá también overlap/clearance.
- No cambiar producción como parte de UX-00.
- No introducir modificaciones visuales en esta actualización.

## Estado

Estado inicial: `EN EJECUCIÓN` hasta que la rama UX-00 pase su validación y se integre en `staging`.
