import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const layout = read("app/layout.tsx");
const css = read("app/cya-game-ux-system.css");
const docs = read("docs/P36_GAME_UX_SYSTEM.md");
const catalog = read("app/cya-icon-catalog.ts");
const iconRuntime = read("app/cya-icon.tsx");
const iconAdmin = read("app/p36-icon-admin.tsx");
const appearanceAdmin = read("app/p31-appearance-admin.tsx");
const primaryNavigation = read("app/primary-navigation.tsx");
const iconMigration = read("db/migrations/v94_p36_icon_registry.sql");
const globalRedesign = read("tests/postrelease-global-redesign.test.mjs");

test("P36 loads one canonical Game UX system after feature-specific visual layers", () => {
  const aud020 = layout.indexOf('import "./aud020-student-experience.css"');
  const p36 = layout.indexOf('import "./cya-game-ux-system.css"');
  assert.ok(aud020 >= 0, "AUD-020 visual layer must remain present");
  assert.ok(p36 > aud020, "P36 system must load after certified feature layers");
  assert.equal((layout.match(/cya-game-ux-system\.css/g) ?? []).length, 1);
});

test("P36 exposes semantic visual, radius, elevation and motion tokens", () => {
  for (const token of ["--cya-accent:", "--cya-accent-strong:", "--cya-canvas:", "--cya-surface:", "--cya-text:", "--cya-text-muted:", "--cya-radius-control:", "--cya-radius-card:", "--cya-shadow-soft:", "--cya-motion-fast:", "--cya-motion-base:", "--cya-ease-standard:"]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(css, /--purple:\s*var\(--cya-accent\)/);
  assert.match(css, /--ink:\s*var\(--cya-text\)/);
});

test("P36 makes interaction accessible without decorative motion", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px solid var\(--cya-focus-ring\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /transition-duration:\s*0\.01ms/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /#ffff00|#fff200|yellow|fluorescent/i);
});

test("P36 scope is explicitly screen-by-screen across all three experiences", () => {
  assert.match(docs, /Profesor/);
  assert.match(docs, /Alumno/);
  assert.match(docs, /Administración/);
  assert.match(docs, /390 px, 430 px y 1280 px/);
  assert.match(docs, /P36 solo se considera cerrado cuando todas las superficies del ledger/);
  assert.match(globalRedesign, /student bottom navigation keeps exactly the approved five product destinations/);
  assert.match(globalRedesign, /teacher mobile primary navigation contract is untouched/);
});

test("P36 icon registry is semantic, admin-managed and safely falls back", () => {
  for (const key of ["navigation.home", "navigation.students", "navigation.live", "navigation.teaching", "navigation.marketing", "navigation.notifications", "teaching.correction", "teaching.explanation", "teaching.exercise", "teaching.sequence", "student.progress", "student.missions", "student.bz", "admin.appearance", "action.save", "state.error"]) {
    assert.match(catalog, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.match(iconRuntime, /data-cya-icon/);
  assert.match(iconRuntime, /fallback: CyaFallbackIcon/);
  assert.match(iconRuntime, /cya:icons-changed/);
  assert.match(appearanceAdmin, /P36IconAdmin/);
  assert.match(iconAdmin, /image\/png/);
  assert.match(iconAdmin, /image\/webp/);
  assert.match(iconAdmin, /512 KB/);
  assert.match(iconAdmin, /Restaurar/);
});

test("P36 icon persistence uses public visual assets with admin-only writes", () => {
  assert.match(iconMigration, /create table if not exists public\.app_icon_settings/);
  assert.match(iconMigration, /alter table public\.app_icon_settings enable row level security/);
  assert.match(iconMigration, /for insert to authenticated[\s\S]*private\.is_admin/);
  assert.match(iconMigration, /for update to authenticated[\s\S]*private\.is_admin/);
  assert.match(iconMigration, /for delete to authenticated[\s\S]*private\.is_admin/);
  assert.match(iconMigration, /'cya-icons'.*true.*524288/s);
  assert.match(iconMigration, /array\['image\/png','image\/webp'\]/);
  assert.doesNotMatch(iconMigration, /service_role|service key/i);
});

test("P36 begins migrating high-frequency navigation through the semantic icon runtime", () => {
  assert.match(primaryNavigation, /CyaIcon/);
  assert.match(primaryNavigation, /navigation\.home/);
  assert.match(primaryNavigation, /navigation\.students/);
  assert.match(primaryNavigation, /navigation\.live/);
  assert.match(primaryNavigation, /navigation\.teaching/);
  assert.match(primaryNavigation, /navigation\.marketing/);
});
