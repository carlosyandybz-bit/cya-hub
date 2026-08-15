import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shell = fs.readFileSync("app/cya-app.tsx", "utf8");
const css = fs.readFileSync("app/p36-teaching.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("P36-6 preserves the three teaching work modes and four content families", () => {
  assert.match(shell, /Biblioteca/);
  assert.match(shell, /Enseñar alumnos/);
  assert.match(shell, /Mapa/);
  for (const label of ["Correcciones", "Explicaciones", "Ejercicios", "Secuencias"]) assert.match(shell, new RegExp(label));
});

test("P36-6 gives teaching a semantic responsive hierarchy", () => {
  assert.match(layout, /import "\.\/p36-teaching\.css"/);
  assert.match(css, /\.teaching-switch\{display:grid/);
  assert.match(css, /\.teaching-kind-grid\{display:grid/);
  assert.match(css, /\.graph-tree-presets\{display:grid!important/);
  assert.match(css, /\.graph-actions\{display:grid!important/);
  assert.match(css, /var\(--cya-accent-soft\)/);
  assert.match(css, /var\(--cya-warning-soft\)/);
});

test("P36-6 removes horizontal carousels from the map controls on mobile", () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.doesNotMatch(css, /graph-tree-presets[^}]*overflow-x:\s*auto/i);
  assert.doesNotMatch(css, /graph-actions[^}]*overflow-x:\s*auto/i);
  assert.doesNotMatch(css, /#ffff00|yellow/i);
});
