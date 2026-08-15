import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const agenda = fs.readFileSync("app/agenda-view.tsx", "utf8");
const css = fs.readFileSync("app/p36-agenda.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");
const catalog = fs.readFileSync("app/cya-icon-catalog.ts", "utf8");

test("P36-4 preserves the four agenda modes and calendar sources", () => {
  for (const value of ["day", "week", "month", "list"]) assert.ok(agenda.includes(`"${value}"`));
  assert.match(agenda, /GoogleCalendarSync/);
  assert.match(agenda, /calendar_snapshot/);
  assert.match(agenda, /Programar clase/);
  for (const label of ["Clase", "Misión", "Evento", "Calendario"]) assert.match(agenda, new RegExp(label));
});

test("P36-4 turns month view into a real responsive grid instead of a horizontal desktop canvas", () => {
  assert.match(layout, /import "\.\/p36-agenda\.css"/);
  assert.match(css, /\.month-weekdays,\.month-days\{min-width:0;width:100%;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)\}/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.month-weekdays,\.month-days\{min-width:0!important;width:100%!important\}/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/i);
});

test("P36-4 uses the semantic visual system and touch-sized agenda controls", () => {
  for (const token of ["--cya-accent-soft", "--cya-success-soft", "--cya-danger-soft", "--cya-info-soft"]) assert.match(css, new RegExp(token));
  assert.match(css, /\.calendar-nav \.icon-btn,\.today-button\{min-width:44px;min-height:44px\}/);
  assert.match(css, /\.calendar-modes button\{min-width:0;min-height:44px/);
  assert.match(css, /\.calendar-filters button\{width:100%;min-height:44px\}/);
  assert.doesNotMatch(css, /#ffff00|yellow/i);
});

test("P36-4 routes agenda icons through the administrator-managed semantic registry", () => {
  assert.match(agenda, /import \{ CyaIcon \} from "\.\/cya-icon"/);
  for (const key of ["management.classes", "management.missions", "marketing.events", "navigation.calendar", "action.add", "action.back", "action.forward", "state.success"]) {
    assert.match(agenda, new RegExp(key.replace(".", "\\.")));
  }
  for (const key of ["management.missions", "marketing.events", "action.forward"]) assert.match(catalog, new RegExp(key.replace(".", "\\.")));
});
