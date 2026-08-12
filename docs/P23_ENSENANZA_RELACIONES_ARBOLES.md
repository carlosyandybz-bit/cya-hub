# P23 — Enseñanza + relaciones + árboles

Estado: **EN EJECUCIÓN — contrato backend v51 validado en dry-run**  
Fecha de corte: 2026-08-12  
Base: P22 cerrado / v50 + v50b  
Paquete: F16–F20  
Migración prevista: `v51_p23_teaching_graph_contract`

## 1. Verdad del esquema real

P23 se ha auditado contra producción, no contra el SQL histórico.

Modelo canónico real:

- `teaching_contents` — cuatro tipos: correction / explanation / exercise / sequence;
- taxonomías N:M de estilos, roles y niveles;
- `teaching_content_tags`;
- `teaching_content_media`;
- `teaching_content_relations`;
- `student_content_assignments`.

**No existe `teaching_sequence_items` en producción.** Las secuencias se representan correctamente en el grafo canónico mediante:

`teaching_content_relations(relation_type='sequence_item', position)`.

P23 no crea una segunda tabla paralela.

## 2. Estado de datos al iniciar P23

- relaciones pedagógicas existentes: **0**;
- secuencias relacionadas existentes: **0**;
- campos de pareja en el dominio enseñanza: **0**;
- categorías activas: correction/explanation/exercise/sequence `General`;
- estilos activos: Bachata / Salsa / Zouk / Bachazouk;
- roles activos: Leader / Follower;
- niveles activos: Inicio / Intermedio / Avanzado.

La ausencia de relaciones permite endurecer el contrato sin migrar relaciones históricas ambiguas.

## 3. Frontend de mapa ya existente y preservado

`app/teaching-graph.tsx` ya usa React Flow y dispone de:

- pan por arrastre;
- pinch zoom;
- zoom de rueda;
- centrar / fit view;
- reset;
- historial “Anterior”;
- búsqueda;
- filtros estilo / rol / nivel / tipo;
- minimapa en pantallas grandes;
- panel de detalle;
- responsive específico para móvil/iPhone.

P23 no reemplaza esta base. Debe completarla con accesos explícitos a los ocho árboles estilo×rol, ruta conectada y semántica pedagógica real.

## 4. Gaps reales detectados

### 4.1 Necesita pareja

No existe ninguna columna de pareja/partner en las tablas de Enseñanza.

v51 añade `teaching_contents.requires_partner boolean default false` con constraint:

- solo puede ser `true` si `content_type='exercise'`.

RPC dedicada:

`set_teaching_exercise_partner_requirement(content_id, requires_partner)`.

El flujo de clase también rechazará `exercise_active` / `exercise_completed` si el ejercicio requiere pareja y la clase tiene menos de dos participantes.

### 4.2 Homólogas Leader/Follower

El guard actual solo exige Explicación ↔ Explicación.

v51 exige además:

- exactamente un rol por cada explicación;
- roles opuestos Leader/Follower;
- mismos estilos;
- mismos niveles;
- una única homóloga directa por explicación;
- relación simétrica en orden canónico.

Las asignaciones siguen siendo individuales. La relación homóloga no copia ni fusiona asignaciones personales.

### 4.3 Secuencias

El modelo actual ya usa `sequence_item + position`, pero faltan garantías:

- posición única dentro de la secuencia;
- impedir Secuencia dentro de Secuencia;
- reordenación atómica.

v51 añade índice parcial único y RPC `reorder_teaching_sequence(sequence_id, item_ids[])`.

La RPC solo acepta exactamente el conjunto actual de pasos, los bloquea y reordena de forma transaccional en posiciones 10/20/30…

### 4.4 Ciclos

Se mantiene y refuerza el rechazo de ciclos para:

- `prerequisite`;
- `sequence_item`.

### 4.5 Multimedia

`teaching_content_media` sigue separado del grafo. Ninguna operación v51 crea o convierte media en `teaching_contents` ni en relaciones.

La autorización de Drive cerrada en P22 v50/v50b se preserva.

## 5. Dry-runs v51

Todos terminados en `ROLLBACK`.

### Estructura

Verificado:

- columna `requires_partner`;
- constraint solo-Ejercicios;
- constraint `position` solo para `sequence_item`;
- índice único de posición.

### RPCs/guard

Verificado:

- `private.guard_teaching_content_relation` compila;
- `set_teaching_exercise_partner_requirement` compila;
- `reorder_teaching_sequence` compila;
- ACL de `record_class_content_event` preservada para authenticated y bloqueada a anon.

### Semántica con datos sintéticos

Con identidad staff real y rollback completo:

- homóloga Leader/Follower mismo estilo/nivel → aceptada;
- homóloga con contexto de estilo distinto → rechazada;
- `requires_partner=true` en Ejercicio → aceptado;
- `requires_partner=true` en Corrección → rechazado;
- dos pasos de Secuencia → creados;
- Secuencia como paso de otra Secuencia → rechazada;
- reordenación atómica → posiciones 10/20 en el orden pedido;
- relaciones sintéticas → **0 media creada implícitamente**.

## 6. Siguiente bloque P23

Tras validar y aplicar v51 aditiva:

- integrar `requires_partner` en editor/biblioteca/Dar clase;
- editor de relaciones contextual en vez de lista genérica;
- ordenar pasos de Secuencia con controles táctiles;
- ocho presets: 4 estilos × 2 roles;
- modo Ruta del grafo;
- mantener filtros de nivel/tipo/búsqueda;
- QA iPhone + desktop;
- RLS y Advisors;
- regresión P17–P22;
- marcador de runtime P23 antes del cierre.

P23 no se considera cerrado hasta completar frontend, runtime y post-cutover.
