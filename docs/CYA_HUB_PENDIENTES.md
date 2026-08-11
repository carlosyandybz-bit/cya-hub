# CYA HUB — PENDIENTES VIVOS

**Versión:** 1.3  
**Fecha de corte:** 11 de agosto de 2026  
**Plan operativo:** `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md` (B00–B12)  
**Auditoría de evidencia:** `docs/PARITY_AUDIT_2026-08-11.md`

> Este archivo se mantiene como registro vivo de estados/evidencias porque el usuario exige recibirlo actualizado después de cada implementación. El **orden de ejecución** lo gobierna el Plan Maestro B00–B12.

Estados: 🔴 PENDIENTE · 🟠 REQUIERE PRODUCCIÓN/E2E · 🟡 PARCIAL · 🟢 CERRADO/VERIFICADO · ⚫ DESCARTADO.

# Cerrado

## C-001 — P16/v42 RLS alumno–clases
**Estado:** 🟢 CERRADO / PRODUCCIÓN

- dry-run 11/11;
- producción 17/17;
- `20260811124729 / v42_rls_student_class_correlation`;
- PR #2;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.

## P-003 — Baseline de migraciones
**Estado:** 🟢 CERRADO

- 52 migraciones registradas;
- primera `20260808214303 / teaching_module`;
- última `20260811124729 / v42_rls_student_class_correlation`;
- PR #3, squash `a8acf2bf161535d4b84be1ae651d530ddc9248c5`;
- `docs/DATABASE_MIGRATION_BASELINE.md`.

## P-025 — 18 fuentes SQL históricas
**Estado:** 🟢 CERRADO

- 18/18 recuperadas desde `schema_migrations.statements[1]`;
- archivadas en `supabase/applied-history/`;
- 18/18 verificadas byte por byte mediante Git blob SHA;
- ninguna fue reejecutada;
- PR #4, merge `5999542e6b4bb258aff93aee3b96f6f0d255dda8`.

# B00 — base técnica / bloqueos externos

## P-001 — runtime Hostinger
**Estado:** 🔴 PENDIENTE · **Prioridad:** P0

GitHub está identificado, pero el conector Hostinger cargado en esta sesión no expone despliegues/logs Node.js. No se declarará producción verificada sin evidencia.

**Cierre:** commit desplegado + `/` + `/api/runtime-config` + login/sesión + smoke de módulos/portal + secretos/runtime.

## P-002 — Leaked Password Protection
**Estado:** 🔴 PENDIENTE CONFIRMADO · **Prioridad:** P1

Security Advisors confirma `Leaked Password Protection Disabled`. Es ajuste de Supabase Auth, no SQL.

# B01/B02 — navegación, multirol, personas

## P-020 — navegación principal
**Estado:** 🟠 VERIFICADO CÓDIGO / FALTA E2E

Implementado: **Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**. Falta gate Hostinger/iPhone.

## P-013 — multirol / Ver como
**Estado:** 🟠 VERIFICADO CÓDIGO+BD / FALTA E2E

- selector Profesor/Alumno/Administrador condicionado por capacidades reales;
- producción tiene una identidad con `admin + teacher + student` activos;
- cambio de portal no modifica permisos reales.

## P-022 — fuente canónica de personas
**Estado:** 🟡 PARCIAL · **Prioridad:** P1

Correcto hoy:

- CRM y alumnado comparten `people`;
- `auth_user_id` único;
- 0 grupos duplicados por email normalizado;
- 0 grupos duplicados por teléfono normalizado.

Brecha real:

- email no es UNIQUE;
- `create_student` inserta persona nueva sin resolver coincidencia;
- `save_crm_contact` hace lo mismo cuando `p_person_id` es null.

**Siguiente corrección recomendada:** endurecer identidad/deduplicación antes de ampliar conversiones/formularios.

## P-019 — Alumnado como módulo único
**Estado:** 🟡 PARCIAL

Existe ficha maestra con Resumen/Formación/Evaluación/Clases/Bonos/Datos/CRM, perfiles de baile, incidencias y acciones. No se cierra hasta resolver P-022 y ejecutar conversión contacto→provisional→alumno→registrado sin duplicación/pérdida.

# B03 — formularios e import/export

## P-015 — formularios versionables
**Estado:** 🟡 PARCIAL

Producción: 18 formularios activos, 18 versiones activas, 68 campos activos. Administración gestiona parte del catálogo, pero los formularios operativos siguen mayoritariamente codificados en React: falta renderer reusable que aplique opciones/condiciones/visibilidad/validación/canonical_path.

## P-016 — importación/exportación integral
**Estado:** 🟠 VERIFICADO CÓDIGO+BD / FALTA E2E

Existe XLSX/CSV/JSON, preview, estrategias de duplicados, exportación por dominios y backup/restore completo no destructivo con cobertura de personas, clases, bonos, enseñanza, evaluaciones, CRM, misiones, formularios y configuración.

# B04/B05/B07/B09/B11 — pendientes de rediseño/validación ya conocidos

## P-007 — Dar clase
**Estado:** 🔴 PENDIENTE FINAL · **Prioridad:** P1

Validar/rediseñar el flujo completo de selección→3 min→trabajo→terminar/cerrar, buscador unificado, pareja, evaluación, saldo y persistencia.

## P-006 — Evaluaciones
**Estado:** 🔴 PENDIENTE FINAL · **Prioridad:** P1

Contrato 0/25/50/75/100, niveles, persistencia, radares, reevaluación y UX táctil.

## P-008 — Árboles de Enseñanza
**Estado:** 🔴 PENDIENTE FINAL · **Prioridad:** P1

Relaciones, prerequisitos, L/F, estilos/niveles, zoom/pan/rutas y UX iPhone.

## P-009 — Marketing
**Estado:** 🔴 PENDIENTE DE REDISEÑO FUNCIONAL · **Prioridad:** P2

## P-010 — Estadísticas
**Estado:** 🔴 PENDIENTE DE REDISEÑO FUNCIONAL · **Prioridad:** P2

## P-004 — identidad visual
**Estado:** 🔴 PENDIENTE · **Prioridad:** P2

## P-005 — tipografía/apariencia admin
**Estado:** 🔴 PENDIENTE · **Prioridad:** P3

# B06 — portal alumno

## P-018 — Portal alumno
**Estado:** 🟡 PARCIAL

Verificado: clases, bonos/saldo, formación, multimedia autorizada, evaluación/evolución y mensajes filtrados; P16 protege `internal_note`.

Brecha: existe `class_preparation_requests` y el profesor las lee, pero no se localiza UI de alumno para crear/editar la preparación previa.

# B08 — Inicio, Misiones, Agenda, Notificaciones

## P-011 — Inicio contextual
**Estado:** 🟠 VERIFICADO CÓDIGO+BD / FALTA HOSTINGER

Verificado: saludo por nombre/hora, frase diaria, próxima clase dominante ±30 min, siguiente misión, accesos rápidos, resumen, Administración, notificaciones, cuenta/perfil y cambio de portal. Producción contiene 15 frases activas.

## P-012 — Motor de Misiones
**Estado:** 🟡 PARCIAL

Backend/BD: 8 reglas iniciales activas y soporte de frecuencia, días/hora, peso, anticipación, máximo, duplicados, fallo, evidencia, auto-completar, calendario, canales/destinatarios/escalado y horas silenciosas.

Brecha: Administración solo expone una parte de esos parámetros.

## P-014 — Agenda / Google Calendar
**Estado:** 🟡 PARCIAL

Día/Semana/Mes/Lista y filtros de clases/misiones/eventos/externos existen. Producción tiene 0 `calendar_connections`; falta flujo real OAuth/sincronización Google Calendar.

## P-017 — Notificaciones
**Estado:** 🟡 PARCIAL

Centro interno funcional (pendientes, historial, lectura y navegación contextual). Producción tiene 13 reglas activas, actualmente con canal automático `internal` solamente. Falta motor externo email/WhatsApp si debe formar parte de notificaciones automáticas.

# B10 — almacenamiento/integraciones

## P-021 — multimedia por referencias externas
**Estado:** 🟡 PARCIAL

Correcto: enseñanza/clases/marketing sirven Drive mediante `external_file_id` y tickets autenticados; no se detectaron columnas `bytea` operativas.

Excepción actual: la foto de perfil se guarda en bucket público Supabase Storage `avatars` (5 MB). Debe formalizarse como excepción permitida o migrarse al contrato Drive/serving seguro.

# QA permanente

## P-023 — smoke iPhone
**Estado:** 🔴 GATE PERMANENTE

## P-024 — regresión transversal
**Estado:** 🔴 GATE PERMANENTE

# Descartados

- D-001 WordPress como backend canónico — ⚫.
- D-002 ChatGPT Sites como producción — ⚫.
- D-003 móvil 9.3.0 — ⚫.
- D-004 20.14/20.15 como base Dar clase — ⚫.
- D-005 hamburguesa principal — ⚫.
- D-006 amarillo fluorescente — ⚫.
- D-007 YouTube/TikTok obligatorios — ⚫.

# Próximo trabajo ejecutable

B00.1/B00.2 siguen bloqueados por acceso/configuración externa. El siguiente defecto técnico que puede prepararse sin fingir cierres es:

1. **B01.3/B02.2 — deduplicación canónica de personas (P-022/P-019).**
2. B08.2 — completar configuración administrativa de Misiones.
3. B03.1 — renderer reusable de formularios.
4. B06 — UI de preparación del alumno.
5. B08.3 — Google Calendar real.
6. B08.4 — canales externos automáticos.
7. B10 — política definitiva de avatar.

No reimplementar Inicio, navegación, multirol o import/export: ya tienen base verificable y requieren gate E2E, no reconstrucción.

# Registro

## v1.0–v1.2

Creación del registro, P16, baseline de migraciones y recuperación P-025.

## 11/08/2026 — v1.3

- integrada la numeración B00–B12 del Plan Maestro;
- auditados P-011→P-022 contra `main` y Supabase producción;
- P-011/P-013/P-016/P-020 pasan de “requiere verificación” a **verificado código/BD, pendiente E2E**;
- P-012/P-014/P-015/P-017/P-018/P-019/P-021/P-022 pasan a **parcial** con brecha concreta;
- se identifica P-022/B01.3 como siguiente corrección técnica prioritaria;
- evidencia detallada en `docs/PARITY_AUDIT_2026-08-11.md`.
