import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const menu = fs.readFileSync("app/account-menu.tsx", "utf8");
const pages = fs.readFileSync("app/account-pages.tsx", "utf8");
const notifications = fs.readFileSync("app/notifications-view.tsx", "utf8");

test("account session dialog escapes header stacking contexts", () => {
  assert.match(menu, /import \{ createPortal \} from "react-dom"/);
  assert.match(menu, /accountOpen && typeof document !== "undefined" \? createPortal\(/);
  assert.match(menu, /document\.body/);
});

test("implementation-oriented copy is not shown in account and notification screens", () => {
  for (const forbidden of [
    "Esta pantalla podrá crecer",
    "cuando los incorporemos",
    "CYA la optimiza antes de subirla",
    "Solo aparecen aquí los avisos de CYA",
    "Inicio queda libre para tu trabajo del día",
  ]) {
    assert.equal(menu.includes(forbidden) || pages.includes(forbidden) || notifications.includes(forbidden), false, forbidden);
  }
  assert.match(notifications, /Tus avisos pendientes y el historial reciente\./);
});
