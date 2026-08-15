import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const view = fs.readFileSync("app/academy-online-teacher.tsx", "utf8");
const css = fs.readFileSync("app/academy-online.module.css", "utf8");

test("P36 Academy preserves programs, lessons, publication and enrollments", () => {
  for (const value of ["Programas", "Lecciones", "Matrículas activas", "Publicación", "Contenido añadido al programa", "Acceso a Academia concedido"]) {
    assert.match(view, new RegExp(value));
  }
  assert.match(view, /academy_save_program/);
  assert.match(view, /admin_academy_enroll/);
});

test("P36 Academy follows progressive master-detail hierarchy", () => {
  assert.match(css, /\.workspace\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(240px/);
  assert.match(css, /\.workspace\s*>\s*aside\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(css, /\.programButtonActive\s*\{/);
  assert.match(css, /\.formGrid\s*\{[\s\S]*?display:\s*grid/);
});

test("P36 Academy is mobile safe and semantic", () => {
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*720px\)/);
  assert.match(css, /var\(--cya-accent-soft\)/);
  assert.match(css, /var\(--cya-success\)/);
  assert.doesNotMatch(css, /overflow-x:\s*auto|#ffff00|yellow/i);
});
