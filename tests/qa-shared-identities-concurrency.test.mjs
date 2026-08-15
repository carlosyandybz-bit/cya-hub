import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/cya-qa-e2e.yml", "utf8");
const bootstrap = readFileSync("supabase/functions/cya-qa-bootstrap/index.ts", "utf8");

test("browser QA serializes runs because bootstrap rotates shared identity passwords", () => {
  assert.match(bootstrap, /email:\s*"carlosyandybz\+qa-teacher@gmail\.com"/);
  assert.match(bootstrap, /email:\s*"carlosyandybz\+qa-student@gmail\.com"/);
  assert.match(bootstrap, /email:\s*"carlosyandybz\+qa-admin@gmail\.com"/);
  assert.match(bootstrap, /const password = makePassword\(\)/);
  assert.match(workflow, /group:\s*cya-qa-shared-identities/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(workflow, /group:\s*cya-qa-\$\{\{\s*github\.workflow/);
});
