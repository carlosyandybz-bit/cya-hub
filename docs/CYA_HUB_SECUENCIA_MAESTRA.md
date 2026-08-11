# CYA HUB — SECUENCIA MAESTRA DEL PROYECTO

**Versión:** 1.1  
**Fecha de corte:** 11 de agosto de 2026 — 15:14 (Europe/Madrid)  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Producción:** rama `main`

## Objetivo

Este documento es el registro histórico y funcional maestro de CYA Hub. Evita que requisitos, decisiones, regresiones, descartes o implementaciones queden aislados en un chat. Después de cada bloque de implementación deben actualizarse este archivo y `docs/CYA_HUB_PENDIENTES.md` con evidencia técnica, pruebas, producción, pendientes cerrados y pendientes nuevos.

Estados: **VERIFICADO PRODUCCIÓN**, **VERIFICADO CÓDIGO**, **PARCIAL**, **REQUIERE VERIFICACIÓN**, **PENDIENTE**, **DESCARTADO**, **HISTÓRICO**.

## Fuentes de verdad vigentes

1. Producción CYA Hub Web.
2. GitHub `carlosyandybz-bit/cya-hub`, `main`.
3. Supabase producción `CyA hub 2`.
4. Decisiones funcionales consolidadas.
5. Plugin e informes históricos como fuente de paridad.
6. Versiones intermedias solo para reconstruir comportamiento/regresiones.

Una petición antigua no se considera pendiente automáticamente: primero se contrasta con el estado actual.

# Secuencia histórica

## Etapa WordPress / plugin histórico

CYA Hub nació como plugin privado de WordPress alojado en Hostinger. Sus áreas históricas incluían alumnado, clases, bonos, Correcciones, Explicaciones, Ejercicios, Secuencias, evaluaciones, CRM, notificaciones, ubicaciones, contabilidad, administración, portal del alumno y distintas iteraciones de misiones/gamificación.

Principio conservado: mantener la lógica pedagógica y operativa útil, no el desorden estructural ni las duplicidades del plugin.

## 21/07/2026 — V4.1.0 / V5

V4.1.0 consolidó modo clase, autosave transaccional, idempotencia, migraciones verificables, misiones/BZ Points, analítica pedagógica, búsqueda/favoritos/recientes, rendimiento, SQL estricto, seguridad, diagnósticos y tutoriales. La funcionalidad offline/PWA compleja no debía reintroducirse.

V5.0.0 evolucionó de forma aditiva: 61 tablas heredadas + 12 nuevas, portal con progreso, ruta/árbol, explicaciones, correcciones, misiones, recompensas, recomendaciones, tutorial y consola docente. Quedó pendiente validación real en staging/Hostinger.

## 23/07/2026 — auditoría 2.3.5/2.3.6

La base 2.3.5 debía conservar funciones, módulos, datos, configuraciones, roles, permisos, shortcodes, endpoints, tablas y compatibilidad salvo decisión expresa. La candidata 2.3.6 corrigió privacidad, diagnóstico, bonos, permisos docentes y OAuth/WhatsApp. Stripe, Google Drive completo, pedagogía completa y backups propios no estaban realmente implementados en ese ZIP.

## 25/07/2026 — panel profesor

3.4.1 añadió biblioteca SVG premium en Inicio. 3.4.3 añadió un carrusel táctil de métricas: 3 visibles dentro de un catálogo de 24, con navegación táctil/botones/teclado y acciones configurables.

## 26/07/2026 — regresión 9.3.0

9.3.0 quedó **DESCARTADA** por regresión móvil. 9.3.1 restauró el comportamiento 9.2.0 y dejó la capa problemática desactivada.

## 27/07/2026 — definición del flujo Dar clase

Orden operativo consolidado: **Seleccionar alumno/clase → 3 minutos iniciales → Diagnosticar/Preparar → Trabajar → Terminar/Cerrar**.

Los 3 minutos iniciales sirven para preguntar al alumno, adaptar la sesión, tomar notas rápidas, relacionarlas con errores/correcciones, registrar frecuencia/importancia, revisar correcciones anteriores y progreso, detectar explicaciones necesarias y realizar evaluación rápida.

Reglas históricas consolidadas: máximo orientativo de 3 correcciones/hora (1 h 30 → 4), información individual en parejas, sin pestaña inútil en individual, separar Trabajo de hoy del histórico, Guía para pendientes, captura rápida, evaluación protegida y cierre administrativo/pedagógico diferenciado y transaccional cuando corresponda.

## 27/07/2026 — almacenamiento/sincronización

Se fijó que logs, exportaciones, caché, backups y temporales no debían acumularse dentro del plugin. Esa decisión evoluciona a la arquitectura actual: datos en Supabase y multimedia en Google Drive. Durante sincronizaciones no se debían activar eliminaciones antes de verificar la vista previa.

## 04/08/2026 — iPhone como referencia

Se localizaron fallos sistémicos por `100vw`, grids rígidos, tablas con ancho mínimo y cadenas sin corte. Se hizo corrección transversal. **iPhone queda como dispositivo móvil de referencia principal.**

## 04–07/08/2026 — reorganización funcional

Se identifica el problema central: muchas funciones existían, pero dispersas, duplicadas, mal ubicadas o conectadas con flujos poco claros. Se adopta la reorganización completa en lugar de añadir pantallas aisladas.

Principios: conservar funciones útiles; flujos excepcionales detrás de Opciones/Vista completa; gamificación privada del profesor; datos canónicos sin duplicar; menos pantallas técnicas; selectores frente a texto libre cuando sea viable; rapidez táctil; evitar listas largas.

## 05/08/2026 — Enseñanza y evaluaciones

Relaciones entre Correcciones, Explicaciones, Ejercicios y Secuencias. Filtros por Leader/Follower/ambos y bachata/salsa/zouk/bachazouk. Estados de corrección: pendiente, en corrección, corregida. Se unifica **Importancia**. Explicaciones pueden ser Leader/Follower/ambos y tener homólogas. Ejercicios se asocian a explicaciones y/o correcciones.

Evaluaciones: INICIO / INTERMEDIO / AVANZADO; cinco opciones discretas por parámetro: 0/25/50/75/100; radar profesor absoluto y alumno relativo; reevaluación al subir nivel; referencia histórica del 75 % del contenido obligatorio completado.

## 06/08/2026 — reglas visuales

Login no negro; eliminar amarillo fluorescente; contraste suficiente; iconos sin cuadrados decorativos; DAR CLASE destacado; Enseñanza móvil con scroll; estadísticas responsive; no cortar contenido en iPhone.

## 06–07/08/2026 — Inicio contextual

Inicio pasa a ser lanzador rápido contextual. La próxima clase debe dominar **30 minutos antes**. Debe priorizar saludo, frase diaria, siguiente acción, misiones, agenda, avisos, accesos rápidos, resumen del día, Administración, Ver como y cuenta/perfil.

## 07/08/2026 — base histórica Dar clase

Base obligatoria histórica: `20.13.24 CLASS-FINISH-HOTFIX`. Las ramas 20.14/20.15 quedaron descartadas como base del flujo. Flujo: **Preparar → Diagnóstico 3 min → Trabajar → Terminar**. Cierre: qué pasó → cobro → notas/excepciones → revisión pedagógica.

## 07–08/08/2026 — CRM / Marketing

Modelo de personas: potencial/contacto, provisional y registrado. Regla: es alumno quien tiene clase o bono comprado; el resto son contactos/clientes potenciales registrados. Campos CRM base: Fecha, Nombre, Teléfono, País, Cómo nos conoció, Qué quería, Reservó, Bono, Importe, Observaciones, Tarifa. No duplicar persona al convertirla.

Marketing debe reunir CRM, tarifas, creación y planificación de contenido, campañas, comunicaciones, fotos/vídeos, eventos, estadísticas y métricas. YouTube/TikTok no son integraciones obligatorias.

# Cambio a app web

## 08/08/2026 — reconstrucción

Se abandona la dependencia estructural de WordPress. Arquitectura objetivo: app web propia; GitHub para código; Supabase para Auth/datos; Hostinger para hosting; Google Drive para multimedia. Se decide limpiar las primeras pruebas inválidas y usar como proyecto canónico **`CyA hub 2`**; el proyecto antiguo queda fuera de uso.

## 08–09/08/2026 — contrato maestro web

Reglas: auditar `main` y Supabase; no duplicar; después de la reconstrucción inicial no resetear Supabase; migraciones incrementales/idempotentes; distinguir EXISTE/PARCIAL/FALTA; no maquillar funciones incompletas; seguridad real en servidor/RLS.

# Arquitectura funcional vigente

## Navegación

Móvil: **Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**. DAR CLASE central, mayor y elevado. Sin hamburguesa para funciones clave. Durante clase puede ocultarse la navegación. Escritorio debe conservar la misma arquitectura conceptual.

## Inicio

Saludo por hora y nombre; frase diaria persistente; siguiente acción; misiones; agenda/calendario; avisos; accesos rápidos; resumen del día; Administración; Ver como; cuenta/perfil. Mañana 05:00–11:59, tarde 12:00–19:59, noche 20:00–04:59. Frases con activar/desactivar, calendario, CSV, sustitución por fecha, evitar duplicados y previsualización.

## Misiones

Tipos: principal, diaria, crecimiento. Estados: próxima, disponible, en progreso, bloqueada, pospuesta, completada, no realizada, no aplicable, cancelada, automática. Prioridad: normal, prioritaria, urgente. Casos iniciales: cierre de clases; bono bajo/vencimiento; perfil incompleto; correcciones pendientes de explicación; preparación; añadir contenido; revisar información; completar contenido interno.

## Alumnado

Alumnos/provisionales, perfiles, datos personales/baile, roles/estilos, evaluaciones/evolución, clases, bonos/saldo, historial, formación, correcciones, feedback, programar clase, añadir bono, incidencias y vinculación. Clases y Bonos dejan de ser módulos principales independientes.

## Enseñanza

Biblioteca, Correcciones, Explicaciones, Ejercicios, Secuencias, categorías, relaciones, asignaciones, árboles/mapas, búsqueda global, incompletos, multimedia Drive y configuración pedagógica. Árboles táctiles con zoom, mover, centrar, ruta, volver/reset y filtros estilo/rol/nivel/tipo/búsqueda.

## Dar clase

Buscador unificado para Correcciones, Explicaciones, Ejercicios y Secuencias; búsqueda por título/etiquetas/categoría/descripción/relaciones; prioridad por activo del alumno, correcciones activas, contexto, biblioteca compatible y otros. Crear rápido con mínimos y estados incompleta/borrador/solo profesores.

## Multirol / Ver como

Una persona puede ser Profesor + Alumno y además Administrador si está autorizada. Ver como: Profesor/Alumno/Administrador. Nunca debe escalar permisos; servidor/RLS valida la identidad real.

## Portal alumno

Próxima clase, clases, bonos/saldo, Correcciones, Explicaciones, Ejercicios, Secuencias, multimedia, evolución, evaluaciones, perfil e información autorizada.

## Formularios

Sistema reusable/versionable con definición, versión, campos, opciones, requerido, visibilidad, condición, validación y orden. Tipos mínimos: info, texto, textarea, select, multiselect, checkbox, número, fecha, email, teléfono. Principio: **un dato canónico no se vuelve a pedir si ya existe**.

## Agenda/calendario

Día/Semana/Mes/Lista; clases/misiones/eventos; integración Google Calendar con id externo, última sincronización, estado, errores y conflictos; operaciones idempotentes que no destruyan participantes, saldos, estado pedagógico ni historia.

## Marketing

CRM, tarifas, contenido, campañas, comunicaciones, eventos, métricas y estadísticas; multimedia de campañas por referencias externas.

## Administración

Configuración general, roles/permisos, misiones, formularios, pedagogía, import/export, integraciones, seguridad/diagnóstico y control administrativo.

# Arquitectura técnica actual

- Next.js + React + Node.js.
- Supabase para Auth/datos.
- GitHub `main` para código.
- Hostinger como hosting.
- Google Drive por referencias/IDs para multimedia.
- No blobs operativos pesados en GitHub/DB.
- No `service_role`, `sb_secret_*` ni secretos administrativos en cliente/repositorio.
- RLS como frontera real.
- `/api/runtime-config` para configuración pública.
- Producción no depende de ChatGPT Sites, Vinext, Wrangler ni Worker de Cloudflare.
- Se mantiene `manifest.webmanifest`/standalone para iPhone sin reintroducir una capa offline compleja.

# 10/08/2026 — Auditoría visual web v23

Corregido: bottom-sheets no deseados, ficha alumno fullscreen, scroll de fondo, safe-area, objetivos táctiles, tipografías pequeñas, overflow horizontal, padding barra inferior, modal Enseñanza y acciones táctiles. Se añadieron pruebas de integridad visual.

Fuera de alcance deliberadamente: identidad visual definitiva, colores/logo/cabecera, selector tipografías/apariencia, Evaluación, Dar clase, árboles Enseñanza, Marketing y Estadísticas.

# 11/08/2026 — P16 / v42

P16 cierra fronteras RLS alumno/clases: se retira SELECT directo de alumno sobre `class_pedagogy_summaries`; el portal conserva `student_message` mediante `student_portal_snapshot`; `internal_note` queda aislada; se sustituyen políticas vulnerables de preparación y se añade helper privado de privilegio mínimo.

Validación: dry-run 11/11; producción 17/17; migración `20260811124729 / v42_rls_student_class_correlation`; PR #2 fusionada; merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`. **Estado: VERIFICADO PRODUCCIÓN para P16.**

# 11/08/2026 — control post-P16 y baseline de migraciones

## P-001 — Hostinger

Se comprueba que `main` contiene P16 y que los commits posteriores auditados hasta `d757cc85ccb832be35b621834ea2ec3ece5be3b5` son documentales. La integración Hostinger disponible en esta sesión no ofrece las acciones de hosting Node.js, despliegues o logs necesarias para demostrar qué commit sirve el runtime. P-001 permanece abierto por falta de evidencia, no por un fallo detectado.

## P-002 — Auth

Security Advisors de `CyA hub 2` confirma **`Leaked Password Protection Disabled`**. Se clasifica como pendiente real de configuración Auth. No se debe resolver mediante SQL.

## P-003 — baseline real de Supabase

Se audita `supabase_migrations.schema_migrations` de producción:

- **52 migraciones registradas**;
- primera: `20260808214303 / teaching_module`;
- última: `20260811124729 / v42_rls_student_class_correlation`.

Cruce con `supabase/`:

- 34 migraciones registradas tienen fuente/archivo equivalente identificable en el repositorio;
- 18 migraciones registradas carecen de archivo SQL independiente;
- esas 18 conservan sus sentencias en `schema_migrations.statements` y son recuperables sin inferencia ni reejecución;
- `foundation.sql`, `classes-and-credits.sql`, `live-class.sql` y `marketing-crm.sql` se clasifican como bootstrap/pre-registro;
- `v21-data-transfer-followups.sql` es un agregado histórico de varios follow-ups;
- `v35c-enforce-post-class-evaluation.sql` está presente pero no registrado como aplicado;
- `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` está presente, explícitamente marcado como no aplicado y tampoco figura en producción.

Se crea `docs/DATABASE_MIGRATION_BASELINE.md` como referencia canónica. **P-003 queda CERRADO.**

Se abre **P-025** para recuperar las 18 fuentes SQL independientes desde el registro de producción, sin ejecutarlas.

# Decisiones descartadas / no reintroducir

- WordPress como backend/identidad canónica de la app web.
- ChatGPT Sites como producción.
- regresión móvil 9.3.0.
- 20.14/20.15 como base Dar clase.
- hamburguesa para módulos principales.
- amarillo fluorescente.
- login/fondos negros no solicitados.
- iconos sistemáticamente en cuadrados decorativos.
- duplicar personas al convertir potencial/provisional/alumno.
- volver a preguntar datos canónicos ya conocidos.
- mezclar CRM con expediente pedagógico sin entidad adecuada.
- exponer notas internas al alumno.
- multimedia pesada en GitHub/DB.
- secretos administrativos en frontend/GitHub.
- YouTube/TikTok como requisito obligatorio sin nueva decisión.

# Protocolo permanente

Cada implementación debe registrar:

```text
[FECHA/HORA]
BLOQUE:
REQUISITOS AFECTADOS:
CAMBIO:
BD/MIGRACIÓN:
COMMIT/PR:
PRUEBAS:
PRODUCCIÓN:
REGRESIONES:
PENDIENTES NUEVOS:
PENDIENTES CERRADOS:
```

El archivo `docs/CYA_HUB_PENDIENTES.md` es el tablero operativo y debe actualizarse en el mismo ciclo.

# Último punto conocido

- P16/v42: verificada en Supabase producción.
- PR #2: fusionada en `main`.
- P-003: cerrado mediante baseline real de 52 migraciones.
- P-001: pendiente de evidencia de runtime Hostinger.
- P-002: warning Auth confirmado.
- P-025: pendiente de recuperar 18 fuentes SQL históricas desde producción.
