# CYA HUB — PLAN MAESTRO ÚNICO DE CIERRE

**Versión:** 3.0  
**Fecha de corte:** 11 de agosto de 2026 — 16:01 (Europe/Madrid)  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Producción:** `main` + Supabase `CyA hub 2` + Hostinger  
**Última actualización secuencial cerrada:** **P16 / v42**

---

# 1. QUÉ ES ESTE DOCUMENTO

Este documento **no crea una auditoría nueva** y **no reinicia la numeración**.

Es la combinación operativa de:

1. `docs/CYA_HUB_SECUENCIA_MAESTRA.md` — historia, decisiones, arquitectura, requisitos y secuencia funcional;
2. `docs/CYA_HUB_PENDIENTES.md` — pendientes técnicos, funcionales, visuales y de QA vivos;
3. el estado real actual de GitHub y Supabase.

La secuencia de trabajo continúa donde se quedó: **después de P16**.

Por tanto:

- P12, P13, P14, P15 y P16 conservan su significado histórico real;
- los pendientes del tablero secundario no sustituyen esa numeración;
- los pendientes se absorben desde **P17 en adelante** en el orden correcto de implementación;
- los controles que no son una función concreta se convierten en **gates permanentes** y no rompen la secuencia.

Este archivo es desde ahora la **única hoja de ruta operativa** para terminar CYA Hub.

---

# 2. REGLA OBLIGATORIA ANTES DE CADA ACTUALIZACIÓN

Antes de empezar cualquier actualización P17, P18, P19… se debe mostrar al usuario, sin que tenga que pedirlo de nuevo:

```text
CYA HUB — PLAN PENDIENTE ANTES DE EMPEZAR

✅ CERRADO
- últimas actualizaciones ya terminadas

▶ AHORA
- actualización exacta que empieza
- objetivo
- alcance
- qué pendientes antiguos absorbe

⏳ FALTA DESPUÉS
- TODAS las actualizaciones restantes, en orden
- estado de cada una

⚠ GATES / RIESGOS
- producción
- Supabase / RLS / Auth
- migraciones
- iPhone
- regresiones
- datos / multimedia
```

No basta con mostrar solo el siguiente punto: **debe mostrarse el resto completo del planning pendiente**.

Al terminar cada actualización se actualizará este archivo con:

```text
FECHA/HORA:
ACTUALIZACIÓN:
REQUISITOS/PENDIENTES ABSORBIDOS:
CAMBIOS:
BD/MIGRACIÓN:
COMMIT/PR:
PRUEBAS:
PRODUCCIÓN:
REGRESIONES:
PENDIENTES CERRADOS:
PENDIENTES NUEVOS:
SIGUIENTE ACTUALIZACIÓN:
```

---

# 3. BASELINE SECUENCIAL YA RECORRIDO

El objetivo de esta sección no es reauditar todos los puntos anteriores, sino conservar el hilo real del trabajo.

## P12 — Modelo de evaluaciones

**Estado:** implementado históricamente; queda sujeto al cierre/reconciliación final de P17.

Evidencia GitHub: commit `b56bda2897242d1ed429c5b98f2141cd5d1a0add` — `Implement Point 12 evaluation model`.

## P13 — Radar interactivo de evaluación

**Estado:** implementado históricamente; queda sujeto al cierre/reconciliación final de P17.

Evidencia GitHub: commit `d1bd7048cec15fee5fa987c946eb283bb1076e01` — `Implement Point 13 interactive evaluation radar`.

## P14 — Historial/evolución de evaluaciones

**Estado:** implementado y validado en código; queda sujeto al cierre/reconciliación final de P17.

Evidencia GitHub: commit `10d91aff7ad571324ab95a894eb5f1a626c4884f` — `Validate evaluation history point 14`.

## P15 — Resumen real de progreso

**Estado:** implementado y validado en código; queda sujeto al cierre/reconciliación final de P17.

Evidencia GitHub: commit `a57f89bf6d3704bb65226b0006e0aaa5f2cc59f1` — `Validate real progress summary point 15`.

## P16 — Seguridad RLS alumno–clases / v42

**Estado:** ✅ CERRADO Y VERIFICADO EN PRODUCCIÓN.

Evidencia:

- migración `20260811124729 / v42_rls_student_class_correlation`;
- dry-run 11/11;
- producción 17/17;
- `student_message` preservado;
- `internal_note` aislada;
- operaciones ajenas bloqueadas;
- acceso staff preservado;
- PR #2 fusionada;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.

## Cierres técnicos posteriores que NO consumen número de actualización

### Baseline de migraciones

✅ CERRADO.

- 52 migraciones registradas en producción;
- baseline canónico en `docs/DATABASE_MIGRATION_BASELINE.md`.

### Recuperación de 18 SQL históricos — antiguo P-025

✅ CERRADO.

- 18/18 fuentes recuperadas desde producción;
- archivadas en `supabase/applied-history/`;
- verificadas byte por byte;
- no se ejecutó ni reaplicó SQL histórico.

---

# 4. GATES PERMANENTES

Estos elementos pertenecen a la auditoría combinada, pero **no deben desplazar el orden funcional P17 → P32**.

## G1 — Producción Hostinger — antiguo P-001

**Estado actual:** pendiente de evidencia completa del runtime.

Debe verificarse cuando el conector/herramienta permita demostrarlo y es **obligatorio antes del cierre final P32**.

Comprobar:

- commit realmente desplegado;
- `/`;
- `/api/runtime-config` con `configured:true`;
- login/sesión Supabase;
- rutas principales;
- ausencia de secretos cliente;
- errores runtime relevantes.

No bloqueará innecesariamente el desarrollo si la herramienta disponible no permite leer despliegues/logs, pero nunca podrá darse por cerrado P32 sin evidencia.

## G2 — Supabase Auth — antiguo P-002

**Estado:** pendiente confirmado.

Warning actual: `Leaked Password Protection Disabled`.

Debe activarse cuando la configuración/plan lo permita, probar login/recuperación y volver a pasar Security Advisors. Es requisito de release final.

## G3 — Smoke test iPhone — antiguo P-023

**Estado:** permanente.

Después de cada actualización que afecte UI/flujo móvil:

- safe areas;
- scroll;
- teclado;
- zoom Safari;
- modales;
- formularios;
- barra inferior;
- navegación/retorno;
- orientación cuando proceda.

## G4 — Regresión transversal — antiguo P-024

**Estado:** permanente.

Antes de cerrar cada fase relevante y obligatoriamente en P32:

- crear persona;
- convertir contacto;
- programar clase;
- dar/cerrar clase;
- consumir bono;
- consultar/asignar formación;
- evaluar;
- portal alumno;
- CRM/Marketing;
- import/export;
- permisos Profesor/Alumno/Admin.

## G5 — Datos y multimedia — antiguos P-021/P-022

**Estado:** permanente.

- una persona canónica;
- no duplicar CRM/alumno/profesor;
- no volver a pedir información conocida;
- multimedia pesada en Google Drive;
- Supabase solo referencias/IDs/metadatos cuando corresponda;
- no blobs operativos pesados en GitHub/DB;
- no secretos administrativos en cliente/repositorio.

---

# 5. SECUENCIA ÚNICA PENDIENTE — P17 A P32

El orden siguiente es el orden de implementación. Un punto puede empezar auditando lo que ya existe, pero debe terminar **corrigiendo/completando y validando** su alcance; no se crearán implementaciones duplicadas si la función ya existe correctamente.

---

# P17 — CIERRE REAL DE EVALUACIONES Y RECONCILIACIÓN DE POINT 12R

**Prioridad:** P1  
**Estado:** ▶ SIGUIENTE ACTUALIZACIÓN  
**Absorbe:** antiguo P-006 y la deuda abierta de la PR #1 `Point 12R — evaluation engine rebuild`.

## Por qué va primero

La secuencia real venía de P12 → P13 → P14 → P15 → P16. No tiene sentido abandonar ahora la línea de evaluación dejando una rama histórica divergente y dos SQL de cutover sin decisión final.

La PR #1 está actualmente divergida respecto a `main`: su rama está **21 commits por delante y 57 por detrás** de `main`. **No debe fusionarse a ciegas.**

## Trabajo

1. Comparar la PR #1/Point12R contra `main` actual.
2. Determinar qué funcionalidad de sus 21 commits ya está incorporada/superada en `main`.
3. Extraer solo cualquier comportamiento útil realmente ausente; no reintroducir regresiones.
4. Revisar:
   - `v35c-enforce-post-class-evaluation.sql` — presente pero no registrada como aplicada;
   - `v41c-final-evaluation-cutover-PREPARED-NOT-APPLIED.sql` — preparada y no aplicada.
5. No aplicar ninguna de las dos por inercia: decidir según esquema real y flujo actual.
6. Validar el modelo final:
   - INICIO / INTERMEDIO / AVANZADO;
   - 0/25/50/75/100;
   - cinco opciones táctiles por parámetro;
   - persistencia;
   - parámetros configurables;
   - radar profesor;
   - radar alumno;
   - historial/evolución;
   - reevaluación;
   - evaluación inicial guiada;
   - revisión postclase del profesor;
   - Bachata/Bachazouk según reglas vigentes;
   - visibilidad correcta para alumno.
7. Resolver el estado de la PR #1 solo cuando exista evidencia de que su contenido está absorbido o descartado justificadamente.

## Cierre

Evaluaciones quedan con un único modelo activo, sin doble motor, sin ramas antiguas susceptibles de merge accidental y con regresiones cubiertas.

---

# P18 — IDENTIDAD, ROLES, NAVEGACIÓN Y “VER COMO”

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguos P-013, P-020 y parte estructural de P-022.

## Trabajo

- navegación definitiva móvil: **Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**;
- DAR CLASE central, mayor y elevado;
- sin hamburguesa para funciones principales;
- escritorio con la misma arquitectura conceptual;
- roles simultáneos Profesor + Alumno + Administrador autorizado;
- una sola identidad/persona;
- “Ver como” Profesor/Alumno/Administrador;
- “Ver como” cambia experiencia, nunca permisos reales;
- profesor puede tener expediente de alumno y autoevaluarse;
- RLS/server-side valida identidad real;
- Administración separada de la navegación docente normal cuando corresponda.

## Cierre

Una persona multirol navega correctamente en los tres contextos sin duplicarse y sin escalada de permisos.

---

# P19 — ALUMNADO Y MODELO ÚNICO DE PERSONAS

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-019 y parte de P-022.

## Trabajo

- potencial/contacto;
- provisional;
- registrado;
- alumno real cuando tiene clase o bono comprado;
- conversiones sin pérdida de datos;
- impedir nombres convertidos en `Persona`;
- datos personales y de baile;
- roles/estilos;
- evaluaciones/evolución;
- clases;
- bonos/saldo;
- historial;
- formación;
- feedback;
- incidencias;
- programar clase;
- añadir bono;
- identidad única compartida con CRM sin mezclar expediente comercial/pedagógico.

## Cierre

Crear contacto → convertir → completar perfil → añadir bono → programar clase → consultar historial/formación sin pérdida ni duplicación.

---

# P20 — FORMULARIOS VERSIONABLES Y DATOS CANÓNICOS

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-015 y reglas de P-022.

## Trabajo

Sistema reusable/versionable con:

- definición;
- versión;
- campos;
- opciones;
- requerido;
- visibilidad;
- condiciones;
- validación;
- orden;
- info/texto/textarea/select/multiselect/checkbox/número/fecha/email/teléfono;
- validación de servidor;
- reutilización de formularios históricos útiles;
- no volver a preguntar datos canónicos existentes;
- jerarquía `override clase → preferencia estilo → global → preguntar si falta` cuando aplique.

## Cierre

Los formularios relevantes funcionan con una única fuente de verdad, validación real y sin duplicar preguntas/datos.

---

# P21 — DAR CLASE: FLUJO OPERATIVO DEFINITIVO

**Prioridad:** P0/P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-007.

## Flujo obligatorio

**Seleccionar alumno/clase → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar**

## Trabajo

- clase programada/manual;
- fecha/hora/duración heredadas;
- ubicación cuando falte;
- individual/pareja;
- 3 minutos iniciales;
- notas rápidas;
- frecuencia/importancia;
- correcciones anteriores;
- progreso;
- evaluación rápida;
- buscador unificado Correcciones/Explicaciones/Ejercicios/Secuencias;
- búsqueda por título/etiquetas/categoría/descripción/relaciones;
- prioridad por activo del alumno/contexto;
- Crear rápido;
- incompleto/borrador/solo profesores;
- Trabajo de hoy separado del histórico;
- Guía;
- cambio rápido entre integrantes de pareja;
- concurrencia prevista;
- Terminar clase: asistencia/cobro/bono/incidencias;
- Cerrar clase: contenido/evaluación/cierre pedagógico;
- persistencia e idempotencia;
- consumo correcto de saldo;
- pendientes/misiones si queda trabajo abierto.

## Cierre

Clase individual y clase en pareja completadas de principio a fin sin pérdida de datos ni regresiones.

---

# P22 — PORTAL ALUMNO COMPLETO

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-018 y parte funcional de P-013.

## Trabajo

- próxima clase;
- historial;
- bonos/saldo;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- multimedia autorizada;
- evolución;
- evaluaciones;
- perfil;
- preparación previa de clase cuando corresponda;
- mensajes del profesor autorizados;
- ningún `internal_note`;
- RLS real;
- coherencia con “Ver como Alumno”.

## Cierre

Alumno real y profesor en “Ver como Alumno” ven la misma experiencia funcional permitida, sin exposición de datos internos.

---

# P23 — ENSEÑANZA, RELACIONES Y ÁRBOLES TÁCTILES

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-008.

## Trabajo

- Biblioteca;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- categorías;
- relaciones;
- prerequisitos;
- homólogas Leader/Follower;
- estilos bachata/salsa/zouk/bachazouk;
- niveles;
- asignaciones;
- incompletos;
- búsqueda global;
- filtros estilo/rol/nivel/tipo/búsqueda;
- árbol/mapa táctil;
- pan/zoom;
- centrar;
- ruta;
- volver/reset;
- UX iPhone;
- multimedia Drive por referencias.

## Cierre

Contenido pedagógico puede crearse, relacionarse, buscarse, asignarse y recorrerse cómodamente en móvil sin romper visibilidad ni relaciones.

---

# P24 — INICIO CONTEXTUAL DEFINITIVO

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-011.

## Trabajo

- saludo por hora y nombre;
- mañana 05:00–11:59;
- tarde 12:00–19:59;
- noche 20:00–04:59;
- frase diaria persistente;
- clase próxima domina 30 minutos antes;
- siguiente acción;
- avisos;
- accesos rápidos;
- resumen del día;
- acceso Administración;
- Ver como;
- cuenta/perfil;
- experiencia contextual y rápida, no dashboard sobrecargado.

## Cierre

Inicio prioriza de forma fiable lo que toca hacer y sirve como lanzador rápido real.

---

# P25 — MOTOR DE MISIONES

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-012.

## Trabajo

- tipos principal/diaria/crecimiento;
- estados consolidados;
- prioridades normal/prioritaria/urgente;
- cierres de clase;
- bono bajo/vencimiento;
- perfil incompleto;
- corrección sin explicación;
- preparación de clase;
- añadir contenido;
- revisar información;
- completar contenido interno;
- vencimientos;
- bloqueo;
- duplicados;
- destinatarios;
- canales;
- horas silenciosas;
- evidencia;
- configuración servidor/BD;
- integración con Inicio y calendario.

## Cierre

Misiones se generan, priorizan, vencen, completan y muestran correctamente sin duplicados ni lógica solo cliente.

---

# P26 — AGENDA, CALENDARIO Y GOOGLE CALENDAR

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-014.

## Trabajo

- Día/Semana/Mes/Lista;
- clases/misiones/eventos;
- conflictos;
- identificación clara de clases por alumno+fecha;
- Google Calendar;
- id externo;
- última sincronización;
- estado/error;
- sync idempotente;
- no destruir participantes, saldo, estado pedagógico ni historia.

## Cierre

Crear/editar/sincronizar calendario varias veces no duplica ni corrompe datos.

---

# P27 — NOTIFICACIONES

**Prioridad:** P2  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-017.

## Trabajo

- eventos;
- destinatarios;
- canales;
- persistencia;
- leído/no leído;
- deduplicación;
- integración con clases;
- bonos;
- misiones;
- calendario cuando corresponda;
- privacidad por rol.

## Cierre

Matriz evento → destinatario → canal probada sin duplicados ni filtraciones entre usuarios.

---

# P28 — IMPORTACIÓN / EXPORTACIÓN INTEGRAL

**Prioridad:** P1  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-016 del tablero de pendientes. **No confundir con P16/v42 histórico.**

## Por qué va aquí

Se implementa cuando personas, formularios, clases, evaluaciones y enseñanza ya tienen modelos estabilizados; hacerlo antes obligaría a rehacer importadores/exportadores cada vez que cambie una entidad.

## Trabajo

- alumnos;
- contactos;
- clases;
- bonos;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- evaluaciones;
- configuración relevante;
- CSV/formatos necesarios;
- vista previa;
- detección de duplicados;
- errores por fila/entidad;
- transaccionalidad;
- idempotencia;
- conservación de relaciones.

## Cierre

Exportar → importar en entorno controlado → verificar entidades/relaciones/datos canónicos sin pérdidas ni duplicados.

---

# P29 — MARKETING, CRM, TARIFAS, CAMPAÑAS, EVENTOS Y MULTIMEDIA

**Prioridad:** P2  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-009 y la implementación concreta relacionada con P-021.

## Trabajo

- CRM;
- contactos;
- tarifas;
- captación;
- creación/planificación de contenido;
- campañas;
- comunicaciones WhatsApp/email cuando corresponda;
- fotos/vídeos;
- eventos;
- promoción;
- pipeline/estados útiles;
- reutilizar la persona canónica;
- multimedia en Google Drive por referencias/IDs;
- no YouTube/TikTok obligatorio salvo decisión nueva.

## Cierre

Flujo contacto → seguimiento → tarifa/campaña/evento funciona sin duplicar persona ni almacenar multimedia pesada incorrectamente.

---

# P30 — ESTADÍSTICAS Y MÉTRICAS

**Prioridad:** P2  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguo P-010.

## Trabajo

- definir KPIs reales;
- alumnado;
- clases;
- bonos/negocio;
- enseñanza;
- evolución;
- CRM;
- marketing;
- campañas/eventos cuando exista dato;
- filtros;
- jerarquía;
- navegación táctil;
- gráficos legibles en iPhone;
- no mostrar métricas decorativas sin fuente real.

## Cierre

Cada KPI tiene fuente de datos verificable y la interfaz permite entender tendencias/estado sin inconsistencias.

---

# P31 — ADMINISTRACIÓN, IDENTIDAD VISUAL Y CONFIGURACIÓN FINAL

**Prioridad:** P2/P3  
**Estado:** ⏳ PENDIENTE  
**Absorbe:** antiguos P-004 y P-005, más el cierre visual/administrativo consolidado.

## Trabajo

### Administración

- configuración general;
- roles/permisos;
- misiones;
- formularios;
- pedagogía;
- import/export;
- integraciones;
- seguridad/diagnóstico;
- control administrativo;
- configuración persistida en servidor/BD cuando corresponda.

### Identidad visual

- colores CYA;
- logo;
- cabecera;
- tipografía;
- coherencia visual;
- botones morados con contraste correcto;
- sin amarillo fluorescente;
- sin fondos/login negros no solicitados;
- iconos sin cuadrados decorativos sistemáticos;
- DAR CLASE destacado;
- iPhone y escritorio;
- apariencia configurable solo dentro de las decisiones vigentes, sin reintroducir modo oscuro por defecto.

## Cierre

La aplicación se ve y se siente como un único producto terminado, no como módulos construidos en momentos distintos.

---

# P32 — AUDITORÍA TRANSVERSAL FINAL, PRODUCCIÓN Y RELEASE

**Prioridad:** P0/P1  
**Estado:** ⏳ PENDIENTE FINAL

## Trabajo obligatorio

### Flujos

- crear persona;
- convertir contacto;
- añadir bono;
- programar clase;
- dar clase;
- cerrar administrativa/pedagógicamente;
- consumir saldo;
- asignar formación;
- evaluar;
- consultar evolución;
- portal alumno;
- Inicio/Misiones/Agenda;
- Enseñanza;
- Marketing;
- import/export;
- Profesor/Alumno/Admin.

### Seguridad

- RLS;
- Auth;
- funciones `SECURITY DEFINER`;
- secretos;
- roles;
- Ver como;
- aislamiento de notas internas;
- permisos de multimedia.

### Producción

Cerrar G1:

- commit de `main` identificado en Hostinger;
- runtime config;
- Supabase real;
- login;
- rutas;
- errores/logs cuando haya acceso;
- deploy reproducible.

Cerrar G2:

- protección de contraseñas filtradas resuelta o evidencia documentada de imposibilidad por plan/configuración y decisión explícita de release.

Cerrar G3/G4:

- smoke test iPhone completo;
- regresión transversal completa.

## Cierre final

Solo después de P32 puede declararse **CYA Hub listo para uso real/producción**.

---

# 6. MAPEO COMPLETO DE LA SEGUNDA AUDITORÍA AL PLAN ÚNICO

| Pendiente antiguo | Destino en plan único | Estado |
|---|---|---|
| P-001 Hostinger | G1 + P32 | Pendiente |
| P-002 Auth leaked passwords | G2 + P32 | Pendiente |
| P-003 baseline migraciones | Baseline cerrado | ✅ Cerrado |
| P-004 identidad visual | P31 | Pendiente |
| P-005 tipografía/apariencia | P31 | Pendiente |
| P-006 evaluaciones | P17 | Siguiente |
| P-007 Dar clase | P21 | Pendiente |
| P-008 árboles Enseñanza | P23 | Pendiente |
| P-009 Marketing | P29 | Pendiente |
| P-010 Estadísticas | P30 | Pendiente |
| P-011 Inicio contextual | P24 | Pendiente |
| P-012 Misiones | P25 | Pendiente |
| P-013 multirol/Ver como | P18 + P22 | Pendiente |
| P-014 Agenda/calendario | P26 | Pendiente |
| P-015 formularios | P20 | Pendiente |
| P-016 import/export | P28 | Pendiente |
| P-017 notificaciones | P27 | Pendiente |
| P-018 portal alumno | P22 | Pendiente |
| P-019 Alumnado | P19 | Pendiente |
| P-020 navegación | P18 | Pendiente |
| P-021 multimedia externa | G5 + P23/P29 | Permanente/Pendiente |
| P-022 datos canónicos | G5 + P18/P19/P20 | Permanente/Pendiente |
| P-023 iPhone smoke | G3 + P32 | Permanente |
| P-024 regresión transversal | G4 + P32 | Permanente |
| P-025 recuperar SQL | Baseline cerrado | ✅ Cerrado |

Ningún pendiente de la segunda auditoría desaparece: todos quedan cerrados, asignados a una actualización o convertidos en gate permanente.

---

# 7. RESUMEN DEL ORDEN QUE SE MOSTRARÁ AL USUARIO

```text
✅ P12 — Modelo de evaluaciones — recorrido
✅ P13 — Radar interactivo — recorrido
✅ P14 — Historial de evaluación — recorrido
✅ P15 — Resumen real de progreso — recorrido
✅ P16 — Seguridad RLS/v42 — CERRADO PRODUCCIÓN

▶ P17 — Cierre real Evaluaciones + reconciliar Point12R
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
⏳ P32 — QA transversal + Hostinger + seguridad + release final
```

Este bloque se actualizará después de cada implementación y se utilizará como encabezado obligatorio al iniciar la siguiente.

---

# 8. REGLAS QUE NO SE PUEDEN ROMPER DURANTE LA SECUENCIA

- No reconstruir desde cero una función que ya esté correcta.
- Auditar primero el estado actual de `main` y Supabase del punto que toca.
- No resetear Supabase.
- Migraciones nuevas incrementales, idempotentes cuando proceda y verificables.
- No aplicar SQL `PREPARED-NOT-APPLIED` sin decisión/evidencia específica.
- No fusionar ramas antiguas divergentes a ciegas.
- No reintroducir WordPress como backend/identidad canónica.
- No usar ChatGPT Sites como producción.
- No reintroducir 9.3.0 móvil ni 20.14/20.15 como base de Dar clase.
- No hamburguesa para módulos principales.
- No amarillo fluorescente.
- No duplicar personas.
- No volver a preguntar datos canónicos ya conocidos.
- No exponer notas internas al alumno.
- No multimedia pesada en GitHub/DB.
- No secretos administrativos en frontend/GitHub.
- iPhone sigue siendo referencia móvil principal.

---

# 9. ESTADO DE ARRANQUE DESDE ESTE DOCUMENTO

**Último cierre real:** P16/v42.  
**Siguiente actualización:** **P17 — Cierre real de Evaluaciones y reconciliación de Point12R.**  
**Resto pendiente después de P17:** P18 → P32, más gates G1–G5 hasta su cierre correspondiente.
