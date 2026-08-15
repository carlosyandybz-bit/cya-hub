import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const page = fs.readFileSync("app/page.tsx", "utf8");
const css = fs.readFileSync("app/p36-students.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("P36-3 preserves the student directory operations", () => {
  assert.match(page, /function StudentsView/);
  assert.match(page, /Buscar nombre, teléfono o email/);
  assert.match(page, /Programar/);
  assert.match(page, /Bono/);
  assert.match(page, /Registrado/);
  assert.match(page, /Provisional/);
});

test("P36-3 establishes identity-state-contact-action hierarchy", () => {
  assert.match(css, /Decision-oriented directory/);
  assert.match(css, /\.student-row-main\{/);
  assert.match(css, /\.student-main strong\{/);
  assert.match(css, /\.student-row \.badge\.portal/);
  assert.match(css, /\.student-row-actions/);
  assert.match(css, /var\(--cya-success-soft\)/);
  assert.match(css, /var\(--cya-warning-soft\)/);
});

test("P36-3 is mobile-safe and uses semantic system tokens", () => {
  assert.match(layout, /import "\.\/p36-students\.css"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:420px\)/);
  assert.match(css, /min-height:44px/);
  assert.doesNotMatch(css, /#ffff00|yellow|overflow-x:\s*auto/i);
});
