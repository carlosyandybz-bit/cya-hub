# Sentry en CYA Hub

CYA Hub utiliza Sentry para capturar errores de navegador y del runtime de Next.js en producción.

## Runtime

- SDK: `@sentry/nextjs`.
- Cliente: `instrumentation-client.ts`.
- Servidor/Edge: `instrumentation.ts`.
- El DSN público puede configurarse con `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`; existe un fallback al DSN público actual para que la captura de errores no dependa de una variable secreta.
- `sendDefaultPii` está desactivado.
- Muestreo de trazas: `0.1`.

## Build y source maps

El wrapper `withSentryConfig` solo se activa cuando el entorno de build contiene `SENTRY_AUTH_TOKEN`. El token es secreto y nunca debe exponerse como variable `NEXT_PUBLIC_*` ni guardarse en GitHub.

Variables opcionales/recomendadas en Hostinger:

```text
SENTRY_AUTH_TOKEN=<secret>
SENTRY_ORG=cya-de
SENTRY_PROJECT=organization-slug
SENTRY_ENVIRONMENT=production
```

El runtime de captura de errores funciona aunque `SENTRY_AUTH_TOKEN` no esté configurado en Hostinger; el token se usa para integración de build/source maps.

## Supabase y consulta de incidencias

Supabase `CyA hub 2` mantiene un puente de solo lectura desde la API de Sentry y sincroniza organización, proyecto e incidencias no resueltas cada 15 minutos. Las credenciales de API se mantienen fuera del navegador mediante Edge Function Secrets y Vault.

## Validación previa a producción

Antes de integrar en `main` se validó en una rama aislada:

- instalación reproducible con `npm ci`;
- lint estricto de `instrumentation.ts`, `instrumentation-client.ts` y `next.config.ts`;
- `npm test`, que ejecuta el build completo de Next.js y las pruebas de HTML renderizado.

Las tres comprobaciones finalizaron correctamente. El lint global conserva un backlog previo en componentes no modificados por esta integración; se comprobó de forma separada para no atribuir esos errores existentes a Sentry.
