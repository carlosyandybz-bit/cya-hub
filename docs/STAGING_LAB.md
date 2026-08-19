# CYA Hub — Staging Design Lab

## Estado

`STAGING_ONLY` — infraestructura exclusiva de desarrollo. No forma parte del producto promocionable.

## Frontera arquitectónica

### PRODUCTO

Puede promocionarse de forma selectiva cuando haya sido aprobado:

- design tokens canónicos;
- componentes finales;
- layouts finales;
- motion aprobado;
- assets aprobados;
- patrones UX finales.

### STAGING LAB

Debe permanecer en `staging`:

- `app/staging-lab/`;
- `staging-lab/`;
- `qa/` y skill de QA;
- workflows de QA/laboratorio;
- fixtures, mocks y comparadores visuales;
- snapshots y herramientas de diagnóstico.

El inventario automático vive en `STAGING_ONLY.manifest.json`.

## Guard de build

`npm run build` ejecuta primero `scripts/assert-environment-boundary.mjs`.

El guard determina el entorno por el project-ref real de `NEXT_PUBLIC_SUPABASE_URL` y, opcionalmente, por `CYA_DEPLOY_ENV`.

- Staging permitido: `qlngfkzmncihtdzktcmd`.
- Producción: `ldvyeyhzrepaaouzavgs`.
- Si un build de producción contiene cualquier recurso declarado en `STAGING_ONLY.manifest.json`, el build falla antes de Next.js.
- Si staging apunta a producción o producción apunta a staging, el build falla.
- Un build local sin entorno verificable solo puede continuar con `CYA_ALLOW_UNVERIFIED_LOCAL_BUILD=1` y nunca en CI.

## Prueba automática

`.github/workflows/staging-lab-boundary.yml` demuestra en cada push/PR de `staging` que:

1. el guard acepta staging conectado al Supabase dedicado;
2. una simulación productiva rechaza el mismo árbol por contener `STAGING_ONLY`;
3. el manifiesto contiene las superficies del laboratorio.

No se actualizan snapshots automáticamente para ocultar regresiones.

## Runtime

La ruta `/staging-lab` valida de nuevo el project-ref del Supabase del runtime. Si no corresponde a staging devuelve 404 mediante `notFound()`.

Este runtime guard es una segunda barrera. No sustituye al build guard.

### Acceso manual QA

Las identidades manuales de Profesor, Alumno y Administrador se conservan exclusivamente en staging. Su acceso es passwordless mediante email OTP/magic link con `shouldCreateUser: false`; no existe una contraseña manual compartida en cliente, repositorio o documentación.

`cya-qa-bootstrap` mantiene separadas las credenciales automatizadas `qa-*`, que se generan aleatoriamente por ejecución OIDC. Las identidades manuales se rotan administrativamente mediante Supabase Auth y la contraseña aleatoria resultante nunca se devuelve al workflow ni al cliente.

## Regla de promoción

Nunca se hace merge integral del laboratorio. Cuando un diseño quede aprobado, se traslada únicamente su implementación de PRODUCTO (tokens/componentes/layouts/assets aprobados). Los recursos listados en `STAGING_ONLY.manifest.json` no acompañan esa promoción.

## Supabase

El laboratorio no necesita modificar datos de negocio. QA utiliza únicamente Supabase staging, fixtures o mocks. Está prohibido usar service-role o secretos productivos en cliente, repositorio o capturas.
