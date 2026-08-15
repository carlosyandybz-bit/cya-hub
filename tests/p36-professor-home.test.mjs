import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("app/home-view.tsx", "utf8");
const css = fs.readFileSync("app/p36-professor-home.css", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

test("P36-2 keeps the P24 contextual engine and makes Ahora the dominant visual surface", () => {
  assert.match(home, /selectHomeFocus/);
  assert.match(home, /minutesUntilClass/);
  assert.match(home, /home_snapshot/);
  assert.match(css, /\/\* Ahora: única superficie dominante\. \*\//);
  assert.match(css, /\.focus \{/);
  assert.match(css, /min-height:190px/);
  assert.match(css, /box-shadow:var\(--cya-shadow-raised\)/);
});

test("P36-2 demotes shortcuts and preserves all five operational destinations", () => {
  for (const copy of ["Programar clase", "Abrir alumno", "Enseñanza", "Academia Online", "Agenda completa"]) assert.match(home, new RegExp(copy));
  assert.match(css, /\.quick-grid \{[\s\S]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /\.quick-grid \.quick \{[\s\S]*min-height:62px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("P36-2 preserves missions, agenda and administrator entry after the primary action", () => {
  const focus = home.indexOf('<section className={`focus');
  const alerts = home.indexOf('aria-label="Avisos accionables"');
  const quick = home.indexOf('aria-label="Acciones rápidas"');
  const grid = home.indexOf('<section className="home-grid">');
  assert.ok(focus >= 0 && alerts > focus && quick > focus && grid > quick);
  assert.match(home, /Lo importante después/);
  assert.match(home, /Agenda del día/);
  assert.match(home, /Administración/);
});

test("P36-2 visual layer loads after the canonical Game UX system", () => {
  const base = layout.indexOf('import "./cya-game-ux-system.css"');
  const screen = layout.indexOf('import "./p36-professor-home.css"');
  assert.ok(base >= 0 && screen > base);
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /overflow-x:\s*auto|yellow|#ffff00/i);
});
