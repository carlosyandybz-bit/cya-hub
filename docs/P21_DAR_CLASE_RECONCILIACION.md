# P21 — DAR CLASE definitivo · reconciliación

Estado: **P21 CERRADO — producción + v49 verificadas**  
Fecha de corte: 2026-08-12  
Base de cierre: `main@8f8673c7a67bb7ac3adb7bb7bd28cb730f8e8fa3`  
Paquete anterior: **P20 cerrado**  
Siguiente paquete: **P22 — Portal del alumno**

## 1. Objetivo

P21 no reconstruye Dar clase desde cero. Consolida la implementación real, elimina duplicaciones y código heredado, revalida los correctivos adelantados y deja un único flujo rápido y coherente para clase individual y de pareja.

Reglas permanentes:

- nunca calcular duración/cobro por tiempo transcurrido;
- no fase ni temporizador obligatorio de 3 minutos;
- una clase abierta no bloquea otra;
- datos conocidos se reutilizan;
- provisional se crea dentro de Dar clase;
- evaluación principal = modelo guiado de P17;
- vídeos de clase no crean nodos/relaciones pedagógicas automáticamente.

## 2. Matriz real de auditoría

| Regla | Estado P21 | Resultado |
|---|---|---|
| Centro de clases permite varias abiertas | EXISTÍA | preservado + regresión |
| Inicio de clase no depende de Marketing | EXISTÍA | revalidado |
| `start_class` no comprueba otra clase activa | EXISTÍA backend | preservado |
| Provisional in-flow | EXISTÍA P19 | revalidado |
| Fecha/duración/estilo/rol/nivel precargados | PARCIAL | setup progresivo G7 |
| Duración manual en cierre | EXISTÍA | preservado G3 |
| Bono de pareja único | EXISTÍA | revalidado |
| Transferencia individual → pareja por minutos | EXISTÍA | revalidada |
| Regularización exacta | EXISTÍA v30/v30b | revalidada |
| Pago parcial | EXISTÍA | revalidado |
| Varios vídeos por clase | EXISTÍA | revalidado |
| Buscador 4 tipos | EXISTÍA | ampliado con categoría/relaciones y ranking contractual en v49 |
| Crear rápido hereda contexto | EXISTÍA | preservado |
| Contexto previo/última clase | EXISTÍA | compactado sin duplicar datos |
| Correcciones activas | EXISTÍA | eliminados controles duplicados |
| Explicaciones/secuencias | EXISTÍA | preservadas |
| Ejercicios | EXISTÍA | último estado por contenido preservado |
| Evaluación numérica antigua en Dar clase | LEGADO OCULTO | eliminada físicamente |
| Evaluación guiada P17 | EXISTÍA | única evaluación principal |
| Resumen pedagógico editable | EXISTÍA v45 | revalidado |
| Añadir contenido olvidado postadministrativo | EXISTÍA v45 | revalidado |
| Cierre pedagógico | EXISTÍA | gate de evaluación preservado |
| Reapertura administrativa | EXISTÍA | doble confirmación G6 + rollback preservado |
| `workflow_stage` coherente | PARCIAL | trigger + reconciliación v49 |

## 3. Hallazgos concretos del frontend resueltos

### 3.1 Evaluación heredada

`LiveSession` contenía todavía JSX/estado del tab numérico antiguo aunque P17 ya lo había retirado visualmente. P21 lo elimina físicamente y conserva exclusivamente el modelo guiado de P17.

### 3.2 Correcciones duplicadas

Se elimina el segundo juego de controles de Correcciones. La tarjeta conserva un único control compacto y el detalle queda para explicación/guía/media.

### 3.3 Ejercicios por eventos

Los ejercicios continúan modelándose con eventos de clase, mostrando el último estado por `content_id` en vez de duplicar transiciones históricas.

### 3.4 Setup

Fecha, duración y estilo conocidos se muestran como resumen editable. Rol y nivel solo preguntan cuando faltan, salvo edición voluntaria. El flujo aplica G7 y no vuelve a pedir datos ya conocidos.

## 4. Backend preservado y revalidado

- `start_class(p_class_id)` valida staff, clase, estilo, rol y nivel; no bloquea otras clases activas.
- `administratively_finish_class_v6` usa `p_duration_minutes`; no deriva duración desde `started_at`.
- `transfer_individual_credit_to_pair` acepta minutos elegidos y crea un único bono pair compartido.
- `reopen_administratively_finished_class` revierte consumos, transferencias/artefactos y datos del cierre de forma transaccional y auditada.
- `close_class_pedagogy_v2` exige cierre administrativo y publica al alumno solo contenido releasable.

## 5. P21.1 — v49 compatible

`v49_p21_class_workflow_search.sql` se aplicó sin cambiar la firma ni el shape público del RPC.

Resultado:

1. `search_class_teaching_content` busca también categoría y relaciones;
2. ranking: corrección pendiente asignada → otro contenido asignado → contenido relacionado → biblioteca lista → incompletos;
3. mantiene búsqueda para Correcciones / Explicaciones / Ejercicios / Secuencias;
4. `trg_sync_class_workflow_stage_p21` mantiene consistencia futura;
5. el backfill solo toca estados inequívocos.

### Preflight de producción

- proyecto: `CyA hub 2` (`ldvyeyhzrepaaouzavgs`) `ACTIVE_HEALTHY`;
- todas las tablas y columnas requeridas presentes;
- firma previa del RPC idéntica a la esperada;
- 27 clases existentes;
- 0 `closed` incoherentes;
- 2 `finished + administrative` pendientes de reconciliar;
- 0 `active` incoherentes.

### Cutover

- migración aplicada: `v49_p21_class_workflow_search`;
- ledger Supabase: **`20260812020727`**;
- reconciliación posterior: **0 / 0 / 0 incoherencias** en closed/administrative/live;
- las 2 clases previstas quedaron reconciliadas a `workflow_stage='administrative'`;
- trigger `trg_sync_class_workflow_stage_p21` verificado.

### Permisos post-cutover

- `anon` no ejecuta `search_class_teaching_content`;
- `authenticated` sí ejecuta el RPC público;
- `anon` y `authenticated` no ejecutan `private.sync_class_workflow_stage_p21()`;
- llamada sin sesión al buscador rechazada correctamente con SQLSTATE `42501`.

## 6. P21.2 — limpieza física completada

- retirado el tab numérico `Evaluar` de `LiveSession`;
- preservado exclusivamente el flujo guiado de P17;
- retirado el refresco global cada 15 s; Realtime queda como vía principal y `loadLive()` como fallback discreto;
- eliminado el segundo juego duplicado de controles de Correcciones;
- efectos React modificados durante P21 corregidos sin desactivar reglas.

## 7. P21.3 — setup progresivo real G7

- fecha, duración y estilo conocidos se muestran compactos y no como preguntas obligatorias;
- rol y nivel solo muestran selector si falta alguno, salvo `Editar datos`;
- el bono previsto sigue siendo opcional y puede decidirse al terminar;
- la creación manual reutiliza contexto canónico;
- `Editar datos` permite cambiar voluntariamente valores heredados.

## 8. P21.4 — protección de reapertura G6

- la reapertura conserva la RPC transaccional existente;
- exige dos confirmaciones antes de ejecutar;
- ambas identifican fecha/alumnado de la clase;
- la segunda advierte que se revierten los movimientos financieros del cierre.

## 9. QA y despliegue

Workflow: `Validate P21 Dar clase`, run **31554904287**.

Resultado completo:

- `npm ci`: success;
- **P21 complete regression gate**: success;
- **Lint complete application**: success;
- **Production build**: success;
- **Reject whitespace errors**: success.

El commit funcional P21 quedó en `c9341750ff337c6deb24345e04e975c88f4f3bfb`.

Para forzar Hostinger sin cambiar código se creó el commit no-op:

`8f8673c7a67bb7ac3adb7bb7bd28cb730f8e8fa3` — `chore: force Hostinger redeploy of P21`.

Hostinger mostró `app.carlosyandy.com` como **Actual / Se ha completado**, rama `main`, sobre `8f8673c7`, estructura Next.js y Node 22.x. El commit no-op tiene **0 archivos diferentes** respecto al commit funcional P21, por lo que producción sirve el mismo árbol validado.

## 10. Advisors después de v49

No apareció un hallazgo nuevo específico de v49 que obligue a rollback.

Permanecen deudas globales ya conocidas para P32:

- Leaked Password Protection desactivado;
- varias RPC `SECURITY DEFINER` expuestas deliberadamente a `authenticated` con guards internos, a reauditar;
- `pg_net` en `public`;
- FKs sin índice y policies permisivas múltiples;
- índices aún marcados como no usados.

No se eliminan índices automáticamente por Advisor `unused`.

## 11. Cierre

**P21 queda CERRADO.**

Evidencia de cierre:

- frontend P21 validado por CI;
- Hostinger redeploy completado sobre el árbol P21;
- v49 aplicada en producción;
- ledger verificado;
- trigger y permisos verificados;
- 27 clases coherentes tras reconciliación;
- acceso no autenticado al RPC bloqueado;
- sin hallazgo Advisor nuevo atribuible a v49 que exija rollback.

Siguiente paquete operativo: **P22 — Portal del alumno**.
