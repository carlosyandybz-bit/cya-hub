# P20 — Formularios versionados + datos canónicos

Estado: **implementación y dry-run cerrados; cutover productivo pendiente de G1**  
Fecha: 2026-08-11  
Repositorio: `carlosyandybz-bit/cya-hub`  
Código P20 fusionado a `main`: `09b994fb98b3128da391629ca1f45b456063cdb3`  
Migración preparada: `supabase/v48_p20_form_engine.sql`

## 1. Objetivo

P20 convierte la estructura histórica de formularios introducida en v14 en un motor real, reusable y versionado, sin crear una segunda biblioteca paralela y sin duplicar hechos canónicos que ya pertenecen a `people`, `student_profiles` u otras fuentes relacionales.

## 2. Auditoría previa

Producción antes de v48:

- `people`: 3;
- `form_definitions`: 18;
- `form_versions`: 18;
- `form_fields`: 68;
- `form_submissions`: 0;
- `student_profiles.birth_date`: no existe;
- `student_profiles.motivation`: no existe;
- `public.form_runtime`: no existe.

La base histórica v14 ya contenía `form_definitions`, `form_versions`, `form_fields` y `form_submissions`. P20 reutiliza esas tablas.

## 3. Clasificación de formularios históricos

Solo tres formularios históricos son formularios genéricos de información:

1. `onboarding`;
2. `student_personal`;
3. `student_dance`.

Los otros 15 representan inventario o contratos de flujos de negocio —bonos, vinculación, renovaciones, alertas y operaciones equivalentes— y no deben convertirse artificialmente en simples envíos JSON. v48 los conserva como `runtime_engine=domain_service`, los deja fuera del runtime genérico y bloquea su activación, versionado o publicación desde el editor genérico.

## 4. Fuente única de verdad

Rutas canónicas permitidas en v48:

- `people.first_name`;
- `people.last_name`;
- `people.email`;
- `people.phone`;
- `people.country_code`;
- `student_profiles.birth_date`;
- `student_profiles.goals`;
- `student_profiles.motivation`;
- `student_profiles.health_notes`;
- `student_profiles.teacher_notes`.

No se usa SQL dinámico para resolver `canonical_path`. La lista está permitida explícitamente en servidor.

Cuando se envía un formulario:

- los hechos canónicos actualizan su tabla real;
- `form_submissions.answers` guarda únicamente respuestas específicas no canónicas;
- `canonical_snapshot` conserva una instantánea trazable de los datos canónicos usados en ese envío;
- un envío continúa apuntando a la versión exacta con la que se creó aunque después se publique otra versión.

## 5. Versionado inmutable

Una versión publicada no se edita directamente.

Flujo administrativo:

1. versión activa/publicada;
2. crear nueva versión borrador;
3. editar/agregar/configurar campos en el borrador;
4. validar el borrador;
5. publicar;
6. la versión anterior pasa a `superseded`;
7. envíos anteriores mantienen su `form_version_id` original.

`trg_guard_published_form_fields` impide INSERT/UPDATE/DELETE de campos sobre versiones que no sean `draft`.

## 6. Constructor genérico de Administración

RPCs nuevas:

- `create_generic_form`;
- `add_form_draft_field`;
- `configure_form_draft_field`;
- `create_form_draft_version`;
- `update_form_draft_field`;
- `publish_form_version`;
- `set_form_definition_status`.

Administración puede configurar:

- información;
- texto;
- textarea;
- select;
- multiselect;
- checkbox;
- número;
- fecha;
- email;
- teléfono;
- orden;
- obligatorio;
- ayuda;
- opciones;
- visibilidad;
- condiciones;
- validación;
- fuente canónica o respuesta específica.

La publicación valida como mínimo que exista un campo activo, que las rutas canónicas sean válidas y que las condiciones no apunten a campos inexistentes.

## 7. Seguridad

- escrituras directas `INSERT/UPDATE/DELETE` sobre definiciones, versiones, campos y envíos se revocan a `authenticated`;
- las escrituras pasan por RPCs `SECURITY DEFINER` con `search_path=''` y autorización interna;
- las RPC públicas se revocan a `anon` y se conceden a `authenticated`;
- los helpers `private.*` no son ejecutables por clientes;
- `student_profiles.teacher_notes` tiene un suelo de seguridad en servidor: aunque una configuración intente marcarla visible/editable por alumno, se fuerza a solo equipo y el runtime la omite para usuarios no staff;
- `canonical_path` usa allowlist y no SQL dinámico;
- formularios `domain_service` no pueden ejecutarse, versionarse, publicarse ni activarse mediante el motor genérico.

## 8. Runtime y UX

`RuntimeForm` resuelve metadata desde servidor y soporta modo:

- `complete_missing`;
- `edit`;
- `review`.

En `complete_missing`, los datos ya conocidos pueden ocultarse y la interfaz indica `CYA ya conoce N datos`.

G3 se conserva:

- campos numéricos mantienen cadena vacía durante edición;
- `inputMode=numeric` o `decimal` según validación;
- no se fuerza `0`;
- escribir `5` no produce `05`/`050`.

Alumnado usa `student_personal` mediante `RuntimeForm`.

## 9. Compatibilidad de despliegue

El frontend P20 puede desplegarse antes que v48:

- si `form_runtime` todavía no existe, detecta `PGRST202` / schema cache;
- `StudentIdentityEditor` cae al guardado seguro P19 mediante `save_person_identity`;
- Administración muestra la biblioteca en modo lectura y no permite operaciones P20 hasta detectar el backend nuevo.

El endpoint `GET /api/build-info` devuelve el marcador:

`p20-form-runtime-v48-ready`

Este marcador existe específicamente para demostrar G1 antes de aplicar v48.

## 10. QA de GitHub

Head final previo al merge: `2d34222b192b3344a9494c756d4a83d77f692784`.

Validaciones sobre ese head:

- P20: **13/13 regresiones + lint + build Next.js = OK**;
- P19: **6/6 regresiones + lint + build Next.js = OK**.

La regresión P20 prohíbe también volver a introducir cargas PL/pgSQL del tipo fila compuesta + escalar en un mismo `INTO`, después de que el primer dry-run detectara esa incompatibilidad.

## 11. Dry-run de v48

Primer intento:

- falló en compilación por `record variable cannot be part of multiple-item INTO list`;
- la transacción abortó;
- producción quedó sin cambios.

Corrección:

- `configure_form_draft_field` carga por separado `v_field`, `v_status` y `v_form`;
- `update_form_draft_field` carga por separado `v_field` y `v_status`;
- prueba aislada de ambas RPC: compilación correcta + rollback.

Segundo dry-run integral:

- migración completa;
- runtime `student_personal` v2;
- datos temporales;
- canonicalidad;
- formulario genérico temporal;
- protección `teacher_notes`;
- publicación v1 y v2;
- preservación del `form_version_id` histórico;
- bloqueo de `domain_service`;
- revocación de escritura directa;
- inmutabilidad de campos publicados;
- **resultado: `p20_v48_full_dry_run_passed_and_rolled_back`**.

Baseline después del rollback, idéntico al inicial:

- personas: 3;
- definiciones: 18;
- versiones: 18;
- campos: 68;
- envíos: 0;
- `birth_date`: ausente;
- `motivation`: ausente;
- `form_runtime`: ausente.

## 12. Estado del cutover

El código P20 ya está fusionado a `main` mediante:

`09b994fb98b3128da391629ca1f45b456063cdb3`

**v48 no está aplicada todavía.**

Gate pendiente:

- demostrar que Hostinger sirve el frontend P20 mediante `/api/build-info` con `release=p20-form-runtime-v48-ready`.

La sesión que realizó este cierre no pudo resolver DNS de `app.carlosyandy.com` en ese momento y GitHub no recibió estados de deployment de Hostinger. Por G1, no se debe aplicar v48 hasta obtener evidencia del runtime real.

## 13. Pasos exactos para cerrar P20 cuando G1 sea verificable

1. comprobar `https://app.carlosyandy.com/api/build-info`;
2. exigir `release = p20-form-runtime-v48-ready`;
3. aplicar `v48_p20_form_engine` mediante migración Supabase;
4. comprobar ledger y esquema real;
5. smoke autenticado con datos temporales y rollback;
6. verificar 3 formularios genéricos activos y 15 `domain_service` inactivos;
7. verificar grants y suelo de seguridad de `teacher_notes`;
8. revisar advisors de Supabase;
9. actualizar este informe con la evidencia productiva;
10. actualizar Plan Maestro a v3.7: P20 cerrado / P21 siguiente.

P20 no debe declararse cerrado antes de completar esos pasos.
