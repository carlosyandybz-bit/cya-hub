# P36 — CYA Game UX · rediseño integral

Estado: EN EJECUCIÓN · revisión pantalla por pantalla.

## Mandato

P36 rediseña toda superficie visible de CYA Hub para Profesor, Alumno y Administrador. Se preservan reglas de negocio, datos, permisos y contratos funcionales, pero organización, orden, densidad, color, tipografía, tamaños, componentes, navegación secundaria y composición pueden cambiar cuando mejoren la tarea.

La referencia de calidad es una aplicación trabajada, elegante, creativa, moderna, accesible y coherente. El lenguaje de juego se utiliza para orientación, progreso, recompensa y feedback; nunca para infantilizar el producto.

## Sistema global

`app/cya-game-ux-system.css` define tokens semánticos de color, superficie, texto, radios, elevación, foco y motion. P36 usa color con significado estable: acción/acento, éxito/progreso, atención, error/incidencia, información, estado neutral y bloqueo. `prefers-reduced-motion` desactiva movimiento no esencial y los objetivos táctiles se mantienen en >=44 px.

La iconografía es producto configurable. `app/cya-icon-catalog.ts` mantiene claves semánticas; `CyaIcon` usa un asset personalizado cuando existe y conserva el icono vectorial original como fallback. Administración → Apariencia → Iconos permite buscar, subir/cambiar y restaurar cada slot. Los overrides viven en `app_icon_settings`; los PNG/WebP viven en el bucket público no sensible `cya-icons`, con escritura/borrado exclusivamente administrativa por RLS. No se guardan secretos ni se usa service role en cliente.

## Ledger de superficies

### Profesor
- Inicio contextual — PENDIENTE P36.
- Alumnado · listado/búsqueda — PENDIENTE P36.
- Ficha maestra del alumno — BASE AUD-020; REVISIÓN P36 PENDIENTE.
- Programar clase / clases / agenda — PENDIENTE P36.
- DAR CLASE · flujo completo y estados — PENDIENTE P36, con prioridad absoluta a velocidad y cero distracción.
- Enseñanza · biblioteca, tarjetas, filtros y búsqueda — PENDIENTE P36.
- Árbol/mapa de enseñanza — PENDIENTE P36.
- Correcciones / Explicaciones / Ejercicios / Secuencias — PENDIENTE P36.
- Evaluaciones inicial, postclase, historial, radar y configuración — PENDIENTE P36.
- Marketing / CRM / campañas / contenido — PENDIENTE P36.
- Estadísticas — PENDIENTE P36.
- Feedback Online profesor — PENDIENTE P36.
- Academia Online profesor — PENDIENTE P36.
- Notificaciones profesor — PENDIENTE P36.
- Cuenta / perfil / preferencias — PENDIENTE P36.

### Alumno
- Inicio / Ahora — BASE AUD-020; REVISIÓN P36 PENDIENTE.
- Progreso / evolución — BASE PR-F; REVISIÓN P36 PENDIENTE.
- Mi formación · resumen/práctica/clases/contenido — PENDIENTE P36.
- Misiones y BZ Points — PENDIENTE P36.
- Próxima clase y preparación — PENDIENTE P36.
- Bonos y saldo — PENDIENTE P36.
- Feedback Online alumno — PENDIENTE P36.
- Descubre / Academia / Eventos — PENDIENTE P36.
- Notificaciones alumno — PENDIENTE P36.
- Cuenta / perfil — PENDIENTE P36.

### Administración
- Navegación general de Administración — BASE AUD-014; REVISIÓN P36 PENDIENTE.
- General — PENDIENTE P36.
- Equipo y roles — PENDIENTE P36.
- Formularios — PENDIENTE P36.
- Enseñanza — PENDIENTE P36.
- Misiones — PENDIENTE P36.
- BZ Points — PENDIENTE P36.
- Feedback Online — PENDIENTE P36.
- Academia Online — PENDIENTE P36.
- Notificaciones — PENDIENTE P36.
- Datos / importación / exportación / reset — PENDIENTE P36.
- Tarifas — PENDIENTE P36.
- Integraciones — PENDIENTE P36.
- Apariencia e identidad — EN REDISEÑO P36.
- Iconos — IMPLEMENTADO EN RAMA P36; QA PENDIENTE.
- Seguridad — PENDIENTE P36.
- Ver como — BASE AUD-021; REVISIÓN P36 PENDIENTE.

## Reglas por pantalla

Cada pantalla se revisa en este orden: objetivo principal → decisión/acción más frecuente → información necesaria ahora → acciones secundarias → detalle histórico/administrativo. Se elimina competencia visual innecesaria. Cada estado vacío explica qué hacer; errores dicen cómo recuperarse; éxito confirma el resultado sin interrumpir. No se conservan tarjetas, pestañas, textos, colores o posiciones únicamente por legado.

Cada revisión valida 390 px, 430 px y 1280 px; 0 overflow horizontal; safe areas; teclado; targets >=44 px; foco visible; contraste; jerarquía tipográfica; loading/empty/error/success; experiencia y permisos correctos; y ausencia de amarillo fluorescente.

## Criterio de cierre P36

P36 solo se considera cerrado cuando todas las superficies del ledger estén REDISEÑADAS + QA, toda la iconografía funcional esté inventariada y sustituible desde Administración, no existan usos visibles relevantes fuera del registro semántico, P22/RLS sigan intactos y P32 + CYA QA E2E estén verdes sobre el head final. Hasta entonces P36 permanece EN EJECUCIÓN aunque una tanda individual haya sido fusionada.
