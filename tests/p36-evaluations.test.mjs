import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const panel = fs.readFileSync("app/context-evaluation-panel-p0f.tsx", "utf8");
const css = fs.readFileSync("app/context-evaluation-panel.module.css", "utf8");

test("P36-7 preserves discrete evaluation scale and context flow", () => {
  for (const score of [0, 25, 50, 75, 100]) assert.match(panel, new RegExp(String(score)));
  assert.match(panel, /data-testid="context-evaluation-panel"/);
  assert.match(panel, /Empezar evaluación|Nueva evaluación/);
  assert.match(panel, /Hito actual/);
});

test("P36-7 keeps all five scores visible without horizontal scrolling", () => {
  assert.match(css, /\.scale\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:52px/);
  assert.match(css, /data-selected="true"/);
  assert.doesNotMatch(css, /\.scale[^}]*overflow-x:\s*auto/i);
});

test("P36-7 uses semantic P36 tokens and mobile-safe controls", () => {
  assert.match(css, /var\(--cya-success-soft\)/);
  assert.match(css, /var\(--cya-accent-soft\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.doesNotMatch(css, /#ffff00|yellow/i);
});
