import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("uses the standard Next.js production lifecycle", async () => {
  const pkg = JSON.parse(await source("../package.json"));
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.doesNotMatch(pkg.scripts.build, /vinext|wrangler|sites/i);
  assert.doesNotMatch(pkg.scripts.start, /vinext|wrangler|sites/i);
  assert.equal(pkg.dependencies.next, "16.2.6");
});

test("serves Supabase public configuration through a Next.js route", async () => {
  const route = await source("../app/api/runtime-config/route.ts");
  assert.match(route, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(route, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(route, /sb_publishable_/);
  assert.match(route, /force-dynamic/);
  assert.match(route, /no-store/);
  assert.match(route, /configured: false/);
  assert.match(route, /configured: true/);
});

test("keeps the browser connected to runtime Supabase configuration", async () => {
  const app = await source("../app/cya-app.tsx");
  assert.match(app, /fetch\("\/api\/runtime-config"/);
  assert.match(app, /persistSession: true/);
  assert.match(app, /autoRefreshToken: true/);
  assert.match(app, /detectSessionInUrl: true/);
});

test("forces a fresh application shell after deployments", async () => {
  const page = await source("../app/page.tsx");
  assert.match(page, /dynamic\s*=\s*"force-dynamic"/);
});

test("preserves critical CYA Hub product behaviour", async () => {
  const [app, css, manifest] = await Promise.all([
    source("../app/cya-app.tsx"),
    source("../app/globals.css"),
    source("../app/manifest.ts"),
  ]);
  assert.match(app, /resetPasswordForEmail/);
  assert.match(app, /PASSWORD_RECOVERY/);
  assert.match(app, /Porcentaje de tus puntos totales/);
  assert.match(app, /Material para trabajar/);
  assert.match(app, /Ver información/);
  assert.doesNotMatch(app, /Ejercicios que encajan ahora/);
  assert.doesNotMatch(css, /:hover/);
  assert.match(css, /grid-template-columns:1fr auto 1fr/);
  assert.match(manifest, /name:\s*"CYA Hub"/);
  assert.match(manifest, /display:\s*"standalone"/);
});
