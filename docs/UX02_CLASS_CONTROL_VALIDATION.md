# UX-02 · Dar clase + Más — contrato de validación

Entorno: `staging` exclusivamente.

## Contrato Night Motion

- `Dar clase` conserva el logo oficial y una huella de 72×72 px.
- `Más` permanece visible junto a su chevron.
- El control adicional tiene una huella táctil de 60×48 px; únicamente a <=350 px puede reducir su anchura a 58 px, nunca su altura.
- `Dar clase` y `Más` comparten el mismo eje X físico.
- Ambos se leen como una sola composición apilada, no como dos círculos desconectados.
- `Más` abre un menú con Programar clase, Clases y Agenda y conserva `aria-expanded` y `aria-haspopup="menu"`.
- No se introducen overflow horizontal, clipping ni invasión de los elementos adyacentes.
- `prefers-reduced-motion` elimina las transiciones decorativas.

## Matriz Playwright

Profesor: 320, 360, 375, 390, 393, 402, 414 y 430 px.

Evidencia visual obligatoria: 320, 390 y 430 px.

Regresión explícita: Portal CYA del alumno permanece fuera de los selectores de la capa UX-02 y conserva el disclosure de Mi formación con área táctil mínima 44×44.
