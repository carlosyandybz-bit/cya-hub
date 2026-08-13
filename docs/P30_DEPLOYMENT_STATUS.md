# P30 — Estado de despliegue

Fecha: 2026-08-13
Proyecto Supabase validado: `CyA hub 2` (`ldvyeyhzrepaaouzavgs`).

## Verificaciones completadas

- El esquema canónico de producción fue contrastado antes de desplegar P30.
- `people` todavía no dispone de ciudad/localidad canónica; por tanto P30 no inventa `student_city`.
- `classes.location_text` permite filtros reales dentro/fuera de una ubicación como Málaga.
- `marketing_campaign_metrics` dispone de `spend_cents`, `impressions`, `reach`, `clicks`, `inquiries`, `bookings` y `revenue_cents`.
- `communication_recipients` usa `blocked_reason`; no existe el estado `blocked`.
- Los checks reales de estados de clases, bonos, misiones, notificaciones y asignaciones fueron contrastados con los filtros P30.
- CI P30 incluye contratos, regresión P19–P29, lint, build y whitespace.

## Migraciones aplicadas en producción

1. `v70a1_p30_statistics_dashboards`
   - Crea `statistics_dashboards`.
   - Índice por scope/usuario/estado.
   - RLS activado.
   - Policies de lectura staff y escritura admin.
2. `v70a2_p30_statistics_dashboard_cards_table`
   - Crea `statistics_dashboard_cards`.

## Estado de seguridad de las dos tablas

Comprobación directa posterior:

- `statistics_dashboards`: RLS activo.
- `statistics_dashboard_cards`: RLS todavía no activo.
- `anon`: sin SELECT sobre ambas.
- `authenticated`: sin SELECT/INSERT sobre ambas.

Por tanto la segunda tabla no queda expuesta aunque el gate de acceso todavía esté pendiente.

## Gate pendiente

El conector de Supabase está rechazando antes de PostgreSQL las llamadas que contienen `CREATE FUNCTION`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY` o cambios equivalentes de acceso, con el mensaje de que no puede determinar el estado de seguridad de la solicitud.

No se usará `execute_sql` para saltar este bloqueo: los cambios DDL deben seguir pasando por `apply_migration`.

Hasta resolver este gate:

- no se considera P30 desplegado;
- no se mergea el PR a `main`;
- no se conceden grants sobre `statistics_dashboard_cards`;
- las estadísticas configurables continúan cerradas en la rama y validadas por CI.

## Próximo paso de despliegue

Cuando `apply_migration` permita las operaciones de seguridad/funciones:

1. cerrar RLS/policies/grants explícitos de las tablas P30;
2. aplicar helpers y RPCs de periodos/métricas;
3. aplicar settings y asignaciones;
4. crear panel inicial editable;
5. smoke tests de cada métrica y filtros;
6. ejecutar asesores Supabase de seguridad y rendimiento;
7. actualizar PR #52 y solo entonces preparar integración en `main`.
