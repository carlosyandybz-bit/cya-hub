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

## Decisión posterior — 18/08/2026

La decisión anterior de mantener Google Calendar desconectado queda superada por instrucción expresa del administrador.

- **Google Calendar:** activar e integrar directamente sobre `main`, conservando la arquitectura OAuth y sincronización existente. La conexión real debe iniciarse desde `Administración → Integraciones` cuando el runtime tenga las credenciales externas necesarias.
- **WhatsApp Business:** integrar directamente sobre `main` mediante WhatsApp Cloud API. Mantener los secretos exclusivamente en servidor, validar permisos/contacto antes de cada envío y conservar el envío manual como fallback mientras se completa o valida la configuración externa de Meta.
- Esta autorización directa a `main` aplica específicamente a estas integraciones; no cambia por sí sola la política del resto del desarrollo.
- No aplicar nuevas migraciones de producción ni cambios destructivos de datos sin autorización específica.

No reintroducir WordPress como backend, hamburguesa principal, amarillo fluorescente, mensajes técnicos de desarrollo en UI, almacenamiento pesado en PostgreSQL ni motores paralelos de personas/formularios/notificaciones/estadísticas.
