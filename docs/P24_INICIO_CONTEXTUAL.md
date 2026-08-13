# P24 — Inicio contextual — CERRADO

Estado: **P24 CERRADO EN MAIN / SUPABASE**  
Siguiente paquete: **P25 — Misiones — pendiente de aprobación**

## Alcance cerrado

P24 convierte Inicio en el lanzador operativo del día sin duplicar Agenda ni redefinir todavía el motor de Misiones de P25.

- reloj vivo cada 15 segundos;
- saludo por zona horaria y franjas de mañana/tarde/noche;
- prioridad canónica: clase realmente activa → clase programada a 30 minutos o menos → misión;
- una clase a 31 minutos no domina y al cruzar a 30 sí domina sin recarga;
- frase diaria persistida por usuario + fecha local con snapshot de texto inmutable;
- selección de frase: fecha exacta → recurrencia MM-DD → rotación entre frases activas sin override;
- las 15 frases preexistentes se conservan y pueden actuar como pool de fallback fuera de su fecha recurrente;
- Administración > General permite crear, editar, activar/desactivar, fecha concreta, recurrencia, preview, CSV con detección de conflictos y borrado físico solo sin historial;
- resumen del día reutilizando `calendar_snapshot`;
- avisos accionables sin duplicar la acción dominante;
- accesos rápidos contextuales;
- P25–P32 permanecen fuera de alcance.

## Datos y seguridad

Migraciones aplicadas en Supabase `CyA hub 2`:

- `v58_p24_contextual_home` — ledger `20260812214733`;
- `v59_p24_quote_preview_privileges` — ledger `20260812214904`.

`daily_quote_assignments` mantiene una única asignación por `(user_id, local_date)`, referencia la frase con `ON DELETE RESTRICT` y conserva `quote_text_snapshot` para que una edición posterior del catálogo no cambie lo ya mostrado ese día.

`home_snapshot()` y `preview_daily_quote(date)` son `SECURITY INVOKER`. `anon` no dispone de `EXECUTE`; `authenticated` sí.

Integridad final observada tras QA:

- frases: 15 totales / 15 activas;
- asignaciones QA: 2;
- duplicados por usuario+fecha: 0;
- snapshots vacíos: 0;
- referencias huérfanas a frases: 0.

## QA y repositorio público

Al hacerse público el repositorio, el bootstrap OIDC de QA se endureció para no abrir credenciales a forks externos. La confianza queda fijada por repositorio + repository_id + workflow + runner GitHub-hosted. Se permite:

1. al actor propietario `carlosyandybz-bit` con su actor_id; o
2. a `github-actions[bot]` únicamente para `workflow_dispatch` sobre `refs/heads/main` y el `workflow_ref` exacto de `cya-qa-e2e.yml@refs/heads/main`.

El correctivo se integró mediante PR #42 y la Edge Function `cya-qa-bootstrap` quedó en versión 6 ACTIVE.

## Integración y cierre

- PR #41 — P24 funcional — fusionado;
- merge P24: `b8b4c59cf6e542ebb3cfe80bda26dc39e231ed2c`;
- PR #42 — hardening OIDC del QA post-merge — fusionado;
- main funcional final antes de la sincronización documental: `50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`.

Certificación final sobre `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`:

- P24 gate `31652164663`: contratos P24 + regresiones P17/P18/P19 + lint + build = PASS;
- CYA QA E2E `31652169267`: **36/36 Playwright PASS**;
- iPhone 430×739 y escritorio 1280×720;
- Inicio y Administración: overflow 0, targets <44 px 0, botones sin etiqueta 0, console errors 0, page errors 0, failed requests 0, server errors 0;
- artifact final `9163051155`;
- lint global: 0 errores / 25 warnings no bloqueantes.

La única dependencia QA conocida sigue siendo el `503` de `/api/google-drive/media-ticket` en Enseñanza por ausencia de variables server-side de Drive en el runner. Sigue asignada a CYA-AUD-012 y no es una regresión P24.

## Pendientes que P24 no cierra

- P25: semántica y automatización de Misiones;
- P26: Google Calendar;
- P27: deliveries/canales externos;
- P28: round-trip import/export;
- P29: Marketing/CRM;
- P30: estadísticas aprobadas;
- P31: integraciones/catálogos/apariencia;
- P32: hardening, producción G1 y release final.

Producción/Hostinger G1 continúa sin recertificación independiente.
