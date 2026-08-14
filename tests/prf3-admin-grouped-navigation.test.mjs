import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [view, navigation, css] = await Promise.all([
  read("app/admin-view.tsx"),
  read("app/admin-grouped-navigation.tsx"),
  read("app/prf3-admin-navigation.css"),
]);

const destinations = [
  ["general", "General"], ["team", "Equipo y roles"], ["security", "Seguridad"],
  ["forms", "Formularios"], ["teaching", "Enseñanza"], ["missions", "Misiones"], ["notifications", "Notificaciones"],
  ["rates", "Tarifas"], ["bz", "BZ Points"], ["feedback", "Feedback Online"], ["academy", "Academia Online"],
  ["data", "Datos"], ["integrations", "Integraciones"], ["appearance", "Apariencia"],
];

test("PR-F3 preserves the exact fourteen canonical Administration destinations", () => {
  for (const [id, label] of destinations) {
    assert.match(view, new RegExp(`\\["${id}", "${label}"`));
    assert.match(navigation, new RegExp(`"${id}"`));
  }
  assert.equal(new Set(destinations.map(([id]) => id)).size, 14);
});

test("PR-F3 groups Administration by the five Drive-approved intentions", () => {
  for (const label of ["Sistema", "Enseñanza", "Negocio", "Datos", "Apariencia"]) {
    assert.match(navigation, new RegExp(`label: "${label}"`));
  }
  assert.match(navigation, /\["general", "team", "security"\]/);
  assert.match(navigation, /\["forms", "teaching", "missions", "notifications"\]/);
  assert.match(navigation, /\["rates", "bz", "feedback", "academy"\]/);
  assert.match(navigation, /\["data", "integrations"\]/);
  assert.match(navigation, /\["appearance"\]/);
});

test("AdminView delegates only navigation while keeping section state and render paths", () => {
  assert.match(view, /const \[section, setSection\] = useState<AdminSection>\("general"\)/);
  assert.match(view, /<AdminGroupedNavigation section=\{section\} sections=\{sections\} onSection=\{setSection\} \/>/);
  for (const renderer of ["generalSection", "teamSection", "formsSection", "teachingSection", "missionsSection", "notificationsSection", "dataSection", "ratesSection", "integrationsSection", "appearanceSection", "bzSection", "feedbackSection", "academySection", "securitySection"]) {
    assert.match(view, new RegExp(`function ${renderer}\\(`));
  }
  assert.doesNotMatch(view, /<nav className="admin-nav"/);
});

test("group selection opens the first canonical destination and local navigation keeps exact section ids", () => {
  assert.match(navigation, /onSection\(group\.sectionIds\[0\]\)/);
  assert.match(navigation, /activeGroup\.sectionIds\.map/);
  assert.match(navigation, /onSection\(id\)/);
  assert.match(navigation, /aria-current=\{section === id \? "page" : undefined\}/);
});

test("mobile Administration has touch-safe grouped navigation with no horizontal main scroller", () => {
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:52px/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /\.admin-nav\{display:none!important;overflow-x:visible!important\}/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/);
});
