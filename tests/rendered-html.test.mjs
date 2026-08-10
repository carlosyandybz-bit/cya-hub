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

test("uses one reusable 4:3 teaching card with a dedicated readable detail viewer", async () => {
  const [app, studentDetail, card, cardCss] = await Promise.all([
    source("../app/cya-app.tsx"),
    source("../app/student-detail.tsx"),
    source("../app/teaching-content-card.tsx"),
    source("../app/teaching-content-card.module.css"),
  ]);

  assert.match(app, /TeachingContentCard/);
  assert.ok((app.match(/<TeachingContentCard/g) ?? []).length >= 4, "teacher library, live corrections, live guide and student portal should share the card");
  assert.match(app, /media=\{assignment\.media \?\? \[\]\}/);
  assert.match(app, /media=\{(?:libraryContent|content)\?\.teaching_content_media \?\? \[\]\}/);
  assert.match(studentDetail, /TeachingContentCard/);
  assert.match(studentDetail, /teachingContents\.find/);
  assert.match(studentDetail, /<TeachingContentCard/);

  assert.match(card, /is_cover/);
  assert.match(card, /is_preview/);
  assert.match(card, /group_label/);
  assert.match(card, /display_in_resources/);
  assert.match(card, /SecureDriveAsset/);
  assert.match(card, /Abrir contenido/);
  assert.match(card, /role="dialog"/);
  assert.match(card, /aria-modal="true"/);
  assert.match(card, /document\.body\.style\.overflow = "hidden"/);
  assert.match(card, /resourceGroup/);
  assert.doesNotMatch(card, /<iframe/);
  assert.match(cardCss, /aspect-ratio:4\/3/);
  assert.match(cardCss, /grid-template-columns:138px minmax\(0,1fr\)/);
  assert.match(cardCss, /detailBackdrop/);
  assert.match(cardCss, /resourceGrid/);
});

test("applies an iPhone readability layer without making compact lists oversized", async () => {
  const [layout, visualCss, mediaCss] = await Promise.all([
    source("../app/layout.tsx"),
    source("../app/visual-audit-v21.css"),
    source("../app/teaching-media-editor.module.css"),
  ]);
  assert.match(layout, /visual-audit-v21\.css/);
  assert.match(visualCss, /@media\(max-width:820px\)/);
  assert.match(visualCss, /font-size:16px!important/);
  assert.match(visualCss, /\.mobile-nav button\{font-size:11\.5px/);
  assert.match(visualCss, /\.marketing-tabs button\{font-size:11\.5px!important/);
  assert.match(mediaCss, /font-size:16px/);
});

test("supports gallery uploads, multiple resources, previews and video-frame covers", async () => {
  const [editor, driveMedia, uploadRoute, ticketRoute, mediaRoute] = await Promise.all([
    source("../app/teaching-media-editor.tsx"),
    source("../app/drive-media.tsx"),
    source("../app/api/google-drive/upload/route.ts"),
    source("../app/api/google-drive/media-ticket/route.ts"),
    source("../app/api/google-drive/media/route.ts"),
  ]);

  assert.match(editor, /accept="image\/\*,video\/\*"/);
  assert.match(editor, /multiple accept="image\/\*,video\/\*"/);
  assert.match(editor, /Subir portada/);
  assert.match(editor, /Añadir recursos/);
  assert.match(editor, /groupSuggestions/);
  assert.match(editor, /is_cover/);
  assert.match(editor, /is_preview/);
  assert.match(editor, /display_in_resources/);
  assert.match(editor, /canvas\.width = 800; canvas\.height = 600/);
  assert.match(editor, /Usar este fotograma/);
  assert.match(editor, /thumbnail_external_file_id/);

  assert.match(driveMedia, /IntersectionObserver/);
  assert.match(driveMedia, /activePreview/);
  assert.match(driveMedia, /playsInline/);
  assert.match(uploadRoute, /userCanManageTeaching/);
  assert.match(uploadRoute, /image\//);
  assert.match(uploadRoute, /video\//);
  assert.match(ticketRoute, /userCanAccessTeachingMedia/);
  assert.match(mediaRoute, /verifyMediaTicket/);
});

test("keeps Google Drive credentials server-only", async () => {
  const [server, env] = await Promise.all([
    source("../app/google-drive-server.ts"),
    source("../.env.example"),
  ]);
  assert.match(server, /GOOGLE_DRIVE_REFRESH_TOKEN/);
  assert.match(server, /CYA_SERVER_SECRET/);
  assert.doesNotMatch(server, /NEXT_PUBLIC_GOOGLE/);
  assert.doesNotMatch(env, /sb_publishable_gTLC/);
});
