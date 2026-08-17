#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutPath = path.join(root, "app", "layout.tsx");
const shellPath = path.join(root, "app", "canonical-bottom-navigation-shell.css");
const centralPath = path.join(root, "app", "dual-action-central-control-v50.css");
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
const primitivesImport = 'import "./canonical-ui-primitives.css";';
const chromeImport = 'import "./canonical-app-chrome.css";';
const centralImport = 'import "./dual-action-central-control-v50.css";';
const shellIndex = layout.indexOf(shellImport);
const primitivesIndex = layout.indexOf(primitivesImport);
const chromeIndex = layout.indexOf(chromeImport);
const centralIndex = layout.indexOf(centralImport);

if ([shellIndex, primitivesIndex, chromeIndex, centralIndex].some((index) => index === -1)) {
  fail("layout.tsx debe importar shell, primitives, chrome y control central v50 canónicos.");
}
if (!(shellIndex < primitivesIndex && primitivesIndex < chromeIndex && chromeIndex < centralIndex)) {
  fail("El control central v50 debe ser la última autoridad visual después de shell, primitives y chrome.");
}
if (layout.includes('import "./canonical-central-control-v49.css";')) {
  fail("El runtime ha recuperado el control central legacy v49 y volvería a superponer dos chasis.");
}
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
  "--cya-dual-w: 104px",
  "--cya-dual-h: 52px",
  "--cya-dual-split: 20px",
  "--cya-dual-top: -8px",
  "top:var(--cya-dual-top)",
  "cya-control-breathe",
  "cya-control-sheen",
  "transform:translate(-50%,-50%)",
  "prefers-reduced-motion",
  ".mobile-nav::before { display:none",
];
const missingCentral = requiredCentralMarkers.filter((marker) => !central.includes(marker));
if (missingCentral.length > 0) fail(`El control central v50 ha perdido contratos necesarios:\n- ${missingCentral.join("\n- ")}`);

const forbiddenCentralMarkers = [
  "--cya-central-secondary-h",
  "--cya-dual-bottom",
  "--cya-dual-w: 126px",
  "--cya-dual-w: 112px",
  "--cya-dual-split: 36px",
  "--cya-dual-split: 24px",
  "border-left:",
];
const staleCentral = forbiddenCentralMarkers.filter((marker) => central.includes(marker));
if (staleCentral.length > 0) fail(`El control v50 ha recuperado geometría legacy/no aprobada:\n- ${staleCentral.join("\n- ")}`);

if (!shell.includes("104px") || !shell.includes("100px")) {
  fail("El shell no reserva las mismas anchuras compactas que el control v50.");
}

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

console.log("[CYA visual contract] OK: v50 es autoridad única, top-anchored, compacto y premium en profesor/alumno.");
