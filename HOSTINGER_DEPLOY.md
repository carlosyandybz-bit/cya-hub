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

## Google Calendar — requisitos obligatorios para habilitar la conexión

Google Calendar no queda operativo solo con las variables públicas de Supabase. Antes de declarar la integración disponible en producción, el runtime de Hostinger debe disponer también de:

```text
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
CYA_SERVER_SECRET=
```

`GOOGLE_CALENDAR_CLIENT_ID` y `GOOGLE_CALENDAR_CLIENT_SECRET` pueden omitirse únicamente cuando el runtime ya tiene `GOOGLE_DRIVE_CLIENT_ID` y `GOOGLE_DRIVE_CLIENT_SECRET`, porque Calendar reutiliza ese mismo cliente OAuth como fallback. `CYA_SERVER_SECRET` sigue siendo obligatorio y debe ser un secreto estable y aleatorio del servidor; se usa para cifrar el refresh token de Calendar y nunca debe exponerse como `NEXT_PUBLIC_*` ni almacenarse en GitHub.

Opcionalmente puede fijarse:

```text
GOOGLE_CALENDAR_REDIRECT_URI=https://<dominio-real-de-cya-hub>/api/google-calendar/callback
```

Si se deja vacío, CYA Hub deriva el callback del origen real de la petición. En ambos casos, **la URL exacta de callback debe figurar como Authorized redirect URI en el cliente OAuth de Google**. Un dominio, protocolo, puerto o ruta distintos provocan rechazo OAuth aunque el código de CYA Hub sea correcto.

La cuenta OAuth real no se considera certificada hasta completar desde el runtime productivo estas comprobaciones:

1. `GET /api/google-calendar/status` autenticado devuelve `configured: true` y ninguna precondición pendiente.
2. «Conectar Google Calendar» abre Google con el dominio productivo correcto.
3. Google vuelve a `/api/google-calendar/callback` sin `redirect_uri_mismatch`, `access_denied` ni error de consentimiento.
4. CYA Hub crea una fila `calendar_connections` con estado `connected` y credencial cifrada `enc:v1:*`; nunca debe guardarse un refresh token en texto plano.
5. «Sincronizar ahora» termina sin error y actualiza `last_synced_at`.
6. Una segunda sincronización no duplica eventos y conserva CYA como fuente de verdad para clases, misiones y eventos propios.

No marcar Google Calendar como listo basándose únicamente en build, tests contractuales o Browser QA local: esos gates no sustituyen la autorización OAuth real del dominio desplegado.

## Alta inicial en Hostinger

1. hPanel → Websites → Add Website.
2. Elegir **Deploy Web App**.
3. Elegir **Import Git Repository**.
4. Autorizar GitHub y seleccionar `carlosyandybz-bit/cya-hub`.
5. Seleccionar la rama `main`.
6. Confirmar Node.js 22 y Next.js.
7. Añadir las variables de entorno públicas de Supabase y, si se habilita Google Calendar, completar también los requisitos OAuth descritos arriba.
8. Lanzar el despliegue.
9. Verificar `/api/runtime-config`, login, Alumnado, Enseñanza, Dar clase, Marketing y Administración.
10. Si Google Calendar está habilitado, ejecutar además la certificación OAuth real de seis pasos anterior.

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
- Si Google Calendar está habilitado, `/api/google-calendar/status` autenticado debe devolver `configured: true` y la conexión OAuth real debe estar certificada antes de declarar la integración operativa.
