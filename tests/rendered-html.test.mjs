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
  assert.doesNotMatch(app, /Ejercicios que encajan ahora/);
  assert.match(css, /@media\(hover:hover\)/);
  assert.match(css, /grid-template-columns:1fr auto 1fr/);
  assert.match(manifest, /name:\s*"CYA Hub"/);
  assert.match(manifest, /display:\s*"standalone"/);
});

test("uses one reusable teaching card across teacher, live-class, portal and student profile surfaces", async () => {
  const [app, studentDetail, card, cardCss] = await Promise.all([
    source("../app/cya-app.tsx"),
    source("../app/student-detail.tsx"),
    source("../app/teaching-content-card.tsx"),
    source("../app/teaching-content-card.module.css"),
  ]);

  assert.match(app, /import \{ TeachingContentCard \} from "\.\/teaching-content-card"/);
  assert.ok((app.match(/<TeachingContentCard/g) ?? []).length >= 4, "teacher library, live corrections, live guide and student portal should share the card");
  assert.match(app, /media=\{assignment\.media \?\? \[\]\}/);
  assert.match(app, /media=\{libraryContent\?\.teaching_content_media \?\? \[\]\}/);
  assert.match(studentDetail, /import \{ TeachingContentCard \} from "\.\/teaching-content-card"/);
  assert.match(studentDetail, /teachingContents\.find/);
  assert.match(studentDetail, /<TeachingContentCard/);

  assert.match(card, /Ver información/);
  assert.match(card, /Ocultar información/);
  assert.match(card, /driveContentUrl/);
  assert.match(card, /driveThumbnailUrl/);
  assert.match(card, /<video/);
  assert.match(card, /playsInline/);
  assert.match(card, /onError=\{\(\) => setFailed\(true\)\}/);
  assert.doesNotMatch(card, /<iframe/);
  assert.doesNotMatch(card, /\/preview`/);
  assert.match(card, /Fotos y vídeos/);
  assert.match(cardCss, /nativeMedia/);
  assert.match(cardCss, /mediaFallback/);
});
