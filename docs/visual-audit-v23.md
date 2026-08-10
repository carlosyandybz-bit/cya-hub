# Auditoría visual v23 — CYA Hub

Fecha: 2026-08-10

## Alcance

Auditoría transversal de integridad visual y usabilidad móvil, con iPhone como referencia. No redefine todavía la identidad visual final, la paleta histórica, tipografías configurables, evaluación, árboles pedagógicos ni el flujo funcional de Dar clase.

## Problemas objetivos detectados y corregidos

1. **Modales móviles convertidos en hojas inferiores.** `globals.css` forzaba `.backdrop { align-items:end }` en móvil, haciendo que Programar clase y formularios equivalentes aparecieran pegados abajo.
2. **Ficha del alumno forzada a pantalla completa.** `student-detail.module.css` imponía `width:100vw; height:100dvh`, contradiciendo el patrón de modal centrado solicitado.
3. **Fondo desplazable detrás de diálogos.** Se añade bloqueo del scroll de la página mientras existe un `role="dialog"`.
4. **Safe-area incompleta.** Cabecera, contenido principal, barra inferior y modales ahora respetan los inset de iOS.
5. **Controles táctiles demasiado pequeños.** Había botones/selectores de aproximadamente 30–42 px. La capa móvil establece un objetivo mínimo de 44 px para las acciones interactivas relevantes.
6. **Tipografía excesivamente pequeña.** Se encontraron múltiples etiquetas de 8–10 px en Enseñanza, Dar clase, Marketing, Agenda, Administración y portal del alumno. El mínimo de las hojas principales pasa a 11.5 px; los campos de formulario en iPhone usan 16 px para evitar zoom automático de Safari.
7. **Riesgo de overflow horizontal del viewport.** Se limita el viewport principal sin impedir los carruseles/zonas que usan overflow interno de forma deliberada.
8. **Barra inferior y contenido.** El padding inferior del contenido incorpora safe-area para evitar que la navegación tape acciones o últimas filas.
9. **Modal de enseñanza estrecho en móvil.** Se conserva un ancho específico mayor para `teaching-modal` dentro del nuevo sistema centrado.
10. **Ficha de alumno: acciones táctiles.** Cerrar, pestañas, incidencias, acciones de sección y acciones de clases reciben objetivos táctiles consistentes.

## Protección contra regresiones

Se añade `tests/visual-integrity.test.mjs` para verificar automáticamente:

- ausencia de tipografías por debajo de 11.5 px en las hojas principales;
- ausencia de los patrones de bottom-sheet/fullscreen que provocaban el problema;
- presencia de safe-area y objetivos táctiles;
- bloqueo de scroll bajo diálogos;
- protección frente a overflow accidental del viewport.

## Pendiente deliberadamente fuera de este bloque

- identidad visual definitiva;
- colores históricos de CYA;
- logo y cabecera finales;
- selector de tipografías y apariencia desde Administración;
- rediseño de Evaluación;
- rediseño de Dar clase;
- revisión estética/división de árboles de Enseñanza;
- rediseño funcional de Marketing y Estadísticas.
