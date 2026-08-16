import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync("app/cya-app.tsx", "utf8");
const css = readFileSync("app/cya-detail-system-v2.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const engine = readFileSync("app/statistics-engine.ts", "utf8");
const catalog = readFileSync("app/statistics-catalog.ts", "utf8");

test("public signup creates only a confirmed student account with safe metadata", () => {
  assert.match(app, /"login" \| "signup" \| "recovery"/);
  assert.match(app, /db\.auth\.signUp\(/);
  assert.match(app, /data: \{ full_name: fullName \}/);
  assert.match(app, /emailRedirectTo: `\$\{window\.location\.origin\}\//);
  assert.match(app, /password\.length < 10/);
  assert.match(app, /password !== confirmation/);
  assert.match(app, /Cuando vuelvas, entrarás como Alumno/);
  assert.doesNotMatch(app, /name="role"|name="roles"/);
});

test("public entry reuses the canonical Supabase client instead of creating a second auth owner", () => {
  assert.match(app, /getRuntimeSupabaseClient/);
  assert.match(app, /const runtimeClient = getRuntimeSupabaseClient\(\);/);
  assert.match(app, /if \(runtimeClient\) \{[\s\S]*db = runtimeClient;[\s\S]*return db;/);
});

test("detail system is the final canonical layer and preserves module identity", () => {
  assert.ok(layout.lastIndexOf('import "./cya-detail-system-v2.css"') > layout.lastIndexOf('import "./p36-admin-teaching.css"'));
  for (const module of ["students", "live", "teaching", "marketing", "admin"]) {
    assert.match(css, new RegExp(`data-module="${module}"`));
  }
  assert.match(css, /--cya-module-rgb/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("teacher mobile navigation keeps Dar clase plus a visible secondary action", () => {
  assert.match(app, /className=\{`mobile-nav-secondary/);
  assert.match(app, /<span>Más<\/span><ChevronDown/);
  assert.match(app, /Programar clase/);
  assert.match(app, /navigateView\("classes"\)/);
  assert.match(app, /navigateView\("agenda"\)/);
  assert.match(css, /\.mobile-nav > button:not\(\.mobile-nav-secondary\)[\s\S]*font-size: 11\.5px/);
  assert.match(css, /\.mobile-nav \.mobile-nav-secondary span[\s\S]*font-size: 11\.5px/);
});

test("student statistics require real qualifying activity and use its first date", () => {
  assert.match(engine, /client\.from\("student_profiles"\)[\s\S]*\.eq\("active",true\)/);
  for (const table of ["class_participants", "feedback_credit_orders", "feedback_requests", "academy_enrollments"]) {
    assert.match(engine, new RegExp(`client\\.from\\("${table}"\\)`));
  }
  assert.match(engine, /new Map<number,number>\(\)/);
  assert.match(engine, /if\(current===undefined\|\|at<current\)firstActivity\.set/);
  assert.match(engine, /if\(!isNew\)return firstActivity\.size/);
  assert.match(catalog, /primera actividad real de clase, Feedback o compra de Academia/);
});
