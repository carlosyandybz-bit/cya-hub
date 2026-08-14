import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin=readFileSync("app/admin-view.tsx","utf8");
const catalogs=readFileSync("app/p31-catalog-admin-legacy.tsx","utf8");
const catalogEntry=readFileSync("app/p31-catalog-admin.tsx","utf8");
const defaults=readFileSync("app/p31-defaults-admin.tsx","utf8");
const rates=readFileSync("app/p31-rates-admin.tsx","utf8");
const integrations=readFileSync("app/p31-integrations-admin.tsx","utf8");
const driveServer=readFileSync("app/google-drive-server.ts","utf8");
const driveStatus=readFileSync("app/api/google-drive/status/route.ts","utf8");
const appearance=readFileSync("app/p31-appearance-admin.tsx","utf8");
const appearanceRuntime=readFileSync("app/p31-appearance-runtime.tsx","utf8");
const accountMenu=readFileSync("app/account-menu.tsx","utf8");
const tagMigration=readFileSync("db/migrations/v71a_p31_safe_tag_rename.sql","utf8");
const appearanceMigration=readFileSync("db/migrations/v71b_p31_appearance_settings.sql","utf8");
const defaultsMigration=readFileSync("db/migrations/v71c_p31_operational_defaults.sql","utf8");
const scheduleMigration=readFileSync("db/migrations/v71d_p31_schedule_default_location.sql","utf8");
const appearanceReadPolicyMigration=readFileSync("db/migrations/v71e_p31_appearance_read_policy.sql","utf8");
const teacherOnboarding=readFileSync("app/admin-teacher-onboarding.tsx","utf8");
const evaluationAdmin=readFileSync("app/p0f-evaluation-admin.tsx","utf8");
const teacherMigration=readFileSync("db/migrations/v74_postrelease_teacher_onboarding.sql","utf8");
const teacherInviteFunction=readFileSync("supabase/functions/teacher-invite/index.ts","utf8");

test("Administration centralizes P31 on canonical models",()=>{
  for(const token of ["P31CatalogAdmin","P31RatesAdmin","P31IntegrationsAdmin","P31AppearanceAdmin","Tarifas","Integraciones","Apariencia"]) assert.ok(admin.includes(token),token);
  assert.match(catalogs,/from\("catalog_terms"\)/);
  assert.match(catalogs,/\["location", "Ubicaciones"\]/);
  assert.match(catalogEntry,/P31DefaultsAdmin/);
  assert.match(rates,/from\("marketing_rates"\)/);
  assert.match(rates,/rpc\("save_marketing_rate"/);
});

test("catalog editing preserves stable keys and reversible active state",()=>{
  assert.match(catalogs,/term_key: termKey/);
  assert.match(catalogs,/updateTerm\(term\.id, \{ label: value \}/);
  assert.match(catalogs,/updateTerm\(term\.id, \{ active \}/);
  assert.match(rates,/p_active: active/);
});

test("teaching tag rename is administrator governed and non-destructive",()=>{
  assert.match(tagMigration,/security invoker/i);
  assert.match(tagMigration,/private\.is_admin\(\)/);
  assert.match(tagMigration,/teaching_content_tags_admin_update/);
  assert.match(tagMigration,/update public\.teaching_content_tags/);
  assert.match(tagMigration,/Ya existe una etiqueta con ese nombre/);
  assert.match(tagMigration,/audit_events/);
  assert.match(tagMigration,/authenticated/);
  assert.match(catalogs,/admin_rename_teaching_tag/);
});

test("operational default location is canonical and consumed by schedule_class",()=>{
  assert.match(defaultsMigration,/app_operational_defaults/);
  assert.match(defaultsMigration,/default_location_term_id bigint null references public\.catalog_terms\(id\)/);
  assert.match(defaultsMigration,/private\.is_staff\(\)/);
  assert.match(defaultsMigration,/private\.is_admin\(\)/);
  assert.match(defaults,/from\("catalog_terms"\)/);
  assert.match(defaults,/eq\("taxonomy", "location"\)/);
  assert.match(defaults,/from\("app_operational_defaults"\)/);
  assert.match(scheduleMigration,/resolved_location_id:=p_location_term_id/);
  assert.match(scheduleMigration,/default_location_term_id/);
  assert.match(scheduleMigration,/t\.taxonomy='location'/);
  assert.match(scheduleMigration,/p_style_term_id,resolved_location_id/);
  assert.match(scheduleMigration,/security invoker/i);
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
  assert.match(appearanceReadPolicyMigration,/alter policy app_appearance_settings_read[\s\S]*to public/i);
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

test("teacher onboarding is admin-only, canonical and multi-role",()=>{
  assert.match(teacherMigration,/admin_teacher_invite_preflight/);
  assert.match(teacherMigration,/admin_finalize_teacher_invite/);
  assert.match(teacherMigration,/private\.is_admin\(\)/);
  assert.match(teacherMigration,/private\.match_person_identity/);
  assert.match(teacherMigration,/private\.lock_person_identity/);
  assert.match(teacherMigration,/from auth\.users/);
  assert.match(teacherMigration,/values\(p_auth_user_id,'student',true,v_actor\)/);
  assert.match(teacherMigration,/values\(p_auth_user_id,'teacher',true,v_actor\)/);
  assert.match(teacherMigration,/teacher_profiles/);
  assert.match(teacherMigration,/student_profiles/);
  assert.match(teacherMigration,/teacher_onboarded/);
  assert.match(teacherMigration,/revoke all on function public\.admin_teacher_invite_preflight[\s\S]*from public, anon/);
  assert.match(teacherMigration,/revoke all on function public\.admin_finalize_teacher_invite[\s\S]*from public, anon/);
});

test("teacher invite edge function verifies the caller before privileged Auth work",()=>{
  assert.match(teacherInviteFunction,/authorization\.startsWith\("Bearer "\)/);
  assert.match(teacherInviteFunction,/admin_teacher_invite_preflight/);
  assert.match(teacherInviteFunction,/inviteUserByEmail/);
  assert.match(teacherInviteFunction,/admin_finalize_teacher_invite/);
  assert.match(teacherInviteFunction,/SUPABASE_SECRET_KEYS/);
  assert.match(teacherInviteFunction,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(teacherOnboarding,/SUPABASE_SECRET|SERVICE_ROLE/);
});

test("Administration exposes teacher onboarding and retires automatic progress controls",()=>{
  assert.match(admin,/AdminTeacherOnboarding/);
  assert.match(admin,/Añade profesores y gestiona sus accesos sin duplicar personas/);
  assert.match(teacherOnboarding,/Añadir profesor/);
  assert.match(teacherOnboarding,/functions\.invoke\("teacher-invite"/);
  assert.match(teacherOnboarding,/CountrySelect/);
  assert.doesNotMatch(evaluationAdmin,/Progreso automático/);
  assert.doesNotMatch(evaluationAdmin,/teaching_content_evaluation_points/);
  assert.doesNotMatch(evaluationAdmin,/addPointRule|removePointRule/);
  assert.match(evaluationAdmin,/Hitos de evaluación/);
});
