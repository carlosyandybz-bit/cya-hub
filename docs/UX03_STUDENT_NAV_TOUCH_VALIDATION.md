# UX-03 · Reparación mínima navegación Alumno

## Objetivo

Cerrar UX-011 sin rediseñar Portal CYA: todos los controles visibles de la navegación inferior deben ofrecer al menos 44×44 CSS px de superficie táctil, manteniendo la apariencia compacta aprobada del revelador de «Mi formación».

## Hallazgo

La corrección visual/accesible ya existía en `student-portal-touch-target-v45.css`, pero localizaba el botón mediante `nth-child`. El propio componente dispone de identidad semántica estable (`aria-label="Abrir apartados de Mi formación"`) y el módulo de Portal CYA declara también una superficie de 44×44.

UX-03 no añade otra capa ni cambia la arquitectura. Sustituye el selector posicional por el nombre accesible del control y conserva exactamente la pieza visual 40×20 dentro de una hit-area 44×44.

## Contrato de validación

Playwright valida 320, 360, 375, 390, 393, 402, 414 y 430 px:

- Portal CYA visible y sin overflow horizontal.
- Cero botones visibles de la navegación por debajo de 44×44 CSS px.
- Revelador de «Mi formación» con hit-area mínima 44×44.
- Pseudo-elemento visual conservado en 40×20.
- `aria-expanded` cambia al abrir el sheet.
- El sheet conserva Resumen, A practicar, Clases realizadas y Contenido.
- La navegación principal conserva exactamente Inicio, Progreso, Mi formación, Descubre y Misiones.
- Evidencia visual obligatoria en 320, 390 y 430 px.

## Alcance

Solo Alumno / Portal CYA. No modifica Profesor, Administración, `main`, producción ni datos de negocio.
