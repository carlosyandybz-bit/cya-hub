# CYA Hub — flujo Staging → Producción

## Objetivo

Permitir continuar desarrollando CYA Hub sin interrumpir a los usuarios que ya trabajan en producción y sin sustituir, resetear ni perder datos reales.

## Entornos

### Producción

- Rama GitHub: `main`
- Base de datos: Supabase `CyA hub 2`
- Contiene datos reales.
- Nunca se reemplaza con una copia de staging.
- Nunca se ejecuta `db reset`, reseeding destructivo ni recreación completa de tablas contra producción.

### Staging

- Rama GitHub: `staging`
- Base de datos: proyecto/rama Supabase independiente.
- Datos de prueba exclusivamente.
- Puede recibir cambios incompletos o experimentales.
- Debe usar sus propias variables de entorno, Auth, Storage y credenciales públicas de Supabase.

## Regla de promoción

El código avanza en una sola dirección:

`feature/*` → `staging` → validación → `main` → producción

Los datos no avanzan de staging a producción.

## Datos de producción

Los alumnos, clases, bonos, evaluaciones, correcciones, CRM y demás información persistente permanecen en Supabase producción al actualizar el código.

Una actualización del frontend/backend no debe recrear la base de datos.

## Cambios de esquema

Todo cambio de esquema debe realizarse mediante migraciones incrementales y versionadas.

Flujo obligatorio:

1. Crear la migración.
2. Aplicarla primero en staging.
3. Ejecutar QA funcional y de seguridad.
4. Verificar compatibilidad con datos preexistentes.
5. Preparar backup/punto de recuperación cuando el cambio sea relevante.
6. Aplicarla en producción.
7. Ejecutar smoke test de producción.

### Prohibido en producción

- `DROP TABLE` sin plan explícito de migración de datos.
- `TRUNCATE` de tablas con datos reales.
- `supabase db reset`.
- importar automáticamente un dump de staging sobre producción.
- ejecutar seeds que borren o reemplacen información real.
- introducir `service_role` o `sb_secret_*` en el cliente web.

## Variables de entorno

Staging y producción deben tener juegos de variables independientes.

Como mínimo:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SENTRY_ENVIRONMENT`
- secretos Google Drive/Calendar cuando se prueben dichas integraciones
- `CYA_SERVER_SECRET`

Los secretos nunca se almacenan en GitHub.

## Sentry

Usar entornos diferenciados:

- `SENTRY_ENVIRONMENT=staging`
- `SENTRY_ENVIRONMENT=production`

Así los errores de QA no contaminan el diagnóstico de producción.

## Despliegue

Producción continúa conectada a `main`.

Staging debe desplegarse como una segunda aplicación web/subdominio conectado exclusivamente a la rama `staging` y a Supabase staging.

Nunca apuntar la aplicación staging a Supabase producción para pruebas destructivas.

## Política mientras producción sigue en desarrollo

Mientras finalizan los cambios actualmente abiertos en `main`:

- no se cambia la rama de producción;
- no se modifica la conexión actual de Hostinger;
- `staging` puede prepararse en paralelo;
- cuando `main` alcance el siguiente punto estable, se sincroniza `staging` con ese estado antes de comenzar el nuevo ciclo de desarrollo.

## Publicación de una versión

Antes de promover `staging` a `main`:

- build correcto;
- tests automáticos correctos;
- QA de login, Inicio, Alumnado, Dar clase, Enseñanza, Marketing y Administración;
- comprobación de RLS y permisos si hubo cambios de Supabase;
- smoke test en iPhone;
- migraciones probadas sobre staging;
- ningún secreto expuesto;
- plan de reversión definido para cambios relevantes.

## Principio de seguridad de datos

**Se promociona código, nunca se sustituye la base de datos de producción.**
