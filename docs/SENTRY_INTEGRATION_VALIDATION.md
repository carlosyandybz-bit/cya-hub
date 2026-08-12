# Validación de integración Sentry

Validación ejecutada en rama `sentry-nextjs-integration` antes de integrar en `main`:

- instalación reproducible con `npm ci`: correcta;
- lint estricto de `instrumentation.ts`, `instrumentation-client.ts` y `next.config.ts`: correcto;
- `npm test` (build Next.js + pruebas HTML renderizadas): correcto;
- el lint global conserva un backlog previo en componentes no modificados por esta integración y se registró como diagnóstico no bloqueante para este cambio.

La validación automática se ejecutó antes de retirar el workflow temporal de la rama.
