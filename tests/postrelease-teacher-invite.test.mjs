import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const teacherInviteFunction=readFileSync("supabase/functions/teacher-invite/index.ts","utf8");
const teacherMigration=readFileSync("db/migrations/v75_p19_auth_contact_email_semantics.sql","utf8");
const teacherOnboarding=readFileSync("app/admin-teacher-onboarding.tsx","utf8");

test("teacher invite validates the real caller before constructing the privileged Auth client",()=>{
  const preflight=teacherInviteFunction.indexOf('caller.rpc("admin_teacher_invite_preflight"');
  const privilegedClient=teacherInviteFunction.indexOf('createClient(supabaseUrl, secretKeyFromEnvironment()');
  assert.ok(preflight>=0,"admin preflight is present");
  assert.ok(privilegedClient>preflight,"secret client is created only after admin preflight");
});

test("new Auth invitations are compensated if canonical teacher finalization fails",()=>{
  assert.match(
    teacherInviteFunction,
    /if \(finalize\.error\) \{[\s\S]*if \(invitationSent\) \{[\s\S]*admin\.auth\.admin\.deleteUser\(user\.id\)/,
  );
  assert.match(teacherInviteFunction,/teacher-invite auth rollback failed/);
});

test("linked people may keep a contact email distinct from their Auth login",()=>{
  assert.match(teacherMigration,/from auth\.users u[\s\S]*private\.normalize_person_email\(u\.email\)=v_email/);
  assert.match(teacherMigration,/where p\.active and p\.auth_user_id=v_existing_auth_user_id/);
  assert.match(teacherMigration,/if v_person\.auth_user_id is not null then[\s\S]*v_linked_auth_email is distinct from v_email/);
  assert.match(teacherMigration,/where p\.active and p\.auth_user_id=p_auth_user_id/);
  assert.match(teacherMigration,/email=coalesce\(email,v_email\)/);
});

test("unlinked phone-only identity matches with another contact email remain blocked",()=>{
  assert.match(
    teacherMigration,
    /elsif private\.normalize_person_email\(v_person\.email\) is not null[\s\S]*private\.normalize_person_email\(v_person\.email\) is distinct from v_email/,
  );
  assert.match(
    teacherMigration,
    /if v_person\.auth_user_id is null[\s\S]*private\.normalize_person_email\(v_person\.email\) is distinct from v_email/,
  );
  assert.match(teacherMigration,/La ficha encontrada por teléfono ya tiene otro email/);
});

test("teacher onboarding keeps the form element stable across async work",()=>{
  assert.match(teacherOnboarding,/const formElement = event\.currentTarget;/);
  assert.match(teacherOnboarding,/new FormData\(formElement\)/);
  assert.match(teacherOnboarding,/formElement\.reset\(\)/);
  assert.doesNotMatch(teacherOnboarding,/event\.currentTarget\.reset\(\)/);
});
