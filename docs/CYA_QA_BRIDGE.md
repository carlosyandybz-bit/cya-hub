# CYA QA Bridge

## Objetivo

Permitir que el trabajo de QA de CYA Hub se controle desde conversaciones de ChatGPT sin exigir que Carlos use un ordenador, una terminal o un navegador de escritorio.

El puente usa GitHub Actions como máquina remota y Playwright como navegador automatizado.

## Flujo

1. ChatGPT inspecciona o modifica una rama de trabajo en GitHub.
2. Un push a `chore/**`, `feat/**`, `fix/**` o `qa/**`, o un PR hacia `main`, dispara `CYA QA E2E`.
3. GitHub Actions instala la aplicación y el harness QA.
4. Ejecuta `npm run lint` y `npm run build`.
5. Arranca CYA Hub localmente dentro del runner.
6. Playwright prueba el shell público en móvil y escritorio.
7. Si existen credenciales QA, prueba también autenticación profesor/alumno/admin.
8. GitHub conserva HTML report, screenshots, vídeos, traces y log del servidor como artifacts.
9. ChatGPT puede consultar el workflow, sus jobs y logs desde la integración de GitHub y usar esa evidencia para continuar el diagnóstico/corrección.

## Dispositivos

La cobertura inicial incluye:

- `iphone-large-chromium`: usa el descriptor de iPhone 15 Pro Max de Playwright, forzado sobre Chromium. Se usa como aproximación estable de la clase de pantalla grande de iPhone empleada como referencia principal de CYA Hub.
- `desktop-chromium`: control de regresiones de escritorio.

Cuando Playwright incorpore un descriptor estable del iPhone objetivo más reciente, puede sustituirse sin cambiar la arquitectura del QA Bridge.

## Pruebas activas sin credenciales

Siempre se comprueba:

- render del login;
- presencia de email, contraseña y botón Entrar;
- ausencia de overflow horizontal en el viewport;
- respuesta válida de `/api/runtime-config`;
- que la configuración pública de Supabase use URL HTTPS y publishable key;
- que el endpoint no exponga `service_role` ni claves `sb_secret_`;
- captura de pantalla del shell;
- observaciones de errores de consola y requests fallidas.

## Pruebas autenticadas

Las siguientes variables se leen únicamente desde GitHub Actions Secrets:

```text
QA_TEACHER_EMAIL
QA_TEACHER_PASSWORD
QA_STUDENT_EMAIL
QA_STUDENT_PASSWORD
QA_ADMIN_EMAIL
QA_ADMIN_PASSWORD
```

Si las credenciales de un rol no existen, ese test se marca como omitido. Nunca debe sustituirse por una contraseña real de Carlos o Andy.

La primera cobertura autenticada comprueba:

- login profesor;
- login alumno;
- login administrador;
- render del shell autenticado;
- presencia de navegación principal del profesor.

La cobertura puede ampliarse por módulo con fixtures QA controlados.

## Configuración Supabase usada en CI

El workflow usa únicamente la URL pública y la publishable key del proyecto activo. Son credenciales cliente y no conceden privilegios administrativos; la seguridad continúa dependiendo de Auth y RLS.

Pueden sobrescribirse mediante GitHub Actions Variables:

```text
CYA_QA_SUPABASE_URL
CYA_QA_SUPABASE_PUBLISHABLE_KEY
```

No almacenar nunca `service_role`, `sb_secret_*`, tokens administrativos ni contraseñas dentro del repositorio.

## Evidencias

Cada ejecución conserva durante 14 días un artifact `cya-browser-qa-<run_id>` con:

- `playwright-report/`;
- `test-results/`;
- `qa/app-server.log`.

Playwright está configurado para guardar:

- screenshot cuando falla una prueba;
- vídeo de pruebas fallidas;
- trace en el primer reintento;
- screenshots explícitos de los shells validados.

## Política para pruebas con datos

No utilizar producción para crear/borrar alumnos, bonos, clases o contenido únicamente con fines de QA.

La fase siguiente debe usar cuentas y fixtures QA dedicados. Las pruebas mutantes deberán:

1. crear registros identificables como QA;
2. actuar solo sobre esos registros;
3. comprobar UI y estado persistido;
4. limpiar únicamente los registros creados por la prueba;
5. abortar antes de mutar si no puede demostrar que el registro es de QA.

## Uso desde una conversación

El usuario no necesita ejecutar comandos. El flujo esperado es:

> “Comprueba Dar clase y corrige lo que falle.”

ChatGPT puede modificar una rama, esperar a que GitHub Actions produzca una ejecución, leer jobs/logs/artifacts disponibles, corregir la causa y volver a disparar QA mediante el siguiente cambio o reintentando un job fallido.

`main` continúa siendo producción. El QA Bridge no autoriza por sí mismo merges ni migraciones de Supabase.
