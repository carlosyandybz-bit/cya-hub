# CYA Hub — Administración · Borrado y reinicio de datos

Fecha: 2026-08-11  
Origen: adelanto controlado de F42 / P32 antes de P18.

## Objetivo

Permitir limpiar datos creados durante desarrollo y pruebas sin tocar manualmente Supabase y sin poner en riesgo el acceso a la aplicación.

La herramienta vive en **Administración → Datos → Borrado y reinicio**.

## Operaciones disponibles

### Selectivas

- buscar y borrar una persona/alumno concreto;
- buscar y borrar un contenido pedagógico concreto: Corrección, Explicación, Ejercicio o Secuencia.

Una identidad activa de profesor/administrador está protegida y no puede eliminarse mediante el borrado individual.

### Por áreas

- Todos los alumnos;
- Toda la enseñanza;
- Todas las clases;
- Bonos y finanzas;
- Evaluaciones, medidas y progreso;
- Marketing y CRM;
- Misiones, agenda generada y avisos.

`Todos los alumnos` elimina también las personas que eran alumnos cuando no están vinculadas a una identidad activa del equipo. Las identidades del equipo se conservan, pero sus datos de alumno se vacían.

### Limpiar datos operativos

Vacía personas no vinculadas al equipo, alumnado, clases, bonos, evaluaciones, medidas, asignaciones, incidencias, CRM, campañas/contenido/eventos de marketing, métricas de campañas, misiones, eventos de agenda, notificaciones y formularios enviados.

Conserva la biblioteca de enseñanza, tarifas, frases, reglas, catálogos, configuración, integraciones, accesos y auditoría/transferencias.

### Reinicio completo de CYA Hub

Vacía los datos de negocio y de pruebas anteriores y además elimina:

- biblioteca de enseñanza creada;
- tarifas creadas;
- frases diarias creadas;
- historial de importación/exportación;
- auditoría histórica anterior al reinicio.

Después del reset se escribe un nuevo evento de auditoría que documenta el propio reinicio.

## Infraestructura que nunca borra el reinicio

- `auth.users` y credenciales de Supabase Auth;
- migraciones del esquema;
- `app_members` y `app_member_roles`;
- perfiles/preferencias técnicas del equipo;
- catálogos base;
- configuración de evaluaciones;
- definiciones/versiones/campos de formularios;
- reglas y configuración del motor de misiones;
- reglas de notificación;
- conexiones de calendario;
- configuración de integraciones y secretos.

## Seguridad obligatoria

1. Solo `admin` o `teacher_admin` pueden preparar/ejecutar borrados.
2. Primero se crea una previsualización con cantidades afectadas.
3. La preparación caduca a los 30 minutos.
4. El usuario debe escribir una frase contextual exacta.
5. Después aparece una segunda confirmación final que identifica el alcance.
6. `operational` y `full` exigen una **copia completa generada por el mismo administrador en los últimos 30 minutos**. El requisito se comprueba también en servidor.
7. Los borrados se serializan con advisory lock.
8. La ejecución es transaccional: si una operación falla, PostgreSQL revierte el conjunto.
9. Cada borrado completado genera auditoría.
10. `admin_reset_jobs` no se expone directamente a usuarios autenticados; la operación pasa por RPCs que vuelven a comprobar el rol en servidor.

## Backup completo

Antes de habilitar el reset se corrigió el mapa histórico de copia completa. La copia actual incluye también las tablas que habían nacido después del mapa original:

- `class_content_events`;
- `class_media_resources`;
- `class_pedagogy_summaries`;
- `class_preparation_requests`;
- `data_transfer_jobs`.

La comprobación contra el esquema real devolvió **0 tablas reseteables ausentes de la copia completa**.

## Regla de estadísticas

El reset no inventa estadísticas nuevas ni mantiene snapshots de prueba. Al borrar los datos fuente correspondientes, las vistas/resúmenes derivados vuelven a calcularse a partir del estado restante o vacío.

## Producción

Migraciones:

- `v44_admin_data_reset`;
- `v44b_admin_data_reset_backup_guard`;
- `v44c_admin_reset_backup_coverage`;
- `v44d_admin_reset_student_people`.

Estas migraciones crean infraestructura; desplegarlas **no ejecuta ningún borrado**.

P32 deberá volver a auditar esta herramienta antes del release final, especialmente permisos, restauración, backup y comportamiento de cada alcance.
