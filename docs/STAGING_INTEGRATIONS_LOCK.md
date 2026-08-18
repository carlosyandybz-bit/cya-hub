# CYA Hub — Baseline protegida de integraciones en staging

Este documento declara la implementación actual de integraciones de `staging` como **baseline de no regresión**. Su objetivo es impedir que una actualización, cherry-pick, port, merge o sustitución de archivos vuelva a introducir código anterior, tarjetas estáticas o integraciones incompletas.

## Regla absoluta

`staging` y `main` están fuertemente divergidas. Por tanto:

1. Nunca sustituir en bloque los archivos de integraciones de `staging` por los de otra rama.
2. Comparar antes de portar y trasladar solo la capacidad nueva necesaria.
3. Si la versión entrante carece de una capacidad descrita aquí, esa versión no puede reemplazar la implementación actual.
4. Los secretos reales viven únicamente en las variables privadas del entorno correspondiente. Nunca se copian al repositorio ni se exponen con prefijo `NEXT_PUBLIC_*`.
5. Toda modificación de integraciones debe superar `tests/staging-integrations-regression.test.mjs` antes de considerarse válida.

---

## 1. Email — SMTP seguro de Hostinger

### Estado protegido

- Integración real desde servidor; no volver a una tarjeta de “envío manual” o “sin automatización”.
- Comprobación de conexión autenticada desde Administración > Integraciones.
- Autenticación SMTP mediante `AUTH LOGIN`.
- Conexión TLS con validación de certificado (`rejectUnauthorized: true`).
- Envío de correo de prueba desde la propia app.
- Acceso restringido a perfiles administrativos autorizados.
- Contraseña SMTP exclusivamente en servidor.
- Remitente y buzón de respuesta configurables por entorno.

### Archivos protegidos

- `app/email-integration.tsx`
- `app/email-smtp-server.ts`
- `app/api/email/status/route.ts`
- `app/api/email/test/route.ts`
- `app/p31-integrations-admin.tsx` — debe seguir renderizando `EmailIntegration`.

### Contrato de entorno

- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME`

---

## 2. Google Drive — almacenamiento y multimedia

### Estado protegido

- Verificación real de acceso a Google Drive desde servidor.
- Renovación de credenciales mediante refresh token.
- Carpeta de Enseñanza configurable o administrada automáticamente por CYA Hub.
- Carpeta independiente para vídeos de clase cuando se configure.
- Carpeta independiente de Feedback Online, configurable o administrada por CYA.
- Subidas reanudables a Drive.
- Eliminación controlada de archivos.
- Proxy/lectura protegida de multimedia.
- Tickets de acceso firmados y con caducidad para no exponer archivos arbitrariamente.
- Pruebas criptográficas para asociar vídeos de Feedback Online.
- Los archivos permanecen en Google Drive; CYA conserva referencias y permisos.
- El panel de integraciones debe consultar `/api/google-drive/status` y mostrar estado real, no un badge ficticio.

### Archivos protegidos

- `app/google-drive-server.ts`
- `app/api/google-drive/status/route.ts`
- Rutas `app/api/google-drive/**` relacionadas con subida, multimedia, tickets y estado.
- `app/p31-integrations-admin.tsx` — debe conservar la comprobación real de Drive.

### Contrato de entorno

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_TEACHING_FOLDER_ID`
- `GOOGLE_DRIVE_TEACHING_FOLDER_NAME`
- `GOOGLE_DRIVE_CLASS_VIDEOS_FOLDER_ID`
- `GOOGLE_DRIVE_FEEDBACK_FOLDER_ID`
- `GOOGLE_DRIVE_FEEDBACK_FOLDER_NAME`
- `CYA_SERVER_SECRET` para firmas/tickets internos.

---

## 3. Google Calendar — OAuth, agenda y sincronización

### Estado protegido

- OAuth real con Google Calendar.
- Estado de servidor comprobable desde la app.
- Conectar y desconectar calendario desde CYA Hub.
- Sincronización manual y soporte para sincronización automática donde esté implementada.
- Direcciones soportadas: `CYA ↔ Google`, `CYA → Google` y `Google → Agenda`.
- Persistencia de la conexión y del cursor/estado de sincronización.
- Detección y exposición de conflictos.
- Resolución de conflictos conservando CYA como fuente de verdad cuando se elija esa estrategia.
- Agenda visual y configuración de calendarios/colores existentes en staging deben conservarse.
- Los secretos OAuth y el secreto de cifrado permanecen en servidor.
- No degradar la integración a simples enlaces externos o eventos duplicados sin sincronización.

### Archivos protegidos

- `app/google-calendar-sync.tsx`
- `app/google-calendar-server.ts`
- `app/calendar-visual-admin.tsx`
- `app/google-calendar-auto-sync.tsx` cuando exista en la rama.
- `app/google-calendar-secondary-sync-server.ts` cuando exista en la rama.
- `app/api/google-calendar/status/route.ts`
- `app/api/google-calendar/connect/route.ts`
- `app/api/google-calendar/callback/route.ts`
- `app/api/google-calendar/sync/route.ts`
- `app/api/google-calendar/disconnect/route.ts`
- `app/api/google-calendar/resolve/route.ts`
- Rutas alias bajo `app/api/integrations/google-calendar/**` cuando existan.
- Migraciones de calendario ya presentes en staging.
- `app/p31-integrations-admin.tsx` — debe seguir renderizando `GoogleCalendarSync` y `CalendarVisualAdmin`.

### Contrato de entorno

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `CYA_SERVER_SECRET`

Calendar puede reutilizar el cliente OAuth de Drive cuando la implementación así lo permita; una actualización no debe romper ese fallback.

---

## 4. WhatsApp Business — Meta Cloud API

### Estado protegido

- Diagnóstico real de configuración desde servidor.
- Token de acceso, Phone Number ID y versión Graph API únicamente en variables privadas.
- Verify Token y App Secret únicamente en servidor.
- Webhook compatible con verificación GET de Meta.
- Validación criptográfica de `x-hub-signature-256` mediante App Secret.
- Alias canónico bajo `/api/integrations/whatsapp/webhook`.
- Envío de mensajes de texto desde servidor mediante WhatsApp Cloud API.
- Endpoint de envío con validación previa de comunicación.
- Herramienta administrativa `Enviar prueba a mi usuario`.
- La prueba obtiene primero el teléfono canónico de `public.people` por `auth_user_id`.
- Para España, un teléfono nacional de nueve dígitos se normaliza automáticamente con prefijo `34`.
- Administración > Integraciones debe mostrar el estado real mediante `WhatsAppIntegration` y nunca regresar a la tarjeta antigua “Sin automatización”.
- Estado externo conocido al consolidar esta baseline: la llamada llega correctamente a Meta, pero el número emisor todavía puede devolver `(#133010) Account not registered` hasta finalizar su registro/verificación en Meta. Ese error no debe confundirse con un fallo del código de CYA.

### Archivos protegidos

- `app/whatsapp-server.ts`
- `app/whatsapp-integration.tsx`
- `app/api/whatsapp/status/route.ts`
- `app/api/whatsapp/send/route.ts`
- `app/api/whatsapp/test-self/route.ts`
- `app/api/whatsapp/webhook/route.ts`
- `app/api/integrations/whatsapp/webhook/route.ts`
- `app/p31-integrations-admin.tsx` — debe seguir renderizando `WhatsAppIntegration`.

### Contrato de entorno

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

---

## 5. Meta — Facebook / Instagram

La tarjeta Meta del panel representa actualmente planificación/publicación futura y **no debe declararse conectada falsamente**. Hasta que exista una conexión compatible y verificada para publicación automática:

- conservar el estado explícito de no conectada/no automatizada;
- no reutilizar las credenciales de WhatsApp como si concedieran acceso de publicación a Facebook o Instagram;
- cualquier futura implementación debe añadirse sin degradar WhatsApp ni el resto del panel.

---

## 6. Sentry — observabilidad de runtime

Sentry forma parte de la infraestructura protegida aunque no sea una tarjeta operativa del panel de Integraciones.

Preservar:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN` únicamente en servidor/build.

Una actualización no debe eliminar la instrumentación existente ni exponer `SENTRY_AUTH_TOKEN` al cliente.

---

## 7. Supabase y Hostinger — infraestructura de integración

Supabase sigue siendo la fuente de datos/autenticación de CYA y Hostinger el entorno donde viven los secretos de producción/despliegue. Las actualizaciones de staging deben respetar:

- separación estricta entre proyecto Supabase de staging y producción;
- ninguna credencial real dentro de Git;
- variables específicas por entorno;
- no sustituir URLs/keys de staging por producción al portar código;
- no copiar datos de negocio de producción a staging salvo operación explícitamente aprobada.

---

## 8. Panel único de Integraciones

`app/p31-integrations-admin.tsx` es un punto especialmente sensible. Debe conservar simultáneamente:

- `EmailIntegration`
- `GoogleCalendarSync`
- `CalendarVisualAdmin`
- comprobación real de Google Drive
- `WhatsAppIntegration`
- Meta con estado honesto hasta que exista conexión real

No se acepta incorporar una integración reemplazando la implementación correcta de otra.

---

## 9. Prueba automática de no regresión

`tests/staging-integrations-regression.test.mjs` actúa como guardia mínima de arquitectura. Verifica que:

- existen los archivos esenciales de todas las integraciones;
- el panel usa los componentes reales;
- Email mantiene SMTP seguro y pruebas reales;
- Drive conserva verificación, carpetas y acceso multimedia protegido;
- Calendar conserva OAuth, sincronización bidireccional y conflictos;
- WhatsApp conserva webhook firmado, envío de servidor y teléfono canónico;
- `.env.example` conserva el contrato de todas las variables sin guardar secretos.

Si esta prueba falla después de una actualización, la actualización se considera regresiva hasta demostrar lo contrario.

---

## 10. Procedimiento obligatorio para futuras actualizaciones

1. Comparar la rama/cambio entrante contra `staging`.
2. Identificar archivos de integración afectados.
3. Portar de forma selectiva; no hacer reemplazos ciegos.
4. Mantener todos los secretos fuera del repositorio.
5. Ejecutar la prueba de regresión de integraciones.
6. Comprobar en la app el estado de Email, Drive, Calendar y WhatsApp.
7. Probar al menos una acción real de cada proveedor cuando el entorno disponga de credenciales válidas.
8. Registrar cualquier cambio de contrato, ruta o variable en este documento antes de dar el trabajo por terminado.

Baseline consolidada: **18 de agosto de 2026**.
