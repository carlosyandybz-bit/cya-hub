# Seguridad de Sentry

- El DSN de Sentry es un identificador público de ingestión y puede existir en el bundle cliente.
- `SENTRY_AUTH_TOKEN` es secreto, se usa exclusivamente del lado servidor/build y no se expone al navegador.
- La integración tiene `sendDefaultPii: false`.
- El puente Supabase usa autenticación interna almacenada en Vault y no expone el token de Sentry.
