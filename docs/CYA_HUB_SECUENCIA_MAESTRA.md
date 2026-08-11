# CYA HUB — SECUENCIA MAESTRA DEL PROYECTO

**Versión:** 1.3  
**Fecha de corte:** 11 de agosto de 2026  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Plan de ejecución vigente:** `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md` (B00–B12)

## Función de este archivo

Registro histórico y de evidencia. El Plan Maestro B00–B12 gobierna el orden de cierre; `docs/CYA_HUB_PENDIENTES.md` conserva el estado vivo que se entrega al usuario tras cada implementación.

# 1. Etapa histórica WordPress

CYA Hub nació como plugin privado con alumnado, clases, bonos, Correcciones, Explicaciones, Ejercicios, Secuencias, evaluaciones, CRM, notificaciones, ubicaciones, contabilidad, administración, portal alumno y distintas iteraciones de misiones.

Decisión preservada: conservar lógica pedagógica/operativa útil, no el desorden estructural ni duplicidades del plugin.

## 21/07/2026 — V4.1/V5

Se consolidaron modo clase, autosave transaccional, idempotencia, migraciones, misiones, analítica, búsqueda y seguridad. V5 amplió el portal y mantuvo evolución aditiva. PWA/offline compleja dejó de ser dependencia funcional.

## 23–26/07/2026 — auditorías y regresiones

- 2.3.5/2.3.6: preservar compatibilidad y corregir privacidad, bonos/permisos e integraciones parciales.
- 3.4.x: panel profesor y métricas táctiles.
- 9.3.0: descartada por regresión móvil; 9.3.1 recuperó comportamiento estable.

## 27/07/2026 — contrato Dar clase

Flujo consolidado:

**Seleccionar → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar.**

Reglas: notas rápidas, frecuencia/importancia, revisión histórica, máximo orientativo de correcciones, individual/pareja, Guía, Trabajo de hoy, evaluación, cierre administrativo/pedagógico e idempotencia.

## 04–07/08/2026 — reorganización UX

- iPhone como referencia móvil;
- eliminar overflow, pantallas técnicas y duplicidades;
- navegación rápida;
- Inicio contextual con clase dominante 30 min antes;
- Enseñanza relacional;
- evaluación 0/25/50/75/100;
- evitar amarillo fluorescente, login negro e iconos en cuadrados;
- base Dar clase histórica válida: `20.13.24 CLASS-FINISH-HOTFIX`; 20.14/20.15 descartadas.

## 07–08/08/2026 — CRM/Marketing

Persona única para contacto/provisional/alumno; CRM con Fecha, Nombre, Teléfono, País, origen, intención, reserva, bono, importe, observaciones y tarifa. Marketing amplía a contenido, campañas, comunicaciones, eventos y métricas. YouTube/TikTok no son requisitos obligatorios.

# 2. Cambio a aplicación web

## 08/08/2026

Se abandona WordPress como arquitectura canónica.

Arquitectura vigente:

- Next.js + React + Node.js;
- Supabase Auth/datos;
- GitHub `main`;
- Hostinger;
- Google Drive para multimedia operativa por referencias;
- iPhone/PWA standalone sin capa offline compleja.

Proyecto Supabase canónico: **`CyA hub 2`**.

Reglas: no resetear producción, migraciones incrementales/idempotentes, RLS real, no secretos de servicio en cliente, no duplicar funciones/datos.

# 3. Contrato funcional web consolidado

Navegación móvil:

**Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**.

Áreas clave:

- Inicio contextual, saludo/frase/misiones/agenda/avisos;
- Alumnado con clases/bonos/perfiles/formación;
- Dar clase con buscador Correcciones/Explicaciones/Ejercicios/Secuencias;
- Enseñanza con biblioteca/relaciones/árboles;
- Marketing con CRM/tarifas/contenido/campañas/eventos/estadísticas;
- multirol Profesor+Alumno+Admin cuando autorizado;
- Ver como sin elevar permisos;
- portal alumno seguro;
- formularios versionables;
- agenda Google Calendar idempotente;
- import/export integral;
- multimedia externa y datos canónicos reutilizables.

# 4. 10/08/2026 — auditoría visual v23

Corregido: modales móviles, fullscreen no deseado, scroll de fondo, safe-area, objetivos táctiles, tipografía mínima, overflow y ficha alumno.

Fuera de ese bloque: identidad final, Evaluación, Dar clase, árboles, Marketing y Estadísticas.

# 5. 11/08/2026 — P16/v42

Seguridad RLS alumno/clases cerrada:

- alumno sin SELECT directo sobre `class_pedagogy_summaries`;
- `student_message` preservado;
- `internal_note` aislada;
- preparación de clase protegida;
- dry-run 11/11;
- producción 17/17;
- migración `20260811124729 / v42_rls_student_class_correlation`;
- PR #2;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.

# 6. 11/08/2026 — baseline de migraciones

P-003 cerrado:

- 52 migraciones registradas en producción;
- primera `20260808214303 / teaching_module`;
- última v42;
- bootstrap, registradas y preparadas/no aplicadas separados;
- PR #3 / `a8acf2bf161535d4b84be1ae651d530ddc9248c5`;
- `docs/DATABASE_MIGRATION_BASELINE.md`.

P-025 cerrado:

- 18/18 fuentes antes ausentes recuperadas desde `schema_migrations.statements[1]`;
- archivadas en `supabase/applied-history/` como NO EJECUTABLES;
- 18/18 SHA Git blob coincidentes byte por byte;
- ninguna sentencia reejecutada;
- PR #4 / merge `5999542e6b4bb258aff93aee3b96f6f0d255dda8`.

# 7. 11/08/2026 — Plan Maestro B00–B12

El commit `2af2ce30121f86b1e25b1764e8e1fa3301cf2281` añadió `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md` y unificó el orden operativo con bloques B00–B12.

Regla actual:

- el Plan Maestro define orden;
- la Secuencia conserva historia/evidencia;
- Pendientes conserva estados vivos y se entrega al usuario tras cada implementación.

# 8. 11/08/2026 — auditoría de paridad P-011→P-022

Auditoría directa sobre `main` + Supabase producción. Evidencia detallada: `docs/PARITY_AUDIT_2026-08-11.md`.

## Verificado código/BD, pendiente gate E2E/Hostinger

### P-011 / B08.1 Inicio

Implementado: saludo por nombre/hora, frase diaria, clase dominante ±30 min, siguiente misión, accesos rápidos, resumen diario, Administración, notificaciones, cuenta/perfil y cambio de portal. 15 frases activas.

### P-013 / B01.2 Multirol

Existe una identidad con admin+teacher+student activos; selector de portal se limita a capacidades reales. No modifica autorización.

### P-016 / B03.2 Import/export

XLSX/CSV/JSON, preview, estrategias de duplicados, dominios y backup/restore completo no destructivo presentes.

### P-020 / B01.1 Navegación

Cinco accesos principales implementados. Falta gate iPhone/Hostinger.

## Parcial con brecha concreta

### P-012 / B08.2 Misiones

Ocho reglas iniciales y motor BD completo. Administración todavía no expone frecuencia/días/hora, peso, anticipación, estrategia de duplicados, fallo, evidencia, canales/destinatarios, escalado y toda la configuración de horas silenciosas.

### P-014 / B08.3 Agenda

Día/Semana/Mes/Lista y filtros existen. Producción tiene 0 conexiones Google Calendar; falta flujo OAuth/sync real.

### P-015 / B03.1 Formularios

18 formularios/18 versiones/68 campos activos. Falta renderer reusable: los formularios operativos continúan mayoritariamente hardcoded en React.

### P-017 / B08.4 Notificaciones

Centro interno funcional. 13 reglas activas usan actualmente solo `internal`; faltan canales automáticos externos si forman parte del contrato final.

### P-018 / B06 Portal

Portal rico y seguro; P16 protege notas internas. Existe infraestructura de `class_preparation_requests`, pero no se localiza UI alumno para crear/editar preparación previa.

### P-019 / B02 Alumnado

Ficha maestra integra resumen, formación, evaluación, clases, bonos, datos, CRM, baile e incidencias. Falta cerrar conversión/deduplicación canónica.

### P-021 / B10 Multimedia

Enseñanza/clases/marketing usan Drive + tickets. Excepción: avatar se guarda en bucket público Supabase Storage `avatars`; debe formalizarse o migrarse.

### P-022 / B01.3/B02.2 Fuente canónica

Hoy producción tiene 0 grupos duplicados por email y 0 por teléfono. `auth_user_id` es UNIQUE. Sin embargo `create_student` y `save_crm_contact` pueden insertar una persona nueva sin buscar coincidencias previas y email no es UNIQUE.

**Resultado:** riesgo preventivo real; siguiente corrección técnica prioritaria.

# 9. Bloqueos actuales

## B00.1 / P-001 Hostinger

Sin herramientas de despliegue/log Node.js en el conector Hostinger cargado; no se declara runtime verificado.

## B00.2 / P-002 Auth

Security Advisor confirma `Leaked Password Protection Disabled`; requiere ajuste Auth, no SQL.

# 10. Siguiente bloque técnico

Mientras B00.1/B00.2 no puedan cerrarse por acceso/configuración externa, el siguiente cambio preparable es:

**B01.3/B02.2 — endurecimiento de identidad y deduplicación de personas.**

Objetivo:

- evitar nuevos duplicados por email/teléfono;
- reutilizar `person_id` existente;
- preservar CRM/student_profile;
- no fusionar personas ambiguas automáticamente;
- mantener migración incremental y reversible;
- añadir pruebas de regresión antes de producción.

Después: Misiones Admin → renderer Formularios → preparación Portal → Google Calendar → canales externos → política avatar.

# 11. Protocolo permanente

Tras cada implementación registrar:

```text
FECHA/HORA:
BLOQUE Bxx:
REQUISITOS AFECTADOS:
CAMBIO:
BD/MIGRACIÓN:
COMMIT/PR:
PRUEBAS:
PRODUCCIÓN:
REGRESIONES:
PENDIENTES NUEVOS:
PENDIENTES CERRADOS:
SIGUIENTE BLOQUE:
```

Actualizar siempre:

1. Plan Maestro cuando cambie el orden/estado macro;
2. esta Secuencia como evidencia histórica;
3. `CYA_HUB_PENDIENTES.md` como estado vivo entregable.
