# CYA Hub — Auditoría funcional completa de staging

Fecha: 2026-08-19
Rama auditada: `staging`
Corte funcional inspeccionado: `f41109b4d68b37b060af064f10e921519bc1be6d`
Estado del documento: **CANÓNICO PARA ORGANIZACIÓN FUNCIONAL DE STAGING**

> Esta revisión sustituye la auditoría simple inicial conservando la misma ruta para no fragmentar documentación ni romper referencias existentes.

## 0. Objetivo, alcance y criterio de lectura

Esta auditoría cubre la aplicación completa, no solo el portal del profesor:

- acceso, registro y recuperación de contraseña;
- perfil obligatorio tras registro;
- identidad única y multirol;
- portal del alumno;
- portal del profesor/staff;
- experiencia de Administración;
- Alumnado, clases, bonos y agenda;
- Dar clase;
- Enseñanza;
- Marketing y CRM;
- evaluaciones;
- misiones;
- BZ Points;
- Feedback Online;
- Academia Online;
- notificaciones;
- estadísticas;
- multimedia;
- formularios configurables;
- integraciones;
- QA, migraciones y límites staging/producción;
- deuda estructural y organización objetivo.

La auditoría distingue entre **existencia de código**, **organización funcional** y **certificación runtime**. Que exista una función o una prueba no significa automáticamente que el HEAD actual esté certificado en navegador o que una integración externa esté conectada.

### Estados usados

- **CANÓNICO / OPERATIVO EN CÓDIGO**: la función tiene implementación real y un hogar lógico razonable.
- **OPERATIVO CON DEPENDENCIA EXTERNA**: la implementación existe, pero su disponibilidad real depende de credenciales/proveedor/configuración.
- **PARCIAL**: existe una parte útil, pero el producto o flujo final aún no está completo.
- **PLACEHOLDER / FUTURO**: la superficie existe, pero todavía no ofrece el producto final.
- **COMPATIBILIDAD**: sigue activa para no romper comportamiento mientras existe una implementación anterior o fallback.
- **REUBICAR**: la función existe, pero está presentada en un lugar que no debería ser su hogar definitivo.
- **DEUDA ESTRUCTURAL**: funciona, pero aumenta riesgo, duplicación o coste de mantenimiento.
- **NO CERTIFICADO EN ESTE CORTE**: no se afirma que el HEAD actual haya superado toda la batería E2E si no existe evidencia asociada al commit auditado.

---

# 1. Arquitectura funcional definitiva

CYA Hub no debe entenderse como una sola interfaz con muchas pestañas. Debe tratarse como **tres experiencias de producto sobre una misma identidad y unos mismos motores de dominio**:

1. **Alumno**
2. **Profesor / Staff**
3. **Administrador**

Además existen superficies públicas/de cuenta y motores transversales compartidos.

## 1.1 Entrada y cuenta

Responsabilidad: autenticar, identificar a la persona y dirigirla a la experiencia autorizada.

Debe contener únicamente:

- login;
- creación de cuenta de alumno;
- confirmación de email;
- recuperación/cambio de contraseña;
- comprobación de perfil obligatorio;
- resolución de identidad;
- selección de experiencia autorizada;
- perfil personal;
- preferencias personales;
- cierre de sesión.

No debe contener reglas pedagógicas, CRM ni reglas de negocio específicas de una pantalla.

## 1.2 Experiencia Alumno — cinco núcleos

La navegación principal actual del alumno es conceptualmente correcta:

1. **Inicio**
2. **Progreso**
3. **Mi Formación**
4. **Descubre**
5. **Misiones**

Notificaciones, perfil, preferencias, BZ y Feedback Online pueden tener accesos rápidos/contextuales, pero no necesitan ampliar la barra principal.

## 1.3 Experiencia Profesor — cinco núcleos

La navegación principal diaria debe ser:

1. **Inicio**
2. **Alumnado**
3. **Dar clase**
4. **Enseñanza**
5. **Marketing**

Funciones como Agenda, Estadísticas, Academia Online, Notificaciones o Administración pueden ser importantes sin convertirse en módulos primarios independientes.

## 1.4 Experiencia Administrador

Administración no debe competir con los cinco módulos de trabajo diario. Es una experiencia de gobierno/configuración con acceso únicamente para quien tenga permiso real de administración.

## 1.5 Motores transversales

Deben existir por debajo de las experiencias y ser consumidos desde varias superficies sin duplicarse:

- identidad y permisos;
- persona única;
- formularios;
- clases;
- bonos/facturación;
- enseñanza;
- evaluaciones;
- misiones;
- BZ Points;
- Feedback Online;
- Academia Online;
- agenda/calendario;
- notificaciones;
- multimedia;
- estadísticas;
- comunicaciones;
- integraciones;
- auditoría/importación/exportación.

**Regla maestra:** una función puede tener varios accesos, pero solo un motor y una fuente de verdad.

---

# 2. Acceso, registro, perfil e identidad

## 2.1 Login — CANÓNICO / OPERATIVO EN CÓDIGO

Existe acceso por email y contraseña con mensajes de error adaptados al usuario.

## 2.2 Registro — CANÓNICO / OPERATIVO EN CÓDIGO

La cuenta pública se crea como alumno y no ofrece selector de permisos. Eso es correcto: nadie puede autoasignarse Profesor o Administrador durante el alta.

El formulario inicial pide:

- nombre completo;
- email;
- contraseña;
- confirmación de contraseña.

La contraseña exige una longitud mínima y se usa confirmación por email.

## 2.3 Perfil obligatorio tras registro — CANÓNICO / OPERATIVO EN CÓDIGO

El router de entrada comprueba el estado de perfil para cuentas de alumno y fuerza una compuerta antes de entrar al portal cuando faltan datos obligatorios.

Actualmente se exige:

- nombre;
- apellidos;
- teléfono;
- país.

El email autenticado se conserva como dato de la cuenta.

### Lógica especialmente correcta

Si el teléfono/email coincide con una ficha previa, el sistema no debe crear una segunda persona silenciosamente. El flujo puede generar una necesidad de fusión y dejarla pendiente de resolución administrativa.

## 2.4 Persona única — CANÓNICO / OPERATIVO EN CÓDIGO

La identidad está orientada correctamente a una única `people` canónica.

Existen herramientas para:

- editar identidad;
- buscar candidatos de fusión;
- fusionar personas;
- conservar la persona canónica;
- crear alumnos provisionales reutilizando el modelo de persona;
- vincular posteriormente una cuenta registrada.

**Mantener como invariante:** provisional, registrado, alumno, profesor y contacto CRM no deben convertirse en cinco personas distintas.

## 2.5 Multirol y cambio de experiencia — CANÓNICO / OPERATIVO EN CÓDIGO

La entrada diferencia permisos reales `can_study`, `can_teach` y `can_admin`. El cambio de experiencia está condicionado por esos permisos y no debe elevar privilegios.

### Hallazgo de arquitectura

Actualmente participan **dos capas** en sesión/experiencia:

- `AppEntryRouter` como router moderno de experiencias;
- `CyaApp` conserva todavía lógica propia de autenticación, experiencia y fallback de alumno/staff.

Esto es útil como compatibilidad, pero a largo plazo deja dos posibles propietarios del arranque de la app.

**Destino:** `AppEntryRouter`/shell debe convertirse en el propietario único de sesión, identidad, experiencia y gating. `CyaApp` debería recibir ese contexto ya resuelto.

---

# 3. Portal del alumno — auditoría completa

## 3.1 Inicio — CANÓNICO / OPERATIVO EN CÓDIGO

Responsabilidad: responder a **“¿qué me conviene hacer ahora?”**.

Ya integra información contextual de:

- próxima clase;
- preparación de clase;
- progreso/formación activa;
- misiones;
- BZ Points;
- Feedback Online;
- actividad reciente;
- accesos secundarios.

La jerarquía `Ahora → preparación → progreso/misiones/BZ → actividad secundaria` es correcta y debe mantenerse.

## 3.2 Preparación de próxima clase — CANÓNICO / OPERATIVO EN CÓDIGO

Es una de las lógicas más valiosas del portal.

Permite que el alumno prepare la siguiente clase mediante:

- foco/tema;
- comentario;
- contenido pedagógico;
- enlace;
- vídeo;
- cuestionario opcional cuando corresponda.

La preparación se vincula a clase/persona y no crea un sistema pedagógico paralelo.

### Organización recomendada

Debe seguir viviendo en **Inicio** por proximidad temporal a la próxima clase, pero su motor pertenece al dominio `classes/class-preparation`.

## 3.3 Progreso — CANÓNICO / OPERATIVO EN CÓDIGO

Incluye:

- prioridades actuales;
- contenidos activos;
- evaluación/radar del alumno;
- evolución dentro de su nivel;
- contexto histórico cuando existe.

La vista del alumno debe seguir siendo pedagógicamente segura: mostrar progreso relativo a su nivel y no exponer información interna del profesor.

## 3.4 Mi Formación — CANÓNICO / OPERATIVO EN CÓDIGO

Subnavegación actual:

- Resumen;
- A practicar;
- Clases realizadas;
- Contenido.

Es una buena agrupación: reúne lo que el alumno ya tiene asignado o trabajado sin mezclar descubrimiento comercial.

Debe consumir la misma biblioteca/asignaciones de Enseñanza; nunca mantener copias independientes del contenido.

## 3.5 Misiones — CANÓNICO / OPERATIVO EN CÓDIGO

La pantalla organiza misiones por intención/estado:

- prioritarias/ahora;
- disponibles;
- en progreso;
- completadas.

El portal debe ser solo una superficie del motor de Misiones, no un motor distinto.

## 3.6 BZ Points — CANÓNICO COMO PRODUCTO TRANSVERSAL

El alumno puede consultar su economía de engagement y la Administración configura las reglas/recompensas.

No debe confundirse con evaluación pedagógica ni puntuación de nivel.

## 3.7 Feedback Online — CANÓNICO COMO PRODUCTO TRANSVERSAL

La distribución actual es correcta conceptualmente:

- alumno: compra/uso/solicitud y vídeo privado;
- profesor: cola operativa vinculada al trabajo docente;
- administrador: configuración del producto.

No debe modelarse como una “clase falsa”.

## 3.8 Notificaciones — CANÓNICO / SUPERFICIE SECUNDARIA

Acceso desde cabecera/acciones, no como sexto módulo de navegación.

El motor debe ser común a alumno, profesor y administración.

## 3.9 Perfil y Preferencias — CANÓNICO / SUPERFICIE DE CUENTA

Deben mantenerse fuera de los cinco módulos y accesibles desde la cuenta/avatar.

## 3.10 Descubre — PARCIAL

La estructura conceptual es correcta:

- Aprende Online;
- Eventos.

Pero en el corte auditado, estas dos áreas todavía tienen alcance parcial desde el alumno.

### Aprende Online / Academia

La superficie del alumno sigue siendo **“Próximamente”**. La Academia tiene backend/profesor/admin, pero el producto final de consumo/compra del alumno no está abierto.

### Eventos

El portal presenta el hogar conceptual de Eventos, pero la experiencia visible todavía no constituye un catálogo/inscripción completo conectado al dominio de eventos de Marketing.

**Destino:** conservar `Descubre` y conectar en el futuro eventos reales y Academia cuando el producto esté aprobado, sin crear dominios duplicados.

---

# 4. Portal del profesor / staff — auditoría completa

## 4.1 Inicio — CANÓNICO / OPERATIVO EN CÓDIGO

Debe seguir respondiendo a **“¿qué necesito atender ahora?”** y no convertirse en una colección completa de dashboards.

Incluye o puede resumir:

- próxima clase/acción;
- misiones;
- agenda;
- avisos;
- accesos rápidos;
- contexto del día;
- pequeños indicadores útiles.

## 4.2 Alumnado — CANÓNICO / OPERATIVO EN CÓDIGO

Es el hogar de la relación con personas/alumnos.

La ficha maestra ya está organizada por intención:

### Ahora
- Resumen y prioridad/contexto.

### Aprendizaje
- Formación;
- Evaluación;
- Multimedia.

### Historial
- Clases;
- Bonos.

### Perfil
- Datos;
- CRM.

Esta agrupación es mejor que una lista plana de muchas pestañas y debe conservarse.

### Funciones asociadas

- búsqueda por nombre/teléfono/email;
- nuevo provisional;
- editar ficha;
- fusión;
- programar clase;
- añadir bono;
- historial;
- saldo;
- evaluación;
- formación;
- multimedia;
- CRM individual.

## 4.3 Clases — CANÓNICO COMO SUBÁREA OPERATIVA

Actualmente forma parte del área ampliada de Alumnado y permite:

- listar clases;
- programar;
- abrir una clase;
- identificar estados;
- reabrir cuando el contrato lo permite.

No necesita convertirse en sexto módulo principal.

## 4.4 Bonos — CANÓNICO COMO SUBÁREA OPERATIVA

Debe seguir relacionado con personas/clases y utilizar movimientos como fuente de saldo, evitando contadores independientes.

## 4.5 Agenda — MOTOR TRANSVERSAL / ACCESO CONTEXTUAL

Agenda no pertenece exclusivamente a una persona, pero tampoco necesita ocupar la barra principal.

**Hogar recomendado:** motor transversal de calendario con accesos desde:

- Inicio;
- Alumnado/Clases;
- menú rápido de Dar clase;
- Administración para configuración/sincronización.

## 4.6 Dar clase — CANÓNICO / NÚCLEO PRINCIPAL

Responsabilidad: orquestar la sesión en tiempo real.

Debe concentrar:

- selección de clase/persona;
- preparación previa;
- contexto y última clase;
- correcciones activas;
- buscador pedagógico;
- creación rápida;
- ejercicios;
- notas;
- contenido trabajado;
- multimedia de clase;
- evaluación contextual;
- cierre administrativo;
- cierre pedagógico;
- pendientes posteriores.

También contiene la cola operativa de Feedback Online cuando no hay una clase activa, lo cual es coherente si se entiende Dar clase como **centro de trabajo docente**, no solo cronómetro de una sesión.

## 4.7 Enseñanza — CANÓNICO / NÚCLEO PRINCIPAL

Es la fuente de verdad pedagógica para:

- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- categorías/tags;
- estilo/rol/nivel;
- relaciones;
- árboles/mapas;
- asignaciones;
- multimedia pedagógica;
- contenido incompleto/borrador/publicado.

La lógica de compatibilidad pedagógica debe residir en dominio/RPC/servicios reutilizables y no duplicarse entre Enseñanza, Dar clase, Academia y Portal alumno.

## 4.8 Marketing — CANÓNICO / NÚCLEO PRINCIPAL

Responsabilidad: captación, relación comercial, contenido, campañas y comunicación.

Incluye:

- CRM transversal de personas;
- contactos/oportunidades;
- tarifas;
- contenido de marketing;
- campañas;
- destinatarios/comunicaciones;
- eventos;
- métricas comerciales;
- bonos contextualizados en CRM cuando aportan información comercial.

### Deuda actual

`marketing-view.tsx` continúa delegando parte de la interfaz a `marketing-view-legacy.tsx`.

**Estado:** COMPATIBILIDAD.

No se debe borrar el legacy hasta trasladar toda la capacidad, pero tampoco se debe seguir ampliando la implementación antigua.

## 4.9 Estadísticas — OPERATIVO, PERO REUBICAR

El motor actual es más potente que “estadísticas de Marketing”:

- dashboard CRM;
- paneles configurables;
- insights;
- catálogo general;
- métricas operativas por periodos.

Por tanto, **Estadísticas es un motor transversal de Analítica**.

### Organización final

No debería ser un sexto módulo primario de profesor.

Accesos recomendados:

- Marketing → analítica comercial/CRM;
- Alumnado → evolución de alumnos/cohortes cuando corresponda;
- Inicio → indicadores ejecutivos resumidos;
- Administración → configuración/catálogo de métricas;
- un acceso secundario “Analítica” puede abrir el explorador avanzado completo.

El motor `statistics` se conserva; lo que cambia es su posición en la arquitectura de navegación.

## 4.10 Academia Online profesor — OPERATIVO, PERO REUBICAR

El profesor puede gestionar programas construidos sobre contenido pedagógico canónico y la implementación comprueba compatibilidad de estilo/rol/nivel.

Esto confirma que **Academia es una capa de empaquetado/distribución de Enseñanza**, no una biblioteca alternativa.

### Organización final

- Profesor → `Enseñanza > Academia` para programas, estructura y contenidos.
- Administración → gobernanza comercial, publicación, acceso/matrículas y configuración.
- Alumno → `Descubre` / `Mi Formación` cuando el producto esté abierto.

No debería seguir siendo un módulo primario independiente en el escritorio del profesor.

---

# 5. Administración — auditoría completa

La Administración actual dispone de 14 áreas funcionales:

- General;
- Equipo y roles;
- Formularios;
- Enseñanza;
- Misiones;
- BZ Points;
- Feedback Online;
- Academia Online;
- Notificaciones;
- Datos;
- Tarifas;
- Integraciones;
- Apariencia;
- Seguridad.

## 5.1 Agrupación actual — BUENA BASE

La agrupación por Sistema, Enseñanza, Negocio, Datos y Apariencia es razonable y no requiere rehacerse desde cero.

## 5.2 Organización recomendada

### Sistema y acceso
- General;
- Equipo y roles;
- Seguridad;
- Notificaciones globales.

### Pedagogía
- Formularios ligados a alumnado/docencia;
- Enseñanza;
- evaluación/configuración pedagógica;
- Misiones cuando sean pedagógicas/operativas.

### Productos y negocio
- Tarifas;
- BZ Points;
- Feedback Online;
- Academia Online.

### Datos e integraciones
- Importación/exportación/reset controlado/auditoría;
- Integraciones.

### Apariencia
- design system;
- iconos;
- configuración visual.

No es obligatorio cambiar todos los nombres actuales. La prioridad es que cada ajuste tenga un solo propietario.

## 5.3 Roles y permisos — CANÓNICO

La Administración gestiona roles reales y evita que la interfaz sea la única barrera de seguridad. El permiso debe continuar validándose en servidor/RPC/RLS.

## 5.4 Formularios — CANÓNICO CON CAPA DE COMPATIBILIDAD

La app usa formularios runtime/versionados, pero algunos flujos aún conservan fallback legacy para no romper datos o superficies si el formulario canónico no está disponible.

**Destino:** RuntimeForm como camino único, retirando fallbacks únicamente cuando haya cobertura y migración completa.

## 5.5 Academia Admin — REVISAR FRONTERA, NO ELIMINAR

Actualmente la Administración supervisa Academia y también gobierna el orden de módulos de escritorio.

Hay una incoherencia funcional: el sistema configurable puede tratar Academia/Estadísticas como módulos principales, mientras la arquitectura canónica busca cinco núcleos diarios.

**Destino:** `app_module_settings` debe gobernar como máximo etiqueta/orden/visibilidad de los núcleos permitidos o accesos secundarios, pero no crear una arquitectura distinta entre móvil y escritorio.

---

# 6. Motores y lógicas transversales

## 6.1 Persona única

Fuente compartida por Alumno, Alumnado, CRM, Academia, Feedback y roles.

**Estado:** CANÓNICO.

## 6.2 Clases

Debe ser un dominio único consumido por Inicio, Alumnado, Agenda, Dar clase y Portal alumno.

Incluye estado, participantes, preparación, ejecución, cierres y reapertura.

## 6.3 Bonos y facturación

Saldo derivado de movimientos, compatibilidad de bono, consumos, regularizaciones e incidencias.

No crear saldo paralelo en CRM ni Portal alumno.

## 6.4 Evaluaciones

Usadas en:

- Dar clase;
- ficha del alumno;
- Portal alumno;
- estadísticas.

Deben compartir sesiones, criterios y datos; cada experiencia solo cambia la proyección/visibilidad.

## 6.5 Misiones

Motor único para generación, estados, prioridad, caducidad, repetición, evidencias y acciones del alumno/profesor.

## 6.6 BZ Points

Ledger/economía de engagement independiente del motor de evaluación.

## 6.7 Feedback Online

Dominio propio compartido por alumno/profesor/admin; no clase falsa.

## 6.8 Academia

Dominio de programas/accesos/progreso que reutiliza contenido canónico de Enseñanza.

## 6.9 Agenda y Google Calendar

Agenda local/CYA debe funcionar aunque Google Calendar esté desconectado.

La sincronización externa es una integración del motor, no su fuente de verdad obligatoria.

## 6.10 Notificaciones

Motor común, con superficies diferentes y reglas/configuración en Administración.

## 6.11 Multimedia

Los vídeos/archivos pesados se gestionan mediante Google Drive y referencias/controles de acceso en CYA. No crear almacenamiento pesado paralelo en PostgreSQL.

## 6.12 Estadísticas

Motor transversal que debe calcular métricas de forma única y permitir distintas presentaciones por contexto.

## 6.13 Pull-to-refresh

Existe una capa transversal de refresco que dispara actualización en distintas superficies. Debe mantenerse como infraestructura compartida, no reimplementarse por pantalla.

---

# 7. Integraciones — estado funcional

## 7.1 Email — OPERATIVO CON DEPENDENCIA EXTERNA

Existe implementación SMTP server-side, diagnóstico y prueba desde Administración.

Los secretos deben permanecer únicamente en entorno servidor.

## 7.2 Google Drive — OPERATIVO CON DEPENDENCIA EXTERNA

Existe infraestructura para:

- estado real;
- credenciales/refresh;
- carpetas por finalidad;
- subida reanudable;
- multimedia protegida;
- tickets/proxy;
- eliminación controlada.

## 7.3 Google Calendar — OPERATIVO EN CÓDIGO / CONEXIÓN DEPENDIENTE DEL ENTORNO

Existe soporte real de OAuth, conexión/desconexión, sincronización y resolución de conflictos.

No se debe afirmar “conectado” sin comprobar el entorno concreto.

## 7.4 WhatsApp Business — OPERATIVO EN CÓDIGO / DEPENDENCIA META

Existe:

- diagnóstico;
- envío server-side;
- webhook;
- validación de firma;
- prueba administrativa;
- normalización del teléfono canónico.

Puede existir un bloqueo externo si el número emisor todavía no está completamente registrado/verificado en Meta. Eso no debe mezclarse con errores de lógica CYA.

## 7.5 Meta Facebook/Instagram — PARCIAL / FUTURO

No existe todavía una automatización de publicación equivalente a WhatsApp. La UI debe seguir declarando el estado real y nunca fingir que las credenciales de WhatsApp autorizan publicación social.

## 7.6 Sentry — INFRAESTRUCTURA

Observabilidad transversal. No necesita ser módulo de producto.

## 7.7 OpenAI / asistente IA — NO IMPLEMENTADO COMO MOTOR DE PRODUCTO EN ESTE CORTE

Existe un helper de autenticación relacionado con ChatGPT en el repositorio, pero no constituye la integración funcional de un asistente OpenAI dentro de CYA Hub.

En el `package.json` auditado no existe SDK `openai` y no se ha identificado un motor de producto que revise clases, sugiera correcciones, cree contenido, supervise campañas o converse sobre métricas.

**Destino futuro recomendado:** `src/integrations/openai` + un dominio de `assistant/supervision` con herramientas restringidas, permisos, trazabilidad y aprobación humana. No debe escribir datos sensibles o pedagógicos sin acciones explícitamente autorizadas.

---

# 8. Flujos cruzados que deben conservar una única lógica

## 8.1 Registro → persona existente

`Registro → confirmación email → perfil obligatorio → búsqueda/colisión → fusión si procede → Portal alumno`

Nunca: `registro → crear otra ficha aunque ya exista la persona`.

## 8.2 Provisional → registrado

`Profesor crea provisional → clases/bonos/contenido → persona se registra → vinculación/fusión → se conserva todo el historial`.

## 8.3 Clase completa

`Programar → preparación alumno/profesor → Dar clase → contenido/notas/evaluación → terminar administración/pago → cerrar pedagogía → historial + Portal alumno + misiones/notificaciones`.

## 8.4 Enseñanza → alumno

`Biblioteca canónica → reglas estilo/rol/nivel → asignación → Dar clase / Mi Formación / ejercicios / evaluación`.

## 8.5 Feedback Online

`Producto/crédito → solicitud alumno + vídeo → cola profesor → revisión pedagógica → resultado visible → estadísticas/notificación` sin inventar una clase.

## 8.6 Academia

`Contenido de Enseñanza → programa → publicación/acceso admin → consumo alumno → progreso de Academia` sin duplicar la biblioteca pedagógica ni confundir consumo con dominio pedagógico.

## 8.7 Marketing/comunicación

`Persona CRM → segmentación/campaña → destinatario → Email/WhatsApp → estado de envío → métrica` reutilizando persona y comunicaciones canónicas.

---

# 9. Matriz funcional resumida

| Dominio | Estado actual | Hogar definitivo | Acción |
|---|---|---|---|
| Login/registro/recuperación | Canónico | Cuenta/entrada | Mantener |
| Perfil obligatorio | Canónico | Entrada/identidad | Mantener |
| Persona única/fusión | Canónico | Dominio People | Mantener y reforzar |
| Multirol/Ver como | Canónico con doble capa de shell | Shell/Identity | Unificar propietario |
| Portal alumno Inicio | Canónico | Alumno/Inicio | Mantener |
| Progreso alumno | Canónico | Alumno/Progreso | Mantener |
| Mi Formación | Canónico | Alumno/Formación | Mantener |
| Misiones alumno | Canónico | Alumno/Misiones | Mantener |
| Descubre/Eventos | Parcial | Alumno/Descubre | Conectar eventos reales |
| Academia alumno | Placeholder | Descubre/Formación | Abrir solo con producto real |
| BZ Points | Canónico transversal | Alumno + Admin | Mantener |
| Feedback Online | Canónico transversal | Alumno + Dar clase + Admin | Mantener |
| Alumnado profesor | Canónico | Profesor/Alumnado | Mantener |
| Ficha alumno | Canónico | Alumnado | Mantener grupos por intención |
| Clases | Canónico | Alumnado + motor Classes | Mantener |
| Bonos | Canónico | Alumnado + Billing | Mantener |
| Agenda | Canónico transversal | Inicio/Alumnado accesos | No elevar a módulo principal |
| Dar clase | Canónico | Profesor/Dar clase | Mantener |
| Enseñanza | Canónico | Profesor/Enseñanza | Mantener |
| Marketing/CRM | Operativo con legacy | Profesor/Marketing | Retirar legacy gradualmente |
| Estadísticas | Operativo | Motor Analítica | Reubicar accesos |
| Academia profesor | Operativo | Enseñanza/Academia | Quitar de nivel primario |
| Administración | Operativo | Experiencia Admin | Mantener y pulir grupos |
| Formularios runtime | Canónico + fallback | Domain Forms/Admin | Retirar fallback cuando sea seguro |
| Notificaciones | Canónico transversal | Header + Admin config | Mantener |
| Multimedia Drive | Operativo con proveedor | Domain Media | Mantener |
| Email | Integración real | Integrations | Mantener |
| Google Drive | Integración real | Integrations | Mantener |
| Google Calendar | Integración real | Integrations | Mantener; conexión por entorno |
| WhatsApp | Integración real | Integrations | Resolver bloqueos Meta externos |
| Meta publicación social | Parcial/futuro | Marketing/Integrations | Implementar solo con permisos reales |
| Sentry | Infraestructura | Observability | Mantener |
| OpenAI asistente | No implementado como producto | Integrations/Assistant | Futuro supervisado |

---

# 10. Hallazgos estructurales priorizados

## P0 — propietario único de entrada/sesión/experiencia

**Problema:** `AppEntryRouter` y `CyaApp` todavía comparten responsabilidades de sesión/experiencia y existe lógica de portal alumno antigua/compatibilidad dentro del gran shell.

**Riesgo:** rutas inconsistentes, doble carga, divergencia de permisos y más dificultad para evolucionar Alumno y Staff de forma independiente.

**Corrección:** shell de entrada único; `CyaApp` se convierte en StaffApp puro.

## P0 — unificar arquitectura de navegación móvil/escritorio

**Problema:** móvil profesor ya tiene los cinco núcleos correctos, mientras escritorio admite `statistics` y `academy` como módulos primarios configurables.

**Riesgo:** dos arquitecturas funcionales distintas según dispositivo y crecimiento indefinido de primer nivel.

**Corrección:** mismo contrato canónico en todos los breakpoints:

`Inicio | Alumnado | Dar clase | Enseñanza | Marketing`.

Estadísticas y Academia permanecen accesibles, pero dentro de su contexto.

## P0 — proteger staging de forma real

En el corte auditado, la rama GitHub `staging` aparece **sin branch protection** y sin required status checks configurados a nivel de rama.

Hay buenas barreras en scripts/workflows/documentación, pero la rama todavía puede aceptar cambios directos sin que GitHub imponga esas comprobaciones.

**Corrección recomendada:** protección de rama con, como mínimo, build/lint/gates críticos antes de cambios sensibles o promoción.

## P0 — canonizar migraciones y registro de estado

El repositorio contiene evolución reciente en varias ubicaciones (`supabase/migrations`, `db/migrations`, históricos y baselines documentales). La documentación histórica de baseline ya no representa por sí sola el estado actual de staging.

**No se concluye que haya migraciones duplicadas aplicadas.** El problema es de claridad operativa.

**Corrección:** definir explícitamente:

1. carpeta canónica para nuevas migraciones;
2. carpeta histórica/forense no ejecutable;
3. registro aplicado de staging;
4. registro aplicado de producción;
5. regla para migraciones Drizzle si se mantienen;
6. actualización automática o disciplinada del baseline.

## P1 — descomponer `cya-app.tsx`

Sigue concentrando:

- tipos de muchos dominios;
- conexión;
- sesión;
- navegación;
- alumnos;
- clases;
- bonos;
- enseñanza;
- marketing;
- live class;
- vistas auxiliares.

Debe convertirse gradualmente en composición, no en dominio.

## P1 — retirar deuda `legacy`/versionada

Existen múltiples capas `legacy`, `v2`, `p0f`, `p31`, `p36`, `prf`, CSS v43-v59, etc.

No borrarlas masivamente.

Clasificar cada archivo como:

- CANÓNICO;
- COMPATIBILIDAD;
- LAB/EXPERIMENTO;
- OBSOLETO RETIRABLE.

Y prohibir nuevas versiones numeradas si el cambio puede hacerse sobre el componente canónico.

## P1 — Marketing debe abandonar wrapper legacy

Mantener compatibilidad hasta trasladar toda la capacidad, pero cada mejora nueva debe ir al camino canónico.

## P1 — Academia: separar pedagogía de gobernanza comercial

Profesor gestiona programa/contenido; Admin gobierna publicación, precio, acceso y producto. Evitar controles repetidos o ambiguos.

## P1 — Descubre/Eventos del alumno

Conectar a eventos reales cuando se implemente inscripción/visibilidad. Hasta entonces, tratarlo honestamente como parcial.

## P1 — certificación del HEAD de staging

El repositorio dispone de una batería amplia de tests y Playwright, pero la auditoría no debe convertir “archivos de QA presentes” en “HEAD certificado”.

Para considerar una versión lista para promoción debe existir evidencia ejecutada sobre el SHA exacto.

## P2 — consolidación CSS/design system

Existe un sistema visual canónico junto con numerosas capas históricas y parches. Una vez estabilizado el rediseño, consolidar selectivamente para reducir especificidad, orden de importación y regresiones.

## P2 — OpenAI

Preparar la arquitectura ahora, pero no introducir un nuevo módulo principal. La IA debe ser una capacidad transversal supervisada dentro de los flujos existentes.

---

# 11. Arquitectura técnica objetivo

No hacer un traslado masivo en un solo commit.

```text
app/
  page.tsx
  layout.tsx
  api/
  staging-lab/

src/
  shell/
    entry/
    session/
    experience/
    navigation/
    account/

  experiences/
    student/
    staff/
    admin/

  features/
    home/
    students/
    live-class/
    teaching/
    marketing/
    agenda/
    notifications/
    statistics/
    academy/
    feedback/
    bz/

  domain/
    identity/
    people/
    forms/
    classes/
    billing/
    teaching/
    evaluations/
    missions/
    feedback/
    academy/
    calendar/
    notifications/
    statistics/
    communications/
    media/

  integrations/
    supabase/
    google-drive/
    google-calendar/
    email/
    whatsapp/
    meta/
    sentry/
    openai/

  shared/
    ui/
    hooks/
    types/
    utils/

  compatibility/
```

## Reglas

- `app/` debe ser principalmente routing/API/composición Next.js.
- Las experiencias deciden **qué ve cada rol**.
- Los features deciden **cómo se usa una capacidad**.
- Domain decide **las reglas**.
- Integrations decide **cómo se habla con proveedores externos**.
- Shared contiene piezas genéricas.
- Compatibility tiene fecha/plan de retirada; no recibe features nuevas.

---

# 12. QA, rendimiento y seguridad operativa

## 12.1 Cobertura existente — FUERTE

El repositorio contiene QA para, entre otros:

- autenticación;
- profesor;
- alumno;
- administración;
- navegación;
- Dar clase;
- misiones;
- agenda;
- notificaciones;
- responsive;
- touch targets;
- safe areas;
- visual regression;
- release-wide audit;
- integraciones.

## 12.2 Prebuild actual

El prebuild incluye barreras de entorno, contrato visual y regresión de integraciones.

Eso es positivo, pero no sustituye la ejecución E2E completa sobre una versión que se vaya a promocionar.

## 12.3 Regla de certificación

Antes de promover staging:

1. SHA congelado;
2. build;
3. lint;
4. tests de dominio relevantes;
5. Playwright profesor/alumno/admin;
6. flujo de clase;
7. registro/perfil/fusión;
8. responsive iPhone;
9. integraciones tocadas;
10. RLS/permisos si hubo migraciones;
11. evidencia asociada al SHA;
12. solo entonces promoción.

---

# 13. Entornos y datos — invariantes

Mantener estrictamente:

- `staging` con Supabase staging;
- `main`/producción con Supabase producción;
- datos de staging nunca sustituyen producción;
- migraciones incrementales;
- sin `db reset` en producción;
- sin secretos reales en Git;
- sin service-role en cliente;
- Sentry diferenciado por entorno;
- multimedia pesada fuera de PostgreSQL;
- no mezclar credenciales de proveedores entre entornos.

---

# 14. Orden de reorganización recomendado

## Fase A — contrato y protección, sin cambiar comportamiento

1. Este documento pasa a ser mapa funcional canónico.
2. Centralizar contrato de navegación por experiencia.
3. Limitar módulos primarios de profesor a cinco.
4. Reubicar accesos de Estadísticas y Academia sin borrar funciones.
5. Definir propietario único de shell/experience.
6. Clasificar legacy/versiones.
7. Canonizar estrategia de migraciones.
8. Añadir/proponer protección real de `staging`.

## Fase B — shell

1. Extraer sesión/identidad de `CyaApp`.
2. Retirar routing de alumno duplicado cuando el nuevo router cubra todos los casos.
3. Convertir CyaApp en StaffApp.
4. Centralizar historial/navegación.

## Fase C — dominios y servicios

Orden recomendado por riesgo/valor:

1. People/Identity;
2. Classes/Billing;
3. Teaching/Evaluations;
4. Missions/Notifications;
5. Marketing/Communications;
6. Statistics;
7. Academy/Feedback/BZ;
8. Integrations.

No cambiar comportamiento y arquitectura física a la vez si no es necesario.

## Fase D — compatibilidad

1. Marketing legacy;
2. formularios legacy;
3. componentes versionados ya sustituidos;
4. CSS histórico;
5. aliases/facades innecesarios.

Cada retirada exige búsqueda de consumidores + build + QA relevante.

---

# 15. Cosas que NO se deben romper al reorganizar

1. Una sola persona canónica.
2. Registro siempre empieza sin privilegios de profesor/admin.
3. Perfil obligatorio de nuevos alumnos.
4. Fusión sin pérdida de historial.
5. Alumno solo ve datos autorizados para alumno.
6. CRM/notas internas/incidencias internas no se filtran al portal.
7. Dar clase conserva cierres administrativo y pedagógico.
8. Saldo de bono se deriva del historial de movimientos.
9. Evaluación profesor y proyección alumno siguen contratos distintos de visibilidad.
10. Misiones no se duplican por experiencia.
11. BZ no se mezcla con evaluación.
12. Feedback Online no se convierte en clase falsa.
13. Academia reutiliza contenido de Enseñanza.
14. Google Drive sigue siendo almacenamiento pesado.
15. Agenda funciona sin Google Calendar.
16. Integraciones no exponen secretos al cliente.
17. móvil y escritorio representan la misma arquitectura funcional.
18. Administración nunca eleva permisos solo por UI.
19. `staging-lab` permanece aislado de producción.
20. ninguna reorganización de código debe implicar migración destructiva de datos.

---

# 16. Resultado final de la auditoría

CYA Hub **no necesita inventar muchos módulos nuevos**. La mayoría de dominios importantes ya existen y varios están bastante desarrollados.

El problema principal de `staging` ya no es ausencia general de funciones, sino **crecimiento estructural**:

- el shell staff es demasiado grande;
- la entrada moderna y el shell antiguo se solapan;
- móvil y escritorio no tienen exactamente el mismo mapa primario;
- Estadísticas y Academia tienen demasiado peso de primer nivel;
- conviven implementaciones canónicas y compatibilidad histórica;
- la estrategia de migraciones/documentación necesita una fuente operativa inequívoca;
- la rama depende más de disciplina/workflows que de protección GitHub obligatoria.

La organización funcional recomendada queda fijada así:

### Alumno
**Inicio | Progreso | Mi Formación | Descubre | Misiones**

### Profesor
**Inicio | Alumnado | Dar clase | Enseñanza | Marketing**

### Administrador
**Sistema y acceso | Pedagogía | Productos y negocio | Datos e Integraciones | Apariencia**

### Motores transversales
**Identidad · Personas · Formularios · Clases · Billing · Enseñanza · Evaluaciones · Misiones · BZ · Feedback · Academia · Calendario · Notificaciones · Estadísticas · Comunicaciones · Multimedia · Integraciones**

Este mapa debe guiar las próximas implementaciones: **antes de crear una nueva pantalla o módulo, comprobar si la capacidad ya tiene un hogar y un motor existente.**
