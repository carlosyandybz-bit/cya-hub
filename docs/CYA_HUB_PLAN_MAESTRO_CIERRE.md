# CYA HUB — PLAN MAESTRO DE CIERRE

**Versión:** 2.0  
**Fecha de corte:** 11 de agosto de 2026 — 15:55 (Europe/Madrid)  
**Repositorio canónico:** `carlosyandybz-bit/cya-hub`  
**Producción objetivo:** `main` + Supabase `CyA hub 2` + Hostinger  
**Estado actual de referencia:** P16/v42 cerrado y PR #2 fusionada

---

# 1. PROPÓSITO

Este documento sustituye la existencia de dos auditorías operativas paralelas y pasa a ser la **única hoja de ruta de cierre de CYA Hub**.

Combina:

1. la secuencia histórica y funcional de `docs/CYA_HUB_SECUENCIA_MAESTRA.md`;
2. el tablero técnico de `docs/CYA_HUB_PENDIENTES.md`;
3. el estado real verificado de GitHub, Supabase y producción;
4. los requisitos funcionales consolidados del proyecto;
5. los controles permanentes de seguridad, datos, iPhone y regresión.

Los dos documentos anteriores pueden seguir existiendo como histórico/evidencia, pero **no deben volver a utilizarse como planes paralelos**. Desde este punto, el orden de ejecución se rige por este archivo.

---

# 2. REGLA OBLIGATORIA AL EMPEZAR CADA ACTUALIZACIÓN

Antes de modificar código, base de datos, configuración o producción, se debe mostrar al usuario el estado del plan con este formato:

```text
CYA HUB — ESTADO DEL PLAN ANTES DE LA ACTUALIZACIÓN

CERRADO:
- bloques ya terminados relevantes

AHORA:
- bloque exacto que se va a ejecutar
- objetivo
- alcance

FALTA DESPUÉS:
- lista ordenada de todos los bloques todavía abiertos

DEPENDENCIAS / RIESGOS:
- migraciones
- seguridad
- producción
- posibles regresiones
```

Esta información **se entrega antes de cada nueva actualización** aunque el usuario no la vuelva a pedir.

Al terminar cada actualización se debe registrar:

```text
FECHA/HORA:
BLOQUE:
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

---

# 3. REGLA DE NUMERACIÓN

Para evitar la confusión que existía entre `P16/v42` y el antiguo ticket `P-016`, desde ahora el plan usa identificadores **B00–B12**.

Los identificadores históricos `P-xxx` se conservan solamente como referencias internas dentro del bloque correspondiente.

Ejemplo:

- `P16/v42` = cambio histórico de seguridad RLS ya cerrado.
- antiguo `P-016` = importación/exportación y pasa a formar parte de **B03**.

Nunca se volverá a usar un número `Pxx` aislado para indicar el orden de implementación.

---

# 4. BASELINE YA CERRADO

## ✅ C-001 — P16/v42 Seguridad RLS alumno–clases

**Estado:** CERRADO / VERIFICADO PRODUCCIÓN.

Cerrado:

- SELECT directo de alumno retirado sobre `class_pedagogy_summaries`;
- `student_message` preservado mediante `student_portal_snapshot`;
- `internal_note` aislada;
- políticas vulnerables de preparación sustituidas;
- helper privado de privilegio mínimo;
- dry-run 11/11;
- producción 17/17;
- migración `20260811124729 / v42_rls_student_class_correlation`;
- PR #2 fusionada;
- merge `bfc933ca2394300f2fd54d26afbb4c9f764441b1`.

## ✅ C-002 — Baseline real de migraciones Supabase

**Estado:** CERRADO.

Cerrado:

- 52 migraciones registradas en producción;
- primera `20260808214303 / teaching_module`;
- última `20260811124729 / v42_rls_student_class_correlation`;
- clasificación de bootstrap, registradas y preparadas/no aplicadas;
- baseline documentado en `docs/DATABASE_MIGRATION_BASELINE.md`.

Este baseline no significa que toda la aplicación esté terminada. Solo fija una base fiable desde la que continuar.

---

# 5. ORDEN MAESTRO DE IMPLEMENTACIÓN

El orden siguiente no es una lista estética. Está organizado por **dependencias funcionales, integridad de datos, seguridad y riesgo de regresión**.

---

# B00 — BASE TÉCNICA, PRODUCCIÓN Y TRAZABILIDAD

**Prioridad:** P0/P1  
**Estado:** PENDIENTE  
**Debe cerrarse antes de declarar fiables las pruebas funcionales posteriores.**

## B00.1 — Verificar runtime real de Hostinger

Origen: antiguo P-001.

Comprobar:

- qué commit está realmente desplegado;
- `/`;
- `/api/runtime-config` con `configured:true`;
- conexión Supabase;
- login/sesión;
- Inicio;
- Alumnado;
- Enseñanza;
- Dar clase;
- Marketing;
- Administración;
- portal alumno;
- ausencia de secretos en frontend;
- errores runtime relevantes.

**Cierre:** producción identificada inequívocamente y reproducible.

## B00.2 — Supabase Auth: protección de contraseñas filtradas

Origen: antiguo P-002.

Pendiente confirmado: `Leaked Password Protection Disabled`.

Acciones:

- habilitar la protección cuando la configuración/plan lo permita;
- volver a ejecutar Security Advisors;
- probar login;
- probar recuperación de cuenta;
- comprobar que no se rompe autenticación existente.

## B00.3 — Recuperar 18 migraciones históricas sin SQL independiente

Origen: antiguo P-025.

Acciones:

- extraer exclusivamente desde `supabase_migrations.schema_migrations.statements`;
- conservar versión/nombre originales;
- crear los 18 archivos fuente;
- NO ejecutarlos de nuevo;
- comparar 18/18 contra producción;
- actualizar `DATABASE_MIGRATION_BASELINE.md`.

## Gate de B00

No se cierra B00 hasta conocer la versión de producción, tener seguridad Auth revisada y dejar la historia de migraciones reproducible.

---

# B01 — ARQUITECTURA DE NAVEGACIÓN, IDENTIDAD Y PERMISOS

**Prioridad:** P1  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguos P-020, P-013 parcialmente, P-022 y controles de seguridad transversal.

## B01.1 — Navegación principal definitiva

Contrato obligatorio móvil:

**Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing**

Requisitos:

- DAR CLASE central, mayor y elevado;
- sin hamburguesa para funciones principales;
- back/contexto correcto;
- durante clase puede ocultarse la navegación;
- escritorio conserva la misma arquitectura conceptual;
- iPhone como referencia móvil principal.

## B01.2 — Multirol real y autorización

Una misma persona puede ser:

- Profesor;
- Alumno;
- Administrador cuando exista autorización.

Requisitos:

- roles simultáneos, no perfiles duplicados;
- seguridad server-side;
- RLS coherente;
- “Ver como” no eleva permisos;
- profesor puede tener expediente de alumno y autoevaluarse.

## B01.3 — Fuente única de verdad

Origen: antiguo P-022.

Reglas:

- una persona canónica;
- no duplicar CRM/alumno/profesor;
- no volver a pedir información ya conocida;
- override de clase → preferencia estilo → global → preguntar si falta;
- no mezclar notas comerciales con expediente pedagógico;
- consistencia entre UI, API y Supabase.

## Gate de B01

Crear/ver persona con varios roles, navegar como cada rol y comprobar que ningún cambio de vista modifica permisos reales.

---

# B02 — ALUMNADO Y MODELO DE PERSONAS

**Prioridad:** P1  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguo P-019 y la parte operativa del CRM relativa a personas.

## B02.1 — Estados de persona

- contacto/potencial;
- provisional;
- registrado;
- alumno real cuando existe clase o bono comprado.

## B02.2 — Conversión sin pérdida ni duplicación

Comprobar y corregir:

- potencial → provisional;
- potencial → alumno;
- provisional → registrado;
- conservación de nombre, teléfono, país, observaciones y demás datos;
- identidad estable;
- nombres nunca sustituidos por “Persona”.

## B02.3 — Perfil completo de alumno

Debe reunir:

- datos personales;
- datos de baile;
- roles/estilos;
- nivel;
- evaluaciones;
- evolución;
- clases;
- bonos/saldo;
- historial;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- feedback;
- incidencias;
- programar clase;
- añadir bono.

## B02.4 — Clases y bonos dentro de Alumnado

No deben volver a ser módulos principales independientes.

## Gate de B02

Crear contacto → convertir → completar perfil → añadir bono → programar clase → consultar toda la información sin pérdida ni duplicación.

---

# B03 — FORMULARIOS, VALIDACIÓN E IMPORTACIÓN/EXPORTACIÓN

**Prioridad:** P1  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguos P-015 y P-016.

## B03.1 — Sistema de formularios reusable y versionable

Debe soportar:

- definición;
- versión;
- campos;
- opciones;
- requerido;
- visibilidad;
- condiciones;
- validación;
- orden.

Tipos mínimos:

- información;
- texto;
- textarea;
- select;
- multiselect;
- checkbox;
- número;
- fecha;
- email;
- teléfono.

Reglas:

- validación real de servidor;
- no preguntar datos canónicos existentes;
- reutilizar formularios históricos útiles sin duplicarlos.

## B03.2 — Importación/exportación integral

Debe cubrir:

- alumnos;
- contactos;
- clases;
- bonos;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- evaluaciones;
- configuración relevante.

Requisitos:

- transaccional cuando corresponda;
- idempotencia;
- vista previa;
- detección de duplicados;
- errores por fila/entidad;
- no pérdida de relaciones.

## Gate de B03

Importar muestra de datos, modificarla, exportarla y verificar integridad de IDs, relaciones y datos canónicos.

---

# B04 — DAR CLASE: FLUJO OPERATIVO COMPLETO

**Prioridad:** P0/P1  
**Estado:** PENDIENTE DE REDISEÑO/VALIDACIÓN FINAL

Integra antiguo P-007 y el contrato histórico del flujo de clase.

## Flujo obligatorio

**Seleccionar alumno/clase → Preparar → Diagnóstico 3 min → Trabajar → Terminar/Cerrar**

## B04.1 — Selección

- clase programada del día o manual;
- fecha/hora/duración heredadas;
- ubicación cuando falte;
- individual/pareja correctamente detectado.

## B04.2 — 3 minutos iniciales

Permitir sin fricción:

- preguntar/adaptar sesión;
- notas rápidas;
- asociar notas con errores/correcciones;
- frecuencia;
- importancia;
- revisar correcciones anteriores;
- comprobar progreso;
- detectar explicaciones necesarias;
- primera evaluación rápida.

## B04.3 — Buscador unificado

Buscar simultáneamente:

- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias.

Por:

- título;
- etiquetas;
- categoría;
- descripción;
- relaciones.

Orden:

1. activo del alumno;
2. correcciones activas;
3. relevante por contexto;
4. biblioteca compatible;
5. otros.

No ocultar elementos ya asignados.

## B04.4 — Crear rápido

- mínimos obligatorios;
- estado incompleta/borrador/solo profesores;
- posibilidad de completar posteriormente;
- sin cortar el ritmo de clase.

## B04.5 — Trabajo de hoy vs histórico

Separación visual clara.

## B04.6 — Parejas

- información individual;
- cambio rápido entre alumnos;
- ninguna pestaña innecesaria en clase individual;
- coherencia si participan dos profesores/dispositivos cuando el flujo lo permita.

## B04.7 — Cierre

Diferenciar:

- **Terminar clase:** asistencia, cobro, bono, incidencias administrativas;
- **Cerrar clase:** contenido, evaluación y cierre pedagógico.

Debe garantizar:

- persistencia;
- idempotencia;
- consumo correcto de saldo;
- generación de pendientes/misiones cuando algo quede abierto;
- ninguna pérdida de datos.

## Gate de B04

Ejecutar una clase real completa individual y otra en pareja desde programación hasta cierre administrativo/pedagógico.

---

# B05 — EVALUACIONES Y EVOLUCIÓN PEDAGÓGICA

**Prioridad:** P1  
**Estado:** PENDIENTE DE REDISEÑO/VALIDACIÓN FINAL

Integra antiguo P-006.

Requisitos:

- niveles INICIO / INTERMEDIO / AVANZADO;
- cinco opciones táctiles por parámetro;
- valores 0 / 25 / 50 / 75 / 100;
- nombres de parámetros configurables;
- persistencia inmediata y fiable;
- impedir el bug histórico de valores que desaparecen;
- radar profesor absoluto;
- radar alumno relativo;
- reevaluación al subir de nivel;
- referencia del 75 % del contenido obligatorio cuando aplique;
- usable desde clase y evaluación manual.

## Gate de B05

Crear evaluación, editarla, cerrar sesión, reabrir y comprobar persistencia, radar y evolución histórica.

---

# B06 — PORTAL ALUMNO + MULTIROL COMPLETO + VER COMO

**Prioridad:** P1  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguos P-018 y P-013 restante.

Portal debe incluir:

- próxima clase;
- historial de clases;
- bonos/saldo;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- multimedia autorizada;
- evolución;
- evaluaciones;
- perfil;
- preparación de clase cuando proceda.

Seguridad:

- ninguna nota interna;
- RLS por identidad real;
- “Ver como Alumno” simula experiencia, no permisos;
- profesor/alumno puede evaluarse si el modelo lo autoriza;
- Admin ve solo lo permitido por sus privilegios reales.

## Gate de B06

Comparar la misma persona como Profesor, Alumno y Administrador y validar datos visibles/ocultos.

---

# B07 — ENSEÑANZA, RELACIONES Y ÁRBOLES

**Prioridad:** P1  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguo P-008 y la arquitectura completa de Enseñanza.

Debe incluir:

- Biblioteca;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- categorías;
- relaciones;
- asignaciones;
- búsqueda global;
- incompletos;
- configuración pedagógica.

## Relaciones obligatorias

- Correcciones ↔ Explicaciones;
- Ejercicios ↔ Explicaciones;
- Ejercicios ↔ Correcciones;
- Secuencias ↔ pasos/contenidos;
- prerequisitos;
- homólogas Leader/Follower;
- estilo;
- rol;
- nivel.

## Reglas pedagógicas

- filtros Leader/Follower/ambos;
- bachata/salsa/zouk/bachazouk;
- estados corrección: pendiente / en corrección / corregida;
- término único: Importancia;
- explicaciones Leader/Follower/ambos;
- ejercicios vinculados a explicaciones y/o correcciones;
- elementos incompletos no visibles/asignables al alumno cuando no proceda.

## Árboles táctiles

- mover/pan;
- zoom;
- centrar;
- ruta;
- volver/reset;
- búsqueda;
- filtros estilo/rol/nivel/tipo;
- experiencia usable en iPhone.

## Gate de B07

Crear contenidos relacionados, visualizarlos en árbol, asignarlos a alumno y comprobar reflejo correcto en Dar clase y portal.

---

# B08 — INICIO INTELIGENTE, MISIONES, AGENDA Y NOTIFICACIONES

**Prioridad:** P1/P2  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguos P-011, P-012, P-014 y P-017.

## B08.1 — Inicio contextual

Debe incluir:

- saludo por nombre/hora;
- frase diaria persistente;
- siguiente acción;
- clase próxima dominante 30 minutos antes;
- misiones;
- agenda/calendario;
- avisos;
- accesos rápidos;
- resumen del día;
- Administración;
- Ver como;
- cuenta/perfil.

Franjas saludo:

- mañana 05:00–11:59;
- tarde 12:00–19:59;
- noche 20:00–04:59.

Frases:

- activar/desactivar;
- calendario;
- CSV;
- sustitución por fecha;
- evitar duplicados;
- previsualización;
- persistencia por día.

## B08.2 — Motor de Misiones

Tipos:

- principal;
- diaria;
- crecimiento.

Estados:

- próxima;
- disponible;
- en progreso;
- bloqueada;
- pospuesta;
- completada;
- no realizada;
- no aplicable;
- cancelada;
- automática.

Prioridad:

- normal;
- prioritaria;
- urgente.

Casos iniciales:

- cierre de clases;
- bono bajo/vencimiento;
- perfil incompleto;
- corrección pendiente de explicación;
- preparación de clase;
- añadir contenido;
- revisar información;
- completar contenido interno.

Configuración:

- activación;
- frecuencia;
- días;
- hora;
- prioridad;
- duración;
- peso;
- criterio;
- máximo diario;
- duplicados;
- auto;
- vencimiento;
- evidencia;
- anticipación;
- escalado;
- bloqueo;
- destinatarios;
- canales;
- horas silenciosas.

## B08.3 — Agenda/calendario

Vistas:

- Día;
- Semana;
- Mes;
- Lista.

Fuentes:

- clases;
- misiones;
- eventos.

Google Calendar:

- id externo;
- última sincronización;
- estado;
- errores;
- conflictos;
- operaciones idempotentes;
- no destruir participantes, saldos, estado pedagógico ni historia.

## B08.4 — Notificaciones

- eventos;
- destinatarios;
- canales;
- persistencia;
- lectura;
- deduplicación;
- integración con misiones, clases y bonos.

## Gate de B08

Simular un día completo con clase cercana, misión, conflicto de calendario y notificación y validar prioridades de Inicio.

---

# B09 — MARKETING, CRM, TARIFAS, CAMPAÑAS Y ESTADÍSTICAS

**Prioridad:** P2  
**Estado:** PENDIENTE DE REDISEÑO FUNCIONAL

Integra antiguos P-009 y P-010.

## B09.1 — CRM comercial

Campos base:

- Fecha;
- Nombre;
- Teléfono;
- País;
- Cómo nos conoció;
- Qué quería;
- Reservó;
- Bono;
- Importe;
- Observaciones;
- Tarifa.

Debe usar la misma persona canónica de B02.

## B09.2 — Tarifas

- administración de tarifas;
- uso en CRM y reservas;
- evitar valores duplicados/manuales cuando exista tarifa registrada.

## B09.3 — Contenido y campañas

- creación de contenido;
- planificación;
- campañas;
- comunicaciones;
- WhatsApp/email cuando proceda;
- adjuntar fotos/vídeos mediante almacenamiento externo;
- eventos y promoción.

YouTube/TikTok NO son requisitos obligatorios.

## B09.4 — Estadísticas

Definir KPIs útiles para:

- alumnado;
- clases;
- bonos;
- enseñanza;
- evaluaciones;
- CRM;
- campañas;
- negocio.

Requisitos:

- jerarquía visual;
- filtros;
- navegación táctil;
- métricas accionables;
- no mostrar gráficos solo por estética.

## Gate de B09

Contacto → campaña/evento → conversión → alumno → bono/clase debe conservar trazabilidad sin duplicar persona.

---

# B10 — ADMINISTRACIÓN, INTEGRACIONES Y ALMACENAMIENTO

**Prioridad:** P1/P2  
**Estado:** REQUIERE VERIFICACIÓN + IMPLEMENTACIÓN

Integra antiguo P-021 y requisitos administrativos dispersos.

Administración debe reunir:

- configuración general;
- roles/permisos;
- misiones;
- formularios;
- pedagogía;
- import/export;
- integraciones;
- seguridad/diagnóstico;
- control administrativo;
- configuración de apariencia permitida.

## Multimedia

Regla permanente:

- fotos/vídeos pesados en Google Drive u otro almacenamiento externo aprobado;
- Supabase conserva referencias/IDs/metadatos;
- no blobs pesados operativos en GitHub;
- no blobs pesados operativos en tablas normales de Supabase.

## Integraciones

Verificar según corresponda:

- Supabase;
- GitHub;
- Hostinger;
- Google Drive;
- Google Calendar;
- Sentry/observabilidad;
- servicios de comunicación que se activen.

## Gate de B10

Revisar cada integración desde UI/configuración y comprobar errores, credenciales públicas/privadas y recuperación ante fallo.

---

# B11 — IDENTIDAD VISUAL Y ACABADO GLOBAL

**Prioridad:** P2/P3  
**Estado:** PENDIENTE

Integra antiguos P-004 y P-005 y la auditoría visual v23 como baseline.

Debe cerrar:

- colores CYA definitivos;
- logo;
- cabeceras;
- jerarquía tipográfica;
- espaciados;
- tarjetas;
- botones;
- estados;
- iconografía;
- coherencia entre módulos;
- apariencia configurable únicamente dentro de reglas aprobadas.

Reglas existentes:

- nada de amarillo fluorescente;
- login no negro;
- contraste suficiente;
- iconos sin cuadrados decorativos sistemáticos;
- DAR CLASE destacado;
- no reintroducir modo oscuro sin decisión expresa;
- iPhone como referencia principal;
- no overflow horizontal;
- safe areas correctas;
- tamaños táctiles adecuados.

## Gate de B11

Auditoría visual completa en móvil y escritorio de todos los módulos ya funcionalmente cerrados.

---

# B12 — QA TRANSVERSAL, SEGURIDAD, REGRESIÓN Y RELEASE FINAL

**Prioridad:** P0/P1  
**Estado:** PENDIENTE COMO GATE FINAL

Integra antiguos P-023 y P-024.

## B12.1 — Smoke test iPhone real

Comprobar:

- safe areas;
- scroll;
- teclado;
- zoom Safari;
- modales;
- formularios;
- barra inferior;
- Dar clase;
- árboles;
- evaluación;
- ficha alumno;
- navegación/retorno;
- orientación cuando corresponda.

## B12.2 — Regresión transversal completa

Flujo obligatorio:

1. crear persona;
2. convertir contacto;
3. completar perfil;
4. añadir bono;
5. programar clase;
6. dar clase;
7. terminar/cerrar;
8. consumir bono;
9. consultar/asignar formación;
10. evaluar;
11. comprobar portal alumno;
12. comprobar CRM/Marketing;
13. importar/exportar;
14. revisar Profesor/Alumno/Admin;
15. revisar misiones/calendario/notificaciones;
16. revisar seguridad/RLS.

## B12.3 — Producción

- commit/PR final identificados;
- deploy Hostinger confirmado;
- Supabase migrations alineadas;
- configuración Auth revisada;
- secretos ausentes del frontend/repositorio;
- Sentry/logs sin errores bloqueantes;
- smoke test producción aprobado.

## B12.4 — Criterio de “aplicación lista”

CYA Hub solo se declara lista cuando:

- todos los bloques B00–B11 están cerrados o explícitamente descartados por decisión del usuario;
- B12 pasa completo;
- no quedan P0/P1 conocidos abiertos;
- las funciones principales funcionan en producción real;
- iPhone y escritorio están validados;
- Profesor, Alumno y Administrador tienen flujos coherentes y seguros;
- el estado documental coincide con GitHub/Supabase/Hostinger.

---

# 6. CONTROLES TRANSVERSALES QUE NO ESPERAN A SU BLOQUE

Estas reglas se verifican en **cada actualización**, no solo al final:

1. seguridad/RLS;
2. no secretos administrativos en cliente/repositorio;
3. migraciones incrementales e idempotentes;
4. no resetear Supabase producción;
5. datos canónicos sin duplicación;
6. no pérdida de relaciones;
7. iPhone sin regresiones;
8. accesibilidad táctil básica;
9. no reintroducir elementos descartados;
10. multimedia pesada fuera de GitHub/DB;
11. actualización del plan maestro con evidencia.

---

# 7. ELEMENTOS DESCARTADOS — NO REINTRODUCIR

- WordPress como backend/identidad canónica;
- ChatGPT Sites como producción;
- versión móvil 9.3.0;
- 20.14/20.15 como base Dar clase;
- hamburguesa para funciones principales;
- amarillo fluorescente;
- login/fondos negros no solicitados;
- iconos sistemáticamente dentro de cuadrados decorativos;
- duplicar personas al convertirlas;
- volver a preguntar datos canónicos ya conocidos;
- mezclar expediente comercial y pedagógico sin separación adecuada;
- exponer notas internas al alumno;
- multimedia pesada en GitHub/DB;
- secretos administrativos en frontend/GitHub;
- YouTube/TikTok como integración obligatoria.

---

# 8. ESTADO ACTUAL DEL PLAN — 11/08/2026 15:55

## Cerrado

- ✅ C-001 / P16-v42 seguridad RLS alumno–clases.
- ✅ C-002 / baseline de 52 migraciones Supabase.
- ✅ PR #2 fusionada en `main`.
- ✅ baseline visual v23 aplicado en las áreas incluidas en aquella auditoría.

## Siguiente bloque obligatorio

### ▶ B00 — Base técnica, producción y trazabilidad

Orden interno:

1. B00.1 verificar runtime Hostinger;
2. B00.2 protección de contraseñas filtradas Supabase Auth;
3. B00.3 recuperar 18 SQL históricos.

## Falta después

- ⬜ B01 Navegación, identidad y permisos.
- ⬜ B02 Alumnado y modelo de personas.
- ⬜ B03 Formularios + import/export.
- ⬜ B04 Dar clase.
- ⬜ B05 Evaluaciones.
- ⬜ B06 Portal alumno + multirol/Ver como.
- ⬜ B07 Enseñanza + árboles.
- ⬜ B08 Inicio + Misiones + Agenda + Notificaciones.
- ⬜ B09 Marketing + CRM + Tarifas + Estadísticas.
- ⬜ B10 Administración + Integraciones + Almacenamiento.
- ⬜ B11 Identidad visual y acabado.
- ⬜ B12 QA transversal + producción final.

---

# 9. PRINCIPIO DE EJECUCIÓN

No se debe saltar a un bloque posterior solo porque resulte más visible o atractivo si existe una dependencia abierta anterior que pueda provocar pérdida de datos, problemas de permisos, regresiones o trabajo duplicado.

Se permite trabajar en paralelo únicamente cuando:

- no exista dependencia técnica;
- no se modifique la misma superficie crítica;
- pueda probarse de forma independiente;
- el plan maestro deje registrada la excepción.

La prioridad es **terminar CYA Hub**, no acumular funciones parcialmente implementadas.
