# CYA HUB — PLAN MAESTRO ÚNICO DE CIERRE

Versión: **3.8**  
Fecha de corte: **2026-08-12**  
Repositorio canónico: `carlosyandybz-bit/cya-hub`  
Producción: `main` + Supabase `CyA hub 2` + Hostinger  
Dominio CYA Hub: `app.carlosyandy.com`  
Última actualización secuencial cerrada: **P21 / v49**  
Siguiente actualización: **P22 — Portal del alumno**

Correctivos adelantados que deben preservarse y revalidarse en su punto original: **F42/P32 v44–v44e**. Los adelantos de Dar clase (`v45`, transición fiable de inicio y alta rápida provisional) quedaron revalidados y absorbidos definitivamente por P21.

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
- **P21 — DAR CLASE definitivo, v49.**

## ✅ Correctivos/adelantos ya absorbidos

- Resumen pedagógico editable y corrección RLS enseñanza: v45 → revalidado P21.
- Inicio de clase desacoplado de Marketing y protegido contra `Abriendo…` infinito → revalidado P21.
- Creación/reutilización de provisional dentro de Dar clase → revalidado P21.
- Evaluación numérica antigua retirada físicamente de Dar clase → P21.
- Setup progresivo G7 → P21.
- Reapertura administrativa con doble confirmación G6 → P21.

## ✅ Adelanto pendiente de revalidación final

- Administración → Datos → borrado/reinicio seguro: v44–v44e → reauditar P32.

## 🟣 AHORA

### P22 — Portal del alumno

P22 debe cerrar la experiencia real del alumno: próxima clase, historial, bonos/saldo, formación asignada, multimedia autorizada, evolución, evaluaciones y perfil, con RLS estricta y sin filtrar datos internos.

## ⏳ FALTA DESPUÉS

**P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**

---

# 2. Gates permanentes G1–G8

## G1 — Evidencia de runtime Hostinger

No basta con que un commit esté en `main`. Antes de un backend incompatible se demuestra qué frontend sirve producción.

Evidencias obtenidas:

- P17: Hostinger mostró el commit de evaluación como Actual/completado antes de v43.
- P20: `/api/build-info` devolvió `p20-form-runtime-v48-ready` antes de v48.
- P21: Hostinger mostró `app.carlosyandy.com` como **Actual / Se ha completado** sobre `main@8f8673c7`; ese commit es no-op respecto al árbol funcional P21 `c9341750` y fue el redeploy forzado previo a v49.

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

## G4 — Regresión antes de merge

Cada P debe probar las reglas que modifica. Un build verde no sustituye QA funcional.

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

P19 fijó persona canónica. P20 fijó formularios canónicos. P21 aplicó G7 al setup de clase. Los P siguientes deben reutilizar la misma información.

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

---

# 4. Evidencia de P17–P21 cerrados

## P17 — Evaluaciones ✅

- frontend guiado inicial/postclase activo;
- wrappers antiguos retirados de `authenticated`;
- motor moderno por sesiones conservado;
- evaluación inicial durante clase activa;
- cierre pedagógico exige evaluación explícita;
- Bachazouk conserva dependencia inicial de Bachata cuando corresponde;
- v43 ledger `20260811151901`;
- revisión postclase no reaparece tras completarse.

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

## P21 — DAR CLASE definitivo ✅ CERRADO

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
- preflight: 27 clases, 2 `finished+administrative` a reconciliar;
- post-cutover: **0 incoherencias closed / administrative / live**;
- `anon` no ejecuta el buscador; `authenticated` sí;
- función trigger privada no es ejecutable por `anon/authenticated`;
- llamada sin sesión al buscador rechazada `42501`;
- advisors sin hallazgo nuevo específico de v49 que exija rollback.

Contrato: `docs/P21_DAR_CLASE_RECONCILIACION.md`.

---

# 5. P22 — Portal del alumno 🟣 AHORA

Debe cerrar:

- próxima clase;
- clases e historial;
- bonos/saldo;
- formación asignada: Correcciones/Explicaciones/Ejercicios/Secuencias;
- multimedia autorizada;
- evolución;
- evaluaciones;
- perfil;
- solo información permitida por RLS.

Reglas:

- alumno solo ve lo suyo;
- borradores/incompletos internos no se filtran;
- multirol no escala privilegios;
- profesor con rol alumno puede validar UX mediante `Ver como`;
- ningún dato interno del profesor, CRM, financiero de terceros o contenido no publicado debe aparecer;
- móvil/iPhone es referencia principal.

Gate de cierre P22:

- alumno real y profesor/admin en `Ver como Alumno`;
- próxima clase correcta;
- historial de clases propio;
- bono/saldo propio;
- formación publicada y asignada por los cuatro tipos;
- multimedia autorizada;
- evolución/evaluaciones visibles según reglas P17;
- edición de perfil solo sobre campos autorizados;
- RLS negativa contra datos de otro alumno;
- iPhone + desktop;
- regresión P17–P21.

---

# 6. P23 — Enseñanza + relaciones + árboles ⏳

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
- vídeo asociado no entra automáticamente en grafo.

Ocho árboles conceptuales:

1. Bachata Leader
2. Bachata Follower
3. Salsa Leader
4. Salsa Follower
5. Zouk Leader
6. Zouk Follower
7. Bachazouk Leader
8. Bachazouk Follower

UX móvil: pan, zoom, centrar, ruta, volver/reset, filtros estilo/rol/nivel/tipo y búsqueda.

---

# 7. P24 — Inicio contextual ⏳

Inicio = lanzador inteligente.

Debe incluir:

- saludo por franja horaria y nombre;
- frase diaria persistente;
- siguiente acción;
- misiones;
- agenda/calendario;
- avisos;
- accesos rápidos;
- resumen del día.

Clase próxima domina Inicio **30 minutos antes**.

Frases:

- mañana 05:00–11:59;
- tarde 12:00–19:59;
- noche 20:00–04:59;
- activar/desactivar;
- CSV;
- fecha específica;
- evitar duplicados;
- preview.

---

# 8. P25 — Misiones + worker ⏳

Absorbe F32–F33.

Tipos: principal / diaria / crecimiento.

Estados: próxima / disponible / en progreso / bloqueada / pospuesta / completada / no realizada / no aplicable / cancelada / automática.

Prioridad: normal / prioritaria / urgente.

El motor corre en servidor, no depende de abrir la app.

Reglas iniciales: cierre de clases, bonos, perfiles incompletos, preparación, contenido pendiente, revisión y vencimientos.

---

# 9. P26 — Agenda + Google Calendar ⏳

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
| F4 perfil/preferencias/portal | P18 base + → P22 portal |
| F5 centro notificaciones | ✅ base → automatización P27 |
| F6 temporizadores | ✅ regla permanente P21 |
| F7 duración prevista/bono | ✅ P21 |
| F8–F11 Dar clase | ✅ P21 |
| F12–F15 evaluaciones | ✅ P17 |
| F16–F20 Enseñanza | → P23 |
| F21–F25 Personas/Alumnado | ✅ P19 + formularios ✅ P20 + alta rápida ✅ P21 + portal → P22 |
| F26–F31 Marketing | → P29 |
| F32–F33 Misiones/worker | → P25 |
| F34 notificaciones automáticas | → P27 |
| F35 Agenda/Calendar | → P26 |
| F36 formularios/admin/transferencia | formularios ✅ P20; transferencia P28; admin P31 |
| F37 catálogos | → P31 |
| F38 integraciones | → P31 |
| F39 apariencia | → P31 |
| F40–F41 estadísticas | → P30 |
| F42 reset | ✅ base v44–v44e; reauditar P32 |
| F43 seguridad/destructivas | G6 + P31/P32 |
| F44 QA | → P32 |
| F45 auditoría funcional final | → P32 |
| F46 producción | → P32 |

---

# 17. Correctivos/novedades que deben seguir presentes

| Regla / incidencia | Estado / destino |
|---|---|
| `05`/`050` en campos numéricos | ✅ P21 + G3 permanente |
| varios vídeos por clase | ✅ P21 |
| vídeo pareja → Ambos por defecto | ✅ P21 |
| vídeos fuera de árboles | ✅ P21 + revalidar P23 |
| reabrir clase revierte cierre | ✅ P21 |
| transferencia individual→pareja | ✅ P21 |
| bono compartido una sola vez | ✅ P21 |
| regularización exacta | ✅ P21 |
| suplementos compactos | ✅ P21 |
| pago parcial | ✅ P21 |
| provisional in-flow | ✅ P19↔P21 |
| clase abierta no bloquea otra | ✅ P21 |
| alerta clase olvidada | → P27 |
| ejercicio en pareja solo Ejercicios | → P23 |
| sin fase/cronómetro de 3 min | ✅ P21 / regla permanente |
| revisión postclase reaparecía/recargaba | ✅ P17 |
| leaked password protection | G2/P32 |
| deuda de indexes/policies Advisor | P32 |
| reset seguro | ✅ base v44–v44e / P32 final |
| copia descargada no habilitaba reset | ✅ v44e |
| resumen final editable | ✅ v45 + P21 |
| recursión RLS enseñanza | ✅ v45 + revalidar P23 |
| inicio quedaba `Abriendo…` | ✅ P21 |
| Ver como sin autoridad servidor | ✅ P18/v46 |
| personas duplicadas | ✅ P19/v47 |
| lifecycle duplicado | ✅ P19 |
| formulario canónico/versionado | ✅ P20/v48 |
| FK P20 `published_by` sin índice | ✅ P20/v48b |
| workflow de clase incoherente | ✅ P21/v49 |
| buscador no cubría categoría/relaciones | ✅ P21/v49 |

---

# 18. Orden inmediato desde este corte

**P22 → P23 → P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32.**

No volver a P21 salvo un correctivo demostrado. No volver al antiguo orden F8 → F3B → F9 como secuencia de implementación: esos requisitos ya están absorbidos por P21.

Este documento sustituye las hojas parciales anteriores y debe actualizarse al inicio y cierre de cada paquete.
