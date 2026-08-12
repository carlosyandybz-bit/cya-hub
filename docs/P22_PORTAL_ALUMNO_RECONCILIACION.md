# P22 — Portal del alumno · reconciliación

Estado: **P22 CERRADO — producción + v50/v50b verificadas**  
Fecha de cierre: 2026-08-12  
Base anterior: P21 cerrado / v49  
Frontend P22: `main@10940bffe61c29b93967be86921ce4000ee50621`  
Correctivo v50b: `main@2378b0b6a025fcf0e694584d4b15e4acf2abf5f4`  
Siguiente paquete: **P23 — Enseñanza + relaciones + árboles**

## 1. Objetivo cerrado

P22 cierra una experiencia de alumno real, móvil y segura sin crear una aplicación paralela ni duplicar datos ya existentes.

El alumno puede trabajar únicamente con su información autorizada:

- próxima clase;
- historial completo de clases;
- bonos y saldo;
- formación asignada: Correcciones / Explicaciones / Ejercicios / Secuencias;
- multimedia autorizada;
- resúmenes, observaciones y trabajo de clase publicados;
- evolución y evaluaciones liberadas;
- perfil y datos personales editables según permisos canónicos.

Profesor/admin con rol alumno reutiliza la misma UX mediante `Ver como Alumno`, sin elevar permisos del servidor.

## 2. Base existente preservada

P22 no reconstruyó el portal. Reutiliza:

- `student_portal_snapshot()`;
- `student_portal_snapshot_for(bigint)`;
- proyección privada protegida de la ficha;
- v36/v36b para liberación de evaluaciones;
- v38 para visibilidad de formación;
- v42 para correlación alumno/clase;
- RLS de notas, vídeos privados, documentación, evaluaciones y asignaciones;
- portal visual existente en `app/cya-app.tsx`;
- motor de formularios canónicos P20.

## 3. Hallazgos P22 resueltos

### 3.1 Multimedia de Drive desalineada

El portal ya entregaba `class_media_resources`, pero `can_access_teaching_media` no contemplaba esa familia. Además, el ticket de media pedagógica no estaba alineado con la regla moderna `student_visible_at + asignación liberable + contenido publicado`.

P22 introduce una frontera explícita:

- helper privado `private.can_access_student_portal_media(text)`;
- wrapper público booleano `public.can_access_teaching_media(text)`;
- sin SELECT directo de alumno sobre `teaching_content_media`;
- staff conserva acceso a las tres familias;
- alumno solo accede a multimedia pedagógica liberada, vídeo privado propio cerrado y documentación propia de clase cerrada.

### 3.2 Evolución mezclaba contextos

La proyección visible de evaluaciones solo devolvía aptitud/puntuación/fecha. El frontend podía mezclar estilos, roles o niveles distintos en un único radar.

v50 amplía de forma aditiva la proyección con:

- `style_term_id` + `style`;
- `role_term_id` + `role`;
- `level_term_id` + `level`;
- `session_id`;
- `evaluation_kind`.

El portal usa el último contexto evaluado y calcula el radar únicamente con evaluaciones del mismo estilo + rol + nivel.

Preflight de datos: **60/60** evaluaciones existentes tenían estilo, rol, nivel y aptitud válidos; no hubo filas descartadas por referencias nulas o inexistentes.

### 3.3 Perfil duplicado/incompleto

La pantalla de perfil solo gestionaba nombre visual y avatar aunque P20 ya dispone del formulario canónico `student_personal`.

P22 reutiliza `RuntimeForm` en modo `edit` para usuarios con `can_study`:

- no crea campos paralelos;
- el alumno solo edita campos permitidos por P20;
- email permanece de solo equipo;
- `teacher_notes` no se entrega al alumno;
- los datos guardados actualizan las tablas canónicas y mantienen trazabilidad de formulario.

Verificación real:

- `teacher_notes_exposed = false`;
- email no escribible por alumno;
- nombre, teléfono y salud escribibles cuando corresponde;
- guardado propio real probado dentro de transacción y rollback;
- formulario de otra persona rechazado `42501`.

### 3.4 Historial recortado

`Mis clases` mostraba solo ocho elementos sin acceso al resto. P22 conserva ocho filas compactas inicialmente y añade un desplegable con todas las clases anteriores.

### 3.5 Contador de formación activa

Una explicación `explained` se contaba todavía como activa. P22 considera finalizados `corrected`, `explained` y `completed` según el tipo de contenido.

## 4. Seguridad negativa comprobada

Con identidad real de alumno sin rol de staff:

- `student_portal_snapshot_for(otra_persona)` → `42501`;
- notas de otros alumnos visibles directamente → `0`;
- vídeos privados de otros alumnos → `0`;
- documentación de clase de otros alumnos → `0`;
- evaluaciones de otros alumnos → `0`;
- asignaciones de otros alumnos → `0`.

La misma prueba se repitió después de v50 y permaneció en **0** para todas las familias.

## 5. Dry-runs previos

### Media v50

Dentro de transacción con rollback:

- media pedagógica propia liberada → permitida;
- documentación propia de clase cerrada → permitida;
- documentación de otra persona → denegada;
- la misma media pedagógica tras devolver la asignación a `pending` → denegada.

El primer diseño de wrapper `SECURITY INVOKER` falló correctamente porque el helper privado estaba revocado. No se ignoró el fallo: v50 salió inicialmente con un wrapper `SECURITY DEFINER` mínimo para mantener la cadena funcional.

### Evaluaciones v50

Dentro de transacción con rollback:

- snapshot propio con evaluaciones visibles → conserva estilo/rol/nivel;
- consulta del helper para otra persona → `42501`.

También se detectó que revocar EXECUTE del helper de evaluaciones rompía el contrato v36b porque el snapshot público es `SECURITY INVOKER`. Se preservó `EXECUTE` para `authenticated`; el helper mantiene su guard interno de identidad/staff.

### Dry-run integral

La herramienta de Supabase bloqueó el intento de combinar toda v50 y datos sintéticos en una única transacción porque no pudo clasificar automáticamente su estado de seguridad. **No se intentó eludir el control.** Los bloques funcionales de media, evaluaciones y perfil sí fueron probados por separado con rollback.

## 6. Frontend P22

Cambios cerrados:

- perfil canónico P20 integrado en `Editar perfil`;
- evolución contextual por estilo + rol + nivel;
- historial completo accesible sin perder densidad móvil;
- conteo de formación activa corregido;
- portal existente y AccountMenu preservados;
- no se crea un segundo portal;
- `/api/build-info` expone `p22-student-portal-v50-ready` con `no-store`.

El parche sobre el archivo grande `cya-app.tsx` se aplicó mediante un codemod determinista con comprobaciones de unicidad. El codemod y su workflow de un solo uso fueron retirados antes del merge.

## 7. QA y merge principal

PR **#26** — `P22: cerrar portal del alumno y seguridad multimedia`.

Head validado: `2702aeee26a97842e72af5c330651a6796f9cc4e`.

Workflow P22 final: run **31557290394**:

- npm ci → success;
- P22 portal regression gate → success;
- lint completo → success;
- production build → success;
- whitespace → success.

En el mismo head quedaron también verdes las regresiones de P18, P19, P20, P21, transición de clase y resumen de cierre.

Merge squash a `main`:

`10940bffe61c29b93967be86921ce4000ee50621`.

## 8. G1 Hostinger

La verificación se ejecutó desde un runner externo de GitHub para no depender del entorno local de esta sesión.

Workflow temporal: **Verify P22 Hostinger runtime**, run **31557437770**.

En el primer intento producción devolvió exactamente:

`{"app":"cya-hub","release":"p22-student-portal-v50-ready"}`

Resultado: **G1 P22 demostrado antes de v50**.

## 9. Cutover v50

Migración:

`v50_p22_student_portal_media_access`

Ledger Supabase:

**`20260812023916`**.

Post-cutover:

- alumno puro: `is_staff=false`, rol alumno presente;
- snapshot propio: **6 evaluaciones visibles** en el smoke;
- contexto de evaluación completo → true;
- aislamiento cruzado → 0 en notas, vídeos, documentación, evaluaciones y asignaciones;
- `anon` sin EXECUTE del wrapper ni helpers;
- `authenticated` con EXECUTE únicamente donde exige el contrato del portal.

## 10. Correctivo v50b — Advisor

Después de v50, Security Advisor señaló un único hallazgo nuevo atribuible al paquete: `public.can_access_teaching_media(text)` era `SECURITY DEFINER` y ejecutable por `authenticated`.

No se dejó como deuda.

Se diseñó y probó v50b:

- wrapper público → `SECURITY INVOKER`;
- helper `private.can_access_student_portal_media` conserva `SECURITY DEFINER` y todos los guards internos;
- `authenticated` recibe EXECUTE del helper privado únicamente para la cadena invoker;
- `public/anon` permanecen revocados;
- no se concede SELECT directo sobre media.

Dry-run v50b → success + rollback.

PR **#27** — `P22: retirar SECURITY DEFINER del wrapper público de media`.

Head `8093838f180a27cc2491c9664981bb29d537cc76`:

- Validate P22 Portal alumno run **31557762638** → success;
- Validate P21 Dar clase run **31557762635** → success.

Merge:

`2378b0b6a025fcf0e694584d4b15e4acf2abf5f4`.

Migración:

`v50b_p22_media_invoker_wrapper`

Ledger Supabase:

**`20260812024534`**.

Estado final:

- `public.can_access_teaching_media(text)` → `SECURITY INVOKER`;
- helper privado → `SECURITY DEFINER`, `search_path=''`;
- `authenticated` puede ejecutar la cadena;
- `anon` no puede ejecutar wrapper ni helper;
- smoke final v50b → success;
- Security Advisor **ya no muestra** `can_access_teaching_media`.

## 11. Advisors después de P22

No queda un hallazgo nuevo específico de P22 que exija rollback.

Permanecen deudas globales preexistentes, asignadas a P32:

- Leaked Password Protection desactivado;
- varias RPC públicas `SECURITY DEFINER` históricas de formularios/reset y otros servicios, a reauditar;
- `pg_net` en schema `public`;
- tablas técnicas con RLS sin policy intencionalmente no accesibles por cliente, a revalidar;
- FKs sin índice, policies permisivas múltiples e índices aún reportados como no usados.

No se eliminan índices automáticamente por Advisor `unused`.

## 12. Cierre

**P22 queda CERRADO.**

Evidencia suficiente:

- frontend P22 fusionado y CI completo verde;
- regresiones P18–P21 verdes;
- G1 Hostinger demostrado con marcador P22;
- v50 aplicada y verificada;
- aislamiento de alumno verificado antes y después del cutover;
- perfil canónico P20 verificado;
- evaluación contextual verificada;
- v50b elimina la única advertencia Advisor nueva introducida por P22;
- ledger v50 + v50b verificado;
- sin hallazgo nuevo de seguridad o rendimiento atribuible a P22 que obligue a rollback.

Siguiente paquete operativo: **P23 — Enseñanza + relaciones + árboles**.
