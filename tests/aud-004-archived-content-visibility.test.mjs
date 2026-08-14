import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const migration = read("db/migrations/v85_aud004_archived_teaching_visibility.sql");
const studentVisibility = read("supabase/v38-student-training-visibility.sql");

test("AUD-004 normalizes historical archived teaching content to staff visibility", () => {
  assert.match(migration, /update public\.teaching_contents[\s\S]*set visibility='staff'[\s\S]*where not active[\s\S]*publication_status='archived'/);
});

test("AUD-004 archive RPC atomically removes student visibility", () => {
  assert.match(migration, /create or replace function public\.archive_teaching_content/);
  assert.match(migration, /set active=false,[\s\S]*publication_status='archived',[\s\S]*visibility='staff'/);
  assert.match(migration, /assignment_status not in \('corrected','explained','completed'\)/);
});

test("AUD-004 enforces the teaching lifecycle invariant at table level", () => {
  assert.match(migration, /teaching_contents_lifecycle_visibility_check/);
  assert.match(migration, /active and publication_status in \('draft','published'\)/);
  assert.match(migration, /not active and publication_status='archived' and visibility='staff'/);
});

test("AUD-004 preserves defense in depth on student reads", () => {
  const required = [
    /tc\.active/,
    /tc\.publication_status='published'/,
    /tc\.visibility='student'/,
    /t\.active/,
    /t\.publication_status='published'/,
    /t\.visibility='student'/,
  ];
  for (const expression of required) assert.match(studentVisibility, expression);
});
