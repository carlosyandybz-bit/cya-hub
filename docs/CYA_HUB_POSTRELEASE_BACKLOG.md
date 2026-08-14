# CYA HUB — BACKLOG POST-RELEASE

**Corte:** 14/08/2026  
**Base técnica:** `main` tras PR #73  
**Orden operativo:** Auditoría Viva de Google Drive.

Este documento resume el estado técnico post-release. No sustituye el orden ni las decisiones funcionales de la Auditoría Viva en Drive.

## Estado confirmado

- P18–P32 cerrados en código y Supabase producción.
- PR-A cierres transversales: completado.
- PR-B BZ Points: completado y desplegado.
- PR-C Feedback Online: completado y desplegado, producto configurable/inactivo por defecto hasta configuración real.
- PR-D Academia Online: backend/profesor/admin completados; alumno permanece en `Próximamente` hasta apertura comercial real.
- PR-E multimedia/vídeo: completado con compresión oportunista y subida directa resumible a Drive.
- PR-F rediseño global: **activo**; PR-F1 portal de usuario/alumno en implementación.
- Browser QA del último `main` cerrado: verde en profesor/alumno/admin e iPhone/escritorio.
- Copia completa CYA tras Academia: 97 tablas.

## Gates externos

- **Hostinger:** `carlosyandy.com` continúa sirviendo la web pública existente. No mover el dominio principal hasta demostrar CYA Hub en una URL de app independiente.
- **Supabase Auth:** Leaked Password Protection continúa siendo un ajuste externo.

# PR-A — Cierres transversales — COMPLETADO

Incluye:

- ficha profesional de profesor sobre `teacher_profiles` y persona P19;
- alta de profesores reutilizando persona/Auth y roles reales;
- país completo: ISO-2 en BD y nombre localizado en UI;
- preferencias personales separadas de configuración global;
- copy de producto sin jerga técnica innecesaria;
- agrupación de notificaciones por entidad + regla + destino.

# PR-B — BZ Points y recompensas — COMPLETADO

Economía de engagement independiente de puntuación pedagógica.

Garantías principales:

- ledger inmutable/auditable;
- saldo derivado, nunca editable directamente;
- reglas y recompensas administrables;
- idempotencia/antiabuso;
- acciones premiables reales;
- preparación de próxima clase conectada a `class_preparation_requests`;
- integración P28/P30/P32.

Producción: v76–v79 aplicadas; smokes transaccionales y rollback verdes.

# PR-C — Feedback Online — COMPLETADO

Dominio propio, no clase falsa ni consumo de minutos.

Incluye:

- créditos discretos propios;
- vídeo privado en Drive;
- subida de alumno con ownership/HMAC;
- cola de profesor dentro de DAR CLASE;
- asignación pedagógica/evaluación sin crear una clase;
- Administración;
- P27/P28/P30/P32;
- identidad P19 única.

Producción: v80–v81 aplicadas. PR #71 fusionado.

# PR-D — Academia Online — COMPLETADO EN SU ALCANCE ACTUAL

Academia organiza contenido canónico de Enseñanza; no duplica biblioteca, personas ni evaluación.

Incluye:

- programas y orden de contenidos;
- matrículas/accesos;
- progreso de consumo separado del estado pedagógico;
- profesor y Administración;
- integración P28/P30/P32;
- alumno `Academia Online · Próximamente`.

Producción: v82–v83 aplicadas. PR #72 fusionado.

La apertura comercial del alumno queda condicionada a un flujo real de compra/acceso aprobado.

# PR-E — Multimedia / vídeo — COMPLETADO

Arquitectura final:

- Mediabunny + WebCodecs en cliente cuando sea compatible;
- compresión oportunista, nunca bloqueante;
- H.264/AAC y tamaño acotado como perfil inicial;
- usar comprimido solo cuando aporta ahorro real;
- subida directa resumible a Google Drive;
- HMAC de sesión y verificación servidor;
- proxy streaming como fallback;
- sin `arrayBuffer()` completo de vídeos grandes;
- sin dependencia de FFmpeg/Hostinger no demostrada.

PR #73 fusionado en `main` (`57ff649c…`).

# PR-F — Rediseño global — ACTIVO

Dirección: moderna, urbana, elegante, clara y lúdica sin resultar infantil. iPhone como referencia. No perder funciones ni cambiar permisos.

## PR-F1 — Portal de usuario/alumno — EN IMPLEMENTACIÓN

Arquitectura aprobada en Drive y reflejada en `docs/PR_F_PORTAL_USUARIO_APRENDIZAJE.md`:

- cabecera: logo CYA + Notificaciones + avatar;
- saludo dentro de Inicio, no en cabecera;
- barra inferior: Inicio · Progreso · **MI FORMACIÓN** · Descubre · Misiones;
- Mi Formación central y con subnavegación Resumen / A practicar / Clases realizadas / Contenido;
- Descubre agrupa Aprende Online + Eventos;
- Eventos usa arquitectura canónica híbrida sin registros duplicados;
- Inicio resume `Ahora`, próxima clase, BZ, Misiones, Progreso, Feedback, novedades y actividad;
- preparación colaborativa de próxima clase reutiliza `class_preparation_requests` para contenido, mensajes, vídeos y enlaces;
- tono cercano, humano y orientado a crear confianza.

### Orden posterior dentro del portal

El detalle exacto se ejecutará según Drive y con resumen + aprobación previa del usuario antes de cada bloque:

- Mi Formación: Resumen + A practicar;
- Clases realizadas + Contenido;
- Progreso + Mis vídeos;
- Misiones + Descubre/Aprende/Eventos + Avatar/Mis profesores.

## Ficha alumno en profesor — PENDIENTE TRAS PORTAL

Conservar las siete áreas actuales y reorganizarlas por intención/frecuencia sin eliminar capacidad.

## Ver como — PENDIENTE SEGÚN ORDEN DE DRIVE

Reorganizar Profesor/Alumno/Administrador sin elevar permisos. El selector solo presenta experiencias autorizadas por servidor.

## Administración — PENDIENTE SEGÚN ORDEN DE DRIVE

Reorganizar las 14 áreas por propósito y eliminar el scroller horizontal principal en móvil, manteniendo toda la capacidad existente.

# Reglas transversales

1. Una persona canónica P19; no duplicar profesor/alumno/cliente.
2. Toda función nueva define permisos/RLS reales.
3. Integrar estadísticas P30 cuando el dominio genere métricas nuevas relevantes.
4. Multimedia pesada va a Drive, no PostgreSQL.
5. Notificaciones nuevas reutilizan P27 y agrupación por entidad/regla/destino.
6. P28/P32 se amplían antes de producción si aparece un nuevo dominio persistente.
7. Touch targets >=44 px y safe areas iPhone.
8. No mostrar copy técnico de desarrollo en UI de producto.
9. No mover `carlosyandy.com` hasta demostrar runtime CYA Hub separado.
10. Mantener ISO `country_code`; traducir solo en presentación/selector.
11. Google Drive es memoria operativa y define orden mediante la Auditoría Viva; GitHub conserva la implementación técnica.
