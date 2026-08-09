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
3. Seleccionar Node.js 22 / Next.js.
4. Añadir las variables públicas de Supabase.
5. Construir con `npm run build` y arrancar con `npm start`.
6. Mantener habilitado el despliegue automático de la rama conectada.

Antes de sustituir una web existente en un dominio principal, validar CYA Hub en un subdominio dedicado.

## Esquema de Supabase

Los SQL de `supabase/` documentan el esquema aplicado en producción. La cadena histórica de reconstrucción disponible en el repositorio es:

1. `foundation.sql`
2. `classes-and-credits.sql`
3. `live-class.sql`
4. `teaching.sql`
5. `teaching-measurement-adjustment-fix.sql`
6. `marketing-crm.sql`
7. `communications-outbox.sql`
8. `communications-creator-indexes.sql`
9. `v7-security-portal-media.sql`
10. `v7-portal-projection-hardening.sql`
11. `v7-communications-trigger-fix.sql`
12. `v12-portal-media.sql`

> Nota: la cadena SQL histórica todavía debe consolidarse para reflejar íntegramente las ampliaciones posteriores de administración, identidad, misiones y configuración. No usar esta lista como sustituto de una copia de seguridad de producción.

## Reglas de datos y seguridad

- Supabase es la fuente de verdad de personas, clases, bonos, enseñanza, CRM, roles y configuración.
- Google Drive es la fuente de verdad de fotos y vídeos; Supabase guarda solo identificadores y metadatos relacionados.
- No almacenar secretos en GitHub.
- La publishable key de Supabase puede utilizarse en el cliente; la seguridad real depende de Auth, RLS y permisos de base de datos.
- Las páginas de la aplicación y `/api/runtime-config` evitan cachear configuración sensible al despliegue para no reutilizar una versión obsoleta después de una actualización.

## PWA

CYA Hub mantiene `manifest.webmanifest`, iconos y modo `standalone` para poder añadirse a la pantalla de inicio del iPhone como aplicación web.
