import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const view = fs.readFileSync("app/statistics-explorer.tsx", "utf8");
const css = fs.readFileSync("app/statistics-view.module.css", "utf8");

test("P36-9 preserves statistics source catalog and rolling periods", () => {
  assert.match(view, /statisticCatalog/);
  for (const days of [30, 90, 365]) assert.match(view, new RegExp(String(days)));
  assert.match(view, /calculateStatistic/);
});

test("P36-9 creates an executive reading hierarchy without horizontal scroll", () => {
  assert.match(css, /\.hero\{display:grid/);
  assert.match(css, /\.metricGrid,.dashboardGrid\{display:grid/);
  assert.match(css, /\.periods\{display:grid;grid-template-columns:repeat\(3/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/i);
});

test("P36-9 uses semantic colors and mobile-safe metric grids", () => {
  for (const token of ["--cya-accent", "--cya-info", "--cya-success", "--cya-warning"]) assert.match(css, new RegExp(token));
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.doesNotMatch(css, /#ffff00|yellow/i);
});
