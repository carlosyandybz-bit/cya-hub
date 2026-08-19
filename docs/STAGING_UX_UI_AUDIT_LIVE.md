# CYA HUB — AUDITORÍA UX/UI VIVA · STAGING

Estado del documento: **VIVO**  
Entorno auditado: **staging + Supabase Staging**  
Rama auditada: **staging**  
Commit de referencia inicial: `f906851d4b5159834443b7e8343b8755984e70ab`  
Fecha de apertura: **16 de agosto de 2026**  
Ámbito: experiencia de Profesor y Alumno; visualización, navegación, organización, motion, accesibilidad, rendimiento percibido, disponibilidad y resiliencia.  
Regla de seguridad: este programa de mejoras pertenece exclusivamente al entorno de desarrollo. No autoriza cambios en `main` ni en Supabase de producción.

## 1. Objetivo

Esta auditoría convierte la revisión visual de CYA Hub en un programa de mejora continuo y verificable. No se limita a localizar defectos cosméticos: estudia qué ve el usuario, qué entiende, qué puede tocar, cuánto espacio útil conserva, cómo se orienta, cómo recibe feedback, cómo se recupera de errores y qué sensación de velocidad y calidad transmite la aplicación.

El criterio principal es que Profesor y Alumno puedan completar sus tareas con el mínimo esfuerzo cognitivo, sin perder el carácter Night Motion de CYA Hub.

## 2. Metodología y evidencia

La auditoría parte de:
- ejecución real de GitHub Actions sobre `staging`;
- suite Playwright autenticada para Profesor, Alumno y Administrador;
- capturas y vídeos generados por la ejecución;
- revisión de layouts en 390 px, 430 px y escritorio;
- auditorías automatizadas de overflow, targets táctiles, errores de consola, requests fallidas y etiquetas accesibles;
- revisión del flujo funcional de clase;
- revisión del sistema visual Night Motion y sus contratos;
- lint y build de Next.js;
- inspección cualitativa de jerarquía, densidad, composición y continuidad entre pantallas.

Resultado de la ejecución de referencia:
- **101 pruebas superadas**;
- **6 fallos**;
- **5 pruebas omitidas**;
- build correcto;
- **15 warnings de lint, 0 errores**;
- las superficies principales de Profesor y Administración no presentan overflow horizontal ni errores de consola en la auditoría general;
- existe una regresión reproducible de target táctil en Alumno;
- existe un fallo reproducible del contrato E2E de cierre de clase.

Importante: una prueba verde no implica por sí sola una composición visual correcta. En esta auditoría se distingue entre **correcto geométricamente**, **correcto funcionalmente** y **correcto visualmente**.

## 3. Resumen ejecutivo

### Fortalezas actuales
- arquitectura móvil clara con accesos principales persistentes;
- identidad Night Motion reconocible y coherente;
- base oscura estable;
- ausencia general de overflow horizontal en las superficies auditadas;
- targets táctiles del Profesor ya se mantienen en 44 px o más en el gate general;
- cabecera y botón principal del Profesor ya están centrados matemáticamente;
- buen nivel de cobertura automatizada;
- formularios, agenda, alumnado y enseñanza disponen de validaciones responsive específicas;
- el sistema ya contempla reduced motion y safe areas en su especificación.

### Problemas prioritarios
- la cabecera del Profesor puede estar matemáticamente centrada y, aun así, colisionar visualmente con acciones de la derecha;
- la composición central de **Dar clase** ha acumulado parches y se ha separado de la especificación visual canónica;
- el portal del Alumno tiene un control de navegación inferior por debajo de 44 px en 390 y 430 px;
- la navegación fija inferior resta demasiado espacio útil y puede cubrir visualmente contenido en formularios largos;
- el cierre de clase no completa el E2E porque el contrato de accesibilidad/nombre del CTA ha divergido;
- la jerarquía de algunas pantallas es excesivamente densa: demasiados bloques, brillos, bordes y texto compiten por atención;
- hay inconsistencias entre Profesor y Alumno en cabeceras, piezas centrales y lenguaje de navegación;
- la suite comprueba bien overflow y tamaños, pero todavía comprueba poco colisiones, oclusiones, altura útil, motion real, estados offline y rendimiento percibido.

### Diagnóstico global
CYA Hub ya tiene una base visual potente y funcional, pero necesita una fase de **refinamiento de producto**: menos parches CSS, más componentes canónicos, mejor jerarquía, pruebas visuales más inteligentes y un sistema de interacción que proteja el espacio útil en móvil.

## 4. Hallazgos detallados

### 4.1. Cabecera, marca y controles superiores

**UX-001 · P1 · Colisión visual del wordmark del Profesor con acciones derechas**  
Evidencia: en la captura de cierre de clase, `Carlos & Andy` queda visualmente invadido por la zona de notificación/cuenta. La medición geométrica devuelve el centro de marca en `dx=0`, por lo que el problema no es el centro matemático sino la falta de espacio de seguridad.  
Impacto: la cabecera parece rota incluso cuando el test de centrado pasa.  
Mejora: reservar rails laterales reales; medir bounding boxes y exigir un gap mínimo de 10–12 px; permitir reducción controlada del wordmark en anchos estrechos sin desplazar su eje.  
Aceptación: 0 colisiones a 320/360/375/390/393/402/414/430 px.

**UX-002 · P1 · El test actual de cabecera valida centro, no legibilidad**  
Mejora: assertions de no-overlap, clipping, visibilidad completa, máximo ancho y distancia a bordes.

**UX-003 · P2 · Densidad de acciones en cabecera**  
En algunas vistas conviven atrás, logo/marca, notificaciones y cuenta.  
Mejora: tres variantes canónicas: cabecera raíz, detalle y flujo inmersivo.

**UX-004 · P2 · Badge de notificaciones visualmente dominante**  
Mejora: `9+` o `99+`, badge más pequeño y sin cambiar la geometría del botón.

**UX-005 · P2 · Nomenclatura visual de marca no completamente unificada**  
Alumno muestra `CYA Hub` y algunos contextos Profesor muestran `Carlos & Andy`.  
Mejora: contrato explícito de uso de producto vs. firma artística.

### 4.2. Navegación inferior del Profesor

**UX-006 · P1 · La pieza `Más` ha divergido de la especificación canónica**  
Night Motion pide huella aproximada 60×48 px, texto visible `Más` + chevron e integración con el segundo lóbulo. La implementación reciente se ha reducido a un control compacto.  
Mejora: reconstruir la pieza como un único componente React/CSS y retirar capas correctivas sucesivas.

**UX-007 · P1 · Demasiada altura ocupada por la composición central**  
Mejora: presupuesto vertical máximo medido desde el borde superior de la barra hasta safe area.

**UX-008 · P1 · La barra compite con acciones críticas durante una clase**  
Mejora: modo inmersivo que reduzca contraste u oculte navegación secundaria en fases críticas.

**UX-009 · P2 · Arquitectura de accesos secundarios poco visible**  
Mejora: sheet contextual para Programar clase, Clases y Agenda.

**UX-010 · P2 · Riesgo de acumulación de overrides CSS**  
Mejora: consolidar estilos en un único componente y retirar reglas obsoletas tras QA.

### 4.3. Navegación inferior del Alumno

**UX-011 · P0 · Existe 1 target táctil inferior a 44 px**  
Confirmado en 390 y 430 px por AUD-020, repetido en ambos proyectos Playwright. El stack contiene `Mi formación` y el disclosure `Abrir apartados de Mi formación`; el control auxiliar es el principal candidato y debe medirse explícitamente antes de tocarlo.  
Aceptación: 0 controles visibles <44×44 en todos los anchos móviles.

**UX-012 · P1 · La composición central de Mi formación consume demasiada altura**  
Mejora: mantener identidad visual pero compactar el dibujo; el hit area puede ser mayor que la pieza visible.

**UX-013 · P1 · La barra inferior reduce el contenido visible del formulario**  
La captura muestra la navegación fija superpuesta visualmente a la región inferior del formulario.  
Mejora: padding-bottom basado en altura real de barra + safe area + margen.

**UX-014 · P2 · Doble affordance en Mi formación**  
Mejora: composición semántica única con acción principal + disclosure claramente relacionados.

**UX-015 · P2 · Peso excesivo del estado central**  
Mejora: equilibrar Inicio/Progreso/Descubre/Misiones sin perder centralidad.

### 4.4. Inicio del Alumno

**UX-016 · P1 · Exceso de contenido vertical**  
Mejora: modelo `Ahora → Después → Explorar`: un bloque dominante, dos secundarios, resto bajo accesos.

**UX-017 · P1 · Titulares grandes penalizan el above-the-fold**  
Mejora: tipografía responsive también por altura (`max-height`), no solo ancho.

**UX-018 · P1 · Preparación de clase ocupa demasiado espacio al desplegarse**  
Mejora: acordeones, progreso de completitud, autosave y resumen contraído.

**UX-019 · P2 · Texto explicativo demasiado largo antes de acciones**  
Mejora: una frase principal + detalles bajo `Más información`.

**UX-020 · P2 · `Prepararla` debe dominar cuando existe clase próxima**  
Mejora: priorización contextual por tiempo restante y completitud.

**UX-021 · P2 · Personalización insuficiente**  
Mejora: adaptar Inicio a clase próxima, correcciones activas, Academia Online o inactividad.

### 4.5. Inicio y operación del Profesor

**UX-022 · P1 · Reforzar lectura `qué hago ahora`**  
Mejora: una sola acción `Ahora`, métricas/actividad secundaria debajo.

**UX-023 · P1 · Navegación y contenido compiten en trabajo operativo**  
Mejora: estados de foco para Dar clase, evaluación y cierre.

**UX-024 · P2 · Acciones rápidas deben responder a frecuencia/contexto real**.

**UX-025 · P2 · Falta señal consistente de trabajo guardado**  
Mejora: `Guardando / Guardado / Error` discreto y accesible.

### 4.6. Dar clase y cierre

**UX-026 · P0 · El E2E no encuentra `Preparar resumen`**  
El botón visible es `Sí, preparar resumen`, mientras el contrato busca otra accessible name. Puede ser regresión de test o de naming, pero el gate está rojo.  
Aceptación: flujo funcional completo verde en móvil y escritorio.

**UX-027 · P1 · Exceso de texto administrativo en cierre**  
Mejora: título + estado + una frase + detalles desplegables.

**UX-028 · P1 · Demasiadas etapas/niveles visibles simultáneamente**  
Tabs + card + CTAs + nav global compiten.  
Mejora: stepper compacto y navegación atenuada.

**UX-029 · P1 · CTA secundario ocupa demasiada superficie**.

**UX-030 · P2 · Falta feedback de transición entre fases**  
Mejora: 160–220 ms + mensaje de estado.

**UX-031 · P2 · Recuperación ante cierre accidental**  
Mejora: persistir borrador de resumen y fase.

### 4.7. Enseñanza, Alumnado y contenido

**UX-032 · P2 · Densidad alta con muchas cards**  
Mejora: filas compactas para inventarios; cards solo para decisión/resumen.

**UX-033 · P2 · Filtros/tabs deben mantener contexto**  
Sticky local, contador, limpiar filtros, persistencia de sesión.

**UX-034 · P2 · Estados vacíos deben ofrecer siguiente acción**.

**UX-035 · P2 · Búsqueda global necesita feedback inmediato**  
Debounce, contador, resaltado y `sin resultados`.

**UX-036 · P2 · Perfiles extensos**  
Resumen superior + áreas colapsables + acciones recurrentes persistentes.

### 4.8. Jerarquía visual y Night Motion

**UX-037 · P1 · Exceso potencial de violeta brillante**  
Mejora: presupuesto de acento; un CTA primario y pocas superficies con glow por viewport.

**UX-038 · P1 · Contraste muted/soft debe medirse**  
Mejora: WCAG AA sobre colores computados y tamaños reales.

**UX-039 · P2 · Exceso de cajas/radios similares**  
Mejora: diferenciar card informativa, agrupador, acción y estado.

**UX-040 · P2 · Logo como firma, no decoración repetitiva**  
Mejora: gate del máximo de apariciones reconocibles por viewport.

**UX-041 · P2 · Escala de spacing inconsistente**  
Mejora: 4/8/12/16/24/32 y eliminar valores aislados.

**UX-042 · P2 · Longitud de línea en desktop**  
Mejora: 60–75 caracteres en texto explicativo.

### 4.9. Animaciones y microinteracciones

**UX-043 · P1 · QA insuficiente del motion real**  
Mejora: Playwright con `document.getAnimations()` y estilos computados.

**UX-044 · P1 · Reduced motion necesita test de comportamiento**  
Ejecutar contexto `reducedMotion: reduce` y exigir duraciones mínimas/no esenciales desactivadas.

**UX-045 · P2 · Transición mínima entre módulos**  
Opacity + translateY 4–8 px, 160–180 ms.

**UX-046 · P2 · Continuidad de menús/sheets**  
Chevron 120–160 ms; sheet 180–220 ms; overlay 160–180 ms.

**UX-047 · P2 · Feedback táctil**  
Pressed scale .975 + borde/sombra sin layout shift.

**UX-048 · P2 · Evitar animaciones permanentes**.

**UX-049 · P3 · Skeletons sin shimmer permanente**.

### 4.10. Loading, vacío, error y conectividad

**UX-050 · P1 · Falta auditoría sistemática de red lenta/offline**  
Playwright con rutas lentas, abortadas y 500.

**UX-051 · P1 · Formularios largos necesitan autosave**  
Alumno: preparación/feedback. Profesor: resumen/notas.

**UX-052 · P1 · Error boundary global**  
Mensaje humano, `Reintentar`, conservar navegación y registrar en staging.

**UX-053 · P1 · Sesión expirada**  
Refresh silencioso y recuperación de destino/borrador.

**UX-054 · P2 · Uploads de medios**  
Progreso, cancelación, retry y errores específicos.

**UX-055 · P2 · Estados vacíos accionables**.

### 4.11. Rendimiento percibido y técnico

**UX-056 · P1 · Cinco usos de `<img>` reciben warning de Next.js**  
Detectados en `account-menu`, `account-pages`, `drive-media`, `p36-icon-admin` y `teaching-media-editor`.  
Mejora: migrar a `next/image` donde proceda, dimensiones y lazy loading.

**UX-057 · P2 · Posibles rerenders evitables**  
Warnings de dependencias `useMemo` en historial de evaluaciones y resumen de progreso.

**UX-058 · P2 · `cya-app.tsx` concentra demasiada responsabilidad**  
Mejora: separación de módulos e imports dinámicos.

**UX-059 · P2 · Faltan presupuestos Core Web Vitals**  
Objetivos staging: LCP <=2.5 s, INP <=200 ms, CLS <=0.1.

**UX-060 · P3 · CI sin build cache de Next**  
Mejora: cache para reducir ciclo de feedback.

### 4.12. Accesibilidad

**UX-061 · P0 · Corregir target <44 del Alumno**.

**UX-062 · P1 · Zoom/text scaling 200%**.

**UX-063 · P1 · Focus order en navegación apilada y sheets**.

**UX-064 · P1 · `aria-live` para guardados, errores y asincronía**.

**UX-065 · P1 · Contraste real de disabled/muted/badges/bordes**.

**UX-066 · P2 · Icon-only con nombre accesible estable**.

**UX-067 · P2 · Estado activo con `aria-current` + señal no cromática**.

### 4.13. Responsive y disponibilidad de pantalla

**UX-068 · P1 · QA demasiado centrado en ancho**  
Añadir alturas 667/740/812/844/874/932.

**UX-069 · P1 · Landscape insuficientemente cubierto**.

**UX-070 · P1 · Teclado virtual**  
CTA visible, scrollIntoView con offset de barras.

**UX-071 · P2 · Tablet debe dejar de parecer móvil estirado**.

**UX-072 · P2 · Desktop: max-width y densidad útil**.

### 4.14. Organización e información

**UX-073 · P1 · Reducir profundidad mental del Profesor**  
Toda función frecuente a máximo dos decisiones desde navegación principal.

**UX-074 · P1 · Alumno orientado por objetivos, no estructura interna**  
Qué tengo ahora, qué hago, cómo voy, qué puedo aprender.

**UX-075 · P2 · Vocabulario humano por rol**.

**UX-076 · P2 · Contexto/breadcrumb en vistas profundas**.

**UX-077 · P2 · Persistencia de filtros/posición cuando ayuda; reset al cambiar módulo principal**.

### 4.15. Calidad, QA y regresión visual

**UX-078 · P1 · La auditoría amplia y la específica discrepan sobre targets del Alumno**  
Mejora: una sola lógica de detección para evitar falsos verdes.

**UX-079 · P1 · Tests geométricos deben comprobar colisiones**.

**UX-080 · P1 · Baselines visuales por rol y viewport**.

**UX-081 · P1 · Visual diff con tolerancia y máscaras dinámicas**.

**UX-082 · P2 · QA de motion**.

**UX-083 · P2 · QA de disponibilidad: 500, timeout, offline, sesión, upload, refresh**.

**UX-084 · P2 · Mantener 0 errores de consola y rastrear warnings críticos**.

## 5. Prioridad de trabajo

### P0 — Bloqueantes
- UX-011 / UX-061: target táctil Alumno.
- UX-026: cierre de clase / contrato E2E.

### P1 — Alta
- cabecera Profesor y colisiones;
- pieza central Profesor canónica;
- oclusión por barras fijas;
- densidad Inicio Alumno y flujos de clase;
- contraste, motion real, offline, autosave;
- rendimiento básico/Core Web Vitals;
- alturas/teclado virtual;
- QA visual con colisiones y screenshots.

### P2 — Media
- información, filtros, vacíos, microcopy, sheets;
- consolidación visual y spacing;
- tablet/desktop;
- code splitting y warnings de hooks.

### P3 — Mejora
- CI y skeleton refinements.

## 6. Plan de actualizaciones — una a una

### UX-00 · Congelar baseline y contrato de auditoría
**Estado: PENDIENTE**  
Objetivo: fotografía incontestable del staging actual.  
Incluye: manifest screenshots, 6 fallos, auditor target unificado, métricas centro/overlap/overflow/viewport.  
Aceptación: sin cambios visuales; baseline reproducible en Actions.

### UX-01 · Cabecera Profesor collision-safe
**Estado: PENDIENTE**  
Tres variantes, rails, gap, badge compacto y test overlap.  
Aceptación: 0 overlap 320–430; marca completa; targets >=44.

### UX-02 · Reconstrucción canónica Dar clase + Más
**Estado: PENDIENTE**  
Componente único, `Más` visible + chevron, hit area ~60×48, integración con logo, altura controlada y sheet.  
Aceptación: cumple Night Motion y 320–430 verde.

### UX-03 · Reparación mínima navegación Alumno
**Estado: PENDIENTE**  
Identificar control, ampliar hit area, preservar diseño.  
Aceptación: AUD-020 = 0 undersized; screenshots estables.

### UX-04 · Safe area y espacio útil real
**Estado: PENDIENTE**  
Padding dinámico, safe-area, scrollIntoView, alturas compactas, teclado.  
Aceptación: último control siempre visible/tocable.

### UX-05 · Cierre de clase y contrato E2E
**Estado: PENDIENTE**  
Nombre accesible canónico, copy compacto, CTA, borrador, transición.  
Aceptación: functional-class-flow verde móvil/escritorio.

### UX-06 · Inicio Alumno — Ahora / Después / Explorar
**Estado: PENDIENTE**  
Hero adaptable, un bloque dominante, preparación progresiva y personalización.  
Aceptación: acción principal visible sin scroll en alturas habituales cuando exista.

### UX-07 · Profesor — foco operativo
**Estado: PENDIENTE**  
Foco de clase, navegación reducida en fases críticas, acciones contextuales y estado de guardado.

### UX-08 · Tipografía, contraste y densidad
**Estado: PENDIENTE**  
WCAG, clamp por altura, longitud de línea, spacing, presupuesto glow.

### UX-09 · Motion System real
**Estado: PENDIENTE**  
Tokens, módulos, sheets, pressed, guardado y reduced motion.  
Aceptación: sin infinitas; reduced-motion verde; sin CLS.

### UX-10 · Loading, empty, error y offline
**Estado: PENDIENTE**  
Skeleton, empty states, error boundary, retry, sesión, red lenta/offline.

### UX-11 · Formularios móviles y autosave
**Estado: PENDIENTE**  
16 px inputs, teclado, sticky actions, borradores, errores inline, guardado.  
Aceptación: refresh/background no pierde trabajo.

### UX-12 · Rendimiento percibido
**Estado: PENDIENTE**  
Next Image, media, lazy load, hooks, code splitting.  
Aceptación: LCP <=2.5 s, INP <=200 ms, CLS <=0.1.

### UX-13 · Accesibilidad completa
**Estado: PENDIENTE**  
Teclado, screen reader, aria-live, focus, zoom, targets y contraste.

### UX-14 · Coherencia Profesor ↔ Alumno
**Estado: PENDIENTE**  
Cabeceras, vocabulario, barras, modales, feedback y cambio de rol.

### UX-15 · Regresión visual automatizada
**Estado: PENDIENTE**  
Baselines, diff, máscaras, overlap, clipping, safe-area.

### UX-16 · Matriz responsive ampliada
**Estado: PENDIENTE**  
320–430, alturas 667–932, landscape, 768×1024, 1280×900.

### UX-17 · Disponibilidad y resiliencia
**Estado: PENDIENTE**  
500/timeout/offline, retries, uploads, sesión, reanudación y Sentry staging.

### UX-18 · Cierre de auditoría v1 y nueva baseline
**Estado: PENDIENTE**  
Aceptación: 0 P0, 0 P1, suite funcional verde y baselines aprobadas.

## 7. Reglas del documento vivo

Cada actualización registrará:
- Estado: PENDIENTE / EN EJECUCIÓN / BLOQUEADA / VALIDADA.
- Commit inicial y final de `staging`.
- Hallazgos resueltos.
- Cambios ejecutados.
- Evidencia Playwright.
- Screenshots antes/después.
- Resultado GitHub Actions.
- Regresiones encontradas.
- Decisión final.
- Fecha de validación.

Ningún punto se marca **VALIDADO** solo porque compile. Para cerrar una actualización deben existir evidencia funcional y visual.

## 8. Orden de ejecución recomendado

1. UX-00 baseline.
2. UX-01 cabecera Profesor.
3. UX-02 Dar clase + Más.
4. UX-03 navegación Alumno.
5. UX-04 safe area.
6. UX-05 cierre de clase.
7. UX-06 Inicio Alumno.
8. UX-07 foco Profesor.
9. UX-08 tipografía/contraste.
10. UX-09 motion.
11. UX-10 estados.
12. UX-11 formularios/autosave.
13. UX-12 rendimiento.
14. UX-13 accesibilidad.
15. UX-14 coherencia roles.
16. UX-15 visual regression.
17. UX-16 responsive.
18. UX-17 resiliencia.
19. UX-18 cierre v1.

## 9. Changelog

**16/08/2026 — v1.0**
- Documento creado.
- Baseline inicial: `staging` `f906851d4b5159834443b7e8343b8755984e70ab`.
- Incorporados hallazgos de Playwright, capturas, lint, build y Night Motion.
- Backlog inicial UX-00 → UX-18.
