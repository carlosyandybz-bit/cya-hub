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
  assert.match(plan, /# 6\. P23 — Enseñanza \+ relaciones \+ árboles ✅ CERRADO/);
  assert.match(plan, /# 7\. P24 — Inicio contextual 🟣 AHORA/);
  assert.match(plan, /\*\*P24 → P25 → P26 → P27 → P28 → P29 → P30 → P31 → P32\.\*\*/);

  assert.doesNotMatch(plan, /Siguiente actualización(?: funcional)?: \*\*P23/);
  assert.doesNotMatch(plan, /## 🟣 AHORA\s+### P23/);
  assert.doesNotMatch(plan, /# 6\. P23 — Enseñanza \+ relaciones \+ árboles 🟣 AHORA/);
});

test('living audit records the resolved P0 regressions', () => {
  assert.match(audit, /CYA-AUD-001[\s\S]*?\*\*RESUELTO — P0B\*\*/);
  assert.match(audit, /CYA-AUD-005[\s\S]*?\*\*RESUELTO/);
  assert.match(audit, /CYA-AUD-006[\s\S]*?22\/22/);
  assert.match(audit, /CYA-AUD-008[\s\S]*?\*\*RESUELTO — P0A\*\*/);
  assert.match(audit, /31583225189/);

  assert.doesNotMatch(audit, /CYA-AUD-008[^\n]*\*\*ABIERTO/);
  assert.doesNotMatch(audit, /Playwright total: \*\*19 passed \/ 1 failed\*\*/);
});
