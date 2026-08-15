# CYA Hub — Night Motion Design System

## Propósito

Esta especificación define la apariencia y el comportamiento visual de CYA Hub. Es la referencia obligatoria para crear, ampliar o revisar cualquier pantalla de profesor, alumno o administración.

El lenguaje combina baile, movimiento, cultura urbana contemporánea, tecnología y oficio. Debe sentirse oscuro, metálico, vivo y específico de Carlos & Andy, sin sacrificar velocidad operativa, claridad, accesibilidad o rendimiento.

## Principios no negociables

1. La funcionalidad y la comprensión preceden a la decoración.
2. La base es oscura; no existen pantallas aisladas en modo claro.
3. El brillo y el metalizado se reservan para marca, acción primaria, estado activo y feedback importante.
4. Las superficies operativas son grafito mate, con profundidad por contraste y borde, no por sombras pesadas.
5. El logo oficial es una firma; no se redibuja, recolorea ni repite sin propósito.
6. La interfaz se diseña primero para iPhone y después se expande.
7. Los estados no dependen solo del color.
8. Las animaciones usan transform y opacity y respetan prefers-reduced-motion.
9. Una pantalla nueva consume tokens y componentes existentes.
10. No se usan arañazos, cortes, shards o diagonales agresivas junto a contenido operativo.

## Paradigma visual

Nombre interno: Night Motion.

- Canvas: obsidiana profunda con luz violeta ambiental contenida.
- Superficies: grafito mate, negro azulado y elevación por capas.
- Firma: cromo violeta inspirado en el volumen real del logo.
- Movimiento: curvas continuas, órbitas y trayectorias suaves; nunca cortes o ruido.
- Composición: jerarquía editorial en titulares y densidad controlada en operaciones.
- Acentos por módulo: una familia común con una señal diferenciada para orientación.

## Tokens canónicos

### Marca

| Token | Valor | Uso |
| --- | --- | --- |
| --cya-primary | #8b2be2 | acción de marca |
| --cya-primary-hover | #9b39ef | hover |
| --cya-primary-active | #7420c7 | pressed |
| --cya-secondary | #44208c | profundidad violeta |
| --cya-accent | #9d42f5 | iconos y selección |
| --cya-accent-strong | #c879ff | texto/acento de alto contraste |
| --cya-accent-soft | rgba(157, 66, 245, .14) | selección suave |

### Módulos

| Módulo | Token | Valor |
| --- | --- | --- |
| Inicio | --cya-accent | #9d42f5 |
| Alumnado | --cya-students | #668cff |
| Dar clase | --cya-live | #b14cff |
| Enseñanza | --cya-teaching | #31c6bd |
| Marketing | --cya-marketing | #ff9e2f |
| Administración | --cya-admin | #b996ff |

### Fondos y superficies

| Token | Valor |
| --- | --- |
| --cya-canvas | #08090d |
| --cya-background-alt | #0c0d13 |
| --cya-surface | #11131a |
| --cya-surface-elevated | #171923 |
| --cya-surface-interactive | #1b1d28 |
| --cya-surface-subtle | #0e1016 |
| --cya-surface-strong | #232532 |
| --cya-overlay | rgba(4, 4, 8, .76) |

### Texto y bordes

| Token | Valor | Rol |
| --- | --- | --- |
| --cya-text | #f5f3fa | texto principal |
| --cya-text-secondary | #c5c1ce | texto secundario |
| --cya-text-muted | #a09baa | metadatos |
| --cya-text-soft | #777382 | estado pasivo |
| --cya-on-accent | #ffffff | texto sobre acción primaria |
| --cya-line | #292c37 | borde estándar |
| --cya-line-strong | #414451 | borde interactivo |

### Semántica

| Estado | Color | Superficie |
| --- | --- | --- |
| Éxito | #43d39a | rgba(67, 211, 154, .12) |
| Aviso | #f4ad50 | rgba(244, 173, 80, .13) |
| Error | #ff6d83 | rgba(255, 109, 131, .12) |
| Información | #69a4ff | rgba(105, 164, 255, .13) |
| Bloqueado | #a09aaa | rgba(160, 154, 170, .12) |
| Focus | #d58cff | rgba(213, 140, 255, .34) |

## Tipografía

Se usan únicamente Geist Sans y Geist Mono, integradas mediante next/font.

- Display: Geist Sans 850, clamp de 36 a 68px, tracking -.045em, line-height 1.04.
- H1: Geist Sans 800–850, 31–46px.
- H2: Geist Sans 760–820, 20–30px.
- H3/título de tarjeta: Geist Sans 730–800, 17–20px.
- Body: Geist Sans 400–560, 15px, line-height 1.52.
- Body small: 13–14px.
- Caption/label: 11–13px, peso 700–850.
- KPI/cifras: números tabulares.
- Geist Mono: solo para identificadores, claves o datos técnicos.

Los titulares pueden ser editoriales; formularios, clases, CRM y datos operativos priorizan lectura inmediata.

## Uso del logo

Asset oficial: public/cya-logo.png.

1. Se muestra el archivo exacto; no se redibuja ni se sintetiza.
2. Puede recortarse visualmente mediante un contenedor CSS para eliminar transparencia, sin alterar el bitmap.
3. Cabecera: marca reconocible junto a CYA Hub.
4. Inicio: una curva ampliada de baja opacidad puede actuar como marca de agua.
5. Foco/próxima clase: una curva continua aporta profundidad; no se añaden líneas, arañazos o cortes.
6. Barra inferior: el logo es la pieza principal de DAR CLASE.
7. No usar más de tres apariciones reconocibles dentro de un mismo viewport.
8. Mantener contraste, espacio de seguridad y nitidez.

## Navegación inferior de profesor

Arquitectura fija:

Inicio | Alumnado | DAR CLASE | Enseñanza | Marketing

### Pieza central apilada

- La acción principal muestra el logo en un área aproximada de 67 × 38px.
- La etiqueta Dar clase permanece visible y accesible.
- Más opciones de clase se apila por encima, ligeramente hacia el segundo lóbulo del símbolo.
- Tamaño del control adicional: aproximadamente 38 × 29px.
- El conjunto se lee como una única composición inspirada en el logo.
- El control adicional despliega Programar clase, Clases y Agenda.
- aria-expanded y aria-haspopup=menu son obligatorios.
- No añadir un tercer control, un círculo oscuro desconectado ni un chevron gigante.

### Safe area

- La barra termina en bottom 0.
- Padding inferior: 8px + env(safe-area-inset-bottom).
- Padding lateral: env(safe-area-inset-left/right).
- El contenido principal reserva 126px + env(safe-area-inset-bottom).
- Ninguna acción queda bajo el home indicator.

## Componentes

### Tarjetas

- Estándar: superficie --cya-surface, borde --cya-line, radio 20px.
- Elevada: --cya-surface-elevated, borde fuerte puntual y sombra suave.
- Interactiva: transición de transform, borde y fondo; hover -1px, pressed escala .975.
- Destacada: gradiente grafito-violeta, curva de logo de baja opacidad.
- KPI: cifra tabular, label breve e icono semántico.
- Títulos y descripciones permiten wrapping.
- Toda tarjeta soporta título largo, badges, datos vacíos e información incompleta.

### Botones

- Primary: metal violeta, texto blanco y brillo interno contenido.
- Secondary/Ghost: superficie interactiva, borde fuerte, sin brillo.
- Destructive: superficie de error más icono o texto explícito.
- Icon only: mínimo 44 × 44px y aria-label.
- Disabled: superficie fuerte, texto disabled, sin sombra.
- Focus: anillo de 3px.
- Loading: mantiene ancho para evitar saltos de layout.

### Formularios

- Altura mínima 46px; en móvil 44px y texto 16px para evitar zoom de Safari.
- Fondo --cya-surface-interactive.
- Borde --cya-line-strong.
- Focus --cya-focus más halo de cuatro píxeles.
- Labels visibles; placeholder no sustituye al label.
- Error con mensaje y señal visual, nunca solo color.
- Textareas con resize vertical y altura útil.

### Tabs, chips y filtros

- Contenedor en superficie sutil.
- Activo en superficie interactiva más acento de módulo.
- Chip breve y target táctil cuando es interactivo.
- Los filtros móviles pueden desplazarse o reordenarse, sin overflow del documento.

### Tablas y listas

- Escritorio: tabla cuando la comparación por columnas aporta valor.
- Móvil: filas adaptativas o cards.
- Acciones frecuentes visibles.
- Texto largo envuelve o se resume de forma explícita.

### Modales y sheets

- Overlay oscuro con blur moderado.
- Fondo --cya-surface, borde fuerte y radio de 20 a 24px.
- Altura máxima basada en 100dvh y safe areas.
- Cabecera sticky cuando el contenido es largo.
- Acción principal accesible.
- Cierre por botón y Escape cuando corresponda.

## Motion y microinteracciones

| Token | Duración | Uso |
| --- | --- | --- |
| --cya-motion-fast | 120ms | pressed, iconos |
| --cya-motion-base | 180ms | color, borde, tabs |
| --cya-motion-slow | 280ms | pantalla, modal, sheet |

- Easing estándar: cubic-bezier(.2, .8, .2, 1).
- Easing de confirmación: cubic-bezier(.18, .9, .24, 1.18).
- Entrada: opacity 0 a 1 y translateY 8px a 0.
- Modal/sheet: opacity, translateY y escala máxima de 1.5%.
- Pressed táctil: escala .975.
- No hay animaciones decorativas permanentes.
- prefers-reduced-motion reduce las duraciones a un instante funcional.

## Responsive

Viewports mínimos de validación:

- Móvil: 320, 360, 375, 390, 393, 402, 414 y 430px.
- Intermedio/tablet: 768 × 1024px.
- Escritorio: 1280 × 900px.

Reglas:

- Hasta 900px: shell móvil, cabecera sticky y barra inferior.
- Hasta 430px: densidad móvil y tipografía editorial adaptada.
- Hasta 350px: reducción de labels e iconos sin perder targets.
- Usar dvh/svh en overlays y flujos.
- html y body no generan overflow horizontal.

## Accesibilidad

- Contraste objetivo WCAG AA.
- Targets táctiles mínimos de 44 × 44px.
- Focus visible en controles y navegación.
- Estados con icono/texto además de color.
- HTML semántico y labels programáticos.
- La navegación principal declara aria-current.
- El desplegable apilado declara aria-expanded, aria-haspopup y menu.
- La oscuridad no se implementa invirtiendo imágenes.

## Rendimiento

- El logo se sirve mediante next/image.
- Los efectos se resuelven con CSS; no se añade una librería de animación.
- Blur solo en cabeceras, barra inferior, overlays y sheets.
- Las animaciones usan transform y opacity.
- No hay filtros continuos, canvas decorativo ni vídeo de fondo.
- Los assets no se duplican por módulo.

## Receta para una pantalla nueva

1. Identificar módulo y heredar --cya-module.
2. Elegir canvas y una única superficie principal.
3. Definir una acción primaria; el resto usa secondary/ghost.
4. Construir mobile-first a 320px.
5. Probar título corto/largo, vacío, loading, error, uno y muchos elementos.
6. Comprobar targets, focus, labels y contraste.
7. Añadir movimiento solo para orientación o feedback.
8. Validar 320–430, 768 y 1280px.
9. Ejecutar Playwright: navegación, interacción, overflow, consola, red y screenshots.
10. Comparar con Inicio, Alumnado, Dar clase, Enseñanza, Marketing, Administración y Panel alumno.

## Antipatrones

- Tarjetas blancas o fondos grises claros.
- Glassmorphism en todas las superficies.
- Gradientes en cada componente.
- Sombras densas para separar cualquier elemento.
- Neón permanente o texto con glow.
- Logo repetido indiscriminadamente.
- Arañazos, cortes o diagonales agresivas junto a nombres y datos.
- Botón central gigante o control secundario desconectado.
- Hexadecimales nuevos cuando existe un token.
- important como primera respuesta a un problema de cascada.
- Tablas de escritorio comprimidas en móvil.
- Acciones frecuentes ocultas tras varios menús.

## Criterio de aceptación

Una pantalla está terminada cuando compila, se renderiza con datos QA, no presenta overflow, conserva funcionalidad, funciona con teclado y touch, respeta safe areas, supera estados extremos y ha sido capturada e inspeccionada en móvil, intermedio y escritorio.
