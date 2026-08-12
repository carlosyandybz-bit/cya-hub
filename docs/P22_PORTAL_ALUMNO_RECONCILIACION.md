# P22 — Portal del alumno · reconciliación

Estado: **EN VALIDACIÓN — rama P22**  
Fecha de corte: 2026-08-12  
Base: P21 cerrado / v49  
Rama: `p22/portal-alumno-definitivo`  
Siguiente cutover previsto: **v50**

## 1. Objetivo

Cerrar una experiencia de alumno real, móvil y segura sin crear una aplicación paralela ni duplicar datos ya existentes.

El alumno debe poder consultar únicamente su información autorizada:

- próxima clase;
- historial de clases;
- bonos y saldo;
- formación asignada: Correcciones / Explicaciones / Ejercicios / Secuencias;
- multimedia autorizada;
- resúmenes, observaciones y trabajo de clase publicados;
- evolución y evaluaciones liberadas;
- perfil y datos personales editables según permisos canónicos.

Profesor/admin con rol alumno debe poder validar la misma UX mediante `Ver como Alumno`, sin elevar permisos.

## 2. Base ya existente que P22 conserva

P22 no reconstruye el portal. Reutiliza:

- `student_portal_snapshot()`;
- `student_portal_snapshot_for(bigint)`;
- proyección privada protegida de la ficha;
- v36/v36b para liberación de evaluaciones;
- v38 para visibilidad de formación;
- v42 para correlación alumno/clase;
- RLS de notas, vídeos privados, documentación, evaluaciones y asignaciones;
- portal visual existente en `app/cya-app.tsx`;
- motor de formularios canónicos P20.

## 3. Hallazgos P22

### 3.1 Multimedia de Drive desalineada

El portal ya entregaba `class_media_resources`, pero `can_access_teaching_media` no contemplaba esa familia. Además, el ticket de media pedagógica no estaba alineado con la regla moderna `student_visible_at + asignación liberable + contenido publicado`.

P22 v50 introduce una frontera explícita:

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

El portal usa el último contexto evaluado y calcula su radar únicamente con evaluaciones del mismo estilo + rol + nivel.

### 3.3 Perfil duplicado/incompleto

La pantalla de perfil solo gestionaba nombre visual y avatar aunque P20 ya dispone del formulario canónico `student_personal`.

P22 reutiliza `RuntimeForm` en modo `edit` para usuarios con `can_study`:

- no crea campos paralelos;
- el alumno solo edita campos permitidos por P20;
- email permanece de solo equipo;
- `teacher_notes` no se entrega al alumno;
- los datos guardados actualizan las tablas canónicas y mantienen trazabilidad de formulario.

### 3.4 Historial recortado

`Mis clases` mostraba solo ocho elementos sin acceso al resto. P22 conserva ocho filas compactas inicialmente y añade un desplegable con todas las clases anteriores.

### 3.5 Contador de formación activa

Una explicación `explained` se contaba todavía como activa. P22 considera finalizados `corrected`, `explained` y `completed` según el tipo de contenido.

## 4. Seguridad comprobada sobre producción antes de v50

Con una identidad real de alumno sin rol de staff, dentro de una transacción de prueba:

- `student_portal_snapshot_for(otra_persona)` → `42501`;
- notas de otros alumnos visibles directamente → `0`;
- vídeos privados de otros alumnos → `0`;
- documentación de clase de otros alumnos → `0`;
- evaluaciones de otros alumnos → `0`;
- asignaciones de otros alumnos → `0`.

## 5. Formularios P20 comprobados

Smoke transaccional con alumno real:

- `form_runtime('student_personal', null, 'edit')` abre la persona propia;
- un guardado real con el campo obligatorio faltante completado funciona;
- `form_runtime('student_personal', otra_persona, 'edit')` → `42501`;
- toda la prueba termina en `ROLLBACK`.

El primer intento de guardado vacío fue rechazado correctamente porque la ficha de prueba carecía del campo obligatorio `Nombre`. No se relajó la validación.

## 6. Dry-run v50

### Media

Se probó dentro de transacción:

- media pedagógica propia liberada → permitida;
- documentación propia de clase cerrada → permitida;
- documentación de otra persona → denegada;
- la misma media pedagógica tras devolver la asignación a `pending` → denegada;
- rollback completo.

El primer diseño del wrapper público como `SECURITY INVOKER` falló correctamente al no poder ejecutar el helper privado revocado. Se corrigió a un wrapper `SECURITY DEFINER` mínimo que solo devuelve booleano y delega la identidad/propiedad al helper privado.

### Evaluaciones

Se probó dentro de transacción:

- snapshot propio con evaluaciones visibles → conserva estilo/rol/nivel;
- consulta del helper para otra persona → `42501`;
- rollback completo.

Durante el primer dry-run se detectó que revocar EXECUTE del helper de evaluaciones rompía el contrato v36b porque el snapshot público es `SECURITY INVOKER`. v50 preserva `EXECUTE` para `authenticated`; el helper mantiene su guard interno de identidad/staff.

## 7. Frontend P22

Cambios preparados:

- perfil canónico P20 integrado en `Editar perfil`;
- evolución contextual por estilo + rol + nivel;
- historial completo accesible sin perder densidad móvil;
- conteo de formación activa corregido;
- portal existente y AccountMenu preservados;
- no se crea un segundo portal.

El parche sobre el archivo grande `cya-app.tsx` se aplicó mediante un codemod determinista con comprobaciones de unicidad para evitar sustituciones silenciosas.

## 8. Gate pendiente antes de merge/cutover

- CI P22: tests específicos + P17/P19/P21;
- lint completo;
- build de producción;
- `git diff --check`;
- revisión del diff del PR;
- dry-run integral final de v50;
- merge a `main`;
- G1 Hostinger con frontend P22 compatible;
- aplicación v50;
- post-cutover de permisos, snapshot, media y advisors;
- smoke real de alumno y `Ver como Alumno` cuando runtime esté en producción.

P22 no se considera cerrado hasta completar estas evidencias.
