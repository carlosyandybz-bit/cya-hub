import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const layout = read("app/layout.tsx");
const css = read("app/cya-game-ux-system.css");
const docs = read("docs/P36_GAME_UX_SYSTEM.md");
const globalRedesign = read("tests/postrelease-global-redesign.test.mjs");

test("P36 loads one canonical Game UX system after feature-specific visual layers", () => {
  const aud020 = layout.indexOf('import "./aud020-student-experience.css"');
  const p36 = layout.indexOf('import "./cya-game-ux-system.css"');
  assert.ok(aud020 >= 0, "AUD-020 visual layer must remain present");
  assert.ok(p36 > aud020, "P36 system must load after certified feature layers");
  assert.equal((layout.match(/cya-game-ux-system\.css/g) ?? []).length, 1);
});

test("P36 exposes semantic visual, radius, elevation and motion tokens", () => {
  for (const token of [
    "--cya-accent:",
    "--cya-accent-strong:",
    "--cya-canvas:",
    "--cya-surface:",
    "--cya-text:",
    "--cya-text-muted:",
    "--cya-radius-control:",
    "--cya-radius-card:",
    "--cya-shadow-soft:",
    "--cya-motion-fast:",
    "--cya-motion-base:",
    "--cya-ease-standard:",
  ]) assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(css, /--purple:\s*var\(--cya-accent\)/);
  assert.match(css, /--ink:\s*var\(--cya-text\)/);
});

test("P36 makes interaction accessible without turning CYA into decorative motion", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid var\(--cya-focus-ring\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration:\s*0\.01ms/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /#ffff00|#fff200|yellow|fluorescent/i);
});

test("P36 preserves the already-certified professor, student and admin contracts", () => {
  assert.match(globalRedesign, /student bottom navigation keeps exactly the approved five product destinations/);
  assert.match(globalRedesign, /teacher mobile primary navigation contract is untouched/);
  assert.match(docs, /Ahora \/ Aprendizaje \/ Historial \/ Perfil/);
  assert.match(docs, /cinco categorías y catorce destinos funcionales/);
  assert.match(docs, /no añade tablas, RPC, RLS, almacenamiento ni tracking/i);
});
