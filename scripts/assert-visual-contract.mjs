#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "app", "layout.tsx");
const shellPath = path.join(root, "app", "canonical-bottom-navigation-shell.css");
const centralPath = path.join(root, "app", "canonical-central-control-v49.css");
const primitivesPath = path.join(root, "app", "canonical-ui-primitives.css");
const chromePath = path.join(root, "app", "canonical-app-chrome.css");

function fail(message) {
  console.error(`\n[CYA visual contract] ${message}\n`);
  process.exit(1);
}

for (const required of [layoutPath, shellPath, centralPath, primitivesPath, chromePath]) {
  if (!fs.existsSync(required)) fail(`Falta ${path.relative(root, required)}.`);
}

const layout = fs.readFileSync(layoutPath, "utf8");
const shell = fs.readFileSync(shellPath, "utf8");
const central = fs.readFileSync(centralPath, "utf8");
const primitives = fs.readFileSync(primitivesPath, "utf8");
const chrome = fs.readFileSync(chromePath, "utf8");

const shellImport = 'import "./canonical-bottom-navigation-shell.css";';
const centralImport = 'import "./canonical-central-control-v49.css";';
const primitivesImport = 'import "./canonical-ui-primitives.css";';
const chromeImport = 'import "./canonical-app-chrome.css";';
const shellIndex = layout.indexOf(shellImport);
const centralIndex = layout.indexOf(centralImport);
const primitivesIndex = layout.indexOf(primitivesImport);
const chromeIndex = layout.indexOf(chromeImport);

if ([shellIndex, centralIndex, primitivesIndex, chromeIndex].some((index) => index === -1)) {
  fail("layout.tsx debe importar shell, control central, primitives y chrome canónicos.");
}
if (centralIndex < shellIndex) fail("El control central canónico debe cargarse después del shell.");
if (primitivesIndex < centralIndex) fail("Las primitives canónicas deben cargarse después de navegación/legacy.");
if (chromeIndex < primitivesIndex) fail("El chrome compartido debe cargarse al final para homologar profesor y alumno.");
if (layout.includes("cya-bottom-navigation-v38.css")) fail("El layout ha recuperado el shell legacy v38.");

const forbiddenShellMarkers = ["button.primary","mobile-nav-secondary","formationMain","button:first-child","button:nth-child(2)","Apartados de Mi formación","mobile-class-sheet"];
const leaked = forbiddenShellMarkers.filter((marker) => shell.includes(marker));
if (leaked.length > 0) fail(`El shell ha recuperado responsabilidades del control central:\n- ${leaked.join("\n- ")}`);

const requiredCentralMarkers = [
  ".mobile-nav button.primary",
  ".mobile-nav .mobile-nav-secondary",
  "formationMain",
  "Abrir apartados de Mi formación",
  "url('/cya-logo.png')",
  "clip-path",
  "prefers-reduced-motion",
  "focus-visible",
];
const missingCentral = requiredCentralMarkers.filter((marker) => !central.includes(marker));
if (missingCentral.length > 0) fail(`El control central canónico ha perdido contratos necesarios:\n- ${missingCentral.join("\n- ")}`);

const requiredPrimitiveMarkers = [".card",".field input","var(--cya-surface-interactive)","var(--cya-focus-ring)","-webkit-autofill","prefers-reduced-motion"];
const missingPrimitives = requiredPrimitiveMarkers.filter((marker) => !primitives.includes(marker));
if (missingPrimitives.length > 0) fail(`Las primitives canónicas han perdido contratos necesarios:\n- ${missingPrimitives.join("\n- ")}`);

const requiredChromeMarkers = [
  ".shell .mobile-head",
  'body:has(nav[aria-label="Portal CYA"]) header',
  ".mobile-nav",
  'nav[aria-label="Portal CYA"]',
  "safe-area-inset-bottom",
  "prefers-reduced-motion",
];
const missingChrome = requiredChromeMarkers.filter((marker) => !chrome.includes(marker));
if (missingChrome.length > 0) fail(`El chrome compartido ha perdido contratos profesor/alumno:\n- ${missingChrome.join("\n- ")}`);

if (/background\s*:\s*white\b/i.test(primitives) || /#fff(?:fff)?\b/i.test(primitives)) {
  fail("Las primitives canónicas contienen una superficie blanca hardcoded incompatible con Night Motion.");
}

console.log("[CYA visual contract] OK: shell, control central, primitives y chrome compartido mantienen responsabilidades canónicas.");
