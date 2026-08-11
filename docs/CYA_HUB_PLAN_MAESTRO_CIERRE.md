# CYA HUB — PLAN MAESTRO ÚNICO DE CIERRE

Versión: **3.5**  
Fecha de corte: **2026-08-11**  
Repositorio canónico: `carlosyandybz-bit/cya-hub`  
Producción: `main` + Supabase `CyA hub 2` + Hostinger  
Última actualización secuencial cerrada: **P18 / v46**  
Adelantos/correctivos cerrados durante P18: **F42/P32 v44–v44e + P21 v45/resumen editable + transición de inicio de clase**  
Siguiente actualización: **P19 — Alumnado + persona única + identidades**

---

## 0. Regla de continuidad

Este documento es la **única hoja operativa de cierre** de CYA Hub.

Se separan permanentemente dos numeraciones:

- **F1–F46** = auditoría funcional histórica: requisitos, errores y módulos del producto.
- **P12–P32** = secuencia técnica actual de ejecución: paquetes de trabajo que absorben y cierran los F correspondientes.

`P16` no significa `F16`: P16 fue el hotfix RLS/v42. Esta separación es permanente.

Antes de empezar cada nueva actualización se debe comunicar:

1. qué está cerrado;
2. qué P está activo;
3. qué queda después;
4. qué correctivos nuevos se han incorporado y en qué punto viven.

Cuando aparezca una mejora o error nuevo:

- se asigna al P/F correspondiente;
- si el área ya pasó, se registra como **correctivo**;
- no se rompe el orden por conveniencia;
- una incidencia de seguridad o pérdida de datos puede activar un hotfix, pero debe volver a integrarse en esta hoja;
- un adelanto pedido explícitamente por el usuario puede implementarse antes de su P, pero **no cambia el siguiente punto secuencial** y debe volver a auditarse cuando llegue su P original.

---

# 1. Estado ejecutivo

## ✅ Cerrado y validado

- Base de migraciones reconciliada y fuentes históricas recuperadas.
- P12 — modelo de evaluación base.
- P13 — radar de evaluación.
- P14 — histórico de evaluación.
- P15 — resumen real de progreso.
- **P16 — límites RLS de alumnado/clases, migración v42, validación autenticada 17/17 en producción.**
- **P17 — Evaluaciones: reconciliación, frontend guiado, runtime Hostinger demostrado y migración v43 aplicada en producción.**
- **P18 — Identidad, roles, navegación y “Ver como”, con cambio de vista autorizado en servidor mediante v46.**
- **Adelanto F42/P32 — Administración → Datos → Borrado y reinicio seguro, backend v44–v44e aplicado y frontend fusionado.**
- **Correctivo adelantado P21 — resumen pedagógico editable antes del cierre, RLS recursiva corregida mediante v45 y búsqueda/creación postadministrativa habilitada.**
- **Correctivo adelantado P21 — iniciar una clase preparada ya no depende de recargas de Marketing y no puede quedar bloqueado indefinidamente en “Abriendo…”.**
- Marketing vuelve a abrir.
- Build TypeScript estricto recuperado.
- Navegación atrás e historial real.
- principales defectos visuales globales ya corregidos.
- avatar, perfil, preferencias y cambio de portal.
- centro de notificaciones base.
- eliminación del cálculo de duración de clase por tiempo transcurrido.
- duración prevista/manual y selección compatible de bono.
- arquitectura amplia del cierre administrativo de clase ya implementada.

### Evidencia de cierre de P17

- Hostinger sirve `app.carlosyandy.com` desde `main` y marcó como **Actual / completado** el commit `cae0f009986240d0a945cabd16d00f20376e753b` (`P17: prepare safe evaluation cutover`) antes de aplicar v43.
- Supabase registra `v43_evaluation_final_cutover` con versión `20260811151901`.
- Antes y después del cutover se conservaron **6 `evaluation_sessions`** y **48 `student_evaluations`**.
- En el preflight final no quedaban sesiones sin completar; la antigua sesión de clase 23 quedó completada de forma explícita antes del corte, no por SQL silencioso.
- `save_class_evaluation` y `save_class_evaluation_v2` ya no son ejecutables por `authenticated`.
- `start_student_evaluation`, `save_evaluation_score` y `complete_evaluation_session` siguen ejecutables por `authenticated`.
- las RPC guiadas iniciales/postclase siguen ejecutables.
- `trg_complete_class_evaluation_sessions` fue retirado.
- `trg_require_final_evaluation` está activo.
- smoke autenticado: `prepare_post_class_evaluation(23,2)` reutiliza la sesión completada correspondiente y el guard permite un cierre válido dentro de transacción con `ROLLBACK`.
- PR #1 `Point 12R — evaluation engine rebuild` fue cerrada como **supersedida** y no fusionada.
- Correctivo P17 posterior: la revisión postclase ya no reaparece cuando la evaluación está completada y dejó de recargar/reconstruir la pantalla periódicamente durante el trabajo.

### Evidencia del adelanto F42/P32 — borrado y reinicio

- interfaz integrada en `Administración → Datos → Borrado y reinicio`;
- búsqueda y borrado selectivo de persona/alumno y contenido pedagógico;
- borrados por áreas y dos niveles de reinicio (`operational` / `full`);
- previsualización con impacto antes de borrar;
- frase contextual exacta + segunda confirmación final;
- preparación con caducidad de 30 minutos;
- `operational` y `full` exigen copia completa reciente del mismo administrador también en servidor;
- copia completa reconciliada contra esquema real: **0 tablas reseteables ausentes**;
- identidades activas del equipo protegidas;
- borrado de todos los alumnos elimina también sus personas de prueba no protegidas;
- ejecución serializada y transaccional;
- auditoría de borrados;
- dry-run autenticado con persona temporal ejecutado dentro de `BEGIN/ROLLBACK` sin dejar datos;
- guard de reinicio completo probado sin backup y bloquea correctamente;
- migraciones Supabase: `v44_admin_data_reset`, `v44b_admin_data_reset_backup_guard`, `v44c_admin_reset_backup_coverage`, `v44d_admin_reset_student_people`;
- tras validación, `admin_reset_jobs` permanecía en **0**: desplegar la herramienta no ejecutó ningún borrado;
- contrato funcional detallado en `docs/ADMIN_BORRADO_Y_REINICIO_DATOS.md`.

## 🟣 Siguiente punto

### P18 — Identidad, roles, navegación y “Ver como”

P18 debe consolidar la arquitectura multirol y la navegación definitiva antes de continuar con Alumnado, Formularios y Dar clase.

---

# 2. Gates permanentes

Estos gates atraviesan todos los P restantes.

## G1 — Evidencia de runtime Hostinger

No basta con que un commit esté en `main`.

Para cambios incompatibles de backend/frontend hay que demostrar qué versión sirve producción antes de cortar APIs antiguas.

**P17 dejó este gate probado por primera vez con evidencia directa del panel de Hostinger.**

## G2 — Seguridad de autenticación

Pendiente conocido de Supabase:

- Leaked Password Protection está desactivado.

Debe resolverse dentro de P32 antes de lanzamiento.

## G3 — iPhone + densidad + inputs

El iPhone es referencia principal.

Todo formulario nuevo o modificado debe cumplir:

- safe areas;
- targets táctiles cómodos;
- sin controles cortados;
- scroll correcto;
- teclado numérico cuando corresponde;
- teclado decimal para importes;
- un campo vacío puede quedarse vacío;
- nunca forzar `0` mientras se edita;
- escribir `5` produce `5`, no `05` ni `050`.

El antiguo F3B queda absorbido como regla global, no como arreglo puntual.

## G4 — Regresión antes de merge

Cada P debe añadir o actualizar pruebas de las reglas que toca. Build limpio no sustituye QA funcional.

## G5 — Integridad de datos y multimedia

- no resetear Supabase por conveniencia;
- migraciones incrementales e idempotentes cuando corresponda;
- no guardar vídeos en GitHub;
- no guardar binarios pesados en PostgreSQL;
- no depender de WordPress;
- Drive/almacenamiento externo conserva el archivo;
- CYA conserva IDs, permisos, metadatos y relaciones.

## G6 — Acciones destructivas

Para información relevante:

- preferir archivar cuando sea razonable;
- ofrecer deshacer cuando sea viable;
- eliminación definitiva solo cuando tenga sentido;
- doble confirmación contextual;
- la segunda confirmación debe identificar exactamente qué se eliminará.

El reset masivo es la excepción deliberada de borrado definitivo: por ello añade previsualización, backup obligatorio, frase exacta, segunda confirmación, transacción y auditoría.

## G7 — Fuente única de verdad / no volver a preguntar

Jerarquía de datos operativos:

`override de clase → preferencia específica de estilo/rol → valor global → preguntar si realmente falta`.

CYA reutiliza alumno, nivel, estilo, rol, duración, ubicación y demás datos conocidos. No duplica formularios ni hace rellenar dos veces el mismo hecho canónico.

## G8 — Esquema real > historial supuesto

Gate derivado de P17.

El registro de migraciones puede no reflejar todos los SQL que históricamente se ejecutaron. Antes de una migración sensible se compara:

1. migraciones registradas;
2. funciones/triggers/policies reales;
3. código de `main`;
4. datos existentes.

La verdad final del runtime es el esquema real, no el nombre de un archivo.

El adelanto F42/P32 aplicó este gate al backup completo y descubrió cinco tablas actuales ausentes del mapa histórico; quedaron incorporadas antes de habilitar el reset masivo.

---

# 3. Secuencia única restante

## P17 — Evaluaciones + reconciliación PR #1 ✅ CERRADO

### Resultado final

- evaluación inicial guiada durante una clase activa;
- no pedir al profesor números como flujo pedagógico principal;
- histórico preservado;
- radar y progreso derivados de datos reales;
- revisión postclase explícita;
- ninguna sesión se autocompleta para aparentar cierre;
- Bachazouk exige la base de Bachata cuando corresponda;
- Bachata y Bachazouk conservan niveles independientes;
- si ambos contextos existen para el rol, la revisión dual se conserva;
- wrappers numéricos antiguos retirados de `authenticated`;
- motor moderno por sesiones conservado;
- cierre pedagógico protegido por evaluación explícita;
- PR #1 cerrada como supersedida.

### Correctivo de clase 23

La sesión que había aparecido como borrador fue preservada durante la preparación de v43 y posteriormente quedó **completada explícitamente antes del cutover**. v43 no la borró ni la autocompletó.

### Correctivo de estabilidad postclase

- una revisión `completed` no reaparece porque falte el cierre pedagógico posterior;
- sin polling disruptivo mientras la revisión está abierta;
- cuando no hay revisión visible, comprobación discreta y al volver a primer plano;
- cada respuesta actualiza solo su estado local, sin reconstruir la pantalla completa.

---

## P18 — Identidad, roles, navegación y “Ver como” ✅ CERRADO

Absorbe las reglas de navegación y multirol que deben quedar definitivas.

### Debe cerrar

- una sola persona puede ser profesor + alumno + admin si está autorizada;
- `Ver como` Profesor / Alumno / Administrador sin escalada de privilegios;
- servidor verifica permisos reales;
- barra móvil definitiva:
  `Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`;
- DAR CLASE central, mayor y elevado;
- sin hamburguesa para funciones clave;
- escritorio con arquitectura equivalente;
- acceso claro a Administración, cuenta y preferencias;
- historial atrás coherente en todas las pantallas.

### Evidencia de cierre P18

- la identidad real vinculada en producción soporta simultáneamente roles `admin`, `teacher` y `student` sobre una única persona;
- `identity_context()` deriva `can_admin`, `can_teach` y `can_study` desde permisos reales de servidor;
- v46 `set_experience_context` valida en servidor Profesor / Alumno / Administrador antes de persistir la vista;
- v46 solo escribe `user_preferences.preferred_context`: no crea, modifica ni eleva `app_member_roles`;
- la UI usa `Ver como` y solo ofrece contextos autorizados;
- Portal Alumno y Administración mantienen guards explícitos de permiso;
- barra móvil definitiva de cinco accesos y DAR CLASE central/elevado preservados;
- escritorio comparte la misma arquitectura de navegación;
- historial real mediante `pushState`/`popstate` preservado;
- migración v46 aplicada en producción con ledger `20260811183128`;
- dry-run autenticado validó los tres contextos para una identidad multirol sin modificar roles;
- CI final sobre el mismo head: regresiones P18 5/5, lint de AccountMenu y build Next.js correctos;
- los workflows de resumen editable y comenzar clase también quedaron verdes sobre el head final de P18.

---

## P19 — Alumnado + persona única + identidades 🟣 SIGUIENTE

Absorbe F21–F25 excepto el motor reusable de formularios, que vive en P20.

### Estados de persona

- potencial;
- provisional;
- registrado.

### Reglas

- potencial → provisional → registrado sin perder datos;
- nunca degradar el nombre a “Persona”;
- no duplicar ficha al habilitar funciones;
- profesor puede editar la ficha completa;
- autenticación se vincula a persona existente cuando corresponda;
- provisional puede, desde el lado del profesor, usar prácticamente las mismas funciones operativas que un registrado.

### Regla cruzada con P21

En `Dar clase → Seleccionar alumno` debe existir:

`+ Crear alumno provisional`

sin abandonar el flujo. Al crearlo queda seleccionado y puede recibir clase, bono, evaluación y enseñanza inmediatamente.

---

## P20 — Formularios versionados + datos canónicos ⏳

### Objetivo

Recuperar lo útil del plugin histórico sin volver a construir formularios duplicados.

### Motor reusable

- definición;
- versión;
- campos;
- opciones;
- requerido;
- visibilidad;
- condición;
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

### Reglas

- validación de servidor;
- datos canónicos reutilizados;
- onboarding progresivo;
- no mostrar todas las preguntas de golpe;
- separar información interna de lo visible al alumno;
- heredar G3 para entradas numéricas.

---

## P21 — DAR CLASE definitivo ⏳

Absorbe F3B + F6–F11 y los correctivos posteriores de F8/F10.

### Regla innegociable de duración

CYA **nunca** calcula lo cobrado por el tiempo que una clase lleva abierta.

- sin cronómetro operativo;
- sin contador de 3 minutos;
- sin fase obligatoria independiente de 3 minutos;
- `started_at` puede existir como dato técnico, nunca como duración facturable;
- duración prevista cargada por defecto;
- duración manual editable es la operativa.

### Espacio dinámico de clase

Una experiencia integrada debe reunir:

- alumno/pareja;
- resumen y contexto previo;
- correcciones activas;
- progreso relevante;
- explicaciones/secuencias recientes;
- ejercicios;
- buscador contextual;
- guía de hoy;
- creación rápida;
- notas;
- cambio entre alumnos de una pareja;
- evaluación guiada cuando corresponda;
- cierre administrativo;
- cierre pedagógico.

No se conservan pantallas artificiales solo porque el plugin histórico las tuviera.

### Buscador de Dar clase

Primero es **contextual a Dar clase**, no un buscador universal inventado para toda CYA.

Busca Correcciones / Explicaciones / Ejercicios / Secuencias por:

- título;
- etiquetas;
- categoría;
- descripción;
- relaciones.

Orden prioritario:

1. ya activo del alumno;
2. correcciones activas;
3. relevante al contexto;
4. compatible de biblioteca;
5. otros.

No ocultar una corrección por estar ya asignada.

### Cierre administrativo — reglas que se deben preservar y revalidar

- si la clase llegó a iniciarse, no volver a preguntar asistencia;
- bono compatible activo por defecto;
- prioridad al que antes caduca;
- bono de pareja aparece **una sola vez**;
- crear bono rápido;
- pagar clase suelta mediante saldo exacto;
- saldo insuficiente permite pendiente o regularización exacta;
- transferencia individual → pareja con minutos elegibles y coste adicional;
- suplementos compactos editables;
- pago total / mitad / otra cantidad / nada ahora;
- persistir deuda;
- varios vídeos/archivos por clase;
- pareja: “Ambos” por defecto, con cambio a A/B;
- clasificar recurso como Corrección / Explicación / Secuencia cuando proceda;
- estos vídeos **no crean nodos, relaciones ni prerrequisitos de árboles**;
- reabrir clase debe revertir coherentemente artefactos de cierre y dejar auditoría.

### Correctivos adelantados ya implementados durante P18

Estos cambios pertenecen funcionalmente a P21, pero fueron adelantados por incidencias bloqueantes y **deben revalidarse cuando P21 sea el paquete secuencial activo**:

- el resumen pedagógico final incluye `Revisar contenido trabajado` antes de cerrar;
- desde el resumen se puede añadir contenido olvidado y crear contenido rápido;
- una Corrección puede volver de `corregida` a `pendiente` y ajustar frecuencia/importancia;
- Explicaciones/Secuencias y Ejercicios pueden corregir su estado antes del cierre;
- en pareja, la edición sigue siendo individual por alumno;
- v45 eliminó la recursión RLS entre `student_content_assignments` y `teaching_contents` sin desactivar RLS;
- `search_class_teaching_content` y la creación rápida funcionan también tras el cierre administrativo mientras el cierre pedagógico siga abierto;
- comenzar una clase preparada refresca primero el estado operativo y ya no depende de Marketing;
- el botón de inicio usa `try/catch/finally`, por lo que un error no lo deja permanentemente en `Abriendo…`;
- `start_class` fue probado autenticadamente con `ROLLBACK` sobre una clase preparada válida.

### Concurrencia de clases

Una clase abierta **no bloquea iniciar otra**.

Cada sesión se mantiene independiente. Una clase olvidada se resuelve con P27 Notificaciones, no con un bloqueo.

### Limpieza de duplicaciones

Antes de considerar P21 cerrado se eliminan:

- correcciones repetidas;
- estados mostrados dos veces;
- datos de alumno redundantes;
- bloques con la misma información;
- controles heredados ocultos que ya no tengan función, incluida la eliminación física del JSX numérico viejo de evaluación.

---

## P22 — Portal del alumno ⏳

### Debe incluir

- próxima clase;
- clases;
- bonos y saldo;
- formación asignada;
- Correcciones / Explicaciones / Ejercicios / Secuencias;
- multimedia autorizada;
- evolución;
- evaluaciones;
- perfil;
- información autorizada por RLS.

### Reglas

- alumno solo ve lo que le corresponde;
- borradores/incompletos internos no se filtran;
- multirol no implica escalada;
- el profesor puede entrar en modo Alumno para verificar UX usando su rol real autorizado.

---

## P23 — Enseñanza + relaciones + árboles ⏳

Absorbe F16–F20.

### Contenidos

- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- categorías;
- etiquetas;
- relaciones;
- multimedia externa.

### Regla exclusiva de ejercicios

`Realizar en pareja` existe **solo para Ejercicios**.

Al activarlo:

- compatible Leader + Follower según contexto;
- indicador visible `Necesita pareja`.

No propagar esta propiedad automáticamente a Correcciones, Explicaciones o Secuencias.

### Homólogos Leader/Follower

Consolidar:

- explicación Leader;
- homóloga Follower;
- visibilidad;
- asignación individual;
- reglas de aprendizaje por persona.

### Ocho árboles conceptuales

1. Bachata · Leader
2. Bachata · Follower
3. Salsa · Leader
4. Salsa · Follower
5. Zouk · Leader
6. Zouk · Follower
7. Bachazouk · Leader
8. Bachazouk · Follower

Un contenido puede reutilizarse; las rutas pueden variar por árbol.

### Mapa móvil

- táctil;
- zoom;
- pan;
- centrar;
- ruta;
- volver/reset;
- filtros estilo/rol/nivel/tipo;
- búsqueda;
- zonas/categorías legibles;
- revisar varios mapas: no asumir uno único.

### Regla multimedia

Un vídeo de clase asociado a un contenido no entra automáticamente en el grafo pedagógico.

---

## P24 — Inicio contextual ⏳

### Objetivo

Inicio funciona como lanzador inteligente, no como panel estático.

### Debe incluir

- saludo por franja horaria;
- nombre del perfil;
- frase diaria persistente por día;
- siguiente acción;
- misiones;
- agenda/calendario;
- avisos;
- accesos rápidos;
- resumen del día.

### Regla de clase próxima

Una clase próxima pasa a dominar Inicio **30 minutos antes**.

### Frases

- mañana 05:00–11:59;
- tarde 12:00–19:59;
- noche 20:00–04:59;
- activar/desactivar;
- CSV;
- sustitución por fecha;
- evitar duplicados;
- previsualización.

---

## P25 — Misiones + worker ⏳

Absorbe F32–F33.

### Tipos

- principal;
- diaria;
- crecimiento.

### Estados

próxima / disponible / en progreso / bloqueada / pospuesta / completada / no realizada / no aplicable / cancelada / automática.

### Prioridades

normal / prioritaria / urgente.

### Motor

Debe ejecutarse en servidor cuando corresponda; no depender de abrir la app para que “ocurra”.

Incluye reglas de cierre, bonos, perfiles, preparación de clase, contenido, revisión y vencimientos.

---

## P26 — Agenda + Google Calendar ⏳

Absorbe F35.

### Vistas

- Día;
- Semana;
- Mes;
- Lista.

### Capas

- clases;
- misiones;
- eventos.

### Sincronización

- ID externo;
- última sync;
- estado;
- errores;
- conflictos;
- idempotencia.

La sincronización nunca destruye participantes, saldos, estado pedagógico ni historia de una clase.

---

## P27 — Notificaciones automáticas ⏳

El centro de notificaciones base ya existe. P27 construye el motor automático.

### Regla prioritaria

Si una clase se inicia y no se termina:

- aviso de urgencia alta;
- acceso directo a esa clase;
- persiste hasta resolver;
- **no bloquea iniciar otra clase**.

Después:

- vencimientos;
- misiones;
- saldos;
- incidencias;
- recordatorios;
- push cuando la arquitectura esté lista.

---

## P28 — Importación / exportación ⏳

### Alcance

- alumnos/personas;
- correcciones;
- explicaciones;
- ejercicios;
- secuencias;
- configuraciones aplicables;
- datos administrativos.

Mantener JSON/CSV/XLSX ya construidos cuando sean válidos; no reescribir por estética.

Debe existir trazabilidad de trabajos de transferencia y validación antes de alterar datos reales.

---

## P29 — Marketing / CRM / tarifas / campañas / eventos / multimedia ⏳

Absorbe F26–F31.

### CRM

- potenciales;
- alumnos;
- procedencia;
- qué buscaban;
- reservó;
- bono;
- importe;
- observaciones;
- tarifa;
- estados comerciales;
- estadísticas de captación.

Sin “próxima acción” obligatoria.

### Contenido de redes

- ideas;
- contenido;
- planificación;
- calendario;
- archivos;
- estados.

### Campañas

- segmentación;
- audiencia;
- contenido;
- estado;
- resultados;
- texto;
- imágenes;
- vídeos.

Canales futuros según integración aprobada: WhatsApp/email. YouTube y TikTok no son requisito.

### Eventos

- crear;
- gestionar;
- promoción;
- contenido asociado;
- campañas;
- métricas.

### Multimedia

Se aplica G5: archivos fuera de GitHub/Postgres pesado/WordPress.

---

## P30 — Estadísticas definidas con el usuario ⏳

Absorbe F40–F41.

**No implementar un dashboard de métricas inventadas.**

Primero definir qué decisiones debe permitir tomar cada estadística. Después implementar solo las aprobadas.

Ámbitos candidatos, no métricas preaprobadas:

- alumnado;
- enseñanza;
- clases;
- bonos;
- marketing;
- progreso;
- finanzas;
- campañas.

---

## P31 — Administración + catálogos + integraciones + apariencia ⏳

Absorbe F36–F39 y parte de F43.

### Administración de datos

- editar;
- catálogos;
- categorías;
- etiquetas;
- estilos;
- niveles;
- parámetros;
- ubicaciones;
- tarifas;
- valores predeterminados.

### Integraciones

Panel real de:

- Drive;
- Calendar;
- Meta cuando corresponda;
- WhatsApp;
- email.

Nunca mostrar “conectado” si no existe una conexión real verificable.

### Apariencia

Configurable de verdad:

- colores CYA;
- primario/secundario;
- logo;
- cabecera;
- tipografías;
- parámetros visuales aprobados.

### Seguridad destructiva

Aplicar G6 en todas las acciones administrativas.

---

## P32 — QA integral + seguridad + producción + release ⏳

Absorbe F42–F46 y todos los gates pendientes.

### Reset previo a lanzamiento — BASE IMPLEMENTADA ANTICIPADAMENTE

La infraestructura v44–v44d ya existe. P32 **no debe reconstruirla**: debe someterla a QA final y confirmar que sigue siendo compatible con el esquema que exista al final del proyecto.

Base disponible:

- backup completo previo obligatorio para reinicios masivos;
- previsualización del alcance exacto;
- supervivientes técnicos definidos;
- búsqueda/borrado selectivo;
- borrado por áreas;
- frase escrita contextual;
- segunda confirmación;
- ejecución transaccional/serializada;
- auditoría posterior;
- protección de identidades del equipo;
- restauración mediante el sistema de copias existente.

En P32 se debe repetir G8 contra el esquema final y volver a comprobar que la copia completa contiene todas las tablas que el reset pueda eliminar.

### Seguridad

- RLS;
- permisos;
- funciones;
- auth;
- Storage/Drive;
- secretos;
- sesiones;
- acciones destructivas;
- leaked password protection;
- revisión de advisors;
- revisar de nuevo las RPC `SECURITY DEFINER` del reset: su exposición a `authenticated` es deliberada porque cada RPC valida `private.is_admin()` en servidor, pero debe reauditarse en el release final.

### Rendimiento

Los advisors actuales muestran deuda de índices/FKs y políticas permisivas múltiples. No borrar índices “no usados” por lectura superficial; analizar carga real y corregir solo lo demostrado.

### QA integral

Probar:

- profesor;
- alumno;
- administrador;
- potencial;
- provisional;
- registrado;
- parejas;
- bonos;
- clases;
- evaluaciones;
- enseñanza;
- marketing;
- iPhone;
- desktop;
- borrado selectivo;
- borrado por áreas;
- backup + reinicio operativo;
- backup + reinicio completo + restauración.

### Auditoría funcional final

Comparar:

`diseñado → implementado → comportamiento real`.

Buscar:

- botones muertos;
- rutas erróneas;
- duplicaciones;
- datos que no guardan;
- errores silenciosos;
- pantallas inaccesibles;
- inconsistencias;
- endpoints obsoletos aún invocables.

### Release

- datos iniciales;
- entorno;
- seguridad;
- rendimiento;
- backups;
- integraciones;
- dominio;
- runtime Hostinger demostrado;
- checklist final.

---

# 4. Mapa de la auditoría funcional histórica F1–F46

Este mapa evita perder decisiones antiguas aunque la ejecución moderna use P18–P32.

| Auditoría histórica | Estado / destino actual |
|---|---|
| F1 Marketing no abría | ✅ cerrado |
| F1B TypeScript estricto | ✅ cerrado |
| F2 navegación atrás | ✅ cerrado y consolidado en P18 |
| F3 visual global | ✅ base cerrada / QA permanente |
| F3B inputs numéricos | → G3 + P20/P21/P29/P31 |
| F4 avatar/perfil/preferencias/portal | ✅ multirol consolidado en P18 |
| F5 centro de notificaciones | ✅ base; automatización → P27 |
| F6 temporizadores/duración real | ✅ regla permanente P21 |
| F7 duración prevista + bono | ✅ preservar/revalidar P21 |
| F8 cierre administrativo amplio | → P21 |
| F9 duplicaciones Dar clase | → P21 |
| F10 espacio dinámico Dar clase | → P21 |
| F11 buscador Dar clase | → P21 |
| F12–F15 evaluaciones | ✅ cerrado en P17 |
| F16–F20 Enseñanza | → P23 |
| F21–F25 Personas/Alumnado | → P19 + P20 + cruce P21 |
| F26–F31 Marketing | → P29 |
| F32–F33 Misiones/worker | → P25 |
| F34 notificaciones automáticas | → P27 |
| F35 Agenda/Calendar | → P26 |
| F36 formularios/admin/transferencia | → P20 + P28 + P31 |
| F37 catálogos | → P31 |
| F38 integraciones | → P31 |
| F39 apariencia | → P31 |
| F40–F41 estadísticas | → P30 |
| F42 reset | ✅ base implementada v44–v44d; reauditoría final → P32 |
| F43 seguridad/destructivas | → G6 + P31 + P32; reset ya aplica G6 reforzado |
| F44 QA integral | → P32 |
| F45 auditoría funcional final | → P32 |
| F46 producción | → P32 |

---

# 5. Correctivos y novedades incorporados

| Regla / error / mejora | Ubicación definitiva |
|---|---|
| `05` / `050` en horas-minutos | G3 + P21 |
| teclado numérico/decimal | G3 |
| varios vídeos por clase | P21 |
| pareja → vídeo para Ambos por defecto | P21 |
| vídeos de clase fuera de árboles | G5 + P21 + P23 |
| reabrir clase y revertir cierre | P21 |
| doble confirmación al eliminar | G6 + P31/P32 |
| transferencia individual→pareja por minutos | P21 |
| bono compartido mostrado una sola vez | P21 |
| regularizar diferencia exacta | P21 |
| suplementos compactos editables | P21 |
| pago parcial | P21 |
| crear provisional desde Dar clase | P19 ↔ P21 |
| una clase abierta no bloquea otra | P21 |
| alerta urgente de clase olvidada | P27 |
| ejercicio “Realizar en pareja / Necesita pareja” | P23 |
| no fase obligatoria de 3 minutos | P21 |
| no cronómetro facturable | P21 |
| PR #1 no se fusiona por inercia | ✅ P17, cerrada supersedida |
| v41b presente en esquema pero registro históricamente inconsistente | G8 + P32 |
| borrador de evaluación clase 23 | ✅ preservado y completado explícitamente antes de v43 |
| revisión postclase reaparecía/recargaba | ✅ correctivo P17, commit `d0f9bd49c82047bfacff12f68b46bd061650d98c` |
| leaked password protection desactivado | G2 + P32 |
| deuda de índices/policies detectada por advisor | P32 |
| backend incompatible solo tras probar runtime | G1, validado operacionalmente en P17 |
| borrado selectivo y por áreas desde Administración | ✅ adelanto F42/P32 v44–v44d |
| reinicio operativo/completo con backup previo | ✅ base F42/P32; reauditar en P32 |
| borrar todos los alumnos elimina sus personas de prueba | ✅ v44d; identidades staff protegidas |
| backup completo histórico omitía 5 tablas actuales | ✅ v44c; cobertura real = 0 ausencias |
| copia descargada no habilitaba el reinicio tras rerender/recarga | ✅ v44e; validez consultada en servidor durante 30 min |
| resumen final no permitía corregir/añadir contenido olvidado | ✅ correctivo adelantado P21; editor de resumen fusionado |
| recursión RLS en `student_content_assignments` / `teaching_contents` | ✅ v45, sin desactivar RLS |
| búsqueda/creación de enseñanza no funcionaba tras cierre administrativo | ✅ v45 mientras `pedagogy_closed_at` siga vacío |
| comenzar clase podía quedarse en `Abriendo…` por refrescos ajenos | ✅ correctivo adelantado P21; transición operativa desacoplada de Marketing |
| `Ver como` solo confiaba en preferencia frontend | ✅ P18/v46; autorización de contexto en servidor sin escalada |

---

# 6. Orden inmediato desde este corte

**P19 → P20 → P21 → P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**

Los adelantos F42/P32 y P21 realizados durante P18 **no modifican este orden**. Cuando llegue cada P original se revalida la implementación existente en lugar de recrearla.

No volver al antiguo orden F8 → F3B → F9… como secuencia de implementación: esos requisitos siguen vigentes, pero están absorbidos en la secuencia P moderna.

---

# 7. Reglas maestras que no se pueden volver a romper

1. **Dar clase no usa tiempo real para calcular duración o cobro.**
2. **No existe fase obligatoria ni temporizador de 3 minutos.**
3. **CYA reutiliza datos ya conocidos y evita preguntar dos veces.**
4. **Una clase abierta no bloquea otra.**
5. **Un bono de pareja es un único bono compartido.**
6. **Vídeos de clase no forman parte de árboles por el mero hecho de asociarse a contenido.**
7. **Provisionales deben ser operativos desde el lado del profesor.**
8. **Las evaluaciones se basan en el modelo guiado aprobado, no en reactivar formularios numéricos antiguos.**
9. **Las estadísticas se definen con el usuario antes de implementarlas.**
10. **Eliminar información relevante requiere la protección de G6.**
11. **No aplicar un backend incompatible hasta demostrar el frontend de producción.**
12. **La verdad de Supabase se comprueba en el esquema real, no solo en el historial de migraciones.**
13. **Un reinicio masivo nunca se ejecuta sin copia completa reciente, impacto visible, frase exacta y segunda confirmación.**
14. **El reinicio de datos nunca elimina Auth, roles de acceso, migraciones ni la configuración técnica necesaria para volver a entrar en CYA Hub.**

Este documento sustituye las hojas parciales anteriores y será el listado que se actualice al inicio y cierre de cada P.