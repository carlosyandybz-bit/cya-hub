# CYA Hub — despliegue en Hostinger

CYA Hub se despliega como una aplicación **Next.js con servidor Node.js**. Supabase sigue siendo la base de datos y sistema de autenticación; Google Drive sigue alojando la multimedia.

## Fuente de producción

- Repositorio: `carlosyandybz-bit/cya-hub`
- Rama de producción: `main`
- Runtime recomendado: Node.js 22
- Framework: Next.js
- Instalación: `npm ci` (Hostinger puede resolverla automáticamente)
- Build: `npm run build`
- Start: `npm start`
- Output estándar: `.next`

## Variables de entorno obligatorias

Configurar en Hostinger → Node.js app → Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

La publishable key de Supabase es una clave pública de baja capacidad diseñada para clientes web. **No añadir `service_role`, `sb_secret_...` ni ninguna clave administrativa al navegador o a GitHub.**

El navegador obtiene esta configuración en tiempo de ejecución desde `GET /api/runtime-config`. La ruta devuelve `503` si falta la configuración o si no tiene el formato esperado.

## Alta inicial en Hostinger

1. hPanel → Websites → Add Website.
2. Elegir **Deploy Web App**.
3. Elegir **Import Git Repository**.
4. Autorizar GitHub y seleccionar `carlosyandybz-bit/cya-hub`.
5. Seleccionar la rama `main`.
6. Confirmar Node.js 22 y Next.js.
7. Añadir las dos variables de entorno anteriores.
8. Lanzar el despliegue.
9. Verificar `/api/runtime-config`, login, Alumnado, Enseñanza, Dar clase, Marketing y Administración.

## Actualizaciones posteriores

La integración GitHub de Hostinger realiza builds y despliegues automáticos con los nuevos pushes de la rama conectada. Por tanto, una vez conectado `main`, las versiones aprobadas de CYA Hub ya no dependen de ChatGPT Sites.

## Cambio de dominio

No se debe retirar una web existente de un dominio sin copia de seguridad. Si el dominio principal ya aloja WordPress u otra web, es preferible comenzar con un subdominio dedicado, por ejemplo `app.<dominio>`, validar CYA Hub allí y cambiar el tráfico después.

## Smoke test de producción

Tras cada despliegue:

- `/` debe devolver CYA Hub.
- `/api/runtime-config` debe devolver `configured: true` sin cache.
- El login de Supabase debe mantener sesión y refrescar tokens.
- No debe haber claves secretas en HTML, JavaScript ni repositorio.
