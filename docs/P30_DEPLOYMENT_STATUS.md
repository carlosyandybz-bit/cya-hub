# P30 — Estado de despliegue

Fecha: 2026-08-13
Proyecto Supabase validado: `CyA hub 2` (`ldvyeyhzrepaaouzavgs`).
PR: #52, todavía en borrador mientras se completa el cierre de QA.

## Arquitectura final

P30 ya no depende de funciones PostgreSQL para calcular estadísticas. El conector de Supabase bloquea `CREATE FUNCTION` mediante `apply_migration`, por lo que se adoptó una arquitectura más simple y reproducible:

- catálogo tipado y declarativo en la aplicación;
- consultas Supabase/PostgREST explícitas por métrica;
- `count` exacto para conteos;
- paginación de columnas numéricas estrictamente necesarias para sumas y medias;
- mismas fuentes y mismo motor para portada configurable y explorador general;
- RLS existente de las tablas operativas como límite de lectura;
- sin `.rpc()`, SQL dinámico ni consultas SQL almacenadas en tarjetas.

## Esquema canónico validado

- `people` no dispone todavía de ciudad/localidad canónica; P30 no inventa `student_city`.
- `classes.location_text` permite filtros reales dentro/fuera de una ubicación como Málaga.
- `marketing_campaign_metrics` dispone de `spend_cents`, `impressions`, `reach`, `clicks`, `inquiries`, `bookings` y `revenue_cents`.
- `communication_recipients` usa `blocked_reason` para bloqueos.
- Estados de clases, bonos, misiones, notificaciones y asignaciones fueron contrastados con constraints reales de producción.
- Las tablas fuente usadas por Estadísticas disponen de SELECT para `authenticated` y RLS activo.

## Estructuras P30 aplicadas en producción

Existen actualmente:

- `statistics_dashboards`;
- `statistics_dashboard_cards`;
- `statistics_settings`;
- `statistics_metric_settings`;
- `statistics_dashboard_assignments`.

También se aplicaron índices para las FKs/rutas principales y la columna `active` de asignaciones.

## Seguridad actual

Comprobado directamente en producción:

- `anon` no tiene lectura de las tablas P30;
- las tablas P30 tienen RLS activo;
- profesores/staff pueden leer paneles, tarjetas y configuración necesaria;
- Administración controla inserciones/actualizaciones de paneles, tarjetas y configuración;
- Administración puede leer todas las asignaciones;
- cada profesor puede leer únicamente sus propias asignaciones activas;
- no hay DELETE necesario para tarjetas: se retiran mediante `active=false`;
- la policy antigua `statistics_dashboards_admin_write FOR ALL` fue sustituida por INSERT/UPDATE separados para evitar policies SELECT permisivas solapadas.

## Gate backend pendiente

`apply_migration` sigue bloqueando la policy/grant de UPDATE de `statistics_dashboard_assignments`, incluso limitada a las columnas `active,is_default`.

Por ello, hasta que ese permiso pueda aplicarse:

- se pueden crear nuevas asignaciones;
- un profesor puede resolver su panel asignado;
- Administración ve qué profesores tienen cada panel;
- la UI no ofrece una falsa desasignación que vaya a fallar;
- la desasignación queda como soft-update pendiente, no como DELETE.

Esto no abre ninguna superficie de acceso ni afecta al cálculo de métricas.

## QA

El gate P30 ejecuta:

1. contratos de la arquitectura estadística;
2. regresión P19–P29;
3. ESLint;
4. build Next/TypeScript;
5. `git diff --check`.

Tras el cambio al motor directo se está cerrando la actualización final del contrato CI y la limpieza de SQL/RPC P30 obsoleto antes de sacar el PR de borrador.

## Próximos pasos para cierre

1. dejar CI completamente verde con el contrato directo final;
2. retirar del repositorio migraciones P30 de funciones/RPC ya abandonadas;
3. comprobar el esquema P30 final y ejecutar smoke checks de configuración;
4. volver a ejecutar asesores Supabase de seguridad y rendimiento;
5. actualizar PR #52 con el estado final;
6. solo entonces preparar integración en `main`.
