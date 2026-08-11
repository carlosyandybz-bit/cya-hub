# CYA HUB — PENDIENTES VIVOS

**Versión:** 1.2  
**Fecha de corte:** 11 de agosto de 2026 — 15:14+ (Europe/Madrid)  
**Baseline funcional:** P16/v42 verificada en Supabase producción  
**Baseline GitHub previo a este bloque:** `a8acf2bf161535d4b84be1ae651d530ddc9248c5`

## Regla de uso

Este archivo es el tablero maestro de pendientes. Después de cada implementación se actualiza el estado, se añade evidencia, se registran regresiones/deudas nuevas, se mueven los elementos cerrados y se entrega al usuario una copia actualizada.

Estados: 🔴 PENDIENTE · 🟠 REQUIERE VERIFICACIÓN · 🟡 PARCIAL · 🟢 CERRADO · ⚫ DESCARTADO.

Prioridades: P0 seguridad/producción/pérdida de datos · P1 flujo esencial · P2 paridad/UX importante · P3 acabado/deuda.

# Baseline cerrado

## C-001 — P16/v42 RLS alumno–clases
**Estado:** 🟢 CERRADO · **Prioridad histórica:** P0

Evidencia: dry-run 11/11; producción 17/17; migración `20260811124729 / v42_rls_student_class_correlation`; PR #2 fusionada; merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`; `student_message` preservado; `internal_note` aislada; operaciones ajenas bloqueadas; acceso staff preservado.

## P-003 — Consolidar cadena SQL/migraciones documentada
**Estado:** 🟢 CERRADO · **Prioridad:** P2

Cerrado el 11/08/2026 mediante auditoría directa de `supabase_migrations.schema_migrations` y del árbol `supabase/` del repositorio.

Evidencia:

- 52 migraciones registradas en producción.
- Primera: `20260808214303 / teaching_module`.
- Última: `20260811124729 / v42_rls_student_class_correlation`.
- Se distinguen migraciones registradas, SQL conservados, bootstrap pre-registro y SQL preparados/no aplicados.
- `v35c-enforce-post-class-evaluation.sql` existe en GitHub pero no figura aplicada.
- `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` está explícitamente marcada como no aplicada y tampoco figura en producción.
- Referencia canónica: `docs/DATABASE_MIGRATION_BASELINE.md`.
- PR #3 fusionada en `main`, squash `a8acf2bf161535d4b84be1ae651d530ddc9248c5`.

## P-025 — Recuperar 18 SQL aplicados sin archivo independiente
**Estado:** 🟢 CERRADO · **Prioridad:** P2

Cerrado el 11/08/2026 como **archivo histórico**, sin ejecutar ni reaplicar SQL.

Evidencia:

- Se extrajeron exclusivamente de `supabase_migrations.schema_migrations.statements[1]` las 18 fuentes que no tenían archivo independiente.
- Se conservaron versión y nombre originales en `supabase/applied-history/`.
- El directorio está marcado **ARCHIVO HISTÓRICO — NO APLICAR / NO EJECUTAR**.
- Para cada fuente se calculó en producción el SHA-1 de objeto Git `blob` sobre los bytes originales.
- Los **18/18 SHA calculados desde Supabase coinciden exactamente con los `sha` de los archivos de GitHub**: verificación byte por byte.
- También se conserva un MD5 auxiliar por migración en el manifiesto.
- No se modificó el esquema, no se creó ninguna entrada nueva en `schema_migrations` y no se ejecutó ninguna sentencia archivada.

# Pendientes activos confirmados

## P-001 — Verificar despliegue Hostinger después de P16
**Estado:** 🔴 PENDIENTE · **Prioridad:** P0

Comprobado el 11/08/2026:

- GitHub `main` contiene P16 mediante el merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.
- El baseline documental posterior fue fusionado en `a8acf2bf161535d4b84be1ae651d530ddc9248c5`.
- El conector Hostinger disponible en esta sesión no expone hosting Node.js, despliegues ni logs; por rigor, no se declara el runtime actualizado.

**Cierre:** comprobar commit desplegado, `/`, `/api/runtime-config` (`configured:true`), login/sesión Supabase, Inicio, Alumnado, Enseñanza, Dar clase, Marketing, Administración, portal alumno, ausencia de secretos y errores runtime relevantes.

## P-002 — Protección de contraseñas filtradas en Supabase Auth
**Estado:** 🔴 PENDIENTE CONFIRMADO · **Prioridad:** P1

Security Advisors de `CyA hub 2` confirma el warning **`Leaked Password Protection Disabled`**. Es una configuración de Supabase Auth y no debe intentarse corregir mediante SQL.

**Cierre:** habilitar Leaked Password Protection cuando el plan/configuración lo permita, volver a ejecutar Security Advisors y verificar login/recuperación.

# Fuera de alcance de auditoría visual v23

## P-004 — Identidad visual definitiva
**Estado:** 🔴 PENDIENTE · **Prioridad:** P2

Colores CYA, logo, cabecera y coherencia visual global.

## P-005 — Tipografía/apariencia desde Administración
**Estado:** 🔴 PENDIENTE · **Prioridad:** P3

Debe respetar la identidad definida y no reintroducir modo oscuro/contrastes no deseados sin decisión expresa.

## P-006 — Rediseño definitivo de Evaluaciones
**Estado:** 🔴 PENDIENTE · **Prioridad:** P1

Conservar INICIO/INTERMEDIO/AVANZADO, valores 0/25/50/75/100, cinco opciones rápidas por parámetro, experiencia táctil, persistencia y radares según contrato pedagógico.

## P-007 — Rediseño definitivo de Dar clase
**Estado:** 🔴 PENDIENTE · **Prioridad:** P1

Validar paridad completa: programada/manual; 3 minutos iniciales; notas rápidas; correcciones anteriores; buscador unificado Correcciones/Explicaciones/Ejercicios/Secuencias; Crear rápido; pareja; evaluación; Guía; Trabajo de hoy; terminar/cerrar; asistencia; pago/bono; persistencia; concurrencia prevista; navegación sin regresiones.

## P-008 — Árboles/mapas táctiles de Enseñanza
**Estado:** 🔴 PENDIENTE · **Prioridad:** P1

Relaciones entre tipos, prerequisitos, homólogas L/F, estilos, niveles, zoom/pan/centrar/ruta/reset/búsqueda y UX iPhone.

## P-009 — Rediseño funcional de Marketing
**Estado:** 🔴 PENDIENTE · **Prioridad:** P2

Experiencia integrada para CRM, contactos, tarifas, contenido, campañas, comunicaciones, multimedia, eventos y métricas.

## P-010 — Rediseño de Estadísticas
**Estado:** 🔴 PENDIENTE · **Prioridad:** P2

Definir KPIs, jerarquía, filtros, navegación táctil y relaciones con alumnado, enseñanza, CRM y negocio. La corrección responsive no equivale a diseño funcional final.

# Paridad funcional — requiere verificación actual

Estos requisitos están consolidados en conversaciones y/o tuvieron trabajo previo, pero no se declaran cerrados sin evidencia reciente contra la app web actual.

## P-011 — Inicio contextual
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Saludo por hora/nombre; frase diaria persistente; clase próxima dominante 30 min antes; siguiente acción; avisos; accesos rápidos; resumen del día; Administración; Ver como; cuenta/perfil.

## P-012 — Motor de Misiones
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Tipos, estados, prioridades, reglas iniciales, vencimientos, bloqueo, duplicados, destinatarios, canales, horas silenciosas, configuración servidor/BD e integración Inicio/calendario.

## P-013 — Multirol real y Ver como
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Profesor+Alumno simultáneo; Administrador autorizado; profesor autoevaluable; portal alumno; Ver como Profesor/Alumno/Administrador; sin escalada; seguridad server-side/RLS.

## P-014 — Agenda/calendario
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Día/Semana/Mes/Lista; clases/misiones/eventos; conflictos; Google Calendar; id externo; sync idempotente; errores; no destruir participantes/saldos/historia.

## P-015 — Formularios versionables
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Definición/versión, campos/opciones, requerido, visibilidad, condiciones, validación, orden, formularios históricos, validación servidor, datos canónicos y ausencia de preguntas duplicadas.

## P-016 — Importación/exportación integral
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Alumnos, contactos, clases, bonos, Correcciones, Explicaciones, Ejercicios, Secuencias, evaluaciones y configuración relevante; operaciones transaccionales y sin duplicación.

## P-017 — Notificaciones
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P2

Eventos, destinatarios, canales, persistencia, lectura, deduplicación e integración misiones/clases/bonos.

## P-018 — Portal alumno completo
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Próxima clase, historial, bonos/saldo, formación, multimedia, evolución, evaluaciones, perfil, preparación de clase, aislamiento de notas internas y RLS. P16 cerró seguridad concreta, no toda la paridad funcional.

## P-019 — Alumnado como módulo único
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Potenciales/provisionales/registrados, conversiones sin pérdida, nombres correctos, clases, bonos, saldo, historial, formación, incidencias, programar, añadir bono e identidad unificada.

## P-020 — Navegación principal definitiva
**Estado:** 🟠 REQUIERE VERIFICACIÓN · **Prioridad:** P1

Contrato: **Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**. Sin hamburguesa para funciones clave; DAR CLASE central; back/contexto correcto; iPhone y escritorio coherentes.

# Datos y almacenamiento — controles permanentes

## P-021 — Multimedia por referencias externas
**Estado:** 🟠 REQUIERE VERIFICACIÓN CONTINUA · **Prioridad:** P1

Fotos/vídeos en Google Drive; Supabase solo referencias/IDs/metadatos; sin multimedia operativa pesada en GitHub/DB.

## P-022 — Fuente única de verdad de datos canónicos
**Estado:** 🟠 REQUIERE VERIFICACIÓN CONTINUA · **Prioridad:** P1

Evitar duplicar personas/roles, volver a pedir datos, divergencias CRM/alumno/clase o mezclar expediente comercial/pedagógico.

# QA permanente

## P-023 — Smoke test iPhone real por release
**Estado:** 🔴 PENDIENTE COMO PROCESO · **Prioridad:** P1

Safe areas, scroll, teclado, zoom Safari, modales, formularios, barra inferior, Dar clase, árboles, evaluación, ficha alumno, navegación/retorno y orientación cuando corresponda.

## P-024 — Regresión transversal de flujos
**Estado:** 🔴 PENDIENTE COMO PROCESO · **Prioridad:** P1

Antes de cerrar fase: crear persona, convertir contacto, programar clase, dar/cerrar clase, consumir bono, consultar/asignar formación, evaluar, portal alumno, CRM/Marketing, import/export y permisos Profesor/Alumno/Admin.

# Descartados — no reabrir sin decisión nueva

- D-001 WordPress como backend canónico — ⚫ DESCARTADO.
- D-002 ChatGPT Sites como producción — ⚫ DESCARTADO.
- D-003 versión móvil 9.3.0 — ⚫ DESCARTADO.
- D-004 20.14/20.15 como base Dar clase — ⚫ DESCARTADO.
- D-005 hamburguesa para funciones principales — ⚫ DESCARTADO.
- D-006 amarillo fluorescente — ⚫ DESCARTADO.
- D-007 YouTube/TikTok como requisito obligatorio — ⚫ DESCARTADO.

# Orden operativo actual

1. P-001 verificar Hostinger cuando exista acceso a despliegues/logs.
2. P-002 cerrar protección de contraseñas filtradas cuando exista acceso al ajuste Auth correspondiente.
3. Auditar P-011 a P-022 para convertir “requiere verificación” en cerrado, parcial o pendiente real.
4. Priorizar núcleo: P-007 Dar clase, P-006 Evaluaciones, P-008 Árboles, P-018 Portal, P-019 Alumnado.
5. Cerrar experiencia: P-004/P-005 Identidad y P-009/P-010 Marketing/Estadísticas.
6. Mantener P-023/P-024 como gates de release.

# Registro

## 11/08/2026 — v1.0

Creado a partir del historial recuperado de conversaciones, decisiones del plugin, migración web, arquitectura GitHub/Supabase/Hostinger/Drive, auditoría visual v23 y estado P16/PR #2.

## 11/08/2026 — v1.1

- P-001 auditado: GitHub correcto; Hostinger sigue pendiente de evidencia de runtime.
- P-002 confirmado contra Security Advisors: `Leaked Password Protection Disabled`.
- P-003 cerrado: baseline real de 52 migraciones documentado.
- P-025 abierto: recuperar 18 fuentes SQL aplicadas que producción conserva pero GitHub no tiene como archivos independientes.

## 11/08/2026 — v1.2

- P-025 cerrado.
- Recuperadas las 18/18 fuentes desde `schema_migrations.statements[1]` a `supabase/applied-history/`.
- Verificación byte por byte 18/18 mediante SHA de objeto Git calculado en Supabase y contrastado con GitHub.
- Ningún SQL histórico fue ejecutado; producción no cambió en este bloque.
