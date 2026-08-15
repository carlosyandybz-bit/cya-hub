import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const css = fs.readFileSync("app/p36-admin-teaching.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("P36 final contains Administration teaching controls inside the panel", () => {
  assert.match(layout, /import "\.\/p36-admin-teaching\.css"/);
  assert.match(css, /\.admin-panel[^\{]*\{[^}]*min-width:0;max-width:100%/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.admin-panel \.term-list>div[^\{]*\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.admin-panel \.p0f-create-row\{grid-template-columns:1fr!important\}/);
});
