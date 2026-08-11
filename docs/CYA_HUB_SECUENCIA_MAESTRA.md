# CYA HUB — SECUENCIA MAESTRA DEL PROYECTO

**Versión:** 1.3  
**Fecha de corte:** 11 de agosto de 2026  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Producción:** `main` + Supabase `CyA hub 2` + Hostinger  
**Plan operativo vigente:** `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md`

## Función

Este archivo conserva la historia, decisiones, arquitectura y evidencia de CYA Hub. El Plan Maestro gobierna el orden P17→P32 y `docs/CYA_HUB_PENDIENTES.md` es el tablero vivo que se entrega al usuario después de cada implementación.

---

# 1. ETAPA HISTÓRICA WORDPRESS / PLUGIN

CYA Hub nació como plugin privado con:

- alumnado;
- clases;
- bonos;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- evaluaciones;
- CRM;
- notificaciones;
- ubicaciones;
- contabilidad;
- administración;
- portal alumno;
- distintas iteraciones de misiones/gamificación.

Principio preservado: **mantener la lógica pedagógica y operativa útil, no el desorden estructural ni las duplicidades del plugin.**

## 21/07/2026 — V4.1 / V5

Se consolidaron modo clase, autosave transaccional, idempotencia, migraciones, misiones, analítica, búsqueda y seguridad. V5 amplió el portal y mantuvo evolución aditiva. PWA/offline compleja dejó de ser dependencia funcional.

## 23–26/07/2026 — auditorías y regresiones

- 2.3.5/2.3.6: preservar compatibilidad y corregir privacidad, bonos/permisos e integraciones parciales.
- 3.4.x: panel profesor y métricas táctiles.
- 9.3.0: descartada por regresión móvil; 9.3.1 recuperó comportamiento estable.

## 27/07/2026 — contrato Dar clase

Flujo histórico consolidado:

**Seleccionar → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar.**

Reglas: notas rápidas, frecuencia/importancia, histórico, Guía, Trabajo de hoy, individual/pareja, evaluación, cierre administrativo/pedagógico, saldo e idempotencia.

## 04–07/08/2026 — reorganización UX

- iPhone como referencia móvil;
- eliminar overflow, pantallas técnicas y duplicidades;
- Inicio contextual con clase dominante 30 min antes;
- navegación rápida;
- Enseñanza relacional;
- evaluación 0/25/50/75/100;
- sin amarillo fluorescente;
- sin login negro no solicitado;
- sin iconos sistemáticamente en cuadrados;
- base Dar clase histórica válida: `20.13.24 CLASS-FINISH-HOTFIX`;
- 20.14/20.15 descartadas como base.

## 07–08/08/2026 — CRM / Marketing

Persona única para contacto/provisional/alumno; CRM con datos comerciales canónicos. Marketing amplía a contenido, campañas, comunicaciones, eventos y métricas. YouTube/TikTok no son requisitos obligatorios.

---

# 2. CAMBIO A APLICACIÓN WEB — 08/08/2026

Se abandona WordPress como arquitectura canónica.

Arquitectura vigente:

- Next.js + React + Node.js;
- Supabase Auth/datos;
- GitHub `main`;
- Hostinger;
- Google Drive para multimedia operativa por referencias/IDs;
- PWA standalone en iPhone sin capa offline compleja.

Proyecto Supabase canónico: **`CyA hub 2`**.

Reglas:

- no resetear producción;
- migraciones incrementales/idempotentes cuando proceda;
- RLS real;
- no secretos administrativos en frontend/GitHub;
- no duplicar funciones ni personas;
- no volver a pedir datos canónicos ya conocidos.

---

# 3. CONTRATO FUNCIONAL WEB

Navegación móvil:

**Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**

Contratos principales:

- Inicio contextual;
- Alumnado como núcleo de personas/clases/bonos;
- Dar clase con buscador Correcciones/Explicaciones/Ejercicios/Secuencias;
- Enseñanza relacional y árboles táctiles;
- Marketing con CRM/tarifas/campañas/eventos;
- multirol Profesor+Alumno+Admin autorizado;
- “Ver como” sin elevar permisos;
- portal alumno seguro;
- formularios versionables;
- agenda Google Calendar idempotente;
- import/export integral;
- datos canónicos reutilizables;
- multimedia pesada fuera de GitHub/DB.

---

# 4. 10/08/2026 — AUDITORÍA VISUAL v23

Corregido:

- modales móviles;
- fullscreen no deseado;
- scroll de fondo;
- safe-area iOS;
- objetivos táctiles;
- tipografía mínima;
- overflow horizontal;
- ficha alumno.

Fuera de ese bloque: identidad final, Evaluaciones, Dar clase, árboles, Marketing y Estadísticas.

---

# 5. SECUENCIA P12→P16

## P12 — Modelo de evaluaciones

Implementado históricamente; queda reconciliado definitivamente dentro de P17.

## P13 — Radar interactivo

Implementado históricamente; queda reconciliado definitivamente dentro de P17.

## P14 — Historial/evolución

Implementado/validado en código; sujeto al cierre P17.

## P15 — Resumen real de progreso

Implementado/validado en código; sujeto al cierre P17.

## P16 — Seguridad RLS alumno–clases / v42

**Estado:** CERRADO Y VERIFICADO EN PRODUCCIÓN.

Evidencia:

- `20260811124729 / v42_rls_student_class_correlation`;
- dry-run 11/11;
- producción 17/17;
- PR #2;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`;
- `student_message` preservado;
- `internal_note` aislada;
- preparación de clase protegida;
- acceso staff preservado.

---

# 6. CIERRES TÉCNICOS POSTERIORES A P16

## Baseline de migraciones

**CERRADO.**

- 52 migraciones registradas en producción;
- primera `20260808214303 / teaching_module`;
- última v42;
- bootstrap y SQL preparados/no aplicados separados;
- `docs/DATABASE_MIGRATION_BASELINE.md`;
- PR #3 / `a8acf2bf161535d4b84be1ae651d530ddc9248c5`.

## Recuperación forense de 18 SQL históricos

**CERRADO.**

- 18/18 recuperados desde `schema_migrations.statements[1]`;
- archivados en `supabase/applied-history/`;
- marcados NO EJECUTAR / NO REAPLICAR;
- 18/18 verificados byte por byte mediante SHA Git blob;
- PR #4 / `5999542e6b4bb258aff93aee3b96f6f0d255dda8`;
- ninguna sentencia reejecutada.

---

# 7. PLAN MAESTRO ÚNICO — 11/08/2026

El repositorio consolida la secuencia pendiente **P17→P32** en `docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md`.

Regla:

- Plan Maestro = orden operativo;
- Secuencia = historia/evidencia;
- Pendientes = estado vivo entregable;
- G1–G5 = gates permanentes que no rompen la numeración.

---

# 8. P17 — CIERRE REAL DE EVALUACIONES

## P17.1 — Reconciliación Point12R

**Estado:** CERRADO EN AUDITORÍA.

Baseline auditado: `485af0343098330019dd81a13a39aad6335b6481`.

PR histórica #1:

- rama `agent/point12r-evaluations`;
- abierta;
- draft;
- no mergeable;
- 21 commits / 13 archivos;
- no debe fusionarse como bloque;
- usa APIs/modelos anteriores y quedó parcialmente absorbida/superada por v34–v41.

Documento detallado: `docs/P17_EVALUATION_RECONCILIATION.md`.

### Estado real del modelo en producción

Producción contiene:

- `evaluation_sessions`;
- `student_evaluations`;
- `student_aptitude_progress`;
- `evaluation_milestones`;
- `evaluation_descriptors`;
- `evaluation_progress_awards`;
- puntos/recomendaciones de enseñanza relacionados con evaluación.

Corte auditado:

- 6 sesiones;
- 5 completadas;
- 48 puntuaciones;
- 8 filas de progreso;
- 0 hitos activos;
- 0 descriptores activos;
- 0 awards de progreso.

La escala activa cumple **0 / 25 / 50 / 75 / 100** y existen niveles Inicio/Intermedio/Avanzado.

### APIs modernas verificadas

- `start_student_evaluation`;
- `save_evaluation_score`;
- `complete_evaluation_session`;
- `start_initial_evaluation`;
- `review_evaluation_question`;
- `complete_initial_evaluation`;
- `prepare_post_class_evaluation`;
- `prepare_post_class_evaluations`;
- `complete_post_class_evaluation`.

### Compatibilidad heredada

- `save_class_evaluation`;
- `save_class_evaluation_v2`.

`save_class_evaluation_v2` no es un segundo motor de datos: crea/reutiliza sesión y delega en `save_evaluation_score`. La deuda es de flujo/API pública, no de almacenamiento duplicado.

### Flujo final ya soportado por BD

v40:

- revisión formal postclase;
- clase `finished`;
- cierre administrativo realizado;
- cierre pedagógico todavía abierto;
- profesor propietario de revisión;
- sesión `followup`.

v41a:

- evaluación inicial guiada durante clase cuando corresponde;
- clase activa;
- alumno participante;
- estilo/rol válidos;
- sesión `initial`;
- progreso y escala configurada.

v36:

- alumno solo ve evaluación completada;
- si está ligada a clase, exige cierre pedagógico;
- staff conserva acceso a borradores.

### Brecha frontend P17.2

`app/cya-app.tsx` todavía mantiene una pestaña genérica **Evaluar** durante la clase activa y usa `save_class_evaluation_v2`.

`app/student-detail.tsx` ya usa sesiones modernas, pero todavía depende de RPC que el cutover v41c pretende retirar.

Por tanto P17 aún no está cerrado.

### SQL preparados/no aplicados

- `v35c-enforce-post-class-evaluation.sql`: presente, NO aplicada.
- `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql`: explícitamente PREPARADA, NO APLICAR todavía.

Aplicar v41c ahora rompería frontend porque revoca APIs aún utilizadas.

## P17.2 — Frontend final

**SIGUIENTE TRABAJO EXACTO.**

Debe:

1. sustituir evaluación formal genérica de clase activa por evaluación inicial guiada solo cuando proceda;
2. integrar revisión postclase entre cierre administrativo y cierre pedagógico;
3. retirar dependencia frontend de RPC que v41c revocará o definir API final compatible para evaluación manual legítima;
4. conservar escala de cinco opciones, radar, historial y evolución;
5. validar Bachata/Bachazouk;
6. añadir tests de regresión;
7. pasar build.

## P17.3 — Cutover v41c

**BLOQUEADO POR P17.2.**

Solo abrir cuando búsqueda de frontend demuestre cero dependencias de APIs revocadas y las pruebas estén verdes. Después: dry-run, roles, advisors, producción y portal.

---

# 9. SECUENCIA PENDIENTE DESPUÉS DE P17

1. P18 — Identidad, roles, navegación y Ver como.
2. P19 — Alumnado y modelo único de personas.
3. P20 — Formularios versionables y datos canónicos.
4. P21 — Dar clase definitivo.
5. P22 — Portal alumno completo.
6. P23 — Enseñanza, relaciones y árboles táctiles.
7. P24 — Inicio contextual definitivo.
8. P25 — Motor de Misiones.
9. P26 — Agenda, calendario y Google Calendar.
10. P27 — Notificaciones.
11. P28 — Importación/exportación integral.
12. P29 — Marketing, CRM, tarifas, campañas, eventos y multimedia.
13. P30 — Estadísticas y métricas.
14. P31 — Administración, identidad visual y configuración final.
15. P32 — Auditoría transversal, producción y release.

---

# 10. GATES PERMANENTES

## G1 — Hostinger

Pendiente de evidencia del runtime: commit desplegado, runtime-config, login, rutas, secretos y errores.

## G2 — Supabase Auth

`Leaked Password Protection Disabled` confirmado por Security Advisors. Requiere ajuste Auth, no SQL.

## G3 — iPhone

Smoke de safe-area, scroll, teclado, Safari, modales, formularios y navegación tras UI relevante.

## G4 — Regresión transversal

Persona→conversión→bono→clase→cierre→formación→evaluación→portal→Marketing→import/export→roles.

## G5 — Datos/multimedia

Persona canónica, sin duplicación, datos conocidos reutilizados, multimedia pesada fuera de GitHub/DB y secretos fuera del cliente.

---

# 11. DECISIONES QUE NO SE REINTRODUCEN

- WordPress como backend canónico.
- ChatGPT Sites como producción.
- 9.3.0 móvil.
- 20.14/20.15 como base Dar clase.
- hamburguesa para módulos principales.
- amarillo fluorescente.
- duplicación de personas/datos canónicos.
- exposición de notas internas.
- multimedia pesada en GitHub/DB.
- secretos administrativos en frontend.
- PR #1 como merge íntegro automático.
- SQL PREPARED-NOT-APPLIED aplicado por inercia.

---

# 12. PROTOCOLO PERMANENTE

Después de cada implementación registrar:

```text
FECHA/HORA:
ACTUALIZACIÓN Pxx:
REQUISITOS ABSORBIDOS:
CAMBIO:
BD/MIGRACIÓN:
COMMIT/PR:
PRUEBAS:
PRODUCCIÓN:
REGRESIONES:
PENDIENTES CERRADOS:
PENDIENTES NUEVOS:
SIGUIENTE ACTUALIZACIÓN:
```

Actualizar siempre:

1. Plan Maestro cuando cambie estado/orden macro;
2. esta Secuencia como evidencia;
3. `CYA_HUB_PENDIENTES.md` como archivo vivo entregable.

**Último subcierre:** P17.1.  
**Trabajo exacto siguiente:** **P17.2 — Frontend final de Evaluaciones.**
