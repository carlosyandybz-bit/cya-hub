import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app/cya-app.tsx", "utf8");
const menu = fs.readFileSync("app/account-menu.tsx", "utf8");
const css = fs.readFileSync("app/account-menu.module.css", "utf8");

test("avatar menu owns portal and account actions", () => {
  for (const label of ["Cambiar de portal", "Editar perfil", "Preferencias", "Cuenta y sesión", "Cerrar sesión"]) {
    assert.ok(menu.includes(label), `missing ${label}`);
  }
  assert.ok(menu.includes('user_profiles').valueOf());
  assert.ok(menu.includes('user_preferences').valueOf());
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

test("account menu stays touch-safe and centered", () => {
  assert.match(css, /\.headerTrigger\{width:44px;height:44px/);
  assert.match(css, /\.backdrop\{[^}]*place-items:center/);
  assert.match(css, /\.dialog\{[^}]*max-height:calc\(100dvh/);
  assert.ok(!css.includes("align-items:end"));
});
