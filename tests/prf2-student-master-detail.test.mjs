import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [detail, navigation, css] = await Promise.all([
  read("app/student-detail.tsx"),
  read("app/student-detail-navigation.tsx"),
  read("app/student-detail-navigation.module.css"),
]);

test("PR-F2 groups the seven existing student-detail destinations into four intentions", () => {
  for (const group of ["Ahora", "Aprendizaje", "Historial", "Perfil"]) assert.match(navigation, new RegExp(`label: "${group}"`));
  for (const [id, label] of [
    ["summary", "Resumen"],
    ["learning", "Formación"],
    ["evaluation", "Evaluación"],
    ["classes", "Clases"],
    ["credits", "Bonos"],
    ["data", "Datos"],
    ["crm", "CRM"],
  ]) {
    assert.match(navigation, new RegExp(`id: "${id}", label: "${label}"`));
  }
});

test("StudentMasterDetail delegates navigation without rewriting its seven render paths", () => {
  assert.match(detail, /StudentDetailNavigation tab=\{tab\} onTab=\{setTab\}/);
  assert.doesNotMatch(detail, /tabItems\.map/);
  for (const renderer of ["renderSummary", "renderLearning", "renderEvaluation", "renderClasses", "renderCredits", "renderData", "renderCrm"]) {
    assert.match(detail, new RegExp(`function ${renderer}\\(`));
  }
  for (const tab of ["summary", "learning", "evaluation", "classes", "credits", "data", "crm"]) {
    assert.match(detail, new RegExp(`tab === "${tab}"`));
  }
});

test("primary teacher actions and incident deep-links remain intact", () => {
  assert.match(detail, /<CalendarDays \/> Programar/);
  assert.match(detail, /<WalletCards \/> Bono/);
  assert.match(detail, /tab: "credits" as Tab/);
  assert.match(detail, /tab: "classes" as Tab/);
  assert.match(detail, /tab: "data" as Tab/);
  assert.match(detail, /setTab\(issue\.tab\)/);
});

test("grouped navigation is touch-safe and never needs horizontal scrolling", () => {
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:52px/);
  assert.match(css, /min-height:44px/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/);
});

test("switching groups opens their first canonical view while same-group subviews stay selected", () => {
  assert.match(navigation, /group\.tabs\.some\(\(item\) => item\.id === tab\)/);
  assert.match(navigation, /onTab\(group\.tabs\[0\]\.id\)/);
  assert.match(navigation, /activeGroup\.tabs\.length > 1/);
  assert.match(navigation, /aria-current=\{tab === item\.id \? "page" : undefined\}/);
});
