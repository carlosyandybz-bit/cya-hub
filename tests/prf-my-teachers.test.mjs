import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("db/migrations/v89_prf_student_teacher_profiles.sql", "utf8");
const accountMenu = readFileSync("app/account-menu.tsx", "utf8");

test("My teachers derives the authenticated student relationship from canonical classes", () => {
  assert.match(migration, /create or replace function public\.student_teacher_profiles\(\)/i);
  assert.match(migration, /p\.auth_user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /join public\.class_participants cp/i);
  assert.match(migration, /join public\.classes c/i);
  assert.match(migration, /c\.status\s*<>\s*'cancelled'/i);
  assert.match(migration, /join public\.teacher_profiles tp/i);
  assert.doesNotMatch(migration, /p_person_id|p_student_id|p_user_id/i);
});

test("My teachers SECURITY DEFINER cannot be called anonymously or for another student", () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path\s*=\s*''/i);
  assert.match(migration, /revoke all on function public\.student_teacher_profiles\(\) from public, anon, authenticated;/i);
  assert.match(migration, /grant execute on function public\.student_teacher_profiles\(\) to authenticated;/i);
  assert.doesNotMatch(migration, /grant execute[^;]*\b(?:anon|public)\b/i);
});

test("Account exposes My teachers only to study-capable identities and calls the scoped RPC", () => {
  assert.match(accountMenu, /identity\.can_study\s*\?\s*<button/);
  assert.match(accountMenu, /<strong>Mis profesores<\/strong>/);
  assert.match(accountMenu, /client\.rpc\("student_teacher_profiles"\)/);
  assert.match(accountMenu, /Solo mostramos profesores vinculados a tus clases/);
  assert.doesNotMatch(accountMenu, /from\(["']teacher_profiles["']\)/);
});
