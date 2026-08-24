import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [app, primary, portal, person, identityEditor, aliasResolver, quickControls, missionRouting, missions, marketing, personalMedia] = await Promise.all([
  read("app/cya-app.tsx"),
  read("app/primary-navigation.tsx"),
  read("app/student-portal-prf.tsx"),
  read("app/student-detail.tsx"),
  read("app/person-identity-editor.tsx"),
  read("app/staff-person-name.ts"),
  read("app/content-quick-controls.tsx"),
  read("app/mission-routing.ts"),
  read("app/staff-missions-view.tsx"),
  read("app/marketing-view-legacy.tsx"),
  read("app/student-personal-media.tsx"),
]);

test("A1 keeps five exact teacher destinations and five secondary class accesses", () => {
  const core = ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Academia"];
  const secondary = ["Agenda", "Estadísticas", "Marketing", "Notificaciones", "Misiones"];
  let cursor = -1;
  for (const label of core) {
    const next = primary.indexOf(`label: "${label}"`);
    assert.ok(next > cursor, `${label} must remain in the approved order`);
    cursor = next;
  }
  for (const label of secondary) assert.match(primary, new RegExp(`label: "${label}"`));
  assert.match(primary, /navigation-count/);
});

test("A1 student navigation and Mi Formación match the approved contract", () => {
  const navStart = portal.indexOf('<nav className={styles.bottomNav}');
  const nav = portal.slice(navStart, portal.indexOf("</nav>", navStart));
  for (const label of ["Inicio", "Contenido", "Mi Formación", "Eventos", "Misiones"]) assert.match(nav, new RegExp(`>${label}<`));
  for (const label of ["Academia Online", "Mis clases", "Mi progreso"]) assert.match(portal, new RegExp(label));
  assert.match(portal, /Vídeos de formación y clase/);
  assert.doesNotMatch(nav, /mobile-nav-secondary|Más opciones de clase/);
});

test("A2 staff alias is canonical, private to staff presentation and editable through its owner RPC", () => {
  assert.match(aliasResolver, /clean\(person\.internal_alias\) \|\| clean\(person\.display_name\)/);
  assert.match(identityEditor, /save_person_internal_alias/);
  assert.match(identityEditor, /No se muestra al alumno ni sustituye su identidad real en comunicaciones/);
  assert.doesNotMatch(aliasResolver, /localStorage|sessionStorage/);
  assert.match(person, /staffPrimaryName\(student\)/);
  assert.match(person, /staffRealNameWhenAliased\(student\)/);
  assert.match(personalMedia, /readOnly \? "id,display_name" : "id,display_name,internal_alias"/);
});

test("A2 Persona is a contextual hub with radar inside Formación", () => {
  assert.match(person, /contextualSlots/);
  assert.match(person, /Polígono de progreso/);
  assert.match(person, /StudentEvaluationOverviewStaff/);
  assert.match(person, /initialTab/);
  assert.match(person, /data-mission-highlight="person-data"/);
});

test("A2 CRM labels canonical reservations without copying them into its manual fact", () => {
  assert.match(marketing, /Confirmada por Classes/);
  assert.match(marketing, /contact\?\.canonical_reserved \? Boolean\(profile\?\.reserved\)/);
  assert.doesNotMatch(marketing, /p_reserved: Boolean\(contact\?\.canonical_reserved\)/);
});

test("A3 uses compact canonical status controls and tactile correction measures", () => {
  for (const label of ["Pendiente de corrección", "En corrección", "Corregido"]) assert.match(app, new RegExp(label));
  assert.match(quickControls, /input type="range"/);
  assert.match(quickControls, /Frecuencia/);
  assert.match(quickControls, /Importancia/);
  assert.match(app, /update_class_teaching_assignment_status/);
});

test("A3 search keeps Crear nuevo first, typed labels and safe Enter capture", () => {
  assert.match(app, /data-search-first-option="true"/);
  assert.match(app, /event\.key==='Enter'/);
  assert.match(app, /createQuickContent\(search,contentFilter\)/);
  for (const label of ["Corrección", "Explicación", "Ejercicio", "Secuencia"]) assert.match(app, new RegExp(`>${label}<`));
  assert.match(app, /search_class_teaching_content/);
  assert.doesNotMatch(app, /liveTab==='notes'/);
  assert.match(app, /showAllSuggestions/);
});

test("A1 mission cards act inline and exact destinations expose reusable highlights", () => {
  assert.match(missions, /Ir a la misión/);
  assert.match(missions, /Completar/);
  assert.match(missions, /Posponer/);
  assert.match(missions, /act_on_mission/);
  assert.match(missionRouting, /source_domain/);
  assert.match(missionRouting, /origin\.class_id/);
  assert.match(missionRouting, /teaching-content-/);
  assert.match(app, /data-mission-highlight="pedagogy-close"/);
  assert.match(app, /mission-target-highlight/);
});
