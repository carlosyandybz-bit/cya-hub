# CYA HUB — PENDIENTES

**Estado:** ARCHIVADO como tablero operativo el 14/08/2026.

El plan P17→P32 que contenía este archivo ya fue completado e integrado en `main`; no debe seguir usándose para decidir el siguiente trabajo.

La fuente canónica de trabajo post-release es:

- `docs/CYA_HUB_POSTRELEASE_BACKLOG.md`

## Base cerrada

- P18–P32: cerrados en código y Supabase producción.
- Browser QA final: verde en profesor/alumno/admin e iPhone/escritorio.
- Backup final: 79 tablas.
- Hotfix post-P32 de reset de frases diarias y Notificaciones móviles: integrado.

## Gates externos todavía abiertos

- runtime CYA Hub en Hostinger/subdominio separado antes de mover `carlosyandy.com`;
- Supabase Auth: Leaked Password Protection, sujeto a configuración/plan compatible.

## Integraciones preparadas con activación aplazada

- **Google Calendar:** preparado en código y disponible desde `Administración → Integraciones`, pero se mantiene desconectado por decisión del administrador. La ausencia de conexión OAuth o de sincronización real **no bloquea** el funcionamiento ni el release actual de CYA Hub. Cuando se decida activarlo, la conexión deberá iniciarse desde el panel de Administración y entonces se completará la configuración OAuth externa y la certificación real de sincronización/idempotencia.

No reintroducir WordPress como backend, hamburguesa principal, amarillo fluorescente, mensajes técnicos de desarrollo en UI, almacenamiento pesado en PostgreSQL ni motores paralelos de personas/formularios/notificaciones/estadísticas.
