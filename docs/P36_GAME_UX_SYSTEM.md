# P36 — CYA Game UX system

Estado: implementación transversal de cierre.

## Objetivo

Cerrar la dirección visual aprobada para CYA Hub sin rehacer superficies ya certificadas ni crear una nueva fuente de verdad. P36 consolida un sistema visual e interactivo común para Profesor, Alumno y Administración sobre las implementaciones ya cerradas de PR-F, AUD-014, AUD-020 y AUD-021.

## Principios

- Moderna, urbana, elegante y vinculada al baile; nunca infantil.
- Morado CYA como acento, fondo claro, superficies blancas y jerarquía tipográfica fuerte.
- Información resumida primero; detalle bajo demanda.
- Estado y acción tienen más peso que decoración.
- Iconos sin cajas decorativas innecesarias.
- Nada de amarillo fluorescente.
- Mobile-first con iPhone como referencia.
- Targets táctiles efectivos de al menos 44 px.
- Motion breve (120–180 ms) solo para orientación, selección y feedback.
- `prefers-reduced-motion` elimina movimiento no esencial.
- Focus visible para teclado y accesibilidad.

## Arquitectura

`app/cya-game-ux-system.css` es la capa canónica de tokens e interacción. No contiene reglas de negocio, permisos, consultas ni layout específico de una función.

Los estilos funcionales existentes conservan su ownership. Los tokens P36 se exponen con nombres semánticos y mantienen aliases temporales (`--purple`, `--ink`, etc.) para permitir una migración progresiva sin una reescritura riesgosa.

P36 no añade tablas, RPC, RLS, almacenamiento ni tracking.

## Superficies preservadas

- Profesor: navegación principal de cinco accesos y DAR CLASE central.
- Alumno: portal PR-F/AUD-020 y su jerarquía orientada a objetivos.
- Ficha del alumno desde profesor: Ahora / Aprendizaje / Historial / Perfil.
- Administración: cinco categorías y catorce destinos funcionales.
- Ver como: Profesor / Alumno / Administrador solo cuando IdentityContext lo permite.

## Criterio de cierre

1. Tokens P36 cargados después de las capas funcionales existentes.
2. Estados interactivos coherentes y focus visible.
3. Motion contenido y reducción de movimiento soportada.
4. Targets táctiles protegidos en superficies compartidas.
5. Sin cambios de permisos ni datos.
6. Contrato `tests/p36-game-ux-system.test.mjs` dentro de P32.
7. P32 Release QA y CYA QA E2E verdes sobre el mismo head antes de merge.
8. Las regresiones de navegador existentes deben seguir certificando 390, 430 y 1280 px, overflow, navegación, roles y superficies PR-F/AUD-020.
