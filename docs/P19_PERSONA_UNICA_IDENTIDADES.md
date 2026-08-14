# P19 — Alumnado, persona única e identidades

Fecha: 2026-08-11

## Objetivo

Consolidar una única persona canónica en `public.people` y permitir que evolucione entre Potencial, Provisional y Registrado sin crear fichas paralelas ni perder información.

## Estado derivado

No se añade una columna mutable de estado de persona. El estado se deriva de hechos existentes:

- `potential`: persona activa sin `student_profiles` activo.
- `provisional`: persona con `student_profiles` activo y sin `auth_user_id`.
- `registered`: persona con `student_profiles` activo y `auth_user_id` vinculado.

El estado comercial `crm_stage` sigue siendo independiente. Esto evita mezclar el ciclo comercial con el acceso/operatividad del alumno.

## Reglas de identidad

- Email se normaliza a minúsculas y sin espacios exteriores.
- Teléfono se compara por dígitos para detectar coincidencias operativas.
- Las altas CRM y de alumnado intentan reutilizar una coincidencia única.
- Si email/teléfono apuntan a más de una persona, se bloquea la operación y no se fusiona automáticamente.
- Se usan advisory locks transaccionales para evitar dos altas concurrentes de la misma identidad.
- Editar una persona no permite apropiarse del email/teléfono de otra ficha.
- Ninguna transición cambia clases, bonos, formación, CRM o autenticación de forma destructiva.

### Email de contacto y email de acceso

`public.people.email` y `auth.users.email` cumplen funciones diferentes y no tienen que ser iguales después de vincular una cuenta:

- `people.email` es el email canónico de contacto de la persona y forma parte de la detección de identidades duplicadas. Puede editarse desde la ficha sin cambiar las credenciales de acceso.
- `auth.users.email` es el email de autenticación/acceso. No debe sobrescribirse implícitamente al editar datos de la persona.
- `people.auth_user_id` es el vínculo autoritativo entre la persona canónica y su cuenta Auth. Cuando existe, prevalece sobre la igualdad textual entre ambos emails para reconocer que se trata de la misma persona.
- Antes de existir `auth_user_id`, email y teléfono siguen utilizándose de forma conservadora para localizar una coincidencia única. Una coincidencia solo por teléfono que además presente otro email de contacto requiere revisión antes de enlazar una cuenta de acceso.
- Vincular o habilitar acceso no debe reemplazar automáticamente un email de contacto existente por el email de login.

## Operaciones modificadas por v47

- `create_student`: crea un provisional nuevo o reutiliza la persona existente.
- `save_crm_contact`: crea un potencial o vincula el CRM a una persona existente sin duplicarla.
- `enable_provisional_student`: idempotente; activa la ficha alumno sin duplicar ni perder datos.
- `save_person_identity`: permite al profesor editar nombre, apellidos, email, teléfono, país, objetivos, notas internas y notas de salud desde Alumnado.
- `private.link_confirmed_student`: vincula Auth por email a la persona existente cuando la coincidencia es inequívoca y no usa nombres genéricos como fallback. Si `auth_user_id` ya está vinculado, ese vínculo identifica la persona aunque su email de contacto sea diferente del email de acceso.
- `person_lifecycle_status`: expone el estado derivado con control de permisos.

## Interfaz

### Alumnado

- Los alumnos operativos se muestran como `Provisional` o `Registrado`.
- La ficha incluye `Editar` en Datos principales.
- La edición actualiza la misma persona y conserva sus relaciones.

### Marketing / CRM

- Cada fila muestra además el ciclo de persona: Potencial / Provisional / Registrado.
- `Habilitar provisional` reutiliza la misma persona.
- Crear un contacto con email/teléfono ya conocido reutiliza la ficha cuando la coincidencia es única.

### Dar clase

En `Empezar otra clase` se añade `Crear alumno provisional` para cada posición de alumno. El alta rápida:

1. abre un formulario mínimo;
2. crea o reutiliza la persona;
3. refresca Alumnado sin salir del flujo;
4. selecciona automáticamente el provisional recién creado/reutilizado;
5. continúa con la preparación de la clase.

Este cruce pertenece funcionalmente también a P21 y debe revalidarse cuando P21 sea el paquete activo; no debe reconstruirse desde cero.

## Validación

- CI P19 inicial: regresiones, lint del editor y build Next.js correctos.
- Dry-run v47 autenticado dentro de `BEGIN/ROLLBACK`:
  - creación de potencial temporal;
  - estado `potential` confirmado;
  - `create_student` con mismo email/teléfono reutilizó el mismo `person_id`;
  - estado `provisional` confirmado;
  - edición de identidad preservó el ID;
  - conflicto con otra identidad fue bloqueado;
  - rollback dejó `people` en 3 filas.
- v47 aplicada en producción con ledger `20260811192818`.
- Smoke autenticado posterior a producción repitió Potencial → Provisional sobre el mismo ID y volvió a 3 personas tras rollback.

### Follow-up v75

La auditoría post-release detectó un supuesto demasiado estricto introducido por v74 al dar de alta profesores: exigía que el email de contacto de una persona ya vinculada coincidiera con el email de Auth. v75 corrige esa regresión manteniendo `auth_user_id` como vínculo autoritativo, preservando el email de contacto y conservando el bloqueo del emparejamiento ambiguo de una persona todavía no vinculada.

## Datos reales tras v47

La migración no fusionó ni modificó las personas existentes. Estado derivado observado tras despliegue:

- persona 2: `registered`.
- persona 15: `provisional`.
- persona 16: `provisional`.

Total de personas: 3.

## Pendiente relacionado

P20 construirá formularios versionados y reutilización sistemática de datos canónicos. P21 revalidará el alta rápida de provisional dentro del flujo definitivo de Dar clase.
