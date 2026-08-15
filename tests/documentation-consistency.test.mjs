import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import './reset-daily-quotes-fk.test.mjs';
import './aud-020-student-experience.test.mjs';

const read = (path) => fs.readFileSync(path, 'utf8');
const plan = read('docs/CYA_HUB_PLAN_MAESTRO_CIERRE.md');
const p23 = read('docs/P23_ENSENANZA_RELACIONES_ARBOLES.md');
const p24 = read('docs/P24_INICIO_CONTEXTUAL.md');
const p25 = read('docs/P25_MISIONES.md');
const audit = read('docs/CYA_HUB_AUDITORIA_VIVA_LANZAMIENTO.md');

test('historical handoffs and P25 closure stay canonical', () => {
  assert.match(p23, /Estado: \*\*P23 CERRADO/);
  assert.match(p23, /Siguiente paquete: \*\*P24 — Inicio contextual\*\*/);
  assert.match(p24, /Estado: \*\*P24 CERRADO EN MAIN \/ SUPABASE\*\*/);
  assert.match(p24, /Siguiente paquete: \*\*P25 — Misiones — pendiente de aprobación\*\*/);
  assert.match(p25, /Estado: \*\*P25 CERRADO EN MAIN \/ SUPABASE\*\*/);
  assert.match(p25, /Siguiente paquete: \*\*P26 — Agenda \+ Google Calendar — pendiente de aprobación\*\*/);
  assert.match(plan, /Versión: \*\*4\.4\*\*/);
  assert.match(plan, /Última actualización secuencial cerrada: \*\*P25 \/ v60–v62\*\*/);
  assert.match(plan, /Siguiente actualización funcional: \*\*P26 — Agenda \+ Google Calendar — pendiente de aprobación\*\*/);
  assert.match(plan, /# 8\. P25 — Misiones \+ worker ✅ CERRADO/);
  assert.match(plan, /# 9\. P26 — Agenda \+ Google Calendar 🟣 SIGUIENTE \/ PENDIENTE DE APROBACIÓN/);
  assert.doesNotMatch(plan, /P25 — Misiones \+ worker 🟣 SIGUIENTE/);
  assert.doesNotMatch(plan, /Siguiente actualización(?: funcional)?: \*\*P25/);
});

test('P0 closures and P25 evidence remain protected', () => {
  for (const token of ['P0A ✅','P0B ✅','P0C ✅','P0D ✅','P0E ✅']) assert.match(plan, new RegExp(token));
  assert.match(audit, /CYA-AUD-001[\s\S]*?\*\*RESUELTO — P0B \/ transición P25\*\*/);
  assert.match(audit, /CYA-AUD-003[\s\S]*?\*\*RESUELTO — P25\*\*/);
  assert.match(audit, /CYA-AUD-005[\s\S]*?\*\*RESUELTO/);
  assert.match(audit, /CYA-AUD-007[\s\S]*?\*\*RESUELTO — P0C\*\*/);
  assert.match(audit, /CYA-AUD-008[\s\S]*?\*\*RESUELTO — P0A\*\*/);
  assert.match(audit, /CYA-AUD-013[\s\S]*?\*\*RESUELTO — P0E\/v53\*\*/);
  assert.match(audit, /31658833258/);
  assert.match(audit, /9165485286/);
  assert.match(audit, /P26 — Agenda \+ Google Calendar/);
  assert.doesNotMatch(audit, /Misiones \| \*\*PARCIAL — BUG/);
  assert.doesNotMatch(plan, /P26 no se ha iniciado[^\n]*aprobado/i);
});