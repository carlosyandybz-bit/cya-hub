# CYA Hub — Integraciones protegidas en staging

Este documento protege las integraciones ya implementadas y verificadas para que futuras actualizaciones de staging no las sustituyan por código anterior o incompleto.

## Regla de no regresión

Antes de actualizar, fusionar o sustituir código relacionado con integraciones, conservar como mínimo la funcionalidad descrita aquí. Si una versión entrante no contiene estas capacidades, no debe reemplazar estos archivos sin una migración explícita y revisada.

## WhatsApp Business / Meta Cloud API

Estado funcional preservado:

- Diagnóstico de configuración desde servidor.
- Token de acceso, Phone Number ID y versión Graph API únicamente en variables de entorno.
- Verify Token y App Secret únicamente en servidor.
- Webhook compatible con verificación GET de Meta.
- Validación de firma `x-hub-signature-256` mediante App Secret.
- Alias canónico de webhook bajo `/api/integrations/whatsapp/webhook`.
- Envío de mensajes de texto desde servidor mediante WhatsApp Cloud API.
- Endpoint de envío con validación previa de comunicación.
- Prueba administrativa “Enviar prueba a mi usuario”.
- La prueba usa primero el teléfono canónico de `public.people`, enlazado por `auth_user_id`.
- Para España, un teléfono nacional de 9 dígitos se normaliza automáticamente con prefijo `34`.
- La interfaz de Administración > Integraciones debe mostrar el estado real de WhatsApp y no volver a la tarjeta antigua “Sin automatización”.
- Error actualmente esperado mientras Meta no complete el registro del número emisor: `(#133010) Account not registered`.

Archivos protegidos:

- `app/whatsapp-server.ts`
- `app/whatsapp-integration.tsx`
- `app/api/whatsapp/status/route.ts`
- `app/api/whatsapp/send/route.ts`
- `app/api/whatsapp/test-self/route.ts`
- `app/api/whatsapp/webhook/route.ts`
- `app/api/integrations/whatsapp/webhook/route.ts`
- `app/p31-integrations-admin.tsx` — preservar específicamente la integración del componente `WhatsAppIntegration`.
- `.env.example` — preservar el contrato de variables `WHATSAPP_*` sin valores reales.

Variables requeridas, nunca versionar sus valores reales:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_API_VERSION`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`

## Email SMTP

Estado funcional preservado:

- Verificación real del servidor SMTP desde backend.
- Envío de correo de prueba desde Administración > Integraciones.
- Restricción de las acciones de prueba a roles administrativos.
- Contraseña SMTP y credenciales solo en servidor.
- Conexión TLS obligatoria.
- La interfaz debe mostrar estado real `Verificado/Configurado/No configurado`, no volver a la tarjeta antigua “Sin automatización”.

Archivos protegidos:

- `app/email-smtp-server.ts`
- `app/email-integration.tsx`
- `app/api/email/status/route.ts`
- `app/api/email/test/route.ts`
- `app/p31-integrations-admin.tsx` — preservar específicamente `EmailIntegration`.

Variables requeridas, nunca versionar sus valores reales:

- `EMAIL_SMTP_HOST`
- `EMAIL_SMTP_PORT`
- `EMAIL_SMTP_SECURE`
- `EMAIL_SMTP_USER`
- `EMAIL_SMTP_PASSWORD`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_FROM_NAME`

## Google Drive y Google Calendar

Google Drive y Google Calendar ya forman parte del panel de integraciones de staging y deben mantenerse junto con Email y WhatsApp. No sustituir el panel completo por una versión antigua para incorporar cambios parciales. Las futuras actualizaciones deben preservar la verificación real de Drive y los flujos de OAuth/sincronización de Calendar ya presentes en staging.

## Criterio para futuras actualizaciones

1. Comparar el cambio entrante contra staging antes de aplicar.
2. Hacer port selectivo de la funcionalidad nueva en vez de reemplazar archivos divergentes completos.
3. Mantener secretos fuera del repositorio.
4. No degradar una integración que ya puede demostrar su estado real contra el proveedor a un estado estático/manual.
5. Probar después de cada cambio: estado de integración, webhook, permisos, teléfono canónico, envío de WhatsApp, verificación SMTP y correo de prueba.

Última consolidación: 18 de agosto de 2026.
