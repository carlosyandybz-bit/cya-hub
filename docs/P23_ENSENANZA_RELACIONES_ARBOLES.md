# P23 — Enseñanza + relaciones + árboles

Estado: **P23 CERRADO — v51 + frontend + runtime verificados**  
Fecha de cierre: 2026-08-12  
Base anterior: P22 cerrado / v50 + v50b  
Backend P23: `main@4e95cdb5ee909391b51c33abea6d1c5baa7d41ce`  
Frontend P23: `main@f94eb1a6c154515f68659f29facf15903af227c8`  
Siguiente paquete: **P24 — Inicio contextual**

## 1. Verdad del esquema real

P23 se auditó contra producción, no contra el SQL histórico.

Modelo canónico real:

- `teaching_contents` — Correcciones / Explicaciones / Ejercicios / Secuencias;
- taxonomías N:M de estilos, roles y niveles;
- `teaching_content_tags`;
- `teaching_content_media`;
- `teaching_content_relations`;
- `student_content_assignments`.

**No existe `teaching_sequence_items` en producción.** Las secuencias se representan en el mismo grafo canónico mediante:

`teaching_content_relations(relation_type='sequence_item', position)`.

P23 no creó una base ni una tabla paralela.

## 2. Estado de datos al iniciar y cerrar P23

Al iniciar:

- relaciones pedagógicas: **0**;
- secuencias relacionadas: **0**;
- campos de pareja en Enseñanza: **0**;
- estilos activos: Bachata / Salsa / Zouk / Bachazouk;
- roles activos: Leader / Follower;
- niveles activos: Inicio / Intermedio / Avanzado.

Después del cutover:

- `requires_partner=true` en contenidos existentes: **0**;
- relaciones pedagógicas reales: **0**;
- no se fabricó contenido ni relaciones de demostración en producción.

Esto es deliberado: P23 cierra modelo, reglas y UX; el contenido pedagógico real se crea mediante la aplicación.

## 3. Backend v51 ✅

Migración:

`v51_p23_teaching_graph_contract`

Ledger Supabase:

**`20260812031009`**.

PR backend **#28** → merge:

`4e95cdb5ee909391b51c33abea6d1c5baa7d41ce`.

### Necesita pareja

- `teaching_contents.requires_partner boolean not null default false`;
- constraint: solo puede ser `true` para `content_type='exercise'`;
- RPC `set_teaching_exercise_partner_requirement(bigint, boolean)`;
- Dar clase rechaza en servidor `exercise_active` / `exercise_completed` cuando el ejercicio requiere pareja y la clase tiene menos de dos participantes.

### Homólogas Leader/Follower

`counterpart` exige:

- Explicación ↔ Explicación;
- exactamente un rol por explicación;
- roles opuestos Leader/Follower;
- mismo conjunto de estilos;
- mismo conjunto de niveles;
- una única homóloga directa por explicación;
- almacenamiento simétrico en orden canónico.

La relación no copia ni fusiona asignaciones individuales.

### Secuencias

- `sequence_item + position` continúa siendo el modelo canónico;
- posición solo tiene semántica en `sequence_item`;
- índice único parcial por secuencia/posición;
- una Secuencia no puede contener otra Secuencia como paso;
- `reorder_teaching_sequence(bigint, bigint[])` reordena transaccionalmente el conjunto exacto de pasos en posiciones 10/20/30…;
- ciclos de `prerequisite` y `sequence_item` siguen bloqueados.

### Multimedia

Ninguna operación v51 crea `teaching_content_media` ni convierte archivos/vídeos de clase en nodos o relaciones. Multimedia continúa siendo un recurso asociado al contenido y conserva la frontera de P22 v50/v50b.

## 4. Dry-runs backend ✅

Todos terminaron en `ROLLBACK`.

Se verificó:

- columna/constraints/índice;
- guard de relaciones;
- RPC de pareja;
- RPC de reordenación;
- ACL de actividad de clase;
- homóloga Leader/Follower válida → aceptada;
- homóloga con estilo distinto → rechazada;
- pareja en Ejercicio → aceptada;
- pareja en Corrección → rechazada;
- Secuencia dentro de Secuencia → rechazada;
- reordenación → posiciones 10/20 correctas;
- relaciones sintéticas → **0 multimedia creada implícitamente**.

## 5. QA backend ✅

Head final backend:

`70e464f863b55dcdd1ed50c396e09500d9fd7873`.

Workflow P23 backend:

`31559092233` → **success**.

También quedaron verdes sobre ese head:

- P22 `31559092226`;
- P21 `31559092228`;
- tests P17–P23 incluidos en el gate;
- lint;
- build de producción;
- whitespace.

## 6. Frontend / UX P23 ✅

PR frontend **#29** → merge:

`f94eb1a6c154515f68659f29facf15903af227c8`.

### Editor de Enseñanza

- carga `requires_partner` desde el modelo real;
- toggle **Necesita pareja** solo en Ejercicios;
- biblioteca muestra el estado de pareja;
- servidor continúa siendo la autoridad final.

### Relaciones contextuales

El editor ya no ofrece destinos semánticamente imposibles:

- homólogas filtran Explicación Leader↔Follower del mismo estilo/nivel y sin homóloga previa;
- `exercise_explanation` solo ofrece Explicaciones;
- `exercise_correction` solo ofrece Correcciones;
- `sequence_item` no ofrece otra Secuencia.

### Secuencias táctiles

- cada paso recibe posición incremental;
- panel compacto de orden;
- controles subir/bajar táctiles;
- reordenación delegada a la RPC atómica v51;
- targets de 44 px o superiores, 46 px en móvil.

### Dar clase

Si un Ejercicio requiere pareja y la clase tiene menos de dos participantes:

- la UI muestra `Necesita pareja`;
- no intenta activarlo desde el flujo normal;
- el backend v51 sigue rechazando cualquier intento directo incompatible.

## 7. Ocho árboles sobre un único grafo ✅

`app/teaching-graph.tsx` conserva React Flow y deriva dinámicamente:

1. Bachata Leader
2. Bachata Follower
3. Salsa Leader
4. Salsa Follower
5. Zouk Leader
6. Zouk Follower
7. Bachazouk Leader
8. Bachazouk Follower

No son ocho bases ni ocho grafos persistidos: son ocho vistas/presets del mismo modelo canónico.

Se preservan:

- pan por arrastre;
- pinch zoom;
- zoom;
- centrar;
- reset;
- historial Anterior;
- búsqueda;
- filtros estilo / rol / nivel / tipo;
- minimapa;
- panel de detalle;
- responsive iPhone.

### Modo Ruta

Ruta recorre el componente pedagógico conectado mediante:

- prerequisitos;
- homólogas;
- ejercicio ↔ explicación;
- ejercicio ↔ corrección;
- pasos de secuencia.

`related` genérico se excluye de Ruta para no degradar su significado pedagógico.

Multimedia aparece solo dentro del detalle del contenido y nunca participa en la generación de nodos/aristas.

## 8. Regresión final frontend ✅

Head definitivo del PR #29:

`a8f9e17193f47d83f2e4c7320200ab5703f7b6c3`.

Workflow P23:

**`31559914700`** → success.

Pasaron:

- P23 teaching regression gate;
- P22 Portal;
- P21 Dar clase;
- P20 formularios;
- P19 persona;
- P18 identidad;
- P17 evaluaciones;
- transición fiable de clase;
- resumen/cierre de clase;
- lint completo;
- production build;
- whitespace.

Durante la primera ronda se detectó un test P22 que exigía literalmente el marcador P22. No era una regresión funcional: impedía que paquetes posteriores avanzaran el release. Se corrigió para exigir marcador explícito `p…-ready` + `no-store`, preservando el gate sin congelar el identificador.

## 9. G1 Hostinger ✅

Marcador P23:

`p23-teaching-graph-v51-ready`

Verificador externo GitHub:

- run **`31560051530`**;
- job `94000346844`;
- attempts 1–3: producción aún devolvía `p22-student-portal-v50-ready`;
- attempt 4: producción devolvió exactamente `p23-teaching-graph-v51-ready`;
- resultado: **success**.

Por tanto, el frontend P23 está demostrado en producción.

## 10. Autoridad y seguridad post-runtime ✅

Con identidad real de alumno puro:

- `private.is_staff()` → false;
- intento de `set_teaching_exercise_partner_requirement` → `42501`;
- intento de `reorder_teaching_sequence` → `42501`;
- prueba terminada en rollback.

Estado productivo:

- partner constraint presente;
- position constraint presente;
- índice de posición presente;
- `authenticated` puede ejecutar las RPC nuevas, sujetas a guard `private.is_staff()`;
- `anon` no puede ejecutarlas.

## 11. Advisors ✅ sin blocker P23

No aparece un hallazgo nuevo atribuible a P23 que exija rollback.

Permanecen deudas globales ya asignadas a P32:

- Leaked Password Protection desactivado;
- RPC históricas `SECURITY DEFINER` a reauditar;
- `pg_net` en `public`;
- tablas RLS técnicas sin policy cuando son deliberadamente inaccesibles al cliente;
- FKs sin índice;
- policies permisivas múltiples;
- índices reportados como no usados.

`teaching_content_relations_sequence_position_uidx` aparece actualmente como no usado porque producción todavía tiene **0 relaciones**. **No debe eliminarse**: además de rendimiento futuro, aplica una regla de integridad de v51.

El ledger también contiene migraciones posteriores de otro flujo (`v51_post_class_review_tasks`, `v52_remove_post_class_second_evaluation`). Se preservan; P23 no las reescribe ni revierte.

## 12. Cierre

**P23 queda CERRADO.**

Evidencia de cierre:

- modelo real auditado con G8;
- v51 aplicada y verificada;
- contrato de pareja/homólogas/secuencias/ciclos activo;
- frontend de Enseñanza integrado;
- ocho árboles derivados de un único grafo;
- modo Ruta activo;
- interacción táctil preservada y ampliada;
- multimedia fuera del grafo automático;
- regresión P17–P23 completa verde;
- Hostinger sirve marcador P23;
- autoridad de servidor verificada;
- sin blocker nuevo de Advisors.

Siguiente paquete operativo: **P24 — Inicio contextual**.
