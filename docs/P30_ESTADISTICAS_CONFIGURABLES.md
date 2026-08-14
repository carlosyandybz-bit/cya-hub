# P30 — Estadísticas configurables

## Decisiones funcionales aprobadas

- Las estadísticas globales son visibles para cualquier profesor.
- P30 no decide todavía la navegación global. Estadísticas será uno de los seis módulos configurables junto con Inicio, Alumnado, Enseñanza, Marketing y Academia Online.
- Administración seguirá accesible desde el avatar.
- La futura barra inferior tendrá 4 módulos configurables + DAR CLASE central y una corona secundaria que despliega los seis módulos.

## Pantalla principal de Estadísticas

La portada de Estadísticas no será fija. Estará formada por tarjetas configurables y ordenables. Cada tarjeta define:

1. Métrica.
2. Periodo.
3. Filtros.
4. Comparación opcional.
5. Formato visual.
6. Posición y tamaño.

Ejemplos válidos:

- Clases esta semana.
- Clases este mes.
- Clases con alumnos de Málaga.
- Clases fuera de Málaga.
- Minutos impartidos en los últimos 90 días.
- Bonos cobrados este mes.
- Nuevos alumnos este trimestre.
- Evaluaciones realizadas esta semana.
- Contenidos completados por estilo.
- BZ Points ganados y canjeados.
- Acciones BZ premiadas y personas que han ganado puntos.
- Recompensas BZ canjeadas.
- Reservas e ingresos atribuidos a campañas.
- Misiones abiertas o completadas.
- Notificaciones enviadas o fallidas.

## Periodos

Las tarjetas podrán usar: hoy, esta semana, este mes, este año, últimos N días y, cuando la métrica lo permita, intervalo personalizado. Administración podrá controlar qué periodos aparecen como accesos rápidos y los valores por defecto.

## Catálogo de métricas

El sistema expone un catálogo declarativo de métricas agrupadas por bloques: Negocio, Clases, Alumnado, Enseñanza, BZ Points, Marketing, Operación y módulos futuros. No se permite SQL libre en una tarjeta. Cada métrica define sus filtros soportados, formato y fuente canónica.

BZ Points utiliza como fuente `bz_point_ledger` y `bz_reward_redemptions`; los ajustes manuales no se presentan como puntos ganados ni como canjes. Las métricas BZ disponibles son puntos ganados, puntos canjeados, acciones premiadas, personas que han ganado puntos y recompensas canjeadas.

## Filtros

Se habilitarán solo cuando exista un dato canónico fiable. Entre otros: profesor, alumno, ubicación/ciudad, dentro o fuera de una ubicación, país, estilo, estado de clase, estado de pago, tipo de contenido, campaña, prioridad/tipo de misión y canal/tipo de notificación. Las métricas BZ que representan movimientos individuales admiten filtro por alumno.

## Paneles guardados y asignación

Administración podrá crear varios paneles y asignarlos:

- globalmente a todos los profesores;
- a un profesor concreto;
- como base/default.

Cada profesor podrá tener una preferencia propia sin modificar la configuración global. Ejemplo: Carlos puede tener un panel orientado a negocio y Andrea otro centrado en clases y alumnado.

## Administración

Debe existir una sección específica para Estadísticas desde la que un administrador pueda:

- activar/desactivar métricas disponibles;
- crear, duplicar, renombrar y archivar paneles;
- añadir, quitar y ordenar tarjetas;
- elegir periodos y filtros de cada tarjeta;
- configurar accesos rápidos de tiempo;
- elegir el panel global por defecto;
- asignar un panel a uno o varios profesores;
- previsualizar un panel antes de publicarlo.

## Seguridad

- Cualquier profesor puede leer estadísticas globales.
- Los alumnos no pueden acceder a métricas globales; su futura vista mostrará solo estadísticas personales.
- Solo administradores gestionan catálogo, paneles globales y asignaciones.
- Los filtros nunca contienen expresiones SQL ejecutables.
- Las métricas BZ respetan la RLS del ledger/canjes y no permiten alterar saldos desde Estadísticas.

## Extensibilidad

BZ Points y recompensas ya están integrados en el catálogo P30. Feedback Online, Academia Online y almacenamiento/compresión de vídeo deberán registrar sus métricas en el mismo catálogo cuando sus módulos existan. No se crearán dashboards paralelos incompatibles.
