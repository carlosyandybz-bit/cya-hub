# CYA HUB — AUDITORÍA VIVA DE LANZAMIENTO

Fecha de corte: **2026-08-13**
Repositorio: `carlosyandybz-bit/cya-hub`  
Base funcional actual auditada: `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f` + Supabase `CyA hub 2` (`ldvyeyhzrepaaouzavgs`)
Auditoría transversal integrada: PR **#32 — P0 audit: add release-wide Playwright coverage**  
Control documental P0B: `CYA_HUB_PLAN_MAESTRO_CIERRE.md` + `P23_ENSENANZA_RELACIONES_ARBOLES.md` + `tests/documentation-consistency.test.mjs`  
Estado: **AUDITORÍA VIVA — P24 cerrado; P25 — Misiones es la siguiente propuesta pendiente de aprobación; todavía existen gates antes del release**

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
- la transición canónica vigente es **P24 cerrado → P25 siguiente / pendiente de aprobación**;
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

### Resultado actual post-P24 en `main`

Workflow `CYA QA E2E`, run **31652169267**, ejecutado sobre `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`:

- bootstrap QA OIDC → Supabase: **OK**;
- gate documental: **2/2**;
- lint: **0 errores / 25 warnings no bloqueantes**;
- build Next.js: **OK**;
- servidor local: **OK**;
- Playwright total: **36/36 passed**;
- targets táctiles auditados por debajo de 44 px en iPhone: **0**;
- ciclo Profesor → Alumno → Administrador: **OK**;
- artifacts: **OK**, artifact `9163051155`.

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
| **CYA-AUD-001** | Proceso / documentación | Alta | **RESUELTO — P0B / transición P24** | `P24_INICIO_CONTEXTUAL.md` declara P24 cerrado y P25 siguiente; el Plan Maestro v4.3 queda canonizado a `P24 / v58–v59` cerrado y `P25 — Misiones` pendiente de aprobación. `tests/documentation-consistency.test.mjs` protege la transición y el workflow `CYA QA E2E` lo ejecuta antes del navegador. | Mantener el gate y actualizarlo deliberadamente en cada cierre secuencial. |
| **CYA-AUD-002** | Formularios | — | **CERRADO / RECLASIFICADO** | La auditoría anterior asumía que una versión publicada debía tener `status='published'`. El contrato real usa `form_versions.status='active'`; `publish_form_version` y `form_runtime` son coherentes con ese contrato. | Corregir texto histórico; no tocar runtime. |
| **CYA-AUD-003** | Misiones | Media | **ABIERTO — BUG CONFIRMADO** | Corte 13/08: 3 misiones vencidas de `daily.review_information` con `failure_behavior='expire'` siguen `available`; además existe 1 `daily.complete_internal_content` vencida con `failure_behavior='repeat'` aún `available`. `refresh_missions()` solo implementa la transición vencida `mark_not_done`. | P25 debe definir `expire` y `repeat`, automatización server-side y backfill seguro sin borrar historial. |
| **CYA-AUD-004** | Enseñanza / visibilidad | Baja | **ABIERTO** | Contenidos archivados/inactivos `Pinball` y `Cadera contraria` conservan `visibility='student'`. No se exponen ahora por `active=false`, pero el estado es semánticamente ambiguo. | Definir/normalizar invariante de archivado y visibilidad. Correctivo Enseñanza/P32. |
| **CYA-AUD-005** | QA integral | Alta | **RESUELTO — P0D** | `release-wide-audit` está integrado en `main` mediante PR #32 y recorre superficies Profesor/Alumno/Admin. | Mantenerlo como gate permanente y ampliarlo en P32 para destructivas/integraciones. |
| **CYA-AUD-006** | QA release-wide | — | **EJECUTADO — 36/36** | Run post-merge P24 `31652169267`: documentación 2/2 + Playwright 36/36, iPhone + desktop, ciclo Profesor→Alumno→Admin, frontera 31/30, saludo Madrid, frase estable tras reload y Administración de frases; artifact `9163051155`. | Mantener como gate real tras cada paquete relevante y en P32. |
| **CYA-AUD-007** | Responsive / iPhone | Media | **RESUELTO — P0C** | PR #34 + merge `c253ff5135e7955c69d152038434c96cc70777f8`; `p0c-touch-targets.css` eleva el área efectiva auditada a ≥44 px manteniendo switches visualmente compactos. Run main `31592129261`: 26/26 y `touchTargetsUnder44=0` en todas las superficies iPhone auditadas. | Mantener `mobile-touch-targets.spec.ts` como gate permanente y reauditar componentes nuevos/modificados. |
| **CYA-AUD-008** | Navegación / Dar clase | Media | **RESUELTO — P0A** | PR #32: `.mobile-nav` ya no se oculta por `view === 'live'`; se oculta únicamente con clase seleccionada realmente `status='active'` + `workflow_stage='live'`. Centro y preparación mantienen cinco accesos; clase activa oculta chrome; cierre lo restaura. Run `31583225189` verde. | Mantener `class-center-navigation.spec.ts` + lifecycle E2E como regresión permanente. |
| **CYA-AUD-009** | Seguridad | Media | **ABIERTO — HARDENING** | Advisor avisa de RPC `SECURITY DEFINER` ejecutables por `authenticated`. Las RPC sensibles de formularios/reset inspeccionadas contienen guards `private.is_admin()` y `anon` no puede ejecutarlas; no se observó escalada. Leaked Password Protection sigue desactivado. `pg_net` está en `public`. | Reducir superficie EXECUTE/SECURITY DEFINER, revisar policies, activar leaked password protection y endurecer extensiones antes de release. P32. |
| **CYA-AUD-010** | Rendimiento / DB | Baja–Media | **ABIERTO** | Advisor muestra varias FK sin índice, policies permisivas múltiples e índice duplicado de posición de secuencias en `teaching_content_relations`. | Indexar según carga real; eliminar solo duplicados confirmados; consolidar policies sin romper RLS. P32. |
| **CYA-AUD-011** | Producción / G1 | Alta | **BLOQUEO DE CERTIFICACIÓN** | El Plan conserva evidencias G1 históricas P17–P23, pero esta auditoría todavía no constituye certificación final del commit que servirá Hostinger en release. | Obtener evidencia actual de Hostinger + `/api/build-info`/runtime antes de un cutover incompatible o del release final. G1/P32. |
| **CYA-AUD-012** | Drive / QA | Media | **ABIERTO COMO GAP QA** | `integration_settings.google_drive='configured'`, pero el runner de GitHub no tiene secretos server-side de Drive y por ello no puede probar `media-ticket` end-to-end. | Crear prueba segura de Drive con secrets/env de QA o entorno staging; no copiar credenciales de producción al repositorio. P31/P32. |
| **CYA-AUD-013** | Dar clase / Evaluaciones | Alta | **RESUELTO — P0E/v53** | Los gates globales fueron retirados. `ContextEvaluationPanel` vive en Dar clase y perfil. Baseline = primera evaluación completa válida, independientemente de `evaluation_kind`; la primera sesión QA válida fue `class` y se convirtió en baseline. La revisión post-clase queda acotada a ESA clase. PR #36 y run post-merge `31610773094` verdes 26/26. | Mantener P17/P0E y lifecycle E2E como regresión permanente; reauditar en P32. |

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

P0A/P0B/P0C/P0D no exigieron migración funcional. P0E aplicó v53 de forma incremental, sin borrar históricos ni añadir tablas.

---

## 5. Matriz funcional — diseñado → implementado → estado real

| Función / dominio | Estado | Origen / evidencia | Qué falta / acción |
|---|---|---|---|
| Identidad única + multirol + `Ver como` | **EXISTE / CERRADO** | P18–P19; roles server-side; QA profesor/alumno/admin | Reauditar seguridad global en P32. |
| Personas / Alumnado canónico | **EXISTE / CERRADO BASE** | P19–P22; `people`, profiles, clases/bonos integrados | P0C cerró los targets táctiles auditados; mantener el gate y revalidar globalmente en P32. |
| Formularios versionados + datos canónicos | **EXISTE / CERRADO** | P20; runtime y publicación coherentes | Solo hardening RPC P32. CYA-AUD-002 cerrado. |
| Evaluaciones guiadas | **EXISTE / CERRADO + P0E** | P17 + v53; evaluación contextual; baseline derivada; E2E post-clase | CYA-AUD-013 cerrado. Mantener P17/P0E como regresión permanente y reauditar en P32. |
| Dar clase | **EXISTE / VALIDADO + P0E** | P21 + P0A + v53; E2E completo profesor→alumno→admin; Centro móvil y Evaluación contextual protegidos | Mantener regresión; ninguna evaluación global puede bloquear otra superficie o clase. |
| Bonos / consumo de minutos | **EXISTE / VALIDADO** | E2E verificó consumo exacto y cierres; integridad sin saldos negativos | Ampliar escenarios pareja/regularización en P32. |
| Portal del alumno | **EXISTE / CERRADO** | P22 + v52; release-wide sin page/network errors | Reauditar contenido real y multimedia Drive en P32. |
| Enseñanza + relaciones + 8 árboles | **EXISTE / P23 CERRADO** | `P23_ENSENANZA_RELACIONES_ARBOLES.md`; backend/frontend P23; release-wide | Normalizar archivados CYA-AUD-004 y cubrir Drive E2E CYA-AUD-012. |
| Inicio contextual | **EXISTE / P24 CERRADO** | v58/v59 + PR #41/#42 + Browser QA 36/36 | Mantener regresión; P25 modifica Misiones, no la prioridad P24. |
| Frases diarias | **EXISTE / P24 CERRADO** | 15 frases preservadas + `daily_quote_assignments`; Admin General + CSV/preview/fecha/recurrencia | Mantener integridad usuario+fecha, snapshots y privilegios v59. |
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
- **25 warnings**.

Principalmente:

- `<img>` que podría pasar a `next/image`;
- imports/variables no usados;
- dependencias de `useMemo` que conviene estabilizar.

No bloquea el producto, pero debe limpiarse progresivamente para que warnings nuevos vuelvan a ser señal útil.

---

## 9. Orden recomendado de actuación

### P0 — antes de continuar paquetes

1. **P0A / CYA-AUD-008 — ✅ CERRADO**: navegación móvil del Centro `Dar clase` corregida.
2. **P0B / CYA-AUD-001 — ✅ CERRADO**: gate documental actualizado deliberadamente a P24 cerrado → P25 siguiente.
3. **P0C / CYA-AUD-007 — ✅ CERRADO**: targets táctiles auditados ≥44 px + gate permanente.
4. **P0D / CYA-AUD-005 — ✅ CERRADO**: `release-wide-audit` integrado como gate permanente.
5. **P0E / CYA-AUD-013 — ✅ CERRADO**: evaluación contextual opcional, baseline derivada y gates globales eliminados; v53 + PR #36.

### Luego secuencia funcional

6. **P24 — ✅ CERRADO**: Inicio contextual, v58/v59, PR #41/#42 y Browser QA 36/36.
7. **P25 — SIGUIENTE / PENDIENTE DE APROBACIÓN**: definir `expire`/`repeat` y cerrar Misiones/worker.
8. P26 — Calendar real.
9. P27 — automatización/delivery de notificaciones.
10. P28 — round-trip import/export.
11. P29 — Marketing/CRM/tarifas/campañas/eventos con datos y canales reales.
12. P30 — definir estadísticas con el usuario y solo entonces cerrar métricas.
13. P31 — Administración/integraciones/apariencia.
14. P32 — seguridad, rendimiento, reset/restore, producción y release final.

### Bloqueos de release que no se pueden saltar

- G1: runtime Hostinger/producción demostrado;
- Leaked Password Protection;
- CYA-AUD-007 y CYA-AUD-013 cerrados; mantener sus gates hasta release;
- release-wide verde en iPhone y desktop;
- integraciones declaradas como conectadas solo si son verificables;
- restore/reset realmente probado;
- P25–P32 formalmente cerrados con evidencia.

---

## 10. Conclusión ejecutiva

CYA Hub **ya no está en un estado de arquitectura frágil generalizada**: identidad, formularios canónicos, evaluaciones, Dar clase, portal y Enseñanza tienen una base real y los checks de integridad no muestran corrupción sistémica.

P0A–P0E han cerrado los correctivos prioritarios de auditoría: navegación móvil, consistencia documental, targets táctiles, auditoría transversal y evaluación contextual/baseline derivada. Todos permanecen protegidos por gates automáticos.

Pero **todavía no debe declararse terminado ni listo para lanzamiento**. Los riesgos vivos relevantes son ahora un conjunto acotado y verificable:

- bug de expiración de misiones CYA-AUD-003 / P25;
- integraciones futuras todavía no operativas;
- gap E2E de Google Drive en CI;
- seguridad/hardening y producción pendientes del gate final.

P24 está cerrado y protegido por QA. La siguiente propuesta es **P25 — Misiones**, todavía pendiente de aprobación expresa.
