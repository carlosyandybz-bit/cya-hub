import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin=readFileSync("app/admin-view.tsx","utf8");
const catalogs=readFileSync("app/p31-catalog-admin.tsx","utf8");
const rates=readFileSync("app/p31-rates-admin.tsx","utf8");
const integrations=readFileSync("app/p31-integrations-admin.tsx","utf8");
const driveServer=readFileSync("app/google-drive-server.ts","utf8");
const driveStatus=readFileSync("app/api/google-drive/status/route.ts","utf8");
const appearance=readFileSync("app/p31-appearance-admin.tsx","utf8");
const appearanceRuntime=readFileSync("app/p31-appearance-runtime.tsx","utf8");
const accountMenu=readFileSync("app/account-menu.tsx","utf8");
const tagMigration=readFileSync("db/migrations/v71a_p31_safe_tag_rename.sql","utf8");
const appearanceMigration=readFileSync("db/migrations/v71b_p31_appearance_settings.sql","utf8");

test("Administration centralizes P31 on canonical models",()=>{
  for(const token of ["P31CatalogAdmin","P31RatesAdmin","P31IntegrationsAdmin","P31AppearanceAdmin","Tarifas","Integraciones","Apariencia"]) assert.ok(admin.includes(token),token);
  assert.match(catalogs,/from\("catalog_terms"\)/);
  assert.match(catalogs,/\["location", "Ubicaciones"\]/);
  assert.match(rates,/from\("marketing_rates"\)/);
  assert.match(rates,/rpc\("save_marketing_rate"/);
});

test("catalog editing preserves stable keys and reversible active state",()=>{
  assert.match(catalogs,/term_key: termKey/);
  assert.match(catalogs,/updateTerm\(term\.id, \{ label: value \}/);
  assert.match(catalogs,/updateTerm\(term\.id, \{ active \}/);
  assert.match(rates,/p_active: active/);
});

test("teaching tag rename is a single admin governed merge operation",()=>{
  assert.match(tagMigration,/security invoker/i);
  assert.match(tagMigration,/private\.is_admin\(\)/);
  assert.match(tagMigration,/on conflict \(content_id, tag\) do nothing/i);
  assert.match(tagMigration,/audit_events/);
  assert.match(tagMigration,/authenticated/);
  assert.match(catalogs,/admin_rename_teaching_tag/);
});

test("Drive verification requires staff and a live Google response",()=>{
  assert.match(driveStatus,/requireStaff\(bearerToken\(request\)\)/);
  assert.match(driveStatus,/verifyGoogleDriveConnection/);
  assert.doesNotMatch(driveStatus,/folderId/);
  assert.match(driveServer,/googleAccessToken\(\)/);
  assert.match(driveServer,/DRIVE_API.*files/);
  assert.match(driveServer,/verified: true/);
  assert.match(integrations,/drive\?\.verified \? "Verificada"/);
  assert.match(integrations,/Sin API verificada/);
  assert.match(integrations,/No integrada/);
  assert.doesNotMatch(integrations,/status === "connected"/);
});

test("appearance is constrained, persistent and administrator controlled",()=>{
  for(const token of ["app_appearance_settings","app_name","short_mark","logo_url","primary_color","secondary_color","typography","header_style"]) assert.match(appearanceMigration,new RegExp(token));
  assert.match(appearanceMigration,/typography in \('geist','system','rounded'\)/);
  assert.match(appearanceMigration,/header_style in \('standard','compact'\)/);
  assert.match(appearanceMigration,/private\.is_admin\(\)/);
  assert.match(appearanceMigration,/enable row level security/);
  assert.doesNotMatch(appearanceMigration,/dark|css_text|custom_css/i);
  assert.match(appearance,/from\("app_appearance_settings"\)/);
  assert.match(appearanceRuntime,/--purple/);
  assert.match(appearanceRuntime,/--cya-font-family/);
  assert.match(accountMenu,/P31AppearanceRuntime/);
});

test("manual communication channels never impersonate a verified API",()=>{
  assert.match(integrations,/WhatsApp/);
  assert.match(integrations,/envío manual/);
  assert.match(integrations,/Email/);
  assert.match(integrations,/cliente del usuario/);
  assert.match(integrations,/Meta/);
  assert.match(integrations,/No integrada/);
});
