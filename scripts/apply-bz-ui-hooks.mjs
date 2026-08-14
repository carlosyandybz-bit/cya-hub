import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source,before,after,label){
  const first=source.indexOf(before);
  if(first<0) throw new Error(`${label}: fragment not found`);
  if(source.indexOf(before,first+before.length)>=0) throw new Error(`${label}: fragment is not unique`);
  return source.slice(0,first)+after+source.slice(first+before.length);
}
function patch(path,changes){let source=readFileSync(path,"utf8");for(const [before,after,label] of changes) source=replaceOnce(source,before,after,`${path} · ${label}`);writeFileSync(path,source);}

patch("app/cya-app.tsx",[
  [
    'import { CountrySelect } from "./country-field";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
    'import { CountrySelect } from "./country-field";\nimport { BZPointsPanel } from "./bz-points-panel";\nimport type { ExperienceContext, IdentityContext } from "./v14-types";',
    "BZ panel import",
  ],
  [
    '      if (nextIdentity) setIdentity(nextIdentity);\n      if (nextIdentity) {',
    '      if (nextIdentity) setIdentity(nextIdentity);\n      if (nextIdentity?.can_study) void db.rpc("bz_record_daily_login");\n      if (nextIdentity) {',
    "daily login hook",
  ],
  [
    '    <section className="portal-grid">',
    '    <BZPointsPanel client={client} assignments={snapshot.assignments} />\n    <section className="portal-grid">',
    "student portal BZ panel",
  ],
]);

patch("app/admin-view.tsx",[
  [
    'import { AdminTeacherOnboarding } from "./admin-teacher-onboarding";\nimport { P0fEvaluationAdmin } from "./p0f-evaluation-admin";',
    'import { AdminTeacherOnboarding } from "./admin-teacher-onboarding";\nimport { BZPointsAdmin } from "./bz-points-admin";\nimport { P0fEvaluationAdmin } from "./p0f-evaluation-admin";',
    "BZ admin import",
  ],
  [
    'type AdminSection = "general" | "team" | "forms" | "teaching" | "missions" | "notifications" | "data" | "rates" | "integrations" | "appearance" | "security";',
    'type AdminSection = "general" | "team" | "forms" | "teaching" | "missions" | "bz" | "notifications" | "data" | "rates" | "integrations" | "appearance" | "security";',
    "BZ section type",
  ],
  [
    '  ["missions", "Misiones", Target],\n  ["notifications", "Notificaciones", Bell],',
    '  ["missions", "Misiones", Target],\n  ["bz", "BZ Points", WalletCards],\n  ["notifications", "Notificaciones", Bell],',
    "BZ nav item",
  ],
  [
    '  function securitySection() {',
    '  function bzSection() {\n    return <BZPointsAdmin client={client} notify={notify} />;\n  }\n\n  function securitySection() {',
    "BZ section renderer",
  ],
  [
    'section === "missions" ? missionsSection() : section === "notifications" ? notificationsSection()',
    'section === "missions" ? missionsSection() : section === "bz" ? bzSection() : section === "notifications" ? notificationsSection()',
    "BZ content routing",
  ],
]);

console.log("BZ UI hooks applied exactly once.");
