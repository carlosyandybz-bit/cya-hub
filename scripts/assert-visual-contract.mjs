#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "app", "layout.tsx");
const shellPath = path.join(root, "app", "canonical-bottom-navigation-shell.css");
const centralPath = path.join(root, "app", "canonical-central-control-v49.css");

function fail(message) {
  console.error(`\n[CYA visual contract] ${message}\n`);
  process.exit(1);
}

for (const required of [layoutPath, shellPath, centralPath]) {
  if (!fs.existsSync(required)) fail(`Falta ${path.relative(root, required)}.`);
}

const layout = fs.readFileSync(layoutPath, "utf8");
const shell = fs.readFileSync(shellPath, "utf8");
const central = fs.readFileSync(centralPath, "utf8");

const shellImport = 'import "./canonical-bottom-navigation-shell.css";';
const centralImport = 'import "./canonical-central-control-v49.css";';
const shellIndex = layout.indexOf(shellImport);
const centralIndex = layout.indexOf(centralImport);

if (shellIndex === -1 || centralIndex === -1) {
  fail("layout.tsx debe importar el shell de navegación y el control central canónico.");
}
if (centralIndex < shellIndex) {
  fail("El control central canónico debe cargarse después del shell para mantener una única autoridad de geometría.");
}
if (layout.includes("cya-bottom-navigation-v38.css")) {
  fail("El layout ha recuperado el shell legacy v38.");
}

const forbiddenShellMarkers = [
  "button.primary",
  "mobile-nav-secondary",
  "formationMain",
  "button:first-child",
  "button:nth-child(2)",
  "Apartados de Mi formación",
  "mobile-class-sheet",
];

const leaked = forbiddenShellMarkers.filter((marker) => shell.includes(marker));
if (leaked.length > 0) {
  fail(`El shell ha recuperado responsabilidades del control central:\n- ${leaked.join("\n- ")}`);
}

const requiredCentralMarkers = [
  ".mobile-nav button.primary",
  ".mobile-nav .mobile-nav-secondary",
  "formationMain",
  "Abrir apartados de Mi formación",
  "prefers-reduced-motion",
  "focus-visible",
];

const missing = requiredCentralMarkers.filter((marker) => !central.includes(marker));
if (missing.length > 0) {
  fail(`El control central canónico ha perdido contratos necesarios:\n- ${missing.join("\n- ")}`);
}

console.log("[CYA visual contract] OK: shell y control central mantienen responsabilidades separadas.");
