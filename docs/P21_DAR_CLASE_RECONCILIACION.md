# P21 — DAR CLASE definitivo · reconciliación

Estado: **P21 ACTIVO — auditoría inicial cerrada, implementación en curso**  
Fecha de corte: 2026-08-12  
Base: `main@afc51ab5d823ecd34af154215c0d28a34d24dc83`  
Paquete anterior: **P20 cerrado**

## 1. Objetivo

P21 no reconstruye Dar clase desde cero. Consolida la implementación real, elimina duplicaciones y código heredado, revalida los correctivos adelantados y deja un único flujo rápido y coherente para clase individual y de pareja.

Reglas permanentes:

- nunca calcular duración/cobro por tiempo transcurrido;
- no fase ni temporizador obligatorio de 3 minutos;
- una clase abierta no bloquea otra;
- datos conocidos se reutilizan;
- provisional se crea dentro de Dar clase;
- evaluación principal = modelo guiado de P17;
- vídeos de clase no crean nodos/relaciones pedagógicas automáticamente.

## 2. Matriz real de auditoría

| Regla | Estado actual | Acción P21 |
|---|---|---|
| Centro de clases permite varias abiertas | EXISTE | preservar + regresión |
| Inicio de clase no depende de Marketing | EXISTE (correctivo PR #13) | revalidar |
| `start_class` no comprueba otra clase activa | EXISTE backend | preservar |
| Provisional in-flow | EXISTE P19 | revalidar individual/pareja |
| Fecha/duración/estilo/rol/nivel precargados | PARCIAL | simplificar confirmación para no volver a preguntar lo conocido |
| Duración manual en cierre | EXISTE | preservar G3 |
| Bono de pareja único | EXISTE | revalidar |
| Transferencia individual → pareja por minutos | EXISTE | revalidar y rollback |
| Regularización exacta | EXISTE v30/v30b | revalidar |
| Pago parcial | EXISTE | revalidar |
| Varios vídeos por clase | EXISTE | revalidar pareja/Ambos |
| Buscador 4 tipos | EXISTE | completar categoría/relaciones y ranking contractual |
| Crear rápido hereda contexto | EXISTE | preservar |
| Contexto previo/última clase | EXISTE | compactar sin duplicar datos |
| Correcciones activas | EXISTE | eliminar controles duplicados dentro de tarjeta |
| Explicaciones/secuencias | EXISTE | preservar |
| Ejercicios | EXISTE: usa el último evento por contenido | preservar + regresión |
| Evaluación numérica antigua en Dar clase | CÓDIGO HEREDADO OCULTO | eliminar físicamente en P21.2 |
| Evaluación guiada P17 | EXISTE fuera del tab legado | preservar |
| Resumen pedagógico editable | EXISTE PR #12 / v45 | revalidar |
| Añadir contenido olvidado postadministrativo | EXISTE v45 | revalidar |
| Cierre pedagógico | EXISTE | preservar gate de evaluación |
| Reapertura administrativa | EXISTE | revalidar devolución/artefactos/auditoría |
| `workflow_stage` coherente | PARCIAL: hay históricos `finished/live` y `finished/data` | normalizar futuro + backfill seguro |

## 3. Hallazgos concretos del frontend actual

### 3.1 Evaluación heredada

`app/cya-app.tsx` todavía contiene un tab `Evaluar` con radar y guardado numérico. P17 lo retiró de la experiencia visible mediante CSS, pero el JSX y estado siguen vivos. P21 debe eliminarlo físicamente para evitar dos motores de evaluación.

### 3.2 Correcciones duplicadas

Cada tarjeta de Corrección monta controles rápidos de estado/frecuencia/importancia y vuelve a montar los mismos controles dentro del detalle. P21 conservará un único control compacto, expandible solo para explicación/guía/media.

### 3.3 Ejercicios por eventos

Los ejercicios se modelan con eventos de clase. La UI debe representar **el último estado por `content_id`**, no una fila por cada transición histórica (`pending → active → completed`). El histórico permanece en DB.

### 3.4 Setup

El backend y frontend ya precargan datos de la clase y `student_dance_profiles`. P21 debe convertir el setup en confirmación progresiva: mostrar lo conocido como resumen editable y destacar solo lo que falta.

## 4. Hallazgos del backend real

- `start_class(p_class_id)` valida staff, clase, estilo, rol y nivel; no comprueba ni bloquea otras clases activas.
- `administratively_finish_class_v6` usa `p_duration_minutes`; no deriva duración desde `started_at`.
- `transfer_individual_credit_to_pair` acepta minutos elegidos y crea un único bono pair compartido.
- `reopen_administratively_finished_class` devuelve consumos, revierte transferencias/artefactos, elimina cuentas/items del cierre y audita.
- `search_class_teaching_content` ya busca título/descripción/guía/tags pero aún no categoría/relaciones y su ranking no refleja completamente el contrato P21.
- `close_class_pedagogy_v2` requiere cierre administrativo y publica al alumno solo contenido releasable.

## 5. P21.1 — v49 compatible

`v49_p21_class_workflow_search.sql` será compatible con el frontend actual:

1. amplía el buscador sin cambiar firma ni shape;
2. busca también categoría y relaciones;
3. ordena: corrección pendiente asignada → otro contenido asignado → contenido relacionado con lo activo → biblioteca lista → incompletos;
4. instala un trigger de consistencia de `workflow_stage` solo para estados operativos inequívocos;
5. normaliza históricos `active`, `finished+administrative` y `pedagogy_closed`, sin tocar clases `scheduled` en `data/prepare`.

## 6. Subfases restantes de P21

- **P21.1** reconciliación + buscador/workflow compatible.
- **P21.2** limpieza física del LiveSession: quitar evaluación antigua, duplicados y deduplicar ejercicios.
- **P21.3** setup progresivo G7 + UX iPhone.
- **P21.4** revalidación cierre administrativo, pagos, bonos, vídeos y reapertura.
- **P21.5** QA integral P21 + Hostinger + cierre documental.

## 7. Gate de cierre

No cerrar P21 hasta probar: individual, pareja, programada, manual, provisional in-flow, dos clases abiertas, buscador 4 tipos, correcciones/explicaciones/ejercicios/secuencias, evaluación guiada, cierre financiero con variantes, resumen editable, cierre pedagógico, reapertura, iPhone y desktop.


## 8. P21.2 — limpieza física iniciada

- se retira el tab numérico `Evaluar` de `LiveSession`;
- se conserva exclusivamente el flujo guiado de P17;
- se elimina el refresco global cada 15 s: Realtime queda como vía principal y `loadLive()` como fallback discreto;
- se elimina el segundo juego duplicado de controles de Correcciones;
- se corrigen efectos React detectados por el lint sin desactivar reglas.


## 9. P21.3 — setup progresivo real G7

- fecha, duración y estilo conocidos se muestran compactos y no como preguntas obligatorias;
- rol y nivel solo muestran selector si falta alguno, salvo que el profesor pulse `Editar datos`;
- el bono previsto sigue siendo opcional y puede decidirse al terminar;
- la creación manual explica que CYA reutilizará el contexto canónico ya conocido;
- `Editar datos` permite cambiar voluntariamente cualquier valor heredado.

## 10. P21.4 — protección de reapertura G6

- la reapertura conserva la RPC transaccional existente;
- antes de ejecutarla exige dos confirmaciones;
- ambas incluyen fecha/alumnado de la clase para evitar confirmar la clase equivocada;
- la segunda advierte explícitamente que se revierten los movimientos financieros del cierre.
