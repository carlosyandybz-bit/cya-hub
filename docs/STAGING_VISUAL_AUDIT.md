# CYA Hub — Staging Visual Audit

> STAGING_ONLY. Documento operativo del laboratorio visual. No forma parte del producto final.

## Objetivo

Convertir Night Motion en un sistema visual canónico y reducible, evitando nuevas capas de parches CSS. La aplicación sigue siendo una sola: el laboratorio inspecciona y valida el mismo Design System que consume CYA Hub.

## Fuente de verdad visual

1. `app/cya-game-ux-system.css` — foundations, tokens, superficies e interacción global.
2. CSS de feature — solo layout o necesidades propias de cada módulo.
3. CSS canónico de patrones estratégicos — por ejemplo `app/canonical-central-control-v49.css`.
4. `app/staging-lab/**` — demostración, comparación y QA; nunca producto.

Una nueva capa visual no se considera final si solo sobreescribe una versión anterior. Debe existir un plan de retirada de la regla sustituida.

## Auditoría inicial

| Área | Estado | Deuda observada | Acción |
|---|---|---|---|
| Foundations / tokens | EN PROGRESO | Base Night Motion sólida, pero convive con aliases y valores históricos | Mantener tokens como fuente canónica y migrar hardcodes gradualmente |
| Navegación inferior | EN PROGRESO | Varias generaciones `v38`, `v43`, `v46`, `v48`, `v49`; especificidad alta y `!important` | Consolidar geometría central y después simplificar barra base |
| Dar clase + Más | CANÓNICO v49 | El comportamiento era simple pero la presentación dependía de múltiples overrides | Mantener un único patrón, protegido por Playwright geométrico |
| Portal alumno / Mi formación | EN PROGRESO | Selectores históricos por posición DOM compiten con el patrón compartido | Neutralizar selectores legacy y compartir familia con Profesor |
| Cards | PENDIENTE | Exceso de superficies rectangulares equivalentes reduce jerarquía | Definir 3–4 familias por función, no por pantalla |
| Formularios | PENDIENTE | Densidad y estilos varían entre módulos; formularios largos consumen viewport | Normalizar field, estados, agrupación y comportamiento con teclado móvil |
| Inicio | PENDIENTE | Muchas superficies compiten; jerarquía de próxima acción puede diluirse | Diseñar composición editorial-operativa con una acción dominante |
| Alumnado | PENDIENTE | Master/detail y perfiles acumulan capas responsive específicas | Consolidar patrones de fila, sección y detalle |
| Enseñanza | PENDIENTE | Biblioteca y árbol necesitan lenguaje táctil propio sin perder densidad | Definir navegación, nodos, relaciones y estados pedagógicos |
| Marketing | PENDIENTE | Necesita identidad del módulo sin convertirse en tema independiente | Usar color de dominio como señal, no como decoración extensiva |
| Administración | PENDIENTE | Alta densidad y múltiples patrones de navegación/formulario | Priorizar claridad, tablas/listas compactas y controles consistentes |
| Login / registro | PENDIENTE | Debe alinearse con Night Motion sin aparentar dashboard | Auditar composición, mensajes, focus, teclado y registro abierto |
| Motion | EN PROGRESO | Tokens existen; algunas transiciones legacy usan duraciones aisladas | Migrar a fast/base/slow y respetar reduced motion |
| Accesibilidad | EN PROGRESO | Focus y touch target globales existen; falta revisión completa de contraste/semántica | Mantener gates y añadir auditoría por superficie |
| Regresión visual | EN PROGRESO | Suite Playwright amplia y screenshots existentes | Crear snapshots de patrones canónicos y no actualizar sin revisión |

## Hallazgos estructurales prioritarios

### P0 — Cascada visual fragmentada

`app/layout.tsx` carga numerosas capas históricas. El problema no es únicamente tamaño: varias reglas posteriores dependen de especificidad, posición DOM y `!important`. Esto aumenta el riesgo de que una mejora local desplace otra superficie.

**Regla de migración:** cada patrón estratégico que se estabilice debe reducir, no aumentar, el número de capas que lo controlan.

### P0 — Control central

`Dar clase + Más` y `Mi formación + Más` deben ser una misma familia visual, apilada verticalmente y centrada. El área táctil permanece >=44 px aunque la silueta visible sea compacta. `qa/tests/central-control-v49.spec.ts` bloquea desplazamiento lateral, dimensiones inválidas y pérdida del apilado.

### P1 — Jerarquía de superficies

Night Motion usa correctamente superficies oscuras, pero demasiadas áreas terminan expresándose como cards equivalentes. El Design System debe separar al menos:

- `surface/base`: continuidad de pantalla;
- `surface/group`: agrupación funcional sin protagonismo;
- `surface/raised`: interacción o contenido temporal;
- `feature/action`: elemento de prioridad alta.

No todo bloque necesita borde, radio y sombra simultáneamente.

### P1 — Densidad mobile-first

El iPhone es el viewport de referencia. Se debe proteger:

- safe area inferior;
- viewport dinámico;
- teclado abierto;
- touch targets;
- contenido útil por encima de la navegación;
- scroll sin elementos fijados que tapen acciones;
- textos largos y datos reales.

### P1 — Hardcodes y aliases

Los aliases históricos de `cya-game-ux-system.css` son una herramienta de migración, no una API permanente. El código nuevo debe usar tokens `--cya-*`.

## Criterio para declarar un patrón CANÓNICO

Un patrón solo puede etiquetarse como canónico cuando:

1. usa tokens del Design System;
2. contempla estado normal, focus, active/pressed y disabled cuando aplique;
3. respeta reduced motion;
4. tiene touch targets móviles correctos;
5. no produce overflow en la matriz de viewports;
6. existe QA automatizado representativo;
7. se ha identificado qué CSS previo sustituye;
8. la capa anterior puede retirarse o queda documentada como dependencia temporal.

## Matriz de viewports del laboratorio

- Compacto: 320 px.
- iPhone estándar: 390 px.
- iPhone grande: 430 px.
- Tablet: 768 px.
- Desktop: 1280 px.

El orden de prioridad de defectos es 390 → 430 → 320 → 768 → 1280.

## Próxima secuencia

1. Cerrar `v49` y retirar reglas centrales redundantes de `v48`.
2. Consolidar shell de navegación inferior sin alterar funcionalidad.
3. Normalizar botones, inputs y estados interactivos en el laboratorio.
4. Definir familias de superficies/cards.
5. Aplicar por módulos: Inicio → Alumnado → Enseñanza → Marketing → Administración → Portal alumno.
6. QA visual y accesibilidad después de cada patrón, no al final del proyecto.
