import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const plan = read('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md');
const p23 = read('docs/P23_ENSENANZA_RELACIONES_ARBOLES.md');
const p24 = read('docs/P24_INICIO_CONTEXTUAL.md');
const audit = read('docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md');

test('P23 historical handoff and P24 closure stay canonical', () => {
  assert.match(p23, /Estado: \*\*P23 CERRADO/);
  assert.match(p23, /Siguiente paquete: \*\*P24 — Inicio contextual\*\*/);
  assert.match(p24, /Estado: \*\*P24 CERRADO EN MAIN \/ SUPABASE\*\*/);
  assert.match(p24, /Siguiente paquete: \*\*P25 — Misiones — pendiente de aprobación\*\*/);
  assert.match(plan, /Versión: \*\*4\.3\*\*/);
  assert.match(plan, /Última actualización secuencial cerrada: \*\*P24 \/ v58–v59\*\*/);
  assert.match(plan, /Siguiente actualización funcional: \*\*P25 — Misiones — pendiente de aprobación\*\*/);
  assert.match(plan, /# 7\. P24 — Inicio contextual ✅ CERRADO/);
  assert.match(plan, /# 8\. P25 — Misiones \+ worker 🟣 SIGUIENTE \/ PENDIENTE DE APROBACIÓN/);
  assert.doesNotMatch(plan, /P24 — Inicio contextual 🟣 AHORA/);
  assert.doesNotMatch(plan, /Siguiente actualización(?: funcional)?: \*\*P24/);
});

test('P0 closures and P24 evidence remain protected', () => {
  for (const token of ['P0A ✅','P0B ✅','P0C ✅','P0D ✅','P0E ✅']) assert.match(plan, new RegExp(token));
  assert.match(audit, /CYA-AUD-001[\s\S]*?\*\*RESUELTO — P0B \/ transición P24\*\*/);
  assert.match(audit, /CYA-AUD-005[\s\S]*?\*\*RESUELTO/);
  assert.match(audit, /CYA-AUD-007[\s\S]*?\*\*RESUELTO — P0C\*\*/);
  assert.match(audit, /CYA-AUD-008[\s\S]*?\*\*RESUELTO — P0A\*\*/);
  assert.match(audit, /CYA-AUD-013[\s\S]*?\*\*RESUELTO — P0E\/v53\*\*/);
  assert.match(audit, /31652169267/);
  assert.match(audit, /9163051155/);
  assert.match(audit, /P25 — Misiones/);
  assert.doesNotMatch(audit, /Inicio contextual \| \*\*PARCIAL/);
  assert.doesNotMatch(plan, /P25 no se ha iniciado[^\n]*aprobado/i);
});
