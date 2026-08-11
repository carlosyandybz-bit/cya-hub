# CYA HUB — PENDIENTES VIVOS

**Versión:** 1.3  
**Fecha de corte:** 11 de agosto de 2026  
**Hoja de ruta operativa:** `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md`  
**Actualización en curso:** **P17 — Cierre real de Evaluaciones + reconciliación Point12R**

> Este archivo es el tablero vivo que debe actualizarse y entregarse al usuario después de cada implementación. El orden de ejecución lo gobierna el Plan Maestro P17→P32.

## Estados

- 🟢 **CERRADO / VERIFICADO**
- ▶ **EN CURSO**
- 🟡 **PARCIAL / BLOQUEADO POR SUBTAREA**
- ⏳ **PENDIENTE EN SECUENCIA**
- 🔴 **GATE/RIESGO ABIERTO**
- ⚫ **DESCARTADO / NO REINTRODUCIR**

---

# 1. CERRADO

## P12 — Modelo de evaluaciones
**Estado:** 🟢 recorrido históricamente; sujeto a reconciliación final P17.

## P13 — Radar interactivo
**Estado:** 🟢 recorrido históricamente; sujeto a reconciliación final P17.

## P14 — Historial/evolución de evaluaciones
**Estado:** 🟢 implementado/validado en código; sujeto a P17.

## P15 — Resumen real de progreso
**Estado:** 🟢 implementado/validado en código; sujeto a P17.

## P16 — Seguridad RLS alumno–clases / v42
**Estado:** 🟢 CERRADO EN PRODUCCIÓN

Evidencia:

- migración `20260811124729 / v42_rls_student_class_correlation`;
- dry-run 11/11;
- producción 17/17;
- PR #2 fusionada;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`;
- `student_message` preservado;
- `internal_note` aislada;
- operaciones ajenas bloqueadas;
- acceso staff preservado.

## Baseline de migraciones
**Estado:** 🟢 CERRADO

- 52 migraciones registradas en producción;
- primera `20260808214303 / teaching_module`;
- última v42;
- baseline en `docs/DATABASE_MIGRATION_BASELINE.md`;
- PR #3 / `a8acf2bf161535d4b84be1ae651d530ddc9248c5`.

## Recuperación de 18 SQL históricos
**Estado:** 🟢 CERRADO

- 18/18 recuperados desde `schema_migrations.statements[1]`;
- archivados en `supabase/applied-history/` como **NO EJECUTAR / NO REAPLICAR**;
- 18/18 verificados byte por byte mediante Git blob SHA;
- PR #4 / `5999542e6b4bb258aff93aee3b96f6f0d255dda8`;
- ningún SQL histórico fue reejecutado.

---

# 2. AHORA — P17

# P17 — Cierre real de Evaluaciones + reconciliación Point12R
**Prioridad:** P1  
**Estado global:** ▶ EN CURSO

## P17.1 — Auditoría/reconciliación de Point12R
**Estado:** 🟢 CERRADO EN AUDITORÍA

Hallazgos verificados:

- PR #1 `agent/point12r-evaluations` sigue abierta, draft y no mergeable;
- no debe fusionarse como bloque sobre `main`;
- su arquitectura usa APIs/modelos anteriores y quedó parcialmente absorbida/superada por v34–v41;
- el motor actual usa `evaluation_sessions` + `student_evaluations` + `student_aptitude_progress`;
- `save_class_evaluation_v2` no es un segundo motor: delega en `save_evaluation_score`;
- producción conserva escala activa `0/25/50/75/100` y niveles Inicio/Intermedio/Avanzado;
- datos actuales: 6 sesiones, 5 completadas, 48 puntuaciones, 8 filas de progreso;
- `evaluation_milestones` activos: 0;
- `evaluation_descriptors` activos: 0;
- v36 ya oculta borradores al alumno mediante sesión completada + cierre pedagógico;
- v40 ya soporta revisión formal postclase del profesor;
- v41a ya soporta evaluación inicial guiada durante clase cuando corresponde;
- `v35c-enforce-post-class-evaluation.sql` no está aplicada;
- `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` sigue correctamente sin aplicar.

Documento de evidencia: `docs/P17_EVALUATION_RECONCILIATION.md`.

## P17.2 — Frontend final de Evaluaciones
**Estado:** ⏳ PENDIENTE · **bloquea P17.3**

Debe:

1. retirar la evaluación formal genérica de cualquier clase activa;
2. usar evaluación inicial guiada durante clase solo cuando corresponda;
3. integrar revisión postclase entre cierre administrativo y cierre pedagógico;
4. migrar la ficha del alumno fuera de RPC que el cutover final pretende retirar, o definir una API final compatible para evaluación manual fuera de clase si sigue siendo requisito;
5. conservar 0/25/50/75/100 y cinco opciones táctiles;
6. conservar radar, historial y evolución;
7. validar Bachata/Bachazouk;
8. añadir regresión que impida reintroducir `save_class_evaluation_v2` en el flujo vivo;
9. ejecutar build + pruebas antes de tocar producción.

## P17.3 — Cutover final v41c
**Estado:** 🟡 BLOQUEADO POR P17.2

**No aplicar ahora.** El frontend actual todavía depende de RPC que v41c revoca, entre ellas:

- `start_student_evaluation`;
- `save_evaluation_score`;
- `complete_evaluation_session`;
- `save_class_evaluation_v2`.

Condición de apertura:

- búsqueda frontend = cero dependencias de RPC revocadas;
- tests verdes;
- dry-run transaccional;
- pruebas Profesor/Alumno/Admin;
- solo entonces decidir/aplicar migración incremental y advisors.

---

# 3. SECUENCIA PENDIENTE DESPUÉS DE P17

## P18 — Identidad, roles, navegación y “Ver como”
**Estado:** ⏳ PENDIENTE

Absorbe navegación principal, multirol y una persona única. Debe cerrar Profesor+Alumno+Admin sin escalada y navegación `Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`.

## P19 — Alumnado y modelo único de personas
**Estado:** ⏳ PENDIENTE

Debe cerrar contacto→provisional→alumno→registrado sin pérdida/duplicación, nombres correctos, clases, bonos, formación, evaluación, CRM e incidencias sobre una persona canónica.

## P20 — Formularios versionables y datos canónicos
**Estado:** ⏳ PENDIENTE

Debe convertir el catálogo de formularios/versiones/campos en renderer reusable real, con validación servidor y reutilización de datos conocidos.

## P21 — Dar clase definitivo
**Estado:** ⏳ PENDIENTE · Prioridad P0/P1

Flujo: **Seleccionar → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar**, con buscador unificado, pareja, saldo, persistencia, idempotencia y evaluación reconciliada con P17.

## P22 — Portal alumno completo
**Estado:** ⏳ PENDIENTE

Próxima clase, historial, bonos/saldo, formación, multimedia, evolución, evaluaciones, perfil, preparación previa y RLS sin notas internas.

## P23 — Enseñanza, relaciones y árboles táctiles
**Estado:** ⏳ PENDIENTE

Biblioteca, Correcciones/Explicaciones/Ejercicios/Secuencias, relaciones, prerequisitos, L/F, estilos/niveles, árbol táctil y Drive.

## P24 — Inicio contextual definitivo
**Estado:** ⏳ PENDIENTE

Saludo, frase, clase dominante 30 min antes, siguiente acción, avisos, accesos, Administración, Ver como y cuenta/perfil.

## P25 — Motor de Misiones
**Estado:** ⏳ PENDIENTE

Tipos/estados/prioridades, reglas, vencimientos, duplicados, evidencia, canales/destinatarios, horas silenciosas y configuración servidor/BD.

## P26 — Agenda, calendario y Google Calendar
**Estado:** ⏳ PENDIENTE

Día/Semana/Mes/Lista, clases/misiones/eventos, conflictos y sync Google Calendar idempotente.

## P27 — Notificaciones
**Estado:** ⏳ PENDIENTE

Evento→destinatario→canal, persistencia, lectura, deduplicación y privacidad por rol.

## P28 — Importación/exportación integral
**Estado:** ⏳ PENDIENTE

Personas, clases, bonos, enseñanza, evaluaciones, configuración y relaciones; preview, duplicados, errores e idempotencia.

## P29 — Marketing, CRM, tarifas, campañas, eventos y multimedia
**Estado:** ⏳ PENDIENTE

Persona canónica, CRM, tarifas, campañas, comunicaciones, eventos, promoción y Drive.

## P30 — Estadísticas y métricas
**Estado:** ⏳ PENDIENTE

KPIs reales y trazables para alumnado, clases, bonos, enseñanza, CRM/Marketing y evolución, con UX iPhone.

## P31 — Administración, identidad visual y configuración final
**Estado:** ⏳ PENDIENTE

Configuración, roles, misiones, formularios, integraciones, seguridad/diagnóstico y cierre visual CYA coherente.

## P32 — Auditoría transversal final, producción y release
**Estado:** ⏳ PENDIENTE FINAL

Cierra flujos E2E, seguridad, Hostinger, Auth, iPhone y regresión transversal. Solo entonces CYA Hub puede declararse listo para uso real.

---

# 4. GATES PERMANENTES

## G1 — Hostinger runtime
**Estado:** 🔴 ABIERTO

El conector actual no expone despliegues/logs Node.js. Antes de P32 debe verificarse commit desplegado, `/`, `/api/runtime-config`, login/sesión, rutas, secretos y runtime.

## G2 — Supabase Auth / leaked passwords
**Estado:** 🔴 ABIERTO CONFIRMADO

Security Advisors: `Leaked Password Protection Disabled`. Requiere ajuste de Auth, no SQL.

## G3 — Smoke iPhone
**Estado:** 🔴 GATE PERMANENTE

Safe-area, scroll, teclado, Safari, modales, formularios, barra inferior y navegación tras cambios UI.

## G4 — Regresión transversal
**Estado:** 🔴 GATE PERMANENTE

Persona, conversión, bono, clase, cierre, formación, evaluación, portal, CRM/Marketing, import/export y permisos.

## G5 — Datos y multimedia
**Estado:** 🔴 GATE PERMANENTE

Persona canónica, datos no duplicados, datos conocidos reutilizados, Drive para multimedia pesada, sin secretos ni blobs operativos pesados.

---

# 5. DESCARTADOS / NO REINTRODUCIR

- ⚫ WordPress como backend/identidad canónica.
- ⚫ ChatGPT Sites como producción.
- ⚫ versión móvil 9.3.0.
- ⚫ 20.14/20.15 como base de Dar clase.
- ⚫ hamburguesa para funciones principales.
- ⚫ amarillo fluorescente.
- ⚫ YouTube/TikTok como requisitos obligatorios.
- ⚫ PR #1 Point12R como merge íntegro automático.
- ⚫ SQL `PREPARED-NOT-APPLIED` aplicado por inercia.

---

# 6. SIGUIENTE TRABAJO EXACTO

**P17.2 — Frontend final de Evaluaciones.**

No empezar P18 hasta cerrar P17.2, validar regresión y resolver P17.3 con evidencia.

---

# 7. REGISTRO

## 11/08/2026 — v1.3

- Plan vivo alineado con secuencia P17→P32.
- P17.1 cerrado como auditoría/reconciliación.
- PR #1 clasificada como referencia histórica no fusionable en bloque.
- v41c permanece bloqueada correctamente.
- P17.2 pasa a ser el siguiente trabajo exacto.
- P18→P32 permanecen pendientes en orden.
