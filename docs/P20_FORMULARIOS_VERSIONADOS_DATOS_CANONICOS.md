# P20 — Formularios versionados + datos canónicos

Estado: **✅ CERRADO EN PRODUCCIÓN**  
Fecha de cierre: **2026-08-11**  
Repositorio: `carlosyandybz-bit/cya-hub`  
Frontend P20 fusionado a `main`: `09b994fb98b3128da391629ca1f45b456063cdb3`  
Informe técnico inicial fusionado: `6c04d5ebdf5749a6b3082340a72750a9322a51d4`  
Correctivo v48b fusionado: `e1d7e9c69d44d155bf9594c86a22892479bb714e`

## 1. Objetivo cerrado

P20 convierte la estructura histórica de formularios introducida en v14 en un motor real, reusable y versionado, sin crear una segunda biblioteca paralela y sin duplicar hechos canónicos que ya pertenecen a `people`, `student_profiles` u otras fuentes relacionales.

El paquete queda cerrado con frontend desplegado, backend productivo, clasificación de formularios, versionado inmutable, constructor administrativo, validación de servidor y controles de permisos verificados.

## 2. Auditoría previa

Producción antes de v48:

- `people`: 3;
- `form_definitions`: 18;
- `form_versions`: 18;
- `form_fields`: 68;
- `form_submissions`: 0;
- `student_profiles.birth_date`: no existía;
- `student_profiles.motivation`: no existía;
- `public.form_runtime`: no existía.

La base histórica v14 ya contenía `form_definitions`, `form_versions`, `form_fields` y `form_submissions`. P20 reutiliza esas tablas y no crea una biblioteca duplicada.

## 3. Clasificación de formularios históricos

Solo tres formularios históricos se consideran formularios genéricos de información y están activos en el motor:

1. `onboarding`;
2. `student_personal`;
3. `student_dance`.

Los otros 15 representan inventario o contratos de flujos de negocio —bonos, vinculación, renovaciones, alertas y operaciones equivalentes—. Se conservan para trazabilidad como `runtime_engine=domain_service`, permanecen `inactive` en el runtime genérico y no pueden activarse, versionarse ni publicarse desde el editor genérico.

Clasificación productiva verificada tras el cutover:

- **3** formularios `generic_v1` activos;
- **15** formularios `domain_service` inactivos.

## 4. Fuente única de verdad

Rutas canónicas permitidas:

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

`canonical_path` no se transforma en SQL dinámico. El servidor utiliza una allowlist explícita.

Cuando se envía un formulario:

- los hechos canónicos actualizan su tabla real;
- `form_submissions.answers` contiene únicamente respuestas no canónicas;
- `canonical_snapshot` conserva una instantánea trazable de los datos canónicos utilizados;
- el envío permanece asociado a la versión exacta con la que fue creado.

Esto materializa G7: CYA no pregunta ni almacena dos veces el mismo hecho cuando ya existe una fuente canónica.

## 5. Versionado inmutable

Una versión publicada no se modifica directamente.

Flujo administrativo definitivo:

1. versión activa/publicada;
2. crear o clonar una nueva versión `draft`;
3. editar/agregar/configurar campos en el borrador;
4. validar;
5. publicar;
6. la versión anterior pasa a `superseded`;
7. los envíos históricos conservan su `form_version_id` original.

`trg_guard_published_form_fields` bloquea `INSERT/UPDATE/DELETE` de campos sobre versiones no `draft`.

La inmutabilidad fue comprobada nuevamente en producción dentro de transacción: una modificación sobre un campo de `student_personal` v2 fue rechazada con SQLSTATE `55000` y la transacción terminó en `ROLLBACK`.

## 6. Constructor genérico de Administración

RPCs del constructor:

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

La publicación valida que exista contenido activo, que las rutas canónicas sean válidas y que las condiciones no apunten a campos inexistentes.

## 7. Seguridad

Estado productivo comprobado:

- `authenticated` **no** posee escritura directa `INSERT/UPDATE/DELETE` sobre definiciones, versiones, campos ni envíos;
- el runtime y las escrituras pasan por RPCs con validación de servidor;
- `anon` no puede ejecutar `form_runtime`, `submit_form_runtime` ni el constructor;
- `authenticated` sí puede ejecutar las RPC públicas necesarias, que comprueban autenticación, pertenencia, staff o `private.is_admin()` según la operación;
- helpers `private.*` no son ejecutables por clientes;
- `student_profiles.teacher_notes` queda forzado en servidor a `audiences=[staff]` y `editable_by=[staff]`;
- `canonical_path` usa allowlist y no SQL dinámico;
- `domain_service` queda bloqueado en el motor genérico.

Supabase Advisor marca las RPC `SECURITY DEFINER` expuestas a `authenticated`. En P20 esta exposición es **deliberada**: las tablas carecen de escritura directa para clientes y cada RPC aplica autorización interna. Debe reauditarse como parte de P32, junto con el resto de funciones privilegiadas.

La protección contra contraseñas filtradas de Supabase continúa desactivada; sigue siendo deuda conocida de **G2/P32**, no un cambio de P20.

## 8. Runtime y UX

`RuntimeForm` soporta:

- `complete_missing`;
- `edit`;
- `review`.

En `complete_missing`, los datos ya conocidos pueden omitirse y la interfaz informa que CYA ya conoce esos datos.

G3 se conserva:

- un campo numérico puede permanecer vacío durante la edición;
- `inputMode=numeric` o `decimal` según el campo;
- no se fuerza `0`;
- escribir `5` no produce `05` ni `050`.

Alumnado usa `student_personal` mediante `RuntimeForm`.

La compatibilidad de despliegue permanece: si el frontend P20 se encuentra temporalmente contra un backend anterior, la edición de identidad puede caer al guardado seguro de P19 hasta que el runtime de formularios esté disponible.

## 9. G1 — runtime Hostinger demostrado

Antes de aplicar v48 se exigió evidencia del frontend productivo.

El usuario verificó directamente en Safari el endpoint productivo:

`https://app.carlosyandy.com/api/build-info`

Respuesta observada:

```json
{"app":"cya-hub","release":"p20-form-runtime-v48-ready"}
```

Con esta evidencia quedó satisfecho G1: producción estaba sirviendo el frontend preparado para v48 antes del corte de backend.

## 10. QA de código previo al cutover

Head final previo al merge funcional: `2d34222b192b3344a9494c756d4a83d77f692784`.

Validaciones:

- P20: **13/13 regresiones + lint + build Next.js = OK**;
- P19: **6/6 regresiones + lint + build Next.js = OK**.

Las regresiones impiden volver a introducir el patrón PL/pgSQL de variable compuesta + escalar en un mismo `INTO` que detectó el primer dry-run.

## 11. Dry-run previo

Primer intento:

- detectó `record variable cannot be part of multiple-item INTO list`;
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
- publicación v1 → v2;
- preservación histórica de `form_version_id`;
- bloqueo de `domain_service`;
- revocación de escritura directa;
- inmutabilidad de publicados;
- resultado: **`p20_v48_full_dry_run_passed_and_rolled_back`**.

## 12. Cutover productivo

Tras demostrar G1 se aplicó exactamente la migración preparada:

- `v48_p20_form_engine`
- ledger Supabase: **`20260811213826`**.

Resultado productivo posterior:

- `people`: 3;
- `form_definitions`: 18;
- `form_versions`: 21;
- `form_fields`: 89;
- `form_submissions`: 0;
- `student_profiles.birth_date`: presente;
- `student_profiles.motivation`: presente;
- `public.form_runtime`: presente;
- `public.submit_form_runtime`: presente;
- 3 formularios genéricos activos en v2;
- 15 servicios de dominio inactivos en el motor genérico.

No quedaron datos temporales ni envíos de prueba.

## 13. Correctivo v48b de rendimiento

El Advisor de rendimiento detectó que la FK nueva `form_versions.published_by` no tenía índice de cobertura.

Se cerró dentro de P20:

- archivo: `supabase/v48b_p20_form_versions_published_by_index.sql`;
- PR #21;
- merge: `e1d7e9c69d44d155bf9594c86a22892479bb714e`;
- migración: `v48b_p20_form_versions_published_by_index`;
- ledger: **`20260811214312`**;
- índice verificado: `form_versions_published_by_idx`.

La deuda histórica de otros FKs/índices y políticas permisivas múltiples permanece registrada para P32. No se eliminan índices por aparecer como “unused” sin evidencia de carga real.

## 14. QA productivo posterior

Comprobaciones automáticas que sí se pudieron ejecutar:

- `form_runtime` rechaza una llamada sin sesión con `42501`;
- una versión publicada no puede modificarse (`55000`);
- `authenticated` no tiene escritura directa en las tablas del motor;
- `anon` no tiene `EXECUTE` sobre runtime/submit/constructor;
- `authenticated` conserva los `EXECUTE` previstos;
- `teacher_notes` permanece solo-equipo;
- 3 `generic_v1` activos / 15 `domain_service` inactivos;
- 0 `form_submissions` residuales;
- índice de `published_by` presente.

La plataforma de herramientas bloqueó el intento de fabricar una JWT autenticada artificial dentro de SQL para un smoke adicional. No se intentó eludir ese control. La funcionalidad autenticada queda cubierta por el dry-run previo, las regresiones de código, los guards y permisos verificados; la navegación real autenticada volverá a comprobarse durante las regresiones de los paquetes posteriores y en P32.

## 15. Estado final

**P20 queda cerrado.**

No volver a aplicar v48 ni v48b.

Siguiente paquete secuencial:

**P21 — DAR CLASE definitivo.**

P21 debe revalidar y consolidar los correctivos que ya se adelantaron: inicio fiable de clase, provisional in-flow, resumen pedagógico editable, RLS v45, cierre administrativo, buscador contextual, duración manual y ausencia de bloqueos entre clases.
