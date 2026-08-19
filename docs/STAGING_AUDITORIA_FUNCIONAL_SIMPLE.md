# CYA Hub — Auditoría funcional simple de staging

Fecha: 2026-08-19
Rama auditada: `staging`
Objetivo: identificar las funciones y lógicas existentes y fijar una organización canónica sencilla, sin alterar datos ni reglas de negocio.

## 1. Criterio de organización

CYA Hub debe tener cinco núcleos visibles de trabajo:

1. **Inicio**
2. **Alumnado**
3. **Dar clase**
4. **Enseñanza**
5. **Marketing**

Todo lo demás debe vivir dentro de uno de esos núcleos o en **Administración** cuando sea configuración, mantenimiento, permisos o integración.

Regla: una función debe tener un único hogar funcional. Puede tener accesos rápidos desde otros lugares, pero no duplicar su lógica ni su implementación.

---

## 2. Mapa funcional canónico

### INICIO

Responsabilidad: responder a “¿qué tengo que hacer ahora?”.

Incluye:
- saludo y frase diaria;
- siguiente clase / siguiente acción;
- misiones y tareas prioritarias;
- resumen del día;
- agenda resumida;
- avisos y notificaciones relevantes;
- accesos rápidos;
- cambio de experiencia cuando proceda.

No debe convertirse en archivo de administración ni duplicar pantallas completas de otros módulos.

### ALUMNADO

Responsabilidad: todo lo relacionado con personas, relación docente y evolución individual.

Incluye:
- listado de alumnos/personas;
- ficha maestra de persona;
- datos personales y de baile;
- clases e historial;
- bonos y saldo;
- evaluaciones y evolución;
- correcciones y formación asignada al alumno;
- ejercicios personales;
- multimedia del alumno;
- feedback individual;
- incidencias;
- vinculación/fusión de identidades y perfiles;
- programar clase desde la persona.

La fuente de verdad debe ser la persona única. CRM, alumno registrado y alumno provisional no deben crear fichas paralelas de la misma persona.

### DAR CLASE

Responsabilidad: ejecución de una clase en tiempo real.

Incluye:
- selección de clase/alumno;
- datos y contexto previo;
- última clase;
- correcciones activas;
- buscador unificado de correcciones, explicaciones, ejercicios y secuencias;
- creación rápida durante clase;
- notas;
- contenido trabajado;
- asistencia/pago cuando corresponda;
- cierre de clase;
- evaluación postclase;
- generación de pendientes/misiones si algo queda incompleto.

La lógica propia de Dar clase no debe duplicarse dentro de Alumnado o Enseñanza. Esos módulos aportan datos y contenido; Dar clase orquesta su uso durante la sesión.

### ENSEÑANZA

Responsabilidad: biblioteca pedagógica y relaciones entre contenidos.

Incluye:
- correcciones;
- explicaciones;
- ejercicios;
- secuencias;
- categorías, etiquetas, estilos, rol y nivel;
- relaciones entre contenidos;
- árboles/mapas pedagógicos;
- contenido incompleto/borrador;
- multimedia pedagógica;
- asignaciones;
- Academia Online como canal de publicación/consumo del contenido pedagógico cuando corresponda.

Las reglas pedagógicas deben vivir en lógica de dominio reutilizable y no dentro de componentes visuales concretos.

### MARKETING

Responsabilidad: captación, relación comercial, comunicación y crecimiento.

Incluye:
- CRM/contactos;
- potenciales y oportunidades;
- tarifas comerciales;
- campañas;
- planificación de contenido;
- comunicaciones;
- WhatsApp/email como canales;
- eventos;
- fotos/vídeos de marketing;
- estadísticas comerciales y de crecimiento.

Las **estadísticas de marketing/CRM** pertenecen aquí. Las estadísticas globales de operación pueden mostrarse en Inicio o Administración según su uso, pero no necesitan ser un sexto módulo principal.

### ADMINISTRACIÓN

Responsabilidad: configurar cómo funciona la aplicación, no ejecutar el trabajo diario.

Incluye:
- sistema y configuración general;
- equipo, roles y permisos;
- seguridad;
- formularios configurables;
- configuración pedagógica;
- configuración de misiones;
- configuración de notificaciones;
- tarifas maestras;
- configuración de Feedback Online y Academia Online;
- datos, importación/exportación y mantenimiento;
- integraciones (Google Calendar, Drive, WhatsApp, email, IA, etc.);
- apariencia, iconos y design system;
- herramientas técnicas/de diagnóstico restringidas.

---

## 3. Lógicas transversales

Estas lógicas no deben pertenecer a una pantalla concreta:

### Identidad y permisos
- sesión;
- persona autenticada;
- roles alumno/profesor/admin;
- “Ver como” / cambio de experiencia;
- perfil incompleto;
- permisos de servidor.

### Persona única
- deduplicación;
- vinculación de perfiles;
- fusión segura;
- resolución por email/teléfono/identidad autenticada;
- conservación de historial.

### Misiones
- generación;
- prioridad;
- vencimiento;
- completado;
- evidencia;
- escalado;
- relación con clases, bonos, perfiles y contenido.

### Agenda/calendario
- clases;
- misiones;
- eventos;
- sincronización Google Calendar;
- conflictos e idempotencia.

### Notificaciones
- evento que las origina;
- destinatario;
- canal;
- estado de entrega/lectura;
- preferencias y horas silenciosas.

### Multimedia
- subida;
- almacenamiento;
- asociación a persona/clase/contenido/campaña;
- permisos;
- reproducción/descarga.

### Estadísticas
- métricas y agregaciones deben calcularse en una capa reutilizable;
- los dashboards solo deben presentar resultados;
- evitar volver a calcular la misma métrica de forma distinta en cada pantalla.

---

## 4. Hallazgos principales en staging

### A. `cya-app.tsx` concentra demasiadas responsabilidades — PRIORIDAD ALTA

Actualmente funciona como gran coordinador de vistas, estado, tipos y operaciones. El riesgo es que un cambio local afecte zonas no relacionadas.

Objetivo: convertirlo gradualmente en un **App Shell** pequeño que solo resuelva experiencia, navegación y composición de módulos.

### B. Hay archivos canónicos y archivos `legacy`, `v2`, `p0f` y capas históricas coexistiendo — PRIORIDAD ALTA

Ejemplos visibles:
- `marketing-view.tsx` delega todavía en `marketing-view-legacy.tsx`;
- existen variantes de dashboards y componentes con sufijos de versión;
- existen numerosas capas CSS históricas.

No se deben borrar de golpe. Primero hay que marcar explícitamente cuál es el archivo canónico y qué archivos son compatibilidad temporal.

### C. La navegación primaria todavía permite más de cinco módulos — PRIORIDAD MEDIA/ALTA

La configuración actual contempla Inicio, Alumnado, Enseñanza, Marketing, Estadísticas y Academia Online, además de Dar clase.

Objetivo visible final:
**Inicio | Alumnado | Dar clase | Enseñanza | Marketing**.

- Estadísticas se distribuye por contexto.
- Academia Online se integra principalmente en Enseñanza, manteniendo accesos rápidos donde sean útiles.
- Administración se mantiene como área de gestión, no como sexto módulo de trabajo diario.

### D. Hay lógica de datos dentro de vistas — PRIORIDAD MEDIA

Ejemplo: Home y Marketing realizan consultas/RPC directamente desde componentes de interfaz.

Objetivo: mover las operaciones a servicios/hooks de cada dominio y dejar las vistas centradas en presentar e interactuar.

### E. La separación por experiencia está correctamente encaminada — MANTENER

La entrada ya distingue Alumno, Profesor y Administrador, contempla perfil incompleto y soporta cambio de experiencia. Esta frontera debe mantenerse y reforzarse, no rehacerse.

### F. Administración ya tiene una agrupación interna razonable — MANTENER Y PULIR

Los grupos actuales Sistema, Enseñanza, Negocio, Datos y Apariencia son una buena base. Se recomienda conservar la agrupación y corregir únicamente funciones que estén en el grupo equivocado.

---

## 5. Arquitectura objetivo del código

No realizar un movimiento masivo de archivos de una vez. La estructura final recomendada es:

```text
app/
  page.tsx
  layout.tsx
  manifest.ts
  api/

src/
  shell/
    entry/
    navigation/
    experience/

  features/
    home/
    students/
    classes/
    teaching/
    marketing/
    agenda/
    notifications/
    statistics/
    academy/
    feedback/
    admin/

  domain/
    identity/
    people/
    missions/
    teaching/
    classes/
    calendar/
    notifications/
    statistics/

  integrations/
    supabase/
    google-calendar/
    google-drive/
    whatsapp/
    email/
    openai/

  shared/
    ui/
    hooks/
    types/
    utils/

  legacy/
```

`app/staging-lab/` puede continuar como laboratorio visual/QA exclusivo de staging mientras siga siendo útil.

---

## 6. Orden de reorganización seguro

### Fase 1 — sin cambiar comportamiento
1. Fijar este mapa como referencia funcional.
2. Centralizar IDs/nombres de módulos y rutas.
3. Marcar archivos como `canonical`, `compatibility` o `legacy`.
4. No crear nuevos archivos con sufijos `v2`, `v3`, etc. salvo migración explícita y temporal.
5. Extraer tipos compartidos de `cya-app.tsx`.

### Fase 2 — separar lógica de interfaz
1. Extraer servicios de Home.
2. Extraer servicios de Alumnado/persona única.
3. Extraer servicios de Dar clase.
4. Extraer servicios de Enseñanza.
5. Extraer servicios de Marketing.
6. Mantener Supabase y RPC fuera de componentes visuales cuando sea razonable.

### Fase 3 — reorganización física gradual
1. Mover un módulo cada vez a `src/features/...`.
2. Ejecutar tests/QA después de cada módulo.
3. No cambiar lógica y estructura física en el mismo paso salvo necesidad.

### Fase 4 — retirada de deuda
1. Eliminar wrappers y legacy solo cuando no tengan consumidores.
2. Consolidar CSS histórico.
3. Eliminar rutas/componentes duplicados.
4. Confirmar regresión visual y funcional antes de cada retirada.

---

## 7. Regla para nuevas funciones

Antes de crear una función nueva hay que responder:

1. ¿A cuál de los cinco núcleos pertenece?
2. ¿Es realmente una configuración de Administración?
3. ¿Ya existe la misma lógica en otro lugar?
4. ¿Necesita una pantalla propia o solo un acceso dentro de otra?
5. ¿La lógica puede vivir en dominio/servicio y ser reutilizada?

Si no tiene una respuesta clara, no se crea todavía un nuevo módulo de primer nivel.

---

## 8. Resultado esperado

La aplicación debe crecer como un sistema compuesto por cinco áreas de trabajo claras, una administración separada y lógica transversal reutilizable. El objetivo no es reducir funciones, sino **reducir duplicación, ambigüedad y lugares posibles para hacer la misma cosa**.
