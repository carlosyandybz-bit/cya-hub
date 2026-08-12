import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const plan = read('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md');
const p23 = read('docs/P23_ENSENANZA_RELACIONES_ARBOLES.md');
const audit = read('docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md');

test('P23 closure and P24 handoff stay canonical', () => {
  assert.match(p23, /Estado: \*\*P23 CERRADO/);
  assert.match(p23, /Siguiente paquete: \*\*P24 — Inicio contextual\*\*/);
  assert.match(plan, /Última actualización secuencial cerrada: \*\*P23 \/ v51\*\*/);
  assert.match(plan, /Siguiente actualización funcional: \*\*P24 — Inicio contextual\*\*/);
  assert.match(plan, /# 7\. P24 — Inicio contextual 🟣 AHORA/);
  assert.doesNotMatch(plan, /Siguiente actualización(?: funcional)?: \*\*P23/);
});

test('P0A-P0E closures and P24 handoff stay canonical', () => {
  for (const token of ['P0A ✅','P0B ✅','P0C ✅','P0D ✅','P0E ✅']) assert.match(plan, new RegExp(token));
  assert.match(audit, /CYA-AUD-001[\s\S]*?\*\*RESUELTO — P0B\*\*/);
  assert.match(audit, /CYA-AUD-005[\s\S]*?\*\*RESUELTO/);
  assert.match(audit, /CYA-AUD-007[\s\S]*?\*\*RESUELTO — P0C\*\*/);
  assert.match(audit, /CYA-AUD-008[\s\S]*?\*\*RESUELTO — P0A\*\*/);
  assert.match(audit, /CYA-AUD-013[\s\S]*?\*\*RESUELTO — P0E\/v53\*\*/);
  assert.match(audit, /31610773094/);
  assert.match(audit, /9147197152/);
  assert.match(audit, /P24 — Inicio contextual/);
  assert.doesNotMatch(audit, /CYA-AUD-013[^\n]*\*\*ABIERTO/);
  assert.doesNotMatch(plan, /P0E .*SIGUIENTE CORRECTIVO/);
});
