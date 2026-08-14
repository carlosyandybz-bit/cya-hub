# PR-F — Portal de usuario / aprendizaje CYA

Fecha: 2026-08-14
Estado: especificación funcional aprobada parcialmente; la jerarquía visual final se decide junto con producto antes de implementar.

## Principio

El portal no es únicamente el área de alumnos que reciben clases con Carlos & Andy.

Debe servir también a cualquier persona que:
- tenga cuenta CYA pero todavía no tome clases;
- consuma contenido gratuito;
- haya adquirido contenido;
- quiera comprar contenido cuando Academia Online esté activa;
- utilice Feedback Online;
- complete misiones y gane BZ Points;
- quiera construir y conservar su progreso mediante vídeos propios;
- quiera empezar a aprender antes de convertirse en alumno habitual.

La experiencia no debe quedar vacía si la persona no tiene clases, bono o profesor asignado.

## Navegación móvil inferior

La navegación principal móvil tendrá exactamente cinco grandes módulos:

1. Inicio
2. Mi formación
3. Aprende online
4. Progreso
5. Misiones

El avatar queda fuera de esta barra y funciona como acceso personal.

La barra debe:
- respetar safe-area de iPhone;
- mantener targets táctiles >= 44 px;
- permanecer fija mientras se navega por el portal;
- ocultarse únicamente en experiencias inmersivas justificadas, como reproducción de vídeo a pantalla completa;
- no utilizar un botón “Más” para esconder uno de estos cinco módulos.

## 1. Inicio

Inicio es una pantalla de actualidad y resumen, no la formación completa.

Debe responder rápidamente a: “¿qué ha pasado y qué puedo hacer ahora?”.

Contenido principal:
- novedades relevantes;
- resumen breve de actividad;
- BZ Points: saldo y último movimiento/logro relevante;
- misiones: resumen y próxima misión importante;
- acceso destacado a Feedback Online;
- próxima clase, cuando exista;
- contenido nuevo disponible o adquirido;
- avisos relevantes;
- progreso reciente resumido;
- acceso rápido a enviar un vídeo o una duda cuando tenga sentido.

Para una persona sin clases, Inicio debe seguir teniendo valor mediante novedades, contenido gratuito, BZ Points, misiones, Feedback Online y contenido disponible.

## 2. Mi formación — módulo principal

Mi formación es el núcleo pedagógico del portal.

El acceso principal abre siempre `Resumen`.

Al igual que el módulo principal del profesor, tendrá una acción secundaria/desplegable para navegar rápidamente entre:
- Resumen
- A practicar
- Clases realizadas
- Contenido

### 2.1 Resumen

Debe ser corto y orientado a situación actual.

Incluye:
- qué está trabajando ahora;
- qué tiene pendiente;
- contenido recientemente aprendido/adquirido;
- próxima clase si existe;
- máximo unas pocas métricas relevantes, no una cuadrícula extensa;
- accesos claros a `A practicar`, `Clases realizadas` y `Contenido`.

### 2.2 A practicar

Debe reunir todo lo que requiere acción o práctica ahora.

Incluye:
- ejercicios pendientes;
- contenido marcado para practicar;
- preparación de la siguiente clase;
- cosas elegidas por el alumno para la siguiente clase;
- contenido más reciente conseguido, explicado o desbloqueado;
- correcciones activas/en corrección;
- explicaciones explicadas/en aprendizaje;
- ejercicios asociados;
- secuencias activas cuando proceda;
- prioridades actuales de práctica.

Debe permitir contextualizar acciones:
- subir vídeo de práctica;
- asociar vídeo a una corrección, explicación, ejercicio o preparación;
- enviar una duda para la siguiente clase;
- marcar/revisar práctica cuando el modelo pedagógico lo permita.

### 2.3 Clases realizadas

Historial pedagógico organizado por clase, no por tipo de contenido.

Cada clase debe poder mostrar:
- fecha y contexto;
- observaciones de la clase;
- correcciones trabajadas;
- explicaciones dadas;
- ejercicios indicados;
- secuencias/contenido relacionado;
- evaluación o hitos cuando corresponda;
- vídeos vinculados a esa clase;
- evolución o cambios relevantes derivados de la clase.

Las clases deben estar ordenadas cronológicamente y permitir abrir/cerrar detalle sin convertir la pantalla en una lista interminable.

Acciones razonables por clase:
- añadir/subir vídeo asociado;
- consultar material de esa clase;
- enviar una duda relacionada;
- preparar la siguiente clase a partir de lo trabajado.

### 2.4 Contenido

Biblioteca personal y catálogo de aprendizaje.

Debe mostrar:
- contenido ya adquirido o desbloqueado;
- contenido gratuito disponible;
- contenido actualmente accesible;
- próximos contenidos recomendados para aprender;
- contenidos compatibles con el estilo/rol/nivel actual;
- correcciones, explicaciones, ejercicios y secuencias de forma navegable;
- estado de cada contenido cuando exista estado pedagógico.

Cuando Academia Online esté activa:
- permitir adquirir contenido/programas compatibles;
- mostrar precio únicamente si existe flujo de compra real;
- no simular compras si no existe proveedor de pago.

Para alumnos que toman clases:
- permitir seleccionar contenido como interés/preferencia para una próxima clase cuando sea compatible;
- esa elección debe alimentar la preparación real de clase y no una lista paralela.

## 3. Aprende online

Es un gran módulo principal de la barra inferior.

En la primera versión de PR-F debe mostrar una experiencia cuidada de `Próximamente`.

No debe parecer un error ni una pantalla vacía.

Debe anticipar:
- programas de Academia Online;
- contenido estructurado;
- aprendizaje autónomo;
- acceso futuro a material comprado/gratuito.

Hasta que Academia Online se abra al alumno, no se habilitan compras ni accesos ficticios.

## 4. Progreso

Progreso debe responder primero a: “¿qué tengo que mejorar ahora y dónde debería enfocarme?”.

Orden recomendado:

### 4.1 En qué enfocarme ahora
- principales aspectos a mejorar;
- correcciones activas de mayor prioridad;
- aptitudes/parámetros más débiles relevantes;
- próximos hitos;
- recomendaciones derivadas de evaluación/contenido real.

### 4.2 Evaluación actual
- nivel/contexto;
- radar/evaluación vigente;
- parámetros evaluados;
- hitos alcanzados y pendientes.

### 4.3 Qué ha mejorado desde la evaluación
- correcciones resueltas;
- contenido completado/aprendido;
- cambios observables en parámetros;
- hitos superados;
- evolución temporal.

### 4.4 Evolución
- historial de evaluaciones;
- evolución de correcciones;
- progreso de contenido;
- hitos;
- vídeos propios de progreso;
- comparativas que aporten información real, evitando métricas decorativas.

## 5. Misiones

Módulo principal independiente.

Incluye:
- misiones disponibles;
- en progreso;
- prioritarias/urgentes;
- completadas;
- recompensas cuando correspondan;
- relación con BZ Points cuando una misión otorgue puntos.

La experiencia debe ser clara y lúdica sin resultar infantil.

## Avatar / cuenta personal

El avatar queda accesible en la cabecera y no ocupa una posición de la barra inferior.

Debe incluir como mínimo:
- Perfil;
- Preferencias;
- Mis profesores;
- Cuenta y sesión;
- Ver como, cuando la persona tenga más de una experiencia autorizada;
- cerrar sesión.

### Mis profesores

Debe permitir abrir la ficha del profesor/equipo relacionado con el usuario.

Para Carlos & Andy, la ficha puede incluir:
- nombre/foto/identidad visual;
- especialidades y estilos;
- información autorizada;
- formas de contacto;
- acceso a enviar una duda;
- preparación de próxima clase cuando exista;
- Feedback Online cuando sea relevante.

Una persona que todavía no tenga profesor asignado no debe ver un error: puede ver el equipo CYA disponible y las vías para empezar/aprender/contactar.

## Vídeos personales y progreso

El portal debe facilitar que el usuario conserve vídeos propios y los relacione con su aprendizaje.

Puntos de entrada razonables:
- Inicio: acción rápida `Enviar/Subir vídeo` cuando haya contexto relevante;
- A practicar: subir vídeo asociado a corrección/explicación/ejercicio/práctica;
- Clases realizadas: añadir vídeo de esa clase;
- Progreso: `Mis vídeos` / videoteca cronológica de progreso;
- Feedback Online: enviar vídeo para revisión profesional.

Reglas:
- reutilizar Google Drive/multimedia existente;
- no almacenar vídeo pesado en PostgreSQL;
- permitir descripción/contexto del vídeo;
- conservar fecha y relaciones para comparar progreso posteriormente;
- diferenciar vídeo personal de progreso de un vídeo enviado a Feedback Online;
- la privacidad debe seguir al usuario; no hacer visible un vídeo a terceros sin autorización.

## Dudas y contacto

El portal debe ofrecer contacto contextual, no únicamente un enlace genérico escondido en Perfil.

Puntos razonables:
- ficha `Mis profesores`;
- preparación de próxima clase;
- A practicar;
- detalle de una clase realizada;
- Feedback Online;
- acciones rápidas de Inicio cuando existe una duda/pendiente.

Para preguntas sobre la próxima clase se debe reutilizar el sistema canónico de preparación de clase siempre que sea posible, evitando crear un segundo buzón desconectado.

La primera versión puede utilizar los canales reales disponibles (por ejemplo WhatsApp/email/manual) mientras no exista un sistema de chat propio confirmado. No se debe presentar como chat en tiempo real si no lo es.

## Comportamiento según tipo de usuario

### Usuario sin clases
Inicio, Contenido, Aprende online, Misiones, BZ Points, Feedback Online y Progreso personal deben seguir funcionando.

No mostrar bloques vacíos de bonos/clases como protagonistas.

### Alumno con clases
Priorizar próxima clase, A practicar, preparación, clases realizadas, correcciones y evaluación.

### Usuario con contenido adquirido pero sin clases
Priorizar contenido disponible, práctica, progreso propio, misiones/BZ y Academia cuando esté activa.

### Usuario mixto
Combinar sin duplicar: una sola biblioteca/formación, una sola persona, un solo progreso y distintas fuentes de contenido.

## Reglas visuales

- iPhone como referencia principal;
- barra inferior fija de cinco módulos;
- información prioritaria primero;
- no apilar todos los módulos completos en Inicio;
- no usar cuadrículas de métricas como contenido principal;
- iconos sin cuadrados decorativos de fondo;
- morado CYA como acento, fondo claro;
- sin amarillo fluorescente;
- filas/tarjetas compactas y desplegables para detalle;
- evitar scroll horizontal como navegación principal;
- estados y acciones comprensibles sin lenguaje técnico;
- microinteracciones útiles, no decoración infantil.

## Pendientes de decisión conjunta antes de implementar UI final

1. Orden visual exacto de los cinco botones inferiores y si `Mi formación` debe ocupar el centro con tratamiento visual principal.
2. Estructura exacta de la cabecera de Inicio.
3. Qué información pública/privada muestra la ficha `Mis profesores`.
4. Cómo se presenta `Mis vídeos` dentro de Progreso (timeline, galería o híbrido).
5. Canal inicial de `Enviar una duda`: preparación de clase + apertura de canal externo frente a bandeja interna futura.
