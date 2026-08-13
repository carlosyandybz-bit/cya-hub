# CYA HUB — PLAN MAESTRO ÚNICO DE CIERRE

Versión: **4.4**
Fecha de corte: **2026-08-13**
Repositorio canónico: `carlosyandybz-bit/cya-hub`  
Producción: `main` + Supabase `CyA hub 2` + Hostinger  
Dominio CYA Hub: `app.carlosyandy.com`  
Última actualización secuencial cerrada: **P25 / v60–v62**
Siguiente actualización funcional: **P26 — Agenda + Google Calendar — pendiente de aprobación**

Correctivos adelantados que deben preservarse y revalidarse en su punto original: **F42/P32 v44–v44e**. Los adelantos de Dar clase (`v45`, transición fiable de inicio y alta rápida provisional) quedaron revalidados y absorbidos definitivamente por P21. El portal del alumno y su frontera multimedia quedaron absorbidos por P22. Enseñanza, relaciones y árboles quedaron cerrados por P23/v51.

Correctivos de auditoría P0 ya integrados o canonizados en esta versión:

- **P0A ✅** — Centro de clases y modo clase activo separados; navegación móvil corregida y protegida por E2E.
- **P0B ✅** — el documento permanece protegido por un check automático; la transición canónica vigente se actualiza deliberadamente a P25 cerrado → P26 siguiente.
- **P0C ✅** — targets táctiles auditados ≥44 px; gate `mobile-touch-targets` permanente; QA post-merge 26/26.
- **P0D ✅** — `release-wide-audit` integrado como gate permanente; QA actual post-P0C verde 26/26.
- **P0E ✅** — evaluación contextual opcional, baseline derivada de la primera evaluación completa válida y gates globales eliminados; v53 + PR #36 integrados y recertificados 26/26.

---

# 0. Regla de continuidad

Este documento es la **única hoja operativa de cierre** de CYA Hub.

Se separan permanentemente dos numeraciones:

- **F1–F46** = auditoría funcional histórica: requisitos, errores y módulos del producto.
- **P12–P32** = secuencia técnica actual de ejecución: paquetes que absorben y cierran los F correspondientes.

`P16` no significa `F16`. Esta separación es permanente.

Antes de iniciar cada paquete debe comunicarse:

1. **CERRADO** — qué paquetes están finalizados;
2. **AHORA** — qué P está activo;
3. **FALTA DESPUÉS** — secuencia restante completa;
4. **GATES/RIESGOS** — qué condiciones pueden impedir el cierre.

Cuando aparezca una incidencia nueva:

- se asigna al P/F correcto;
- si el área ya pasó, se registra como correctivo;
- un hotfix no altera arbitrariamente la secuencia;
- los adelantos se revalidan al llegar a su P original;
- no se reconstruye lo que ya funciona solo por cambiar de paquete.

Regla documental permanente desde P0B:

- un documento de cierre formal (`Pxx_*.md`) no puede coexistir con este Plan Maestro declarando ese mismo paquete como pendiente/actual;
- la transición canónica actual es **P25 cerrado → P26 siguiente / pendiente de aprobación**;
- `tests/documentation-consistency.test.mjs` debe fallar si una rama vuelve a declarar P25 como pendiente/actual o rompe la transición P25 cerrado → P26 siguiente;
- cualquier avance posterior a P25 se actualizará explícitamente en el cierre del paquete correspondiente y en este test. Nunca se avanza o retrocede por un merge accidental.

---

# 1. Estado ejecutivo

## ✅ Cerrado secuencialmente

- P12 — modelo base de evaluación.
- P13 — radar.
- P14 — histórico.
- P15 — resumen real de progreso.
- P16 — RLS alumnado/clases, v42.
- P17 — evaluaciones definitivas y cutover v43.
- P18 — identidad, multirol, navegación y `Ver como`, v46.
- P19 — persona única + identidades + lifecycle derivado, v47.
- P20 — formularios versionados + datos canónicos, v48 + v48b.
- P21 — DAR CLASE definitivo, v49.
- P22 — Portal del alumno, v50 + v50b.
- **P23 — Enseñanza + relaciones + árboles, v51.**
- **P24 — Inicio contextual, v58 + v59; PR #41 + correctivo OIDC PR #42; QA final 36/36.**
- **P25 — Misiones + worker, v60 + v61 + v62; PR #44; QA final 38/38.**

## ✅ Correctivos/adelantos ya absorbidos

- Resumen pedagógico editable y corrección RLS enseñanza: v45 → revalidado P21 y P23.
- Inicio de clase desacoplado de Marketing y protegido contra `Abriendo…` infinito → revalidado P21.
- Creación/reutilización de provisional dentro de Dar clase → revalidado P21.
- Evaluación numérica antigua retirada físicamente de Dar clase → P21.
- Setup progresivo G7 → P21.
- Reapertura administrativa con doble confirmación G6 → P21.
- Perfil canónico del alumno reutiliza P20 → P22.
- Evolución del alumno separada por estilo/rol/nivel → P22.
- Multimedia de portal alineada con publicación/propiedad → P22 v50/v50b.
- Modelo canónico de Correcciones/Explicaciones/Ejercicios/Secuencias + relaciones + ocho árboles → P23/v51.
- Navegación móvil del Centro `Dar clase` → P0A sobre P21.
- Auditoría transversal release-wide → P0D.
- Targets táctiles auditados ≥44 px + gate móvil → P0C.
- Evaluación contextual opcional, baseline derivada y revisión post-clase acotada a su clase → P0E/v53 cerrado y recertificado en `main`.

## ✅ Adelanto pendiente de revalidación final

- Administración → Datos → borrado/reinicio seguro: v44–v44e → reauditar P32.

## 🟣 SIGUIENTE PROPUESTA — PENDIENTE DE APROBACIÓN

### P26 — Agenda + Google Calendar

P26 todavía NO se ha iniciado. Debe cerrar la conexión y sincronización real con Google Calendar, external IDs, errores, conflictos e idempotencia sin destruir participantes, saldos, estado pedagógico ni historial. La propuesta completa se presenta a Carlos antes de modificar código, Supabase o calendarios reales.

## ⏳ FALTA DESPUÉS

**P26 → P27 → P28 → P29 → P30 → P31 → P32.**

---

# 2. Gates permanentes G1–G8

## G1 — Evidencia de runtime Hostinger

No basta con que un commit esté en `main`. Antes de un backend incompatible se demuestra qué frontend sirve producción.

Evidencias obtenidas:

- P17: Hostinger mostró el commit de evaluación como Actual/completado antes de v43.
- P20: `/api/build-info` devolvió `p20-form-runtime-v48-ready` antes de v48.
- P21: Hostinger mostró `app.carlosyandy.com` como **Actual / Se ha completado** sobre `main@8f8673c7`; ese commit es no-op respecto al árbol funcional P21 `c9341750` y fue el redeploy forzado previo a v49.
- P22: runner externo GitHub `31557437770` consultó producción y obtuvo en el primer intento `p22-student-portal-v50-ready` antes de aplicar v50.
- P23: G1 Hostinger run `31560051530` verificó `p23-teaching-graph-v51-ready`.

Regla permanente: **frontend compatible primero; cutover backend después**.

## G2 — Seguridad de autenticación

Pendiente conocido para P32:

- Supabase Leaked Password Protection está desactivado.

Debe resolverse antes del lanzamiento final.

## G3 — iPhone + densidad + inputs

El iPhone es referencia principal.

Todo formulario/control nuevo o modificado debe cumplir:

- safe areas;
- targets táctiles cómodos;
- scroll estable;
- nada cortado por teclado/barra inferior;
- `inputMode=numeric` o `decimal` cuando corresponda;
- un campo vacío puede seguir vacío;
- nunca forzar `0` durante edición;
- escribir `5` produce `5`, nunca `05`/`050`.

P0C cerró el correctivo táctil: los targets auditados tienen un área efectiva mínima de 44 px y `mobile-touch-targets.spec.ts` lo protege en iPhone. P0E preservó este gate: la recertificación post-merge mantiene `touchTargetsUnder44=0`.

## G4 — Regresión antes de merge

Cada P debe probar las reglas que modifica. Un build verde no sustituye QA funcional.

Desde P0B, la regresión incluye también consistencia documental canónica. El workflow `CYA QA E2E` ejecuta `tests/documentation-consistency.test.mjs` antes del bootstrap de QA. Una rama que vuelva a P25 como pendiente/actual o rompa la transición P25 cerrado → P26 siguiente debe quedar roja.

## G5 — Integridad de datos y multimedia

- no resetear Supabase por conveniencia;
- migraciones incrementales;
- esquema real antes de asumir historial;
- vídeos y binarios pesados fuera de PostgreSQL/GitHub/WordPress;
- Drive/almacenamiento externo conserva archivo;
- CYA conserva IDs, permisos, metadata y relaciones.

## G6 — Acciones destructivas

- archivar/deshacer cuando sea razonable;
- eliminación definitiva solo cuando corresponda;
- doble confirmación contextual;
- segunda confirmación identifica exactamente lo que se elimina.

El reset masivo es excepción deliberada: exige backup reciente, preview, frase exacta, segunda confirmación, transacción y auditoría.

## G7 — Fuente única de verdad / no preguntar dos veces

Jerarquía operativa:

`override de clase → preferencia estilo/rol → valor global → preguntar solo si falta`.

P19 fijó persona canónica. P20 fijó formularios canónicos. P21 aplicó G7 al setup de clase. P22 reutilizó P20 para el perfil del alumno. P23 mantuvo un único grafo pedagógico canónico. Los P siguientes deben conservar esa jerarquía.

## G8 — Esquema real > historial supuesto

Antes de una migración sensible se comparan:

1. ledger de migraciones;
2. funciones/triggers/policies reales;
3. código de `main`;
4. datos reales.

La verdad final es el runtime/esquema real.

---

# 3. Reglas maestras que no pueden volver a romperse

1. **Dar clase no usa tiempo transcurrido para calcular duración o cobro.**
2. **No existe fase obligatoria ni temporizador de 3 minutos.**
3. **CYA reutiliza datos ya conocidos.**
4. **Una clase abierta no bloquea iniciar otra.**
5. **Un bono de pareja es un único bono compartido.**
6. **Vídeos de clase no entran en árboles por el mero hecho de asociarse a contenido.**
7. **Provisionales son operativos desde el lado del profesor.**
8. **Evaluaciones usan el modelo guiado aprobado, no el formulario numérico antiguo.**
9. **Las estadísticas se definen con el usuario antes de implementarse.**
10. **Eliminar información relevante aplica G6.**
11. **Backend incompatible solo tras demostrar frontend productivo.**
12. **Supabase se valida por esquema real, no solo por nombres de migración.**
13. **Reset masivo exige backup reciente + impacto + frase exacta + segunda confirmación.**
14. **Reset no elimina Auth, roles, migraciones ni configuración técnica imprescindible.**
15. **Una identidad humana = una persona canónica.**
16. **Potencial / Provisional / Registrado se deriva de datos reales.**
17. **`Realizar en pareja / Necesita pareja` existe solo para Ejercicios.**
18. **Crear provisional desde Dar clase no abandona el flujo.**
19. **El portal del alumno nunca expone borradores, incompletos internos ni datos de otras personas.**
20. **Una relación pedagógica no convierte automáticamente multimedia de clase en contenido del árbol.**
21. **El Centro `Dar clase` conserva navegación móvil; el chrome solo se oculta con clase realmente activa (`status=active` + `workflow_stage=live`).**
22. **Un cierre formal de paquete no puede retroceder documentalmente por un merge posterior.**
23. **La baseline evaluativa es la primera evaluación completa y válida del contexto; ninguna evaluación general bloquea el trabajo de clase.**

---

# 4. Evidencia de P17–P24 cerrados

## P17 — Evaluaciones ✅

- motor guiado por sesiones y escala 0/25/50/75/100 conservados;
- wrappers antiguos retirados de `authenticated`;
- P0E/v53 elimina la evaluación inicial obligatoria y los gates globales;
- `ContextEvaluationPanel` permite evaluar desde Dar clase y perfil sin abandonar el trabajo principal;
- baseline = primera evaluación completa y válida por persona + estilo + rol, sin depender de `evaluation_kind`;
- una revisión `class` puede ser la primera evaluación y convertirse en baseline;
- solo la revisión `class` de la clase concreta puede condicionar su cierre pedagógico;
- v43 ledger `20260811151901` + v53 P0E;
- PR #36 → merge `a1697c4d573e381064e0d3dc5084a77202cb6634`;
- QA post-merge `31610773094`: **26/26**.

## P18 — Identidad/roles/navegación ✅

- una persona puede ser admin + teacher + student según permisos reales;
- `set_experience_context` valida servidor y no eleva roles;
- `Ver como` solo ofrece contextos autorizados;
- navegación móvil definitiva: `Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing`;
- sin hamburguesa para funciones clave;
- historial atrás real;
- v46 ledger `20260811183128`.

## P19 — Persona única ✅

- `people` es persona canónica;
- CRM, alumnado, Auth y operaciones comparten `person_id`;
- coincidencia inequívoca reutiliza persona y la ambigua se bloquea;
- Potencial/Provisional/Registrado es lifecycle derivado;
- provisional puede crearse desde Dar clase y quedar seleccionado;
- v47 ledger `20260811192818`.

## P20 — Formularios versionados + datos canónicos ✅

- reutiliza `form_definitions`, `form_versions`, `form_fields`, `form_submissions`;
- runtime genérico para `onboarding`, `student_personal`, `student_dance`;
- 15 formularios de servicio de dominio quedan `inactive` y no se simulan como JSON;
- canonicalidad sobre `people` y `student_profiles` con allowlist;
- publicado = inmutable; cambios mediante nueva versión draft;
- constructor administrativo real;
- guards internos y escritura directa restringida;
- P20 13/13 + lint + build;
- v48 ledger `20260811213826`;
- v48b índice `form_versions_published_by_idx`, ledger `20260811214312`.

Contrato: `docs/P20_FORMULARIOS_VERSIONADOS_DATOS_CANONICOS.md`.

## P21 — DAR CLASE definitivo ✅

### Frontend/UX

- flujo de clase consolidado;
- evaluación numérica heredada eliminada físicamente;
- evaluación guiada P17 preservada;
- setup progresivo G7;
- correcciones sin controles duplicados;
- ejercicios muestran último estado operativo por contenido;
- Realtime como vía principal sin polling global disruptivo;
- reapertura administrativa con doble confirmación contextual G6;
- duración/cobro siguen basados en minutos operativos, nunca en tiempo transcurrido.

### Buscador y workflow

- v49 amplía `search_class_teaching_content` a título, descripción, guía, tags, categoría y relaciones;
- conserva firma y shape público;
- ranking contractual por contenido activo/asignado/relacionado/listo;
- `trg_sync_class_workflow_stage_p21` mantiene estados futuros;
- backfill solo sobre estados inequívocos.

### QA/cutover

- workflow `Validate P21 Dar clase`, run `31554904287`: regresión P21 + lint + build + whitespace **success**;
- commit funcional: `c9341750ff337c6deb24345e04e975c88f4f3bfb`;
- redeploy Hostinger no-op: `8f8673c7a67bb7ac3adb7bb7bd28cb730f8e8fa3`;
- v49 ledger **`20260812020727`**;
- post-cutover: **0 incoherencias closed / administrative / live**;
- acceso no autenticado al buscador rechazado `42501`.

Contrato: `docs/P21_DAR_CLASE_RECONCILIACION.md`.

Correctivo P0A posterior a P21:

- PR #32 → merge `85e1d7954cd67190735a118d682c002ddfc2569a`;
- `mobile-nav` ya no depende de `view === 'live'`, sino de clase seleccionada realmente `active/live`;
- Centro de clases y preparación conservan `Inicio | Alumnado | Dar clase | Enseñanza | Marketing`;
- clase activa oculta el chrome móvil y cierre/retorno lo restaura;
- QA post-merge `31583225189`: **22/22**.

## P22 — Portal del alumno ✅ CERRADO

### Frontend/UX

- portal existente consolidado; no hay segunda aplicación de alumno;
- próxima clase, historial completo, bonos/saldo, formación, multimedia, evolución y perfil;
- perfil del alumno reutiliza `RuntimeForm` P20 `student_personal`;
- email permanece no escribible por alumno y `teacher_notes` no se expone;
- evolución agrupada por último estilo + rol + nivel;
- clases anteriores accesibles sin perder densidad inicial;
- `explained` deja de contarse como formación activa.

### Seguridad/RLS

- `student_portal_snapshot_for(otra_persona)` → `42501`;
- acceso cruzado a notas/vídeos/documentación/evaluaciones/asignaciones → **0**;
- multimedia solo para asignación liberada o recurso de clase propio pedagógicamente cerrado;
- sin SELECT directo de alumnado sobre `teaching_content_media`.

### QA/cutover

- PR #26 → merge `10940bffe61c29b93967be86921ce4000ee50621`;
- workflow P22 `31557290394` → tests + lint + build + whitespace **success**;
- G1 → `p22-student-portal-v50-ready` verificado por runner `31557437770`;
- v50 ledger **`20260812023916`**;
- post-cutover: snapshot propio con evaluaciones contextuales y RLS cruzada intacta;
- Advisor detectó un único warning nuevo en el wrapper público de media y se corrigió dentro de P22;
- PR #27 v50b → merge `2378b0b6a025fcf0e694584d4b15e4acf2abf5f4`;
- v50b ledger **`20260812024534`**;
- wrapper final `public.can_access_teaching_media` = `SECURITY INVOKER`;
- Security Advisor ya no muestra ese warning;
- smoke final v50b → success.

Contrato: `docs/P22_PORTAL_ALUMNO_RECONCILIACION.md`.

## P23 — Enseñanza + relaciones + árboles ✅ CERRADO

- v51 ledger `20260812031009`;
- backend PR #28 → `4e95cdb5ee909391b51c33abea6d1c5baa7d41ce`;
- frontend PR #29 → `f94eb1a6c154515f68659f29facf15903af227c8`;
- head final QA `a8f9e17193f47d83f2e4c7320200ab5703f7b6c3`;
- workflow P23 `31559914700` y regresión P17–P23 completas en success;
- G1 Hostinger run `31560051530` → `p23-teaching-graph-v51-ready`;
- ocho árboles derivados de un único grafo canónico;
- Ruta, pan/zoom/centrar/reset/atrás y filtros táctiles activos;
- `Necesita pareja` solo para Ejercicios y autoridad servidor verificada;
- homólogas Leader/Follower y Secuencias protegidas por v51;
- multimedia permanece fuera de la generación automática del grafo;
- sin blocker nuevo de Advisors atribuible a P23.

Contrato: `docs/P23_ENSENANZA_RELACIONES_ARBOLES.md`.

## P24 — Inicio contextual ✅ CERRADO

- v58 ledger `20260812214733` + v59 ledger `20260812214904`;
- prioridad canónica: clase activa → clase ≤30 min → misión;
- reloj vivo, saludo Madrid y transición exacta 31→30 minutos sin recarga;
- frase diaria persistida por usuario+fecha con snapshot inmutable y rotación segura sobre las 15 frases existentes;
- Administración > General incorpora gestión de frases, fecha/recurrencia, preview y CSV con conflictos;
- `home_snapshot()` y `preview_daily_quote(date)` son SECURITY INVOKER; anon sin EXECUTE;
- PR #41 funcional + PR #42 hardening OIDC para repositorio público;
- `cya-qa-bootstrap` v6 ACTIVE y restringido a propietario o dispatch interno exacto de main;
- certificación final `main@50fda0cdbc554f33ae5b5ce0a0d6c6977e66f06f`: gate P24 `31652164663` PASS y Browser QA `31652169267` = 36/36;
- artifact final `9163051155`;
- producción/Hostinger G1 continúa como gate independiente P32.

Contrato: `docs/P24_INICIO_CONTEXTUAL.md`.

---

# 5. P22 — Portal del alumno ✅ CERRADO

P22 queda cerrado por la evidencia del apartado 4. No volver a modificarlo salvo correctivo demostrado.

---

# 6. P23 — Enseñanza + relaciones + árboles ✅ CERRADO

Absorbe F16–F20.

Contenidos:

- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- categorías/etiquetas;
- relaciones;
- multimedia externa.

Reglas:

- `Realizar en pareja / Necesita pareja` solo para Ejercicios;
- explicación Leader/Follower homóloga sin mezclar asignaciones individuales;
- contenido reutilizable en diferentes rutas;
- vídeo asociado no entra automáticamente en grafo;
- incompletos/borradores siguen siendo internos;
- relaciones del grafo y asignaciones a personas son dominios distintos.

Ocho árboles conceptuales:

1. Bachata Leader
2. Bachata Follower
3. Salsa Leader
4. Salsa Follower
5. Zouk Leader
6. Zouk Follower
7. Bachazouk Leader
8. Bachazouk Follower

UX móvil:

- pan;
- zoom;
- centrar;
- ruta;
- volver/reset;
- filtros estilo/rol/nivel/tipo;
- búsqueda;
- interacción táctil fluida en iPhone.

Cierre P23:

- CRUD de cuatro tipos sin campos impropios cubierto;
- categorías/etiquetas y relaciones coherentes;
- homólogas Leader/Follower verificadas;
- ejercicios en pareja solo en Ejercicios;
- secuencias representadas mediante `teaching_content_relations(relation_type='sequence_item', position)`;
- media Drive autorizada sin crear nodos automáticos;
- ocho árboles derivados del mismo grafo canónico, no ocho bases paralelas;
- RLS profesor/alumno verificada;
- iPhone + desktop;
- regresión P17–P23 verde;
- v51 ledger `20260812031009` y G1 de producción documentado.

No volver a abrir P23 salvo correctivo demostrado.

---

# 7. P24 — Inicio contextual ✅ CERRADO

P24 queda cerrado por la evidencia del apartado 4 y el contrato `docs/P24_INICIO_CONTEXTUAL.md`. No volver a abrirlo salvo correctivo demostrado.

Inicio responde a «qué toca hacer ahora» con reloj vivo, saludo contextual, frase diaria persistida, una única acción dominante, resumen del día y accesos rápidos. Una clase realmente activa domina siempre; una clase programada domina desde 30 minutos o menos; a 31 minutos no desplaza una misión. P25 conserva la responsabilidad exclusiva sobre la semántica del motor de Misiones.

---

# 8. P25 — Misiones + worker ✅ CERRADO

Absorbe F32–F33 y cierra CYA-AUD-003.

- estado terminal `expired` + `expired_at`;
- `mark_not_done` → `not_done`; `expire` → `expired`; `repeat` → histórico `expired` + una única siguiente ocurrencia `upcoming`;
- posponer funciona como snooze y no reescribe `due_at`;
- `expired` es histórico terminal y no puede reactivarse mediante `act_on_mission`;
- zona horaria operativa configurable, actualmente `Europe/Madrid`;
- motor server-side idempotente y Supabase Cron cada 15 minutos;
- backfill real: 3 `expire` + 1 `repeat` dejaron de permanecer `available`; `not_done` permaneció inalterado;
- Administración > Misiones muestra comportamiento de vencimiento con etiquetas humanas y configuración del motor;
- v60/v61/v62 aplicadas; PR #44 integrado; Browser QA post-merge 38/38.

Contrato: `docs/P25_MISIONES.md`. No volver a abrir P25 salvo correctivo demostrado.

---

# 9. P26 — Agenda + Google Calendar 🟣 SIGUIENTE / PENDIENTE DE APROBACIÓN

**P26 no se ha iniciado. Requiere aprobación expresa de Carlos antes de modificar código, Supabase o Google Calendar.**

Vistas: Día / Semana / Mes / Lista.

Capas: clases / misiones / eventos.

Sync:

- external ID;
- última sincronización;
- estado/error;
- conflictos;
- idempotencia.

Nunca destruir participantes, saldo, estado pedagógico ni historial por sincronizar.

---

# 10. P27 — Notificaciones automáticas ⏳

El centro base ya existe.

Prioridad: clase iniciada y no terminada → alerta urgente persistente con acceso directo, **sin bloquear otra clase**.

Después:

- vencimientos;
- misiones;
- saldos;
- incidencias;
- recordatorios;
- push cuando la arquitectura esté lista.

---

# 11. P28 — Importación / exportación ⏳

Alcance:

- alumnos/personas;
- Correcciones;
- Explicaciones;
- Ejercicios;
- Secuencias;
- configuraciones aplicables;
- datos administrativos.

Mantener JSON/CSV/XLSX existentes cuando sean válidos. Validar y registrar trabajos antes de modificar datos reales.

---

# 12. P29 — Marketing / CRM / tarifas / campañas / eventos ⏳

CRM:

- potenciales/alumnos;
- procedencia;
- qué buscaban;
- reservó;
- bono/importe;
- observaciones;
- tarifa;
- estado comercial;
- captación.

Sin `próxima acción` obligatoria.

Contenido social:

- ideas;
- planificación;
- calendario;
- archivos;
- estados.

Campañas:

- audiencia/segmentación;
- texto;
- imágenes/vídeos;
- estado;
- resultados.

Eventos:

- creación/gestión;
- promoción;
- contenido/campañas;
- métricas.

WhatsApp/email según integración aprobada. YouTube/TikTok no son requisito.

Multimedia aplica G5.

---

# 13. P30 — Estadísticas definidas con el usuario ⏳

Absorbe F40–F41.

**No implementar métricas inventadas.**

Primero definir con el usuario qué decisión debe permitir cada estadística. Después implementar únicamente las aprobadas.

Ámbitos candidatos: alumnado, enseñanza, clases, bonos, marketing, progreso, finanzas, campañas.

---

# 14. P31 — Administración + catálogos + integraciones + apariencia ⏳

Administración:

- catálogos;
- categorías/etiquetas;
- estilos/niveles/parámetros;
- ubicaciones/tarifas;
- defaults;
- edición segura.

Integraciones:

- Drive;
- Calendar;
- Meta cuando corresponda;
- WhatsApp;
- email.

Nunca mostrar “conectado” sin conexión verificable.

Apariencia configurable:

- colores;
- logo;
- cabecera;
- tipografías;
- parámetros visuales aprobados.

Todas las acciones destructivas aplican G6.

---

# 15. P32 — QA integral + seguridad + producción + release ⏳

Absorbe F42–F46 y todos los gates pendientes.

## Reset final

No reconstruir v44–v44e. Reauditar contra el esquema final:

- backup completo obligatorio;
- cobertura de todas las tablas reseteables;
- preview;
- supervivientes técnicos;
- borrado selectivo/por áreas;
- frase + segunda confirmación;
- transacción/serialización;
- auditoría;
- protección de identidades staff;
- restauración real.

## Seguridad

- RLS;
- roles/permisos;
- funciones;
- Auth;
- Storage/Drive;
- secretos;
- sesiones;
- destructivas;
- activar leaked password protection;
- advisors;
- reauditar todas las RPC `SECURITY DEFINER`, incluidas P20 y reset.

## Rendimiento

Existe deuda de FKs sin índice, múltiples policies permisivas e índices que Advisor aún considera no usados. Analizar carga real; no borrar índices automáticamente por aparecer `unused`.

## QA funcional

Probar:

- profesor/alumno/admin;
- potencial/provisional/registrado;
- individual/pareja;
- clases/bonos/evaluaciones/enseñanza/marketing;
- iPhone/desktop;
- import/export;
- integraciones;
- notificaciones/misiones;
- reset operativo/completo + restauración.

Auditoría final: `diseñado → implementado → comportamiento real`.

Buscar botones muertos, rutas erróneas, duplicaciones, guardados fallidos, errores silenciosos, pantallas inaccesibles, inconsistencias y endpoints obsoletos.

Release:

- datos iniciales;
- entorno;
- seguridad;
- rendimiento;
- backups;
- integraciones;
- dominio;
- runtime Hostinger demostrado;
- checklist final.

---

# 16. Mapa F1–F46 → estado/destino

| Auditoría | Estado / destino |
|---|---|
| F1 Marketing | ✅ cerrado |
| F1B TypeScript estricto | ✅ cerrado |
| F2 navegación atrás | ✅ P18 |
| F3 visual global | ✅ base / QA permanente |
| F3B inputs numéricos | ✅ revalidado P21; G3 permanente + P29/P31 |
| F4 perfil/preferencias/portal | ✅ P18 base + P22 portal |
| F5 centro notificaciones | ✅ base → automatización P27 |
| F6 temporizadores | ✅ regla permanente P21 |
| F7 duración prevista/bono | ✅ P21 |
| F8–F11 Dar clase | ✅ P21 + P0A navegación del Centro |
| F12–F15 evaluaciones | ✅ P17 + P0E/v53 |
| F16–F20 Enseñanza | ✅ P23 |
| F21–F25 Personas/Alumnado | ✅ P19 + P20 + P21 + P22 |
| F26–F31 Marketing | → P29 |
| F32–F33 Misiones/worker | ✅ P25 |
| F34 notificaciones automáticas | → P27 |
| F35 Agenda/Calendar | → P26 |
| F36 formularios/admin/transferencia | formularios ✅ P20; transferencia P28; admin P31 |
| F37 catálogos | → P31 |
| F38 integraciones | → P31 |
| F39 apariencia | → P31 |
| F40–F41 estadísticas | → P30 |
| F42 reset | ✅ base v44–v44e; reauditar P32 |
| F43 seguridad/destructivas | G6 + P31/P32 |
| F44 QA | ✅ release-wide P0D + cierre final P32 |
| F45 auditoría funcional final | → P32 |
| F46 producción | → P32 |

---

# 17. Correctivos/novedades que deben seguir presentes

| Regla / incidencia | Estado / destino |
|---|---|
| `05`/`050` en campos numéricos | ✅ P21 + G3 permanente |
| varios vídeos por clase | ✅ P21 |
| vídeo pareja → Ambos por defecto | ✅ P21 |
| vídeos fuera de árboles | ✅ P21 + P23 |
| reabrir clase revierte cierre | ✅ P21 |
| transferencia individual→pareja | ✅ P21 |
| bono compartido una sola vez | ✅ P21 |
| regularización exacta | ✅ P21 |
| suplementos compactos | ✅ P21 |
| pago parcial | ✅ P21 |
| provisional in-flow | ✅ P19↔P21 |
| clase abierta no bloquea otra | ✅ P21 |
| alerta clase olvidada | → P27 |
| ejercicio en pareja solo Ejercicios | ✅ P23 |
| sin fase/cronómetro de 3 min | ✅ P21 / regla permanente |
| revisión postclase reaparecía/recargaba | ✅ P17 |
| leaked password protection | G2/P32 |
| deuda de indexes/policies Advisor | P32 |
| reset seguro | ✅ base v44–v44e / P32 final |
| copia descargada no habilitaba reset | ✅ v44e |
| resumen final editable | ✅ v45 + P21 |
| recursión RLS enseñanza | ✅ v45 + P23 |
| inicio quedaba `Abriendo…` | ✅ P21 |
| Ver como sin autoridad servidor | ✅ P18/v46 |
| personas duplicadas | ✅ P19/v47 |
| lifecycle duplicado | ✅ P19 |
| formulario canónico/versionado | ✅ P20/v48 |
| FK P20 `published_by` sin índice | ✅ P20/v48b |
| workflow de clase incoherente | ✅ P21/v49 |
| buscador no cubría categoría/relaciones | ✅ P21/v49 |
| historial alumno recortado | ✅ P22 |
| evolución alumno mezclaba contextos | ✅ P22/v50 |
| media de portal y Drive desalineadas | ✅ P22/v50 |
| wrapper media público SECURITY DEFINER | ✅ P22/v50b |
| Centro Dar clase perdía navegación móvil | ✅ P0A / PR #32 / QA 22/22 |
| no existía auditoría transversal permanente | ✅ P0D / PR #32 |
| Plan Maestro retrocedió a P22/P23 pese al cierre P23 | ✅ P0B / gate documental CI |
| targets táctiles <44 px detectados por release-wide | ✅ P0C |
| misiones `expire` siguen `available` | ✅ P25 / CYA-AUD-003 cerrado |

---

# 18. Orden inmediato desde este corte

**P26 → P27 → P28 → P29 → P30 → P31 → P32.**

Los correctivos de auditoría **P0A–P0E están cerrados**. P24 y P25 también están cerrados. El siguiente paquete funcional es **P26 — Agenda + Google Calendar**, pendiente de aprobación.

No volver a P23 salvo un correctivo demostrado. No volver al antiguo orden F8 → F3B → F9 como secuencia de implementación: esos requisitos ya están absorbidos por P21.

Este documento sustituye las hojas parciales anteriores y debe actualizarse al inicio y cierre de cada paquete. El gate documental de P0B debe impedir que un merge basado en documentación antigua lo haga retroceder de nuevo.
