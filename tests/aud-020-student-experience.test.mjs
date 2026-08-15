import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('AUD-020 additive layer stays semantic and preserves reduced-motion handling', () => {
  const css = read('app/aud020-student-experience.css');
  assert.match(css, /nav\[aria-label="Portal CYA"\]/);
  assert.match(css, /\[role="dialog"\]\[aria-labelledby="student-master-title"\]/);
  assert.match(css, /section\[aria-labelledby="portal-now-title"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('AUD-020 layout loads after prior audit layers', () => {
  const layout = read('app/layout.tsx');
  const regression = layout.indexOf('import "./aud017-regression-fixes.css";');
  const aud020 = layout.indexOf('import "./aud020-student-experience.css";');
  assert.ok(regression >= 0);
  assert.ok(aud020 > regression);
});

test('AUD-020 teacher goal navigation remains four-area and human', () => {
  const navigation = read('app/student-detail-navigation.tsx');
  for (const label of ['Ahora', 'Aprendizaje', 'Historial', 'Perfil']) assert.match(navigation, new RegExp(`label: "${label}"`));
  for (const copy of ['Prioridad y contexto', 'Formación y progreso', 'Clases y saldo', 'Datos y gestión']) assert.match(navigation, new RegExp(copy));
});
