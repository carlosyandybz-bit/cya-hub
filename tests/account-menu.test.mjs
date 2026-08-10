import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const menu = fs.readFileSync("app/account-menu.tsx", "utf8");
const pages = fs.readFileSync("app/account-pages.tsx", "utf8");
const css = fs.readFileSync("app/account-menu.module.css", "utf8");

test("avatar menu owns portal and routes account actions", () => {
  for (const label of ["Cambiar de portal", "Editar perfil", "Preferencias", "Cuenta y sesión", "Cerrar sesión"]) {
    assert.ok(menu.includes(label), `missing ${label}`);
  }
  assert.ok(menu.includes("onOpenProfile"));
  assert.ok(menu.includes("onOpenPreferences"));
  assert.ok(!menu.includes('name="avatar_url"'));
});

test("profile and preferences are independent screens", () => {
  assert.ok(pages.includes("export function ProfileSettingsView"));
  assert.ok(pages.includes("export function PreferencesSettingsView"));
  assert.ok(pages.includes('type="file"'));
  assert.ok(pages.includes('accept="image/*"'));
  assert.ok(pages.includes('storage.from("avatars")'));
  assert.ok(pages.includes("prepareAvatar"));
  assert.ok(!pages.includes('name="avatar_url"'));
});

test("technical context selectors are removed from staff shell and student portal", () => {
  assert.ok(!app.includes('<div className="side-bottom"><ContextSelector'));
  assert.ok(!app.includes('<div className="context-toolbar"><ContextSelector'));
  assert.ok(!app.includes('<Brand /><ContextSelector identity={identity} value={experience} onChange={onExperience} compact />'));
});

test("account menu is available in mobile, desktop and student portal", () => {
  const occurrences = (app.match(/<AccountMenu/g) || []).length;
  assert.ok(occurrences >= 3, `expected at least 3 AccountMenu mounts, got ${occurrences}`);
});

test("account dialogs remain inside the real iPhone viewport", () => {
  assert.match(css, /\.headerTrigger\{width:44px;height:44px/);
  assert.match(css, /\.backdrop\{[^}]*align-items:start[^}]*overflow-y:auto/);
  assert.match(css, /\.dialog\{[^}]*max-height:calc\(100svh[^}]*margin-block:auto/);
  assert.match(css, /\.dialogHeader\{position:sticky;top:0/);
  assert.ok(!css.includes("align-items:end"));
});