import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const teacherInviteFunction=readFileSync("supabase/functions/teacher-invite/index.ts","utf8");

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
