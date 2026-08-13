# P25 — Misiones + worker — CERRADO

Estado: **P25 CERRADO EN MAIN / SUPABASE**  
Siguiente paquete: **P26 — Agenda + Google Calendar — pendiente de aprobación**

## Alcance cerrado

P25 cierra la semántica de vencimiento y la automatización server-side del motor de Misiones sin abrir P26–P32.

- nuevo estado terminal `expired` con `expired_at`;
- `mark_not_done`: una misión vencida accionable pasa a `not_done`;
- `expire`: una misión vencida accionable pasa a `expired`, sale del trabajo pendiente y conserva historial;
- `repeat`: la instancia vencida pasa a `expired` y se materializa exactamente una siguiente ocurrencia válida como `upcoming`, deduplicada por `rule_key:fecha`;
- una ocurrencia `upcoming` pasa a `available` cuando alcanza `available_at`;
- `postpone` es un snooze: no reescribe `due_at`; al despertar tras el vencimiento se aplica el `failure_behavior` real;
- `expired` es histórico terminal: puede abrirse y comentarse, pero no reiniciarse, completarse, posponerse, marcarse no aplicable ni cancelarse por el RPC normal;
- motor interno idempotente ejecutable por sistema, independiente de `auth.uid()`;
- `refresh_missions()` permanece como wrapper staff;
- zona horaria operativa configurable, inicialmente `Europe/Madrid`;
- Supabase Cron ejecuta el motor cada 15 minutos;
- Administración > Misiones muestra `Marcar no realizada`, `Caducar` y `Repetir`, además de zona horaria, revisión diaria, proceso nocturno y cadencia automática;
- Inicio P24 continúa consumiendo exclusivamente estados accionables y nunca incorpora `expired`.

## Migraciones

Migraciones aplicadas formalmente en Supabase `CyA hub 2`:

- `v60_p25_mission_expiry_engine` — ledger `20260813013825`;
- `v61_p25_repeat_successor` — ledger `20260813013853`;
- `v62_p25_expired_terminal_guard` — ledger `20260813013909`.

Las funciones P25 inspeccionadas son `SECURITY INVOKER`. `anon` y `PUBLIC` no disponen de `EXECUTE` sobre los RPC/engine P25; `authenticated` entra únicamente por funciones protegidas por staff/administración cuando corresponde. El cron se ejecuta como `postgres`.

## Backfill real

Snapshot previo al backfill:

- `not_done = 3`;
- `available = 24`;
- las cuatro incidencias confirmadas seguían `available`;
- 0 comentarios y 0 evidencias asociados a esas cuatro filas.

Backfill aplicado por semántica, no por IDs hardcodeados:

- misión `99` — `daily.review_information` / `expire` → `expired`;
- misión `694` — `daily.review_information` / `expire` → `expired`;
- misión `963` — `daily.review_information` / `expire` → `expired`;
- misión `964` — `daily.complete_internal_content` / `repeat` → `expired`.

Resultado:

- `not_done` permanece en **3**: las caducadas no contaminan la estadística de no realizadas;
- `expired = 4`;
- `expired` sin `expired_at = 0`;
- duplicados de `dedupe_key = 0`;
- sucesora única del `repeat`: misión `17837`, fecha `2026-08-19`, estado `upcoming`, dedupe `daily.complete_internal_content:2026-08-19`;
- comentarios/evidencias/historial de las cuatro instancias se preservan.

## Worker y Cron

Job Supabase Cron:

- nombre: `cya-mission-engine`;
- cadencia: `*/15 * * * *`;
- comando: `select private.run_mission_engine_p25();`;
- usuario: `postgres`;
- activo: `true`.

Ejecución autónoma demostrada sin abrir Inicio:

- `cron.job_run_details` registró `runid=101`;
- inicio `2026-08-13 01:45:00.613924+00`;
- estado **succeeded**;
- retorno `1 row`.

## QA de datos

Se ejecutó una prueba transaccional con reglas/misiones QA temporales y `ROLLBACK`:

- `mark_not_done` → `not_done`;
- `expire` → `expired`;
- una misión `postponed` con snooze ya cumplido y plazo vencido despertó y pasó a `expired`;
- `repeat` archivó la instancia vencida y creó exactamente una sucesora `upcoming`;
- una segunda ejecución del engine no creó otra sucesora;
- tras `ROLLBACK`: 0 reglas QA y 0 misiones QA permanecieron.

## GitHub / QA

Implementación funcional:

- PR #44 — `P25: cerrar vencimiento y automatización de Misiones`;
- merge funcional: `e32bd7885f6e09df23098d61a267c48157974396`.

Pre-migración sobre head final `641b1a953634c6e303650ebad2961f23f004ca7e`:

- workflow P25 Missions: contratos P25 + regresiones P17–P24 + lint + build + whitespace = PASS;
- Browser QA = PASS.

Post-migración antes del merge:

- Browser QA run `31658000334`: **38/38 Playwright PASS** contra v60–v62 reales;
- artifact `9165360659`;
- iPhone 430×739 y escritorio 1280×720;
- Administración → Misiones: overflow 0, targets <44 px 0, botones sin etiqueta 0, console/page/network/server errors 0.

Certificación post-merge sobre `main@e32bd7885f6e09df23098d61a267c48157974396`:

- P25 Missions run `31658828822`: PASS completo;
- CYA QA E2E run `31658833258`: **38/38 Playwright PASS**;
- artifact `9165485286`;
- lint: 0 errores / 25 warnings no bloqueantes;
- iPhone 430×739 y escritorio 1280×720;
- `admin-Misiones`: overflow 0, targets <44 px 0, botones sin etiqueta 0, console errors 0, page errors 0, failed requests 0, server errors 0.

La única dependencia QA conocida sigue siendo el `503` de `/api/google-drive/media-ticket` en Enseñanza por ausencia de variables server-side de Drive en el runner. Continúa asignada a CYA-AUD-012 y no es una regresión P25.

## Hallazgo cerrado

**CYA-AUD-003 — Misiones vencidas que siguen disponibles: RESUELTO — P25.**

## Fuera de P25

- P26: Agenda + Google Calendar;
- P27: notificaciones automáticas/canales externos;
- P28: round-trip import/export;
- P29: Marketing/CRM/tarifas/campañas/eventos;
- P30: estadísticas aprobadas;
- P31: administración/catálogos/integraciones/apariencia;
- P32: hardening, Hostinger G1 y release final.

P26 no se inicia sin nueva aprobación expresa.
