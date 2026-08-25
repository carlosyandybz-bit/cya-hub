import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const bootstrapPath = resolve(here, "../../supabase/functions/cya-qa-bootstrap/index.ts");
const source = readFileSync(bootstrapPath, "utf8");

test("bootstrap declares separate portal-ready and onboarding-required student contracts", () => {
  assert.match(source, /name: "qa-student-onboarded"/);
  assert.match(source, /expectedState: "PORTAL_READY"/);
  assert.match(source, /name: "qa-student-onboarding-required"/);
  assert.match(source, /expectedState: "ONBOARDING_REQUIRED"/);
  assert.match(source, /credentialKey: "student_onboarding"/);
});

test("bootstrap deterministically materializes and resets the product-required profile fields", () => {
  const readyAssignments = [
    /first_name = \$\{fixture\.studentProfile\.firstName\}/,
    /last_name = \$\{fixture\.studentProfile\.lastName\}/,
    /phone = \$\{fixture\.studentProfile\.phone\}/,
    /country_code = \$\{fixture\.studentProfile\.countryCode\}/,
  ];
  const resetAssignments = [
    /first_name = null/,
    /last_name = null/,
    /phone = null/,
    /country_code = null/,
  ];
  for (const pattern of [...readyAssignments, ...resetAssignments]) assert.match(source, pattern);
});

test("bootstrap readiness comes from the canonical product RPC rather than navigation state", () => {
  assert.match(source, /select public\.registration_profile_status\(\) as status/);
  assert.match(source, /source: "public\.registration_profile_status"/);
  assert.doesNotMatch(source, /Portal CYA/);
  assert.doesNotMatch(source, /nav\[aria-label/);
});

test("bootstrap contains no QA product bypass contract", () => {
  assert.doesNotMatch(source, /bypassOnboarding/i);
  assert.doesNotMatch(source, /qaEmail/i);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
