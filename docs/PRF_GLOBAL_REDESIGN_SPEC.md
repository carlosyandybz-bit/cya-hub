# PR-F · Rediseño global de CYA Hub

Estado: especificación de implementación.
Base: `main` después de PR-E (`57ff649caa7fa8ba2dde4b41b5968e962d711018`).

## Objetivo

Rediseñar las cuatro superficies post-release con mayor deuda de jerarquía visual sin eliminar capacidades, cambiar permisos ni duplicar lógica:

1. Panel del alumno.
2. Ficha maestra del alumno para profesor.
3. Administración.
4. Selector «Ver como».

La referencia principal es iPhone. Escritorio debe aprovechar espacio adicional sin convertirse en otra arquitectura.

## No negociables

- Conservar la barra móvil principal de 5 accesos: Inicio · Alumnado · DAR CLASE · Enseñanza · Marketing.
- DAR CLASE continúa siendo la acción central destacada.
- «Ver como» solo cambia la experiencia; nunca eleva permisos.
- No eliminar datos, acciones, pestañas funcionales, módulos ni RPC existentes.
- No introducir otra fuente de verdad ni nuevas tablas para resolver un problema visual.
- Mantener objetivos táctiles de al menos 44 px.
- No usar amarillo fluorescente.
- Iconos sin cajas/cuadrados decorativos innecesarios; el icono debe poder vivir por sí solo.
- Morado CYA como acento, blanco/off-white como superficie, tinta oscura para texto.
- Evitar listas planas de opciones con el mismo peso visual cuando tienen distinta frecuencia de uso.
- No ocultar acciones críticas dentro de hamburguesas.

## Dirección visual

**Moderna · urbana · elegante · dinámica, nunca infantil.**

- Tipografía: conservar Geist / stack actual.
- Fondo: canvas claro y neutro.
- Superficies: blancas, bordes suaves, sombra muy contenida.
- Acento: `#6d4aff` / `#5637e8` y derivados de baja opacidad.
- Estado correcto: verde actual.
- Incidencia: rojo suave actual.
- Radios: 16–24 px según jerarquía; evitar que cada control parezca una tarjeta independiente.
- Movimiento: 120–180 ms para selección, expansión, entrada de panel y cambio de experiencia; respetar `prefers-reduced-motion`.
- Densidad: información resumida primero, detalle bajo demanda.

## 1. Panel alumno

### Problema actual

El portal apila secuencialmente hero, cuatro métricas grandes, deuda, próxima clase, BZ Points, Feedback Online, Academia, formación, evolución y resto de información. Todo funciona, pero la jerarquía obliga a recorrer una página larga para saber «qué me toca ahora».

### Nueva jerarquía

1. **Cabecera compacta**
   - Marca CYA.
   - Identidad del alumno.
   - Cuenta / Ver como cuando corresponda.

2. **Ahora** — bloque dominante
   - Próxima clase si existe.
   - Si existe deuda/incidencia que requiera atención, aparece antes que información secundaria.
   - Una única acción principal contextual.
   - Contexto de baile de la próxima acción cuando exista.

3. **Progreso rápido**
   - Saldo neto.
   - Formación activa.
   - Evolución/evaluación.
   - BZ Points/resumen de misión cuando haya dato útil.
   - En móvil se representa como una banda compacta, no cuatro tarjetas altas.

4. **Tu camino**
   - Formación y progreso pedagógico como contenido principal.
   - Enseñar primero lo activo/relevante; historial y detalle por expansión.

5. **Servicios y motivación**
   - BZ Points.
   - Feedback Online.
   - Academia Online.
   - No deben competir con «Ahora»; se muestran como módulos secundarios con estado claro.

6. **Evolución e historial**
   - Evaluaciones, clases anteriores, medios y otros detalles.
   - Acceso directo pero con menor peso inicial.

### Móvil

- El primer viewport debe responder: próxima acción, cuándo, saldo/alerta y avance.
- Evitar hero de 180–210 px si no aporta una decisión.
- Métricas compactas en carril/banda o grid bajo de 2 columnas.
- Nunca depender de hover.

## 2. Ficha del alumno — profesor

### Problema actual

Siete pestañas planas tienen el mismo peso: Resumen · Formación · Evaluación · Clases · Bonos · Datos · CRM. Las acciones frecuentes y la información de consulta ocasional compiten entre sí.

### Nueva arquitectura

Cabecera fija de contexto:
- Nombre e identidad.
- Portal/provisional.
- Estado CRM.
- Incidencias visibles.
- Contexto principal de baile.
- Acciones frecuentes: **Programar clase** y **Añadir bono**.

Navegación agrupada sin perder ninguna pantalla:

1. **Ahora**
   - Resumen.
   - Incidencias.
   - Próxima clase.
   - Saldo.
   - Correcciones/formación activas.

2. **Aprendizaje**
   - Formación.
   - Evaluación.

3. **Historial**
   - Clases.
   - Bonos.

4. **Perfil**
   - Datos.
   - CRM.

Cada grupo puede usar subtabs/segmentos internos. Las siete funciones originales siguen accesibles con un máximo de dos decisiones de navegación.

### Móvil

- Cabecera con nombre + estado; acciones frecuentes en fila táctil debajo.
- Navegación de 4 grupos en carril horizontal o segmented control.
- El contenido «Ahora» prioriza incidencias y próxima acción.
- El modal no debe sentirse como una web de escritorio encogida.

## 3. Administración

### Problema actual

14 secciones en una lista plana:
General, Equipo y roles, Formularios, Enseñanza, Misiones, BZ Points, Feedback Online, Academia Online, Notificaciones, Datos, Tarifas, Integraciones, Apariencia y Seguridad.

### Nueva arquitectura por intención

**Sistema**
- General
- Equipo y roles
- Seguridad

**Enseñanza y automatización**
- Formularios
- Enseñanza
- Misiones
- Notificaciones

**Negocio y producto**
- Tarifas
- BZ Points
- Feedback Online
- Academia Online

**Datos y conexiones**
- Datos
- Integraciones

**Experiencia**
- Apariencia

### Escritorio

- Rail lateral de categorías, no 14 filas iguales.
- Al entrar en categoría, mostrar las subsecciones como opciones claras.
- Título y descripción de la sección visibles en el panel.
- Mantener formularios/controles existentes, solo reencuadrados.

### Móvil

- Selector horizontal de 5 categorías.
- Debajo, selector compacto de subsección.
- Evitar el carril horizontal actual de 14 elementos.

## 4. «Ver como»

### Problema actual

Está anidado dentro del menú de cuenta como una fila que despliega una lista. Funciona, pero no explica bien que se cambia de experiencia ni la relación entre vistas.

### Nueva experiencia

Al pulsar **Ver como**, abrir selector de experiencia claro:

- **Profesor** — alumnado, enseñanza y clases.
- **Alumno** — tu propia experiencia, progreso y formación.
- **Administrador** — configuración y control del sistema.

Reglas:
- Solo aparecen experiencias permitidas por `IdentityContext`.
- La experiencia activa se marca claramente.
- Texto persistente: «Cambiar de vista no cambia tus permisos reales».
- Cambio en una pulsación sobre la experiencia elegida.
- El menú de cuenta mantiene Editar perfil, Preferencias, Cuenta y sesión y Cerrar sesión.

## Componentes visuales compartidos a introducir

PR-F debe preferir primitivas reutilizables en vez de añadir más CSS histórico:

- `ExperienceSwitcher`.
- `SectionRail` / `SectionTabs` responsivo.
- `AttentionCard` para próxima acción/incidencia.
- `CompactMetric` para datos de lectura rápida.
- `SurfaceHeader` para cabeceras de módulo.

No es obligatorio crear un design-system completo en este PR. Sí es obligatorio evitar copiar el mismo patrón cuatro veces.

## Estrategia de CSS

- Crear estilos PR-F explícitos y acotados a componentes/superficies nuevas.
- No seguir acumulando overrides versionados globales (`v21`, `v22`, `v37`, etc.) para corregir la misma pantalla.
- Migrar únicamente las reglas necesarias de cada superficie al componente que las posee.
- No borrar CSS legado no relacionado hasta demostrar que queda huérfano.

## QA obligatorio

### Contrato

- Las 7 áreas de ficha alumno continúan accesibles.
- Las 14 áreas de Administración continúan accesibles.
- «Ver como» solo ofrece experiencias permitidas.
- La barra móvil principal mantiene 5 botones y DAR CLASE central.
- Programar clase y añadir bono siguen disponibles desde ficha alumno.
- BZ Points, Feedback Online y Academia siguen presentes en el portal alumno.

### Visual / navegador

Validar al menos:
- iPhone pequeño (~390 px).
- iPhone grande (~430 px).
- escritorio 1280+ px.

Comprobar:
- sin scroll horizontal accidental;
- sin controles <44 px donde sean interactivos;
- safe areas correctas;
- modal ficha alumno usable con teclado abierto/cambio de orientación razonable;
- selector Ver como cerrable con Escape y tap fuera;
- `prefers-reduced-motion` respetado;
- no aparece amarillo fluorescente;
- iconos principales sin cuadrados decorativos.

## Secuencia de implementación

1. Concepto visual y primitivas compartidas.
2. Ver como.
3. Panel alumno.
4. Ficha alumno profesor.
5. Administración.
6. Contrato PR-F en P32.
7. Browser QA y revisión visual móvil/escritorio.

PR-F no requiere migración de base de datos salvo que durante la implementación aparezca una necesidad funcional real independiente del rediseño; en ese caso debe separarse del PR visual.
