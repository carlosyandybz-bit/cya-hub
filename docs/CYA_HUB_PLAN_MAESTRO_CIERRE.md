# CYA HUB — PLAN MAESTRO ÚNICO DE CIERRE

**Versión:** 3.1  
**Fecha de corte:** 11 de agosto de 2026  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Producción:** `main` + Supabase `CyA hub 2` + Hostinger  
**Último cierre completo:** P16 / v42  
**Subcierre actual:** P17.1 — Reconciliación Point12R  
**Trabajo exacto activo:** **P17.2 — Frontend final de Evaluaciones**

---

# 1. REGLA OPERATIVA

Este es el único orden de cierre funcional: **P17 → P32**. No se reinicia numeración y no se abren puntos posteriores antes de cerrar el anterior, salvo gates permanentes G1–G5.

Antes de cada actualización se mostrará:

```text
CYA HUB — PLAN PENDIENTE ANTES DE EMPEZAR

✅ CERRADO
▶ AHORA
⏳ FALTA DESPUÉS
⚠ GATES / RIESGOS
```

Después de cada implementación se actualizarán:

1. este Plan Maestro;
2. `docs/CYA_HUB_SECUENCIA_MAESTRA.md`;
3. `docs/CYA_HUB_PENDIENTES.md`;
4. el usuario recibirá el archivo de pendientes actualizado.

---

# 2. BASELINE RECORRIDO

## P12 — Modelo de evaluaciones
**Estado:** recorrido históricamente; cierre final dentro de P17.

## P13 — Radar interactivo
**Estado:** recorrido históricamente; cierre final dentro de P17.

## P14 — Historial/evolución
**Estado:** implementado/validado; cierre final dentro de P17.

## P15 — Resumen real de progreso
**Estado:** implementado/validado; cierre final dentro de P17.

## P16 — Seguridad RLS alumno–clases / v42
**Estado:** ✅ CERRADO EN PRODUCCIÓN

- migración `20260811124729 / v42_rls_student_class_correlation`;
- dry-run 11/11;
- producción 17/17;
- PR #2;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.

### Cierres técnicos sin número nuevo

**Baseline migraciones:** ✅ 52 migraciones documentadas.  
**18 SQL históricos:** ✅ 18/18 recuperados y verificados byte por byte, sin reejecución.

---

# 3. GATES PERMANENTES

## G1 — Hostinger runtime
**Estado:** 🔴 ABIERTO

Antes de P32: commit desplegado, `/`, `/api/runtime-config`, login/sesión, rutas, secretos y errores runtime. El conector disponible actualmente no expone despliegues/logs Node.js suficientes para cerrarlo.

## G2 — Supabase Auth
**Estado:** 🔴 ABIERTO CONFIRMADO

Security Advisors: `Leaked Password Protection Disabled`. Es configuración Auth, no SQL.

## G3 — Smoke iPhone
**Estado:** permanente

Safe-area, scroll, teclado, Safari, modales, formularios, barra inferior y navegación después de cambios UI relevantes.

## G4 — Regresión transversal
**Estado:** permanente

Persona, conversión, bono, clase, cierre, formación, evaluación, portal, CRM/Marketing, import/export y permisos Profesor/Alumno/Admin.

## G5 — Datos y multimedia
**Estado:** permanente

Persona canónica, datos conocidos reutilizados, sin duplicación, multimedia pesada fuera de GitHub/DB, referencias/IDs cuando corresponda y secretos fuera del cliente.

---

# 4. P17 — CIERRE REAL DE EVALUACIONES + POINT12R

**Prioridad:** P1  
**Estado global:** ▶ EN CURSO  
**Absorbe:** P12–P15 final, antiguo P-006 y deuda de PR #1.

## P17.1 — Reconciliación/auditoría
**Estado:** ✅ CERRADO

Evidencia: `docs/P17_EVALUATION_RECONCILIATION.md`.

### Conclusiones

- PR #1 `agent/point12r-evaluations` sigue abierta, draft y no mergeable.
- No debe fusionarse íntegramente.
- Usa superficies antiguas que fueron absorbidas/superadas por v34–v41.
- El motor actual sí tiene una única base de datos efectiva por `evaluation_sessions` + `student_evaluations` + progreso.
- `save_class_evaluation_v2` es compatibilidad sobre el motor de sesiones, no almacenamiento paralelo.
- escala activa: `0/25/50/75/100`;
- niveles activos: Inicio/Intermedio/Avanzado;
- producción: 6 sesiones, 5 completadas, 48 puntuaciones, 8 filas de progreso;
- hitos activos: 0;
- descriptores activos: 0;
- v36 protege visibilidad del alumno;
- v40 soporta revisión postclase;
- v41a soporta evaluación inicial guiada;
- v35c no está aplicada;
- v41c sigue correctamente PREPARED-NOT-APPLIED.

## P17.2 — Frontend final de Evaluaciones
**Estado:** ▶ AHORA

### Trabajo obligatorio

1. Sustituir la pestaña/formulario genérico de evaluación formal durante cualquier clase activa.
2. Usar `start_initial_evaluation` para evaluación inicial guiada solo cuando el contexto la requiera.
3. Integrar `prepare_post_class_evaluation(s)` + `review_evaluation_question` + `complete_post_class_evaluation` después del cierre administrativo y antes del pedagógico.
4. Migrar `student-detail` fuera de RPC que el cutover final revocará o definir una API final compatible para evaluación manual legítima fuera de clase.
5. Mantener:
   - Inicio/Intermedio/Avanzado;
   - 0/25/50/75/100;
   - cinco opciones táctiles;
   - radar profesor;
   - progreso/radar alumno;
   - historial/evolución;
   - reevaluación;
   - persistencia.
6. Validar reglas Bachata/Bachazouk.
7. Añadir tests que impidan reintroducir `save_class_evaluation_v2` en el flujo vivo final.
8. Build + regresión.

### Brecha demostrada

- `app/cya-app.tsx` mantiene una pestaña **Evaluar** durante clase activa y usa `save_class_evaluation_v2`.
- `app/student-detail.tsx` usa sesiones modernas, pero aún depende de RPC que v41c pretende revocar.

## P17.3 — Cutover v41c
**Estado:** 🟡 BLOQUEADO POR P17.2

No aplicar `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` hasta demostrar:

- cero dependencias frontend de RPC revocadas;
- tests verdes;
- dry-run transaccional;
- Profesor/Alumno/Admin correctos;
- portal alumno correcto;
- advisors revisados.

## Cierre P17

Evaluaciones quedan con un único contrato público final, sin merge accidental de PR #1, sin superficie genérica heredada en clase y con inicial/postclase/portal coherentes.

---

# 5. P18→P32 — ORDEN PENDIENTE COMPLETO

## P18 — Identidad, roles, navegación y “Ver como”
**Estado:** ⏳ PENDIENTE · P1

- navegación `Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`;
- DAR CLASE central;
- sin hamburguesa principal;
- Profesor+Alumno+Admin autorizado;
- identidad única;
- Ver como cambia experiencia, no permisos;
- RLS/server-side real.

**Cierre:** multirol E2E sin duplicación/escalada.

## P19 — Alumnado y modelo único de personas
**Estado:** ⏳ PENDIENTE · P1

Potencial/contacto → provisional → registrado/alumno; conversiones sin pérdida; nombres correctos; datos personales/baile; clases; bonos; evolución; formación; CRM; incidencias; persona canónica.

**Cierre:** conversión completa sin duplicación ni pérdida.

## P20 — Formularios versionables y datos canónicos
**Estado:** ⏳ PENDIENTE · P1

Definición, versión, campos, opciones, requerido, visibilidad, condiciones, validación, orden, renderer reusable, validación servidor y datos canónicos reutilizados.

**Cierre:** formularios reales gobernados por una única fuente de verdad.

## P21 — Dar clase definitivo
**Estado:** ⏳ PENDIENTE · P0/P1

**Seleccionar → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar**; programada/manual; pareja; buscador unificado; Crear rápido; Trabajo de hoy; Guía; saldo; incidencias; persistencia; idempotencia; evaluación reconciliada con P17.

**Cierre:** clase individual y pareja E2E sin pérdida.

## P22 — Portal alumno completo
**Estado:** ⏳ PENDIENTE · P1

Próxima clase, historial, bonos/saldo, formación completa, multimedia, evolución, evaluaciones, perfil, preparación previa, mensajes autorizados, sin `internal_note`, RLS y Ver como Alumno.

## P23 — Enseñanza, relaciones y árboles táctiles
**Estado:** ⏳ PENDIENTE · P1

Biblioteca, cuatro tipos, categorías, relaciones, prerequisitos, homólogas L/F, estilos/niveles, asignaciones, incompletos, búsqueda, filtros, pan/zoom/rutas/reset, iPhone y Drive.

## P24 — Inicio contextual definitivo
**Estado:** ⏳ PENDIENTE · P1

Saludo/frase, clase dominante 30 min antes, siguiente acción, avisos, accesos rápidos, resumen, Administración, Ver como y cuenta/perfil.

## P25 — Motor de Misiones
**Estado:** ⏳ PENDIENTE · P1

Tipos/estados/prioridades, reglas iniciales, vencimientos, bloqueo, duplicados, evidencia, destinatarios, canales, horas silenciosas, servidor/BD, Inicio/calendario.

## P26 — Agenda, calendario y Google Calendar
**Estado:** ⏳ PENDIENTE · P1

Día/Semana/Mes/Lista; clases/misiones/eventos; conflictos; Google Calendar; id externo; sync/errores; idempotencia y preservación de relaciones.

## P27 — Notificaciones
**Estado:** ⏳ PENDIENTE · P2

Eventos, destinatarios, canales, persistencia, leído/no leído, deduplicación, clases/bonos/misiones/calendario y privacidad.

## P28 — Importación/exportación integral
**Estado:** ⏳ PENDIENTE · P1

Personas, contactos, clases, bonos, cuatro tipos de enseñanza, evaluaciones, configuración, preview, duplicados, errores, transaccionalidad, idempotencia y relaciones.

## P29 — Marketing, CRM, tarifas, campañas, eventos y multimedia
**Estado:** ⏳ PENDIENTE · P2

CRM, contactos, tarifas, captación, contenido, campañas, email/WhatsApp cuando corresponda, eventos/promoción, persona canónica y Drive.

## P30 — Estadísticas y métricas
**Estado:** ⏳ PENDIENTE · P2

KPIs trazables de alumnado, clases, bonos/negocio, enseñanza/evolución, CRM/Marketing, filtros, gráficos legibles y sin métricas decorativas.

## P31 — Administración, identidad visual y configuración final
**Estado:** ⏳ PENDIENTE · P2/P3

Configuración general, roles, misiones, formularios, pedagogía, import/export, integraciones, seguridad/diagnóstico, colores/logo/cabecera/tipografía, contraste, sin amarillo fluorescente, sin negro no solicitado e iPhone/escritorio coherentes.

## P32 — Auditoría transversal final, producción y release
**Estado:** ⏳ PENDIENTE FINAL · P0/P1

E2E completo, seguridad/RLS/Auth/roles/secretos, G1 Hostinger, G2 Auth, G3 iPhone, G4 regresión y G5 datos/multimedia.

**Solo P32 puede declarar CYA Hub listo para uso real.**

---

# 6. RESUMEN QUE SE MOSTRARÁ AL USUARIO

```text
✅ P12 — Modelo de evaluaciones — recorrido
✅ P13 — Radar interactivo — recorrido
✅ P14 — Historial de evaluación — recorrido
✅ P15 — Resumen real de progreso — recorrido
✅ P16 — Seguridad RLS/v42 — CERRADO PRODUCCIÓN
✅ P17.1 — Reconciliación Point12R — CERRADA

▶ P17.2 — Frontend final de Evaluaciones
🟡 P17.3 — Cutover v41c — bloqueado por P17.2
⏳ P18 — Identidad + roles + navegación + Ver como
⏳ P19 — Alumnado + persona única
⏳ P20 — Formularios versionables + datos canónicos
⏳ P21 — Dar clase definitivo
⏳ P22 — Portal alumno completo
⏳ P23 — Enseñanza + relaciones + árboles
⏳ P24 — Inicio contextual
⏳ P25 — Misiones
⏳ P26 — Agenda + Google Calendar
⏳ P27 — Notificaciones
⏳ P28 — Importación/exportación integral
⏳ P29 — Marketing + CRM + tarifas + campañas + eventos + multimedia
⏳ P30 — Estadísticas
⏳ P31 — Administración + identidad visual final
⏳ P32 — QA transversal + Hostinger + seguridad + release
```

---

# 7. REGLAS INQUEBRANTABLES

- No reconstruir una función ya correcta.
- Auditar `main` y Supabase antes de implementar.
- No resetear Supabase.
- Migraciones nuevas incrementales/verificables.
- No aplicar `PREPARED-NOT-APPLIED` sin evidencia.
- No fusionar ramas antiguas divergentes a ciegas.
- No reintroducir WordPress ni ChatGPT Sites como producción.
- No reintroducir 9.3.0 ni 20.14/20.15 como base Dar clase.
- No hamburguesa principal.
- No amarillo fluorescente.
- No duplicar personas.
- No volver a pedir datos conocidos.
- No exponer notas internas.
- No multimedia pesada en GitHub/DB.
- No secretos administrativos en frontend/GitHub.
- iPhone sigue siendo referencia móvil.

---

# 8. ÚLTIMA ACTUALIZACIÓN

```text
FECHA: 11/08/2026
ACTUALIZACIÓN: P17.1
REQUISITOS: reconciliación P12–P15 + PR #1 + v35c/v41c
CAMBIO: auditoría técnica y decisión de arquitectura
BD/MIGRACIÓN: ninguna aplicada
PRUEBAS: inspección main + funciones/tablas/datos de producción
PRODUCCIÓN: sin cambios
REGRESIONES: ninguna introducida
PENDIENTES CERRADOS: P17.1
PENDIENTES NUEVOS: ninguno; P17.2/P17.3 quedan explicitados
SIGUIENTE: P17.2 — Frontend final de Evaluaciones
```
