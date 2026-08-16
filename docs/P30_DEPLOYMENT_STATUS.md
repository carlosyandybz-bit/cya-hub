# P30 — Estado de despliegue

Fecha: 2026-08-13  
Proyecto Supabase validado: `CyA hub 2` (`ldvyeyhzrepaaouzavgs`).

## Arquitectura final

P30 usa las tablas canónicas de CYA Hub y un motor de cálculo directo sobre Supabase/PostgREST protegido por las RLS existentes. La interfaz no depende de SQL libre ni de expresiones guardadas por Administración y no utiliza un almacén analítico paralelo.

La resolución del panel del profesor sigue este orden:

1. panel personal activo;
2. panel activo asignado al profesor;
3. panel activo dirigido específicamente al profesor;
4. panel global activo, priorizando el marcado como predeterminado.

## Funcionalidad implementada

### Paneles

- ámbitos global, profesor y personal;
- creación como borrador;
- nombre y descripción editables;
- publicación y archivo sin borrar historial;
- panel global predeterminado;
- asignaciones adicionales de profesores activables y reversibles;
- una asignación preferente por profesor;
- duplicación como borrador;
- previsualización con datos reales antes de publicar.

### Tarjetas

Cada tarjeta puede configurar:

- métrica;
- periodo: hoy, semana, mes, año, últimos N días o intervalo personalizado;
- filtros admitidos por la métrica;
- comparación opcional: ninguna, periodo anterior o año anterior;
- visualización como valor o tendencia;
- tamaño: pequeño, mediano, grande o ancho completo;
- posición, reordenable desde Administración;
- retirada mediante estado inactivo, sin borrar el registro.

La comparación es opt-in: `comparison_kind` tiene por defecto `none`.

### Catálogo actual

Bloques disponibles:

- Clases;
- Alumnado;
- Negocio;
- Enseñanza;
- Marketing;
- Operación.

Marketing utiliza el esquema real de `CyA hub 2`: inversión, impresiones, alcance, clics, consultas, reservas, ingresos, CTR, tasas de conversión y ROI.

BZ Points, Feedback Online y Academia Online se incorporan mediante el mismo catálogo declarativo; vídeo queda reservado para una métrica futura con decisión de producto explícita.

### Alineación de alumnado (2026-08-16)

El motor cliente ya no usa `student_since` como sustituto de captación real. `students_active` exige perfil activo y actividad cualificante; `new_students` toma la primera fecha entre clase, Feedback Online y compra de Academia Online. Esta alineación es de lectura y no requiere migración de base de datos.

## Verificaciones contra producción

Se comprobó el esquema real antes del cierre de P30:

- `classes.location_text` permite filtros reales dentro/fuera de una ubicación;
- `people` todavía no tiene localidad canónica, por lo que P30 no inventa `student_city`;
- `marketing_campaign_metrics` contiene `spend_cents`, `impressions`, `reach`, `clicks`, `inquiries`, `bookings` y `revenue_cents`;
- `communication_recipients` representa bloqueo mediante `blocked_reason`;
- los estados reales de clases, bonos, misiones, notificaciones y asignaciones coinciden con los filtros implementados.

## Seguridad P30 en Supabase

Tablas P30 existentes:

- `statistics_dashboards`;
- `statistics_dashboard_cards`;
- `statistics_settings`;
- `statistics_metric_settings`;
- `statistics_dashboard_assignments`.

Todas tienen RLS activa. `anon` no dispone de lectura. Las escrituras de configuración están restringidas a Administración mediante policies; profesores autenticados reciben únicamente la lectura necesaria para resolver y visualizar estadísticas.

La policy de asignaciones fue consolidada en `v70e6_p30_statistics_assignment_policy_consolidation` para:

- eliminar SELECT permisivos solapados;
- evitar reevaluar `auth.uid()` por fila;
- permitir UPDATE administrativo para activar/desactivar asignaciones sin borrarlas.

Tras esta corrección, los avisos de rendimiento específicos de las policies P30 desaparecieron del asesor de Supabase. Los índices P30 pueden aparecer temporalmente como `unused_index` mientras las tablas continúen vacías; se conservan porque cubren FKs y rutas de consulta reales.

El asesor de seguridad final no reporta hallazgos específicos de P30. Los avisos restantes pertenecen a módulos históricos ajenos a este paquete.

## Estado de datos iniciales

Producción conserva actualmente:

- `statistics_settings` con periodos rápidos `[7,30,90,365]`;
- sin paneles creados;
- sin tarjetas;
- sin asignaciones;
- sin overrides de métricas.

Esto es intencionado: P30 no publica datos ni paneles ficticios. Estadísticas empezará a mostrar un panel configurable cuando Administración cree, revise y publique uno.

## Migraciones P30 relevantes aplicadas

Entre las migraciones fragmentadas aplicadas en `CyA hub 2` están:

- creación y acceso de paneles y tarjetas (`v70a1`–`v70a7`);
- settings y preferencias de métricas (`v70d1`–`v70d4`);
- asignaciones y su acceso (`v70e1`–`v70e6`);
- índices de configuración;
- `v70a8_p30_card_comparison_default_none`.

El repositorio conserva además los archivos canónicos consolidados para que una instalación nueva reproduzca el estado final sin depender de la secuencia histórica de fragmentación usada durante el despliegue.

## QA

Gates obligatorios:

- contratos P30;
- regresión P19–P29;
- ESLint;
- Next.js build;
- `git diff --check`;
- Validate P21 Dar clase;
- CYA QA E2E en Chromium.

El estado definitivo del commit de cierre debe registrarse en el PR #52 una vez terminen las ejecuciones del `head` final.

## Criterio para integrar

P30 puede considerarse listo para integración cuando el `head` final tenga todos los gates anteriores en verde. El PR permanece separado de `main` hasta completar ese gate; no se debe confundir esquema desplegado con integración de frontend.
