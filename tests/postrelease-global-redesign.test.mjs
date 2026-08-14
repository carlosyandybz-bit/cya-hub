import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [portal, css, router, runtime, page, menu, migration, videoMigration, securityMigration, uploadRoute, cyaApp, docs] = await Promise.all([
  read("app/student-portal-prf.tsx"),
  read("app/student-portal-prf.module.css"),
  read("app/app-entry-router.tsx"),
  read("app/supabase-runtime.ts"),
  read("app/page.tsx"),
  read("app/account-menu.tsx"),
  read("db/migrations/v84_prf1_student_class_preparation.sql"),
  read("db/migrations/v84b_prf1_student_preparation_video_registration.sql"),
  read("db/migrations/v84c_prf1_preparation_rpc_security.sql"),
  read("app/api/class-preparation/upload/route.ts"),
  read("app/cya-app.tsx"),
  read("docs/PR_F_PORTAL_USUARIO_APRENDIZAJE.md"),
]);

test("PR-F1 routes only the authorized student experience to the modular portal", () => {
  assert.match(page, /AppEntryRouter/);
  assert.match(router, /experience === "student" && identity\.can_study/);
  assert.match(router, /set_experience_context/);
  assert.match(router, /allowed\(identity, value\)/);
  assert.match(menu, /cya:experience-change/);
});

test("same-tab auth changes wake the entry router without polling", () => {
  assert.match(runtime, /onAuthStateChange/);
  assert.match(runtime, /event !== "SIGNED_IN" && event !== "SIGNED_OUT"/);
  assert.match(runtime, /CustomEvent\("cya:auth-change"/);
  assert.match(router, /addEventListener\("cya:auth-change", onContextChange\)/);
  assert.match(router, /removeEventListener\("cya:auth-change", onContextChange\)/);
  assert.doesNotMatch(router, /setInterval/);
});

test("student header is logo + notifications + avatar, while greeting lives in Inicio", () => {
  const headerStart = portal.indexOf("<header className={styles.topbar}");
  const headerEnd = portal.indexOf("</header>", headerStart);
  const header = portal.slice(headerStart, headerEnd);
  assert.match(header, /styles\.logo/);
  assert.match(header, /Bell/);
  assert.match(header, /AccountMenu/);
  assert.doesNotMatch(header, /Buenos días|Buenas tardes|Buenas noches|greetingForNow/);

  const homeStart = portal.indexOf('screen === "home"');
  assert.ok(homeStart > headerEnd);
  assert.match(portal.slice(homeStart), /greetingForNow\(identity\.timezone\)/);
});

test("student bottom navigation keeps exactly the approved five product destinations", () => {
  const navStart = portal.indexOf('<nav className={styles.bottomNav}');
  const navEnd = portal.indexOf("</nav>", navStart);
  const nav = portal.slice(navStart, navEnd);
  const labels = ["Inicio", "Progreso", "Mi formación", "Descubre", "Misiones"];
  let previous = -1;
  for (const label of labels) {
    const index = nav.indexOf(`>${label}<`);
    assert.ok(index > previous, `${label} debe aparecer en el orden aprobado`);
    previous = index;
  }
  assert.match(nav, /formationMain/);
  assert.match(nav, /formationToggle/);
  assert.doesNotMatch(nav, />Aprende</);
  assert.doesNotMatch(nav, />Eventos</);
});

test("Mi Formación exposes the four approved submodules without adding a sixth bottom tab", () => {
  assert.match(portal, /Resumen/);
  assert.match(portal, /A practicar/);
  assert.match(portal, /Clases realizadas/);
  assert.match(portal, /Contenido/);
  assert.match(portal, /formationSheet/);
});

test("Descubre is the canonical discovery home for Aprende Online and Eventos", () => {
  assert.match(portal, /APRENDE ONLINE/);
  assert.match(portal, /EVENTOS/);
  assert.match(portal, /AcademyOnlineStudentComingSoon/);
  assert.match(docs, /una sola entidad canónica Evento/i);
  assert.match(docs, /Descubre → Eventos/);
  assert.match(docs, /Mi Formación → Clases \/ Próximamente/);
});

test("PR-F1 reuses class_preparation_requests instead of creating a parallel inbox", () => {
  assert.match(portal, /from\("class_preparation_requests"\)/);
  assert.match(migration, /alter table public\.class_preparation_requests/);
  assert.match(migration, /request_type in \('focus','comment','video','content','link'\)/);
  assert.doesNotMatch(migration, /create table .*preparation/i);
  assert.match(docs, /No se crea un segundo buzón/);
});

test("external preparation links are constrained to safe HTTP(S) values", () => {
  assert.match(migration, /request_type <> 'link'/);
  assert.match(migration, /\^https\?\:\/\//i);
  assert.match(migration, /char_length\(body\) between 8 and 2048/);
  assert.match(portal, /new URL\(value\)/);
  assert.match(portal, /url\.protocol === "https:" \|\| url\.protocol === "http:"/);
  assert.match(portal, /target="_blank" rel="noreferrer"/);
});

test("class preparation video upload is owner/class scoped and registered server-side", () => {
  assert.match(uploadRoute, /class_preparation_upload_context/);
  assert.match(uploadRoute, /register_class_preparation_video/);
  assert.match(uploadRoute, /"class-preparation-upload"/);
  assert.match(uploadRoute, /createDriveResumableUpload\(name, mimeType, size, "class_video"\)/);
  assert.match(uploadRoute, /deleteDriveFile\(uploadedFileId\)/);
  assert.match(videoMigration, /c\.status='scheduled'/);
  assert.match(migration, /class_preparation_requests r[\s\S]*request_type='video'/);
});

test("public preparation RPCs are invoker-only and privileged class lookup stays private", () => {
  assert.match(securityMigration, /create or replace function private\.class_preparation_upload_context/);
  assert.match(securityMigration, /create or replace function public\.class_preparation_upload_context[\s\S]*security invoker/);
  assert.match(securityMigration, /create or replace function public\.register_class_preparation_video[\s\S]*security invoker/);
  assert.match(securityMigration, /create or replace function public\.remove_class_preparation_video[\s\S]*security invoker/);
  assert.match(securityMigration, /insert into public\.class_preparation_requests/);
  assert.match(securityMigration, /delete from public\.class_preparation_requests/);
});

test("next-class content can contain several canonical choices while BZ remains class-idempotent", () => {
  assert.match(migration, /and content_id=p_content_id/);
  assert.match(migration, /insert into public\.class_preparation_requests/);
  assert.doesNotMatch(migration, /update public\.class_preparation_requests set content_id=p_content_id/);
  assert.match(migration, /'bz:content-choice:'\|\|v_person\|\|':'\|\|p_class_id/);
});

test("mobile navigation remains iPhone-safe, fixed and touchable", () => {
  assert.match(css, /position: fixed/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /grid-template-columns: 1fr 1fr 1\.18fr 1fr 1fr/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/);
});

test("teacher mobile primary navigation contract is untouched", () => {
  const inicio = cyaApp.indexOf('["home", "Inicio"');
  const alumnado = cyaApp.indexOf('["students", "Alumnado"');
  const live = cyaApp.indexOf('["live", "Dar clase"');
  const teaching = cyaApp.indexOf('["teaching", "Enseñanza"');
  const marketing = cyaApp.indexOf('["marketing", "Marketing"');
  assert.ok(inicio >= 0 && inicio < alumnado && alumnado < live && live < teaching && teaching < marketing);
});

test("student-facing preparation copy stays close and confidence-building", () => {
  assert.match(portal, /¿Qué te apetece trabajar cuando nos veamos\?/);
  assert.match(portal, /Así podemos preparar la clase pensando en ti/);
  assert.match(portal, /Cuéntanos cualquier duda antes de vernos/);
  assert.match(portal, /No hemos podido subir el vídeo esta vez/);
  assert.doesNotMatch(portal, /Supabase RPC|PostgreSQL|migration|backend/i);
});
