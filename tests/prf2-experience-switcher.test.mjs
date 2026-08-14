import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [switcher, switcherCss, menu, router] = await Promise.all([
  read("app/experience-switcher.tsx"),
  read("app/experience-switcher.module.css"),
  read("app/account-menu.tsx"),
  read("app/app-entry-router.tsx"),
]);

test("PR-F2 exposes only server-derived authorized experiences", () => {
  assert.match(switcher, /if \(identity\.can_teach\) values\.push\("teacher"\)/);
  assert.match(switcher, /if \(identity\.can_study\) values\.push\("student"\)/);
  assert.match(switcher, /if \(identity\.can_admin\) values\.push\("admin"\)/);
  assert.match(switcher, /if \(contexts\.length <= 1\) return null/);
  assert.doesNotMatch(switcher, /roles\.push|app_member_roles|set_experience_context/);
});

test("PR-F2 makes the active experience explicit and accessible", () => {
  assert.match(switcher, /Vista actual · \{labels\[experience\]\}/);
  assert.match(switcher, /aria-pressed=\{active\}/);
  assert.match(switcher, /role="group" aria-label="Cambiar experiencia"/);
  assert.match(switcher, /Cambiar de vista no cambia tus permisos reales/);
  assert.match(switcherCss, /min-height:52px/);
  assert.match(switcherCss, /prefers-reduced-motion/);
  assert.doesNotMatch(switcherCss, /yellow|#ffff00|#fff000/i);
});

test("PR-F2 keeps experience changes server-authorized and canonical", () => {
  assert.match(menu, /await onExperience\(value\)/);
  assert.match(menu, /CustomEvent\("cya:experience-change"/);
  assert.match(router, /if \(!allowed\(studentState\.identity, value\)\) throw new Error/);
  assert.match(router, /studentState\.client\.rpc\("set_experience_context", \{ p_context: value \}\)/);
  assert.match(router, /if \(!allowed\(identity, value\)\) throw new Error/);
  assert.match(router, /client\.rpc\("identity_context"\)/);
  assert.doesNotMatch(router, /event\.detail/);
});

test("PR-F2 carries the authorized destination across StudentPortal and staff shell mounts", () => {
  assert.match(router, /function StaffExperienceBridge/);
  assert.match(router, /view: experience === "admin" \? "admin" : "home"/);
  assert.match(router, /window\.history\.replaceState\(state, "", window\.location\.href\)/);
  assert.match(router, /new PopStateEvent\("popstate", \{ state \}\)/);
  assert.match(router, /setStaffExperience\(experience === "admin" \? "admin" : "teacher"\)/);
  assert.match(router, /if \(staffExperience\) return <StaffExperienceBridge experience=\{staffExperience\} \/>/);
});

test("PR-F2 does not add polling or a parallel identity system", () => {
  assert.doesNotMatch(router, /setInterval/);
  assert.doesNotMatch(router, /get_identity_context/);
  assert.doesNotMatch(router, /create table|app_member_roles/i);
});
