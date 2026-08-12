# CYA HUB — AUDITORÍA VIVA DE LANZAMIENTO

Fecha de corte: **2026-08-12**  
Repositorio: `carlosyandybz-bit/cya-hub`  
Base funcional post-P0A auditada: `main@85e1d7954cd67190735a118d682c002ddfc2569a` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)  
Auditoría transversal integrada: PR **#32 — P0 audit: add release-wide Playwright coverage**  
Control documental P0B: `CYA_HUB_PLAN_MAESTRO_CIERRE.md` + `P23_ENSENANZA_RELACIONES_ARBOLES.md` + `tests/documentation-consistency.test.mjs`  
Estado: **AUDITORÍA P0 VIVA — P0A/P0D cerrados, P0B canonizado, P0C pendiente; todavía existen gates antes del release**

---

## 1. Objetivo y criterio

Esta auditoría es acumulativa. Su misión no es demostrar que existe código, sino contrastar:

`diseñado → implementado → comportamiento real → datos reales → seguridad → release`

Fuentes de verdad, por orden operativo:

1. runtime y esquema real de Supabase;
2. `main` del repositorio;
3. QA funcional Playwright;
4. contratos P12–P32 y documentación de cierre;
5. informe/ZIP histórico como referencia de comportamiento, no de arquitectura.

Estados de la matriz:

- **EXISTE / CERRADO**: implementado y con evidencia suficiente para el alcance cerrado.
- **EXISTE + CORRECTIVO**: dominio funcional, pero existe una regresión concreta.
- **PARCIAL**: hay backend/frontend real, pero faltan contratos, integración o QA para cerrar el paquete.
- **FALTA**: no existe implementación suficiente.
- **BLOQUEO RELEASE**: no necesariamente es un bug de producto, pero impide certificar lanzamiento.

Regla documental añadida por P0B:

- el Plan Maestro no puede declarar como pendiente/actual un paquete que tenga documento de cierre formal incompatible;
- la transición canónica vigente es **P23 cerrado → P24 actual**;
- el CI debe bloquear una regresión documental equivalente a CYA-AUD-001 antes de que vuelva a `main`.

---

## 2. Evidencia de QA release-wide

`qa/tests/release-wide-audit.spec.ts` está integrado en `main` y se ejecuta sobre iPhone grande `430×739` y escritorio `1280×720`.

Superficies recorridas:

- Profesor: Inicio, Alumnado, Dar clase, Enseñanza, Marketing, vuelta a Inicio.
- Alumno: Portal alumno.
- Administración: General, Equipo y roles, Formularios, Enseñanza, Misiones, Notificaciones, Datos, Integraciones, Apariencia y Seguridad.

Cada superficie genera:

- screenshot completo;
- JSON de observaciones;
- errores de consola/página;
- fallos de red y HTTP 5xx;
- overflow horizontal;
- inventario de navegación;
- controles visibles sin etiqueta;
- targets táctiles efectivos por debajo de 44 px.

### Resultado actual post-P0A en `main`

Workflow `CYA QA E2E`, run **31583225189**, ejecutado sobre `main@85e1d7954cd67190735a118d682c002ddfc2569a`:

- bootstrap QA OIDC → Supabase: **OK**;
- lint: **0 errores / 14 warnings**;
- build Next.js: **OK**;
- servidor local: **OK**;
- Playwright total: **22/22 passed**;
- regresión específica del Centro `Dar clase`: **OK** en iPhone y desktop;
- ciclo Profesor → Alumno → Administrador: **OK**;
- artifacts: **OK**, artifact `9136133162`.

En todas las superficies auditadas:

- **0 px de overflow horizontal documental**;
- **0 page errors no capturados**;
- **0 requests fallidas inesperadas**;
- **0 HTTP 5xx inesperados**;
- **0 botones visibles sin etiqueta accesible**.

En Enseñanza, el runner local registra un `503` de `/api/google-drive/media-ticket`. Está clasificado como dependencia QA, no como defecto de producción: el runner no dispone de las credenciales server-side de Google Drive que exige `driveServerConfigured()`.

El resultado histórico 19/20 corresponde únicamente al corte previo a P0A y ya no representa el estado actual.

---

## 3. Hallazgos vivos

| ID | Área | Severidad | Estado | Evidencia | Acción / destino |
|---|---|---:|---|---|---|
| **CYA-AUD-001** | Proceso / documentación | Alta | **RESUELTO — P0B** | `P23_ENSENANZA_RELACIONES_ARBOLES.md` declara P23 cerrado y P24 siguiente; el Plan Maestro v4.1 queda canonizado a `P23 / v51` cerrado y `P24 — Inicio contextual` actual. `tests/documentation-consistency.test.mjs` comprueba la transición y el workflow `CYA QA E2E` lo ejecuta antes del QA de navegador. | Mantener el gate; cuando P24 cierre, actualizar deliberadamente cierre + Plan + test en la misma transición. |
| **CYA-AUD-002** | Formularios | — | **CERRADO / RECLASIFICADO** | La auditoría anterior asumía que una versión publicada debía tener `status='published'`. El contrato real usa `form_versions.status='active'`; `publish_form_version` y `form_runtime` son coherentes con ese contrato. | Corregir texto histórico; no tocar runtime. |
| **CYA-AUD-003** | Misiones | Media | **ABIERTO — BUG CONFIRMADO** | Misiones diarias del 10 y 11/08 permanecen `available` tras vencer. `daily.review_information` usa `failure_behavior='expire'`, pero `refresh_missions()` solo procesa vencimiento cuando el comportamiento es `mark_not_done`. | Implementar semántica `expire` explícita y backfill seguro de vencidas. P25. |
| **CYA-AUD-004** | Enseñanza / visibilidad | Baja | **ABIERTO** | Contenidos archivados/inactivos `Pinball` y `Cadera contraria` conservan `visibility='student'`. No se exponen ahora por `active=false`, pero el estado es semánticamente ambiguo. | Definir/normalizar invariante de archivado y visibilidad. Correctivo Enseñanza/P32. |
| **CYA-AUD-005** | QA integral | Alta | **RESUELTO — P0D** | `release-wide-audit` está integrado en `main` mediante PR #32 y recorre superficies Profesor/Alumno/Admin. | Mantenerlo como gate permanente y ampliarlo en P32 para destructivas/integraciones. |
| **CYA-AUD-006** | QA release-wide | — | **EJECUTADO — 22/22** | Run post-merge `31583225189`: 22/22, iPhone + desktop, ciclo Profesor→Alumno→Admin, build y artifacts verdes. | Mantener como gate real tras cada paquete relevante y en P32. |
| **CYA-AUD-007** | Responsive / iPhone | Media | **ABIERTO** | Targets reales <44 px: Alumnado tabs 40 px, `Nuevo` 42 px, `Programar/Bono` 36 px; `Empezar otra clase` 42 px; `Crear contenido` 42 px; `Nuevo contacto` 42 px; tabs de Administración 40 px; switches de roles/misiones/notificaciones 35×21 px; botones de secciones de Datos 40 px. | Elevar área táctil efectiva a ≥44 px sin aumentar innecesariamente densidad visual. G3/P0C + revalidación por módulo. |
| **CYA-AUD-008** | Navegación / Dar clase | Media | **RESUELTO — P0A** | PR #32: `.mobile-nav` ya no se oculta por `view === 'live'`; se oculta únicamente con clase seleccionada realmente `status='active'` + `workflow_stage='live'`. Centro y preparación mantienen cinco accesos; clase activa oculta chrome; cierre lo restaura. Run `31583225189` verde. | Mantener `class-center-navigation.spec.ts` + lifecycle E2E como regresión permanente. |
| **CYA-AUD-009** | Seguridad | Media | **ABIERTO — HARDENING** | Advisor avisa de RPC `SECURITY DEFINER` ejecutables por `authenticated`. Las RPC sensibles de formularios/reset inspeccionadas contienen guards `private.is_admin()` y `anon` no puede ejecutarlas; no se observó escalada. Leaked Password Protection sigue desactivado. `pg_net` está en `public`. | Reducir superficie EXECUTE/SECURITY DEFINER, revisar policies, activar leaked password protection y endurecer extensiones antes de release. P32. |
| **CYA-AUD-010** | Rendimiento / DB | Baja–Media | **ABIERTO** | Advisor muestra varias FK sin índice, policies permisivas múltiples e índice duplicado de posición de secuencias en `teaching_content_relations`. | Indexar según carga real; eliminar solo duplicados confirmados; consolidar policies sin romper RLS. P32. |
| **CYA-AUD-011** | Producción / G1 | Alta | **BLOQUEO DE CERTIFICACIÓN** | El Plan conserva evidencias G1 históricas P17–P23, pero esta auditoría todavía no constituye certificación final del commit que servirá Hostinger en release. | Obtener evidencia actual de Hostinger + `/api/build-info`/runtime antes de un cutover incompatible o del release final. G1/P32. |
| **CYA-AUD-012** | Drive / QA | Media | **ABIERTO COMO GAP QA** | `integration_settings.google_drive='configured'`, pero el runner de GitHub no tiene secretos server-side de Drive y por ello no puede probar `media-ticket` end-to-end. | Crear prueba segura de Drive con secrets/env de QA o entorno staging; no copiar credenciales de producción al repositorio. P31/P32. |

---

## 4. Integridad real de Supabase

Comprobaciones realizadas sobre producción y resultado **0 incoherencias** en:

- emails duplicados;
- teléfonos duplicados;
- personas activas sin nombre;
- participantes duplicados en una clase;
- bonos con saldo negativo;
- clases `closed` sin cierre administrativo;
- clases `closed` sin cierre pedagógico;
- clases `active` fuera de `live`;
- clases `finished` todavía en `live`;
- contenido activo visible al alumno sin publicación;
- `active_version` de formulario sin versión real;
- misiones activas duplicadas por `dedupe_key`.

Esto es una señal fuerte: los problemas P0 encontrados son principalmente de contrato/UX/automatización y hardening, no una corrupción general de datos.

Datos reales excluyendo fixtures QA en el momento del corte:

- personas activas reales: **3**;
- perfiles de alumno activos reales: **3**;
- clases reales: **26** — 7 programadas, 19 terminadas, 0 activas;
- contenidos pedagógicos activos reales: **7**;
- contenidos pedagógicos activos y publicados: **3**.

P0A/P0B/P0D no modificaron estos datos ni exigieron migración de Supabase.

---

## 5. Matriz funcional — diseñado → implementado → estado real

| Función / dominio | Estado | Origen / evidencia | Qué falta / acción |
|---|---|---|---|
| Identidad única + multirol + `Ver como` | **EXISTE / CERRADO** | P18–P19; roles server-side; QA profesor/alumno/admin | Reauditar seguridad global en P32. |
| Personas / Alumnado canónico | **EXISTE / CERRADO BASE** | P19–P22; `people`, profiles, clases/bonos integrados | CYA-AUD-007 en targets táctiles del módulo. |
| Formularios versionados + datos canónicos | **EXISTE / CERRADO** | P20; runtime y publicación coherentes | Solo hardening RPC P32. CYA-AUD-002 cerrado. |
| Evaluaciones guiadas | **EXISTE / CERRADO** | P17 + correctivos v51; E2E inicial/postclase | Mantener regresión permanente. |
| Dar clase | **EXISTE / VALIDADO** | P21 + P0A; E2E completo profesor→alumno→admin; Centro móvil protegido | Solo CYA-AUD-007 en targets táctiles menores. |
| Bonos / consumo de minutos | **EXISTE / VALIDADO** | E2E verificó consumo exacto y cierres; integridad sin saldos negativos | Ampliar escenarios pareja/regularización en P32. |
| Portal del alumno | **EXISTE / CERRADO** | P22 + v52; release-wide sin page/network errors | Reauditar contenido real y multimedia Drive en P32. |
| Enseñanza + relaciones + 8 árboles | **EXISTE / P23 CERRADO** | `P23_ENSENANZA_RELACIONES_ARBOLES.md`; backend/frontend P23; release-wide | Normalizar archivados CYA-AUD-004 y cubrir Drive E2E CYA-AUD-012. |
| Inicio contextual | **PARCIAL AVANZADO / P24 ACTUAL** | `HomeView`, `home_snapshot`, saludo, próxima acción, misiones, agenda, accesos | Revalidar contrato completo de frases/administración y clase dominante a 30 min. |
| Frases diarias | **PARCIAL** | Tabla `daily_quotes` con 15 registros; Home consume quote/snapshot | Cerrar administración/CSV/fechas/no repetición/preview según P24. |
| Misiones | **PARCIAL — BUG** | 53 misiones, 8 reglas, motor y UI existentes | CYA-AUD-003 `expire`; demostrar worker server-side y cerrar estados/config completa en P25. |
| Agenda | **PARCIAL AVANZADO** | Día/Semana/Mes/Lista + capas class/mission/event en `AgendaView` | P26: sincronización Google Calendar real, conflictos/idempotencia. |
| Google Calendar | **PARCIAL / NO OPERATIVO** | Tablas/conexión existen; `integration_settings` indica `disconnected`; 0 conexiones/eventos | Conectar y probar sync bidireccional/seguro en P26. |
| Centro de notificaciones | **EXISTE BASE** | 119 notificaciones internas; vista pendiente/historial | Hay 116 sin leer en el corte: revisar calidad/ruido y automatización. |
| Notificaciones automáticas / externas | **PARCIAL** | 13 reglas; `notification_deliveries=0`; email/WhatsApp desconectados | P27: worker/deliveries/canales/push cuando proceda. |
| Importación / exportación | **PARCIAL AVANZADO** | Admin Datos soporta JSON/CSV/XLSX, preview, estrategia duplicados, backup/reset | `data_transfer_jobs=0`: falta round-trip E2E y prueba real por dominios antes de P28 cerrado. |
| CRM | **PARCIAL** | UI y tablas `crm_*` existen | 0 perfiles/actividades actuales; cerrar flujo real potencial→provisional→alumno y campos del contrato P29. |
| Tarifas | **PARCIAL** | UI/tabla `marketing_rates` existe | 0 registros; cargar/validar tarifas reales y relación comercial. P29. |
| Contenido Marketing | **PARCIAL** | UI y tablas existen | 0 contenidos actuales; validar media y planificación real. P29. |
| Campañas / comunicaciones | **PARCIAL** | UI, campañas, media, recipients/events existen | 0 campañas/comunicaciones; WhatsApp/email desconectados. Probar texto + fotos/vídeos + resultados. P29. |
| Eventos Marketing | **PARCIAL** | Modelo/UI existe | 0 eventos actuales; cerrar promoción/campañas/métricas. P29. |
| Estadísticas | **PARCIAL / NO CERRAR** | Existen componentes/métricas de distintos dominios | P30 exige definir con el usuario qué decisión debe permitir cada estadística antes de ampliar/validar. |
| Administración | **PARCIAL AVANZADO** | Todas las secciones del contrato abren sin overflow/errors en release-wide | G3 táctil, catálogos/integraciones/apariencia y destructivas final en P31/P32. |
| Integraciones | **PARCIAL** | Drive `configured`; Calendar/email/WhatsApp `disconnected` | No declarar conectado sin prueba verificable. P31. |
| Apariencia | **PARCIAL** | Sección accesible y sin errores de runtime | Cerrar parámetros visuales aprobados y QA móvil P31. |
| Reset / borrado seguro | **EXISTE BASE / REAUDITAR** | v44–v44e y Admin Datos | P32: backup reciente, preview, doble confirmación, supervivientes, restauración real. |
| Seguridad final | **PARCIAL** | RLS + guards fuertes en áreas inspeccionadas; QA roles | CYA-AUD-009 y leaked passwords antes de release. |
| QA integral | **GATE BASE INTEGRADO / CIERRE P32 PENDIENTE** | QA Bridge + lifecycle + `release-wide-audit`; run post-merge 22/22 | P0C táctil; ampliar destructivas, Drive e integraciones en P32. |
| Producción / release | **NO CERTIFICADO** | G1 histórico P17–P23 existente | CYA-AUD-011 + P32 completo antes de declarar lanzamiento. |

---

## 6. Estado de integraciones y dominios adelantados

Estado live en `integration_settings` al corte:

- Google Drive: **configured**;
- Google Calendar: **disconnected**;
- email: **disconnected**;
- WhatsApp: **disconnected**.

Actividad de dominios todavía no operativos/cerrados:

- `calendar_connections`: 0;
- `calendar_events`: 0;
- `notification_deliveries`: 0;
- `crm_profiles`: 0;
- `crm_activities`: 0;
- `marketing_rates`: 0;
- `marketing_content`: 0;
- `marketing_campaigns`: 0;
- `marketing_events`: 0;
- `marketing_campaign_metrics`: 0;
- `communication_events`: 0;
- `data_transfer_jobs`: 0.

Que una tabla tenga 0 registros no implica por sí sola un bug. Aquí se usa como evidencia de que **no existe todavía prueba operativa con datos reales suficiente para cerrar esos paquetes**.

---

## 7. Seguridad y rendimiento — detalle

### Seguridad

No se ha encontrado en esta pasada una escalada de privilegios en las RPC administrativas inspeccionadas. Las RPC sensibles P20/reset revisadas usan `private.is_admin()` y `anon` no dispone de ejecución.

Pendientes:

1. activar Supabase Leaked Password Protection antes del lanzamiento;
2. inventariar y minimizar `EXECUTE` sobre funciones `SECURITY DEFINER` para `authenticated`;
3. revisar `pg_net` en schema `public`;
4. revisar tablas RLS deny-all sin policy y documentar si son deliberadas;
5. reauditar policies permisivas múltiples por tabla/acción.

### Rendimiento

Advisor señala:

- varias FK sin índice;
- índices marcados como no usados en una base todavía pequeña;
- múltiples policies permisivas;
- índice de posición de secuencia duplicado en `teaching_content_relations`.

Regla: **no borrar índices automáticamente porque Advisor diga `unused`**. Primero carga real, query plan y duplicidad exacta.

---

## 8. Deuda técnica no bloqueante

Lint actual:

- **0 errors**;
- **14 warnings**.

Principalmente:

- `<img>` que podría pasar a `next/image`;
- imports/variables no usados;
- dependencias de `useMemo` que conviene estabilizar.

No bloquea el producto, pero debe limpiarse progresivamente para que warnings nuevos vuelvan a ser señal útil.

---

## 9. Orden recomendado de actuación

### P0 — antes de continuar paquetes

1. **P0A / CYA-AUD-008 — ✅ CERRADO**: navegación móvil del Centro `Dar clase` corregida.
2. **P0B / CYA-AUD-001 — ✅ CANONIZADO**: Plan Maestro P23 cerrado → P24 actual + gate documental en CI.
3. **P0C / CYA-AUD-007 — SIGUIENTE CORRECTIVO**: normalizar targets táctiles críticos, empezando por switches 35×21 y acciones de Alumnado de 36 px.
4. **P0D / CYA-AUD-005 — ✅ CERRADO**: `release-wide-audit` integrado como gate permanente.

### Luego secuencia funcional

5. P24 — cerrar Inicio contextual.
6. P25 — corregir `expire` y cerrar Misiones/worker.
7. P26 — Calendar real.
8. P27 — automatización/delivery de notificaciones.
9. P28 — round-trip import/export.
10. P29 — Marketing/CRM/tarifas/campañas/eventos con datos y canales reales.
11. P30 — definir estadísticas con el usuario y solo entonces cerrar métricas.
12. P31 — Administración/integraciones/apariencia.
13. P32 — seguridad, rendimiento, reset/restore, producción y release final.

### Bloqueos de release que no se pueden saltar

- G1: runtime Hostinger/producción demostrado;
- Leaked Password Protection;
- CYA-AUD-007 resuelto o aceptado conscientemente antes de release;
- release-wide verde en iPhone y desktop;
- integraciones declaradas como conectadas solo si son verificables;
- restore/reset realmente probado;
- P24–P32 formalmente cerrados con evidencia.

---

## 10. Conclusión ejecutiva

CYA Hub **ya no está en un estado de arquitectura frágil generalizada**: identidad, formularios canónicos, evaluaciones, Dar clase, portal y Enseñanza tienen una base real y los checks de integridad no muestran corrupción sistémica.

P0A y P0D han eliminado el rojo contractual de navegación y han convertido la auditoría transversal en un gate permanente. P0B elimina además la contradicción entre el cierre real de P23 y el Plan Maestro, y añade un check de CI para que una rama antigua no pueda hacer retroceder silenciosamente la secuencia.

Pero **todavía no debe declararse terminado ni listo para lanzamiento**. Los riesgos vivos relevantes son ahora un conjunto acotado y verificable:

- deuda táctil iPhone CYA-AUD-007 / P0C;
- bug de expiración de misiones CYA-AUD-003 / P25;
- integraciones futuras todavía no operativas;
- gap E2E de Google Drive en CI;
- seguridad/hardening y producción pendientes del gate final.

Siguiente correctivo de auditoría: **P0C — targets táctiles críticos ≥44 px**. Después se retoma la secuencia funcional en **P24 — Inicio contextual**.
