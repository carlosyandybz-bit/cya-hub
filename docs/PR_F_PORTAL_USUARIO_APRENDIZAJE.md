# PR-F — Portal de usuario / aprendizaje CYA

Fecha: 2026-08-14  
Estado: arquitectura de producto aprobada; PR-F1 en implementación.

> La Auditoría Viva de Google Drive determina el orden operativo. Este documento conserva el contrato técnico de la rama y no sustituye a Drive.

## Principio

El portal no es únicamente el área de personas que reciben clases con Carlos & Andy. Debe servir también a quien todavía no tome clases, consuma contenido gratuito, tenga contenido adquirido, utilice Feedback Online, complete misiones/BZ Points o construya su progreso personal.

Una persona sin clases, bono o profesor asignado no debe encontrar una experiencia vacía.

## Cabecera

La cabecera fija del portal contiene exactamente:

- logo CYA;
- Notificaciones, con indicador de pendientes;
- avatar/cuenta.

**El saludo no pertenece a la cabecera.** Vive dentro de la pantalla Inicio.

## Navegación inferior móvil

Cinco módulos, en este orden:

1. Inicio
2. Progreso
3. **MI FORMACIÓN** — posición central y tratamiento principal
4. Descubre
5. Misiones

Reglas:

- safe-area de iPhone;
- targets táctiles >=44 px;
- sin scroll horizontal como navegación principal;
- `Mi Formación` abre `Resumen` al tocar el control principal;
- su control secundario despliega `Resumen`, `A practicar`, `Clases realizadas` y `Contenido`;
- el avatar no ocupa un hueco de esta barra.

## Inicio — «qué está pasando»

Inicio es actualidad y resumen, no una copia de todos los demás módulos.

Orden funcional:

1. saludo cercano dentro de la página;
2. bloque `Ahora`, con un máximo de 1–3 asuntos realmente relevantes;
3. próxima clase, cuando exista;
4. resumen compacto de BZ Points, Misiones y Progreso;
5. acceso destacado a Feedback Online;
6. preparación colaborativa de próxima clase, cuando exista;
7. novedades/contenido reciente;
8. actividad reciente.

Para una persona sin clases, Inicio sigue teniendo valor mediante contenido, novedades, Feedback, BZ, Misiones, Progreso y Descubre.

## Mi Formación

Es el núcleo pedagógico. Su navegación interna es:

- Resumen;
- A practicar;
- Clases realizadas;
- Contenido.

### Resumen

Pantalla corta: qué está trabajando ahora, qué tiene pendiente, próxima clase si existe y accesos directos a los tres submódulos.

### A practicar

Reúne por prioridad —no en silos— correcciones activas, explicaciones en aprendizaje, ejercicios pendientes, secuencias, preparación de siguiente clase y contenido reciente que requiere acción.

Debe permitir vídeo/duda en contexto cuando corresponda.

### Clases realizadas

La unidad principal es la **clase**. Cada clase podrá desplegar observaciones, correcciones, explicaciones, ejercicios, secuencias, evaluación/hitos, vídeos y evolución relacionada.

En la zona de próximos compromisos aparecerán también los **eventos a los que el usuario ya se haya apuntado**, sin duplicar la entidad Evento.

### Contenido

Biblioteca personal y catálogo de aprendizaje: contenido gratuito, adquirido, desbloqueado, explicado, recomendado y próximo. Cuando exista compra real de Academia podrá incorporar precios/adquisición; nunca se simula una compra sin proveedor real.

Para quien tenga clase programada, el contenido compatible puede marcarse como algo que le gustaría trabajar en la próxima clase.

## Descubre

`Descubre` agrupa dos grandes destinos:

### Aprende Online

En la fase actual muestra una experiencia cuidada `Próximamente`. Después se convertirá en la experiencia alumno de Academia Online sin volver a cambiar la barra inferior.

### Eventos

Arquitectura híbrida aprobada:

- un evento disponible para descubrir vive en `Descubre → Eventos`;
- un evento relevante puede resumirse/recomendarse en Inicio;
- si el usuario se apunta, también aparece en `Mi Formación → Clases / Próximamente`;
- si asistió, puede formar parte de actividad/historial;
- existe **una sola entidad canónica Evento**; no se duplican registros por aparecer en varios contextos;
- si tiene relación pedagógica, puede vincularse a contenido canónico de Enseñanza antes/después del evento.

La implementación completa de Eventos no pertenece a PR-F1; este contrato queda preparado para el bloque que corresponda según Drive.

## Progreso

Orden final a desarrollar:

1. en qué enfocarte ahora;
2. evaluación actual;
3. qué ha mejorado desde la última evaluación;
4. evolución;
5. hitos;
6. Mis vídeos.

Las mejoras deben derivarse de datos reales. No fabricar elogios, métricas ni causalidad.

## Misiones

Pantalla propia con `Ahora/prioritarias`, `Disponibles`, `En progreso` y `Completadas`. BZ Points actúa como recompensa transversal cuando corresponda, no como sexto módulo inferior.

## Preparación colaborativa de la próxima clase

Se reutiliza **`class_preparation_requests`**. No se crea un segundo buzón.

Cuando exista una clase programada, el usuario puede:

- explicar con sus palabras qué le apetece trabajar;
- enviar una duda/mensaje;
- elegir uno o varios contenidos canónicos;
- subir uno o varios vídeos propios/referencias;
- pegar enlaces HTTP/HTTPS, incluidos Instagram y otros proveedores de vídeo compatibles;
- editar/quitar su preparación mientras la clase siga programada.

El profesor consume esas mismas solicitudes en el flujo canónico de `DAR CLASE`.

### BZ Points y contenido

La primera elección de contenido para una clase mantiene el premio BZ idempotente. Añadir/cambiar otros contenidos no duplica puntos.

### Vídeo

- Google Drive continúa siendo el almacenamiento privado;
- PostgreSQL conserva metadata/relación, no binarios;
- se reutiliza la compresión oportunista del cliente;
- subida directa resumible cuando sea posible y proxy streaming como fallback;
- el servidor valida identidad + participación + clase programada antes de crear/confirmar la subida;
- si el registro final falla, el archivo recién subido se elimina para evitar huérfanos;
- el propietario y staff autorizado pueden visualizarlo mediante el sistema de tickets multimedia existente.

### Enlaces

- solo `http://` o `https://`;
- longitud acotada;
- se presentan como enlaces seguros, no como HTML/embeds arbitrarios;
- no se ejecuta contenido externo dentro del portal sin un contrato específico posterior.

## Avatar / cuenta

Debe conservar:

- Mi perfil;
- Preferencias;
- Mis profesores;
- compras/accesos cuando corresponda;
- Ver como cuando existan varias experiencias autorizadas;
- Cuenta y sesión;
- Cerrar sesión.

`Mis profesores` se completará en su bloque posterior. Para la experiencia actual, la identidad pública es CARLOS Y ANDY.

## Vídeos personales

El punto de entrada depende del contexto: Inicio/próxima clase, A practicar, clase realizada, Progreso, Feedback Online o Mis profesores. Todos los vídeos personales de evolución acabarán centralizados en `Progreso → Mis vídeos`, diferenciados de los vídeos enviados a Feedback Online.

## Dudas y contacto

No crear un chat ficticio. Usar acciones contextuales `Tengo una duda` / `Cuéntanos` y conservar su origen. Para la siguiente clase, la duda entra en `class_preparation_requests`. Los canales externos solo se presentan como conectados si realmente lo están.

## Tono

Todo el portal debe sonar a Carlos & Andy acompañando al alumno:

- cercano y humano;
- breve;
- constructivo;
- sin regañar;
- sin jerga técnica;
- estados vacíos que invitan a algo útil;
- errores que explican qué puede hacer ahora;
- Feedback entendido como aprendizaje, no examen;
- Misiones/BZ motivadoras sin estética infantil.

Ejemplos aprobados:

- `¿Qué te apetece trabajar cuando nos veamos?`
- `Envíanos ese vídeo que tienes en mente.`
- `Si viste algo en Instagram que quieres probar, déjanos el enlace.`
- `Cuéntanos cualquier duda antes de vernos.`
- `Así podemos preparar la clase pensando en ti.`

## PR-F1 — alcance aprobado

Implementar ahora:

- shell del nuevo portal;
- cabecera logo + Notificaciones + avatar;
- barra inferior de cinco módulos;
- Inicio nuevo;
- preparación colaborativa de próxima clase;
- extensión segura de enlaces/vídeo;
- accesos funcionales provisionales a los módulos que se rediseñarán después, para no perder funcionalidad existente.

No cerrar todavía el diseño final de:

- Progreso;
- A practicar;
- Clases realizadas;
- Contenido;
- Eventos;
- Misiones;
- Aprende Online;
- Mis profesores/Avatar;
- ficha del alumno del profesor;
- Administración;
- rediseño final de `Ver como`.

Estos bloques continúan en el orden que marque la Auditoría Viva de Drive y requieren resumen + aprobación antes de comenzar cada actualización.
