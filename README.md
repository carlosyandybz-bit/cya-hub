# CYA Hub

Aplicación web privada de Carlos & Andy para alumnado, clases, enseñanza, marketing y administración.

## Arquitectura de producción

CYA Hub funciona como una aplicación **Next.js estándar sobre Node.js** y está preparada para desplegarse desde GitHub en Hostinger.

- Aplicación: Next.js + React
- Autenticación y datos: Supabase
- Multimedia: Google Drive mediante referencias/IDs; los archivos no se guardan en GitHub ni en la base de datos
- Código: GitHub, rama de producción `main`
- Hosting objetivo: Hostinger con despliegue desde GitHub

El navegador obtiene únicamente la configuración pública de Supabase desde `GET /api/runtime-config`. Nunca deben exponerse claves `service_role`, `sb_secret_...` ni otras credenciales administrativas.

Las variables de entorno necesarias son:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

## Desarrollo y validación

Requiere Node.js 22 o compatible con el rango declarado en `package.json`.

```bash
npm ci
npm run dev
npm run lint
npm run build
npm test
npm start
```

Los comandos de producción son deliberadamente estándar:

- `npm run build` → `next build`
- `npm start` → `next start`

Esto evita que producción dependa de ChatGPT Sites, Vinext, Wrangler o un Worker de Cloudflare.

## Despliegue en Hostinger

La guía operativa está en [`HOSTINGER_DEPLOY.md`](./HOSTINGER_DEPLOY.md).

La configuración prevista es:

1. Importar `carlosyandybz-bit/cya-hub` desde GitHub.
2. Usar la rama `main`.
3. Seleccionar Node.js 22 y Next.js.
4. Añadir las variables públicas de Supabase.
5. Construir con `npm run build` y arrancar con `npm start`.
6. Mantener habilitado el despliegue automático de la rama conectada.

Antes de sustituir una web existente en un dominio principal, validar CYA Hub en un subdominio dedicado.

## Esquema y migraciones de Supabase

La cronología aplicada **no debe inferirse únicamente por los archivos de `supabase/`**.

La referencia canónica es [`docs/DATABASE_MIGRATION_BASELINE.md`](./docs/DATABASE_MIGRATION_BASELINE.md), contrastada el 11/08/2026 directamente con `supabase_migrations.schema_migrations` de producción.

Estado documentado en ese corte:

- **52 migraciones registradas** en producción.
- Primera registrada: `20260808214303 / teaching_module`.
- Última registrada: `20260811124729 / v42_rls_student_class_correlation`.
- **18 migraciones aplicadas** aún no tienen archivo SQL independiente equivalente en el repositorio, aunque sus sentencias se conservan en el registro de producción y son recuperables.
- `foundation.sql`, `classes-and-credits.sql`, `live-class.sql` y `marketing-crm.sql` son fuentes de bootstrap/pre-registro.
- `v35c-enforce-post-class-evaluation.sql` existe en GitHub pero no figura aplicada.
- `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` está explícitamente preparada/no aplicada y tampoco figura en el registro.

**Regla:** presencia de archivo SQL ≠ evidencia de aplicación. La fuente de verdad del estado aplicado es producción.

## Reglas de datos y seguridad

- Supabase es la fuente de verdad de personas, clases, bonos, enseñanza, CRM, roles y configuración.
- Google Drive es la fuente de verdad de fotos y vídeos; Supabase guarda solo identificadores y metadatos relacionados.
- No almacenar secretos en GitHub.
- La publishable key de Supabase puede utilizarse en el cliente; la seguridad real depende de Auth, RLS y permisos de base de datos.
- Las páginas de la aplicación y `/api/runtime-config` evitan cachear configuración sensible al despliegue para no reutilizar una versión obsoleta después de una actualización.

## Documentación operativa

- [`docs/CYA_HUB_SECUENCIA_MAESTRA.md`](./docs/CYA_HUB_SECUENCIA_MAESTRA.md): historial y decisiones consolidadas.
- [`docs/CYA_HUB_PENDIENTES.md`](./docs/CYA_HUB_PENDIENTES.md): tablero vivo de pendientes.
- [`docs/DATABASE_MIGRATION_BASELINE.md`](./docs/DATABASE_MIGRATION_BASELINE.md): estado real de migraciones Supabase.
- [`HOSTINGER_DEPLOY.md`](./HOSTINGER_DEPLOY.md): despliegue y smoke test Hostinger.

## PWA

CYA Hub mantiene `manifest.webmanifest`, iconos y modo `standalone` para poder añadirse a la pantalla de inicio del iPhone como aplicación web.
