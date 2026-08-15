import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("app/cya-app.tsx", "utf8");
const css = fs.readFileSync("app/p36-live-class.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const functionalQa = fs.readFileSync("qa/tests/functional-class-flow.spec.ts", "utf8");

test("P36-5 preserves the complete live-class teaching workflow", () => {
  for (const label of ["Trabajo", "Contexto", "Observaciones", "Evaluación", "Correcciones", "Contenido", "Ejercicios", "Secuencias"]) assert.match(shell, new RegExp(label));
  assert.match(shell, /Buscar correcciones, contenido, ejercicios o secuencias/);
  assert.match(shell, /Crear nuevo/);
  assert.match(shell, /Terminar clase/);
  assert.match(functionalQa, /teacher closes a QA class, student receives it, and admin remains healthy/);
  assert.match(functionalQa, /EN CLASE/);
});

test("P36-5 removes horizontally hidden teaching choices and prioritizes search", () => {
  assert.match(layout, /import "\.\/p36-live-class\.css"/);
  assert.match(css, /\.p0f-primary-tabs,\.p0f-content-tabs\{display:grid!important;overflow:visible!important/);
  assert.match(css, /\.p0f-primary-tabs\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.p0f-sticky-search\{top:0;z-index:24/);
  assert.match(css, /\.live-search\{min-height:50px/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.p0f-primary-tabs\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.p0f-content-tabs\{top:62px;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/i);
});

test("P36-5 uses semantic state colors and touch-safe closing actions", () => {
  for (const token of ["--cya-success-soft", "--cya-warning-soft", "--cya-info-soft", "--cya-danger-soft", "--cya-accent-soft"]) assert.match(css, new RegExp(token));
  assert.match(css, /\.p0f-status-chip\[data-state="in_correction"\]\{background:var\(--cya-warning-soft\)/);
  assert.match(css, /\.p0f-status-chip\[data-state="corrected"\]\{background:var\(--cya-success-soft\)/);
  assert.match(css, /\.workflow-footer \.btn\{min-height:48px\}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css, /#ffff00|yellow/i);
});
