# Checklist de despliegue Sentry

Tras integrar en `main` y completar el despliegue de Hostinger:

1. Confirmar que la aplicación carga normalmente.
2. Confirmar que `/api/runtime-config` sigue operativo.
3. Verificar que Sentry recibe eventos de producción cuando se produzca una excepción real o controlada.
4. Ejecutar la sincronización Supabase → Sentry y comprobar que las incidencias nuevas aparecen en `sentry_issues`.
5. Mantener `SENTRY_AUTH_TOKEN` exclusivamente como secreto de servidor/build si se configura en Hostinger.
