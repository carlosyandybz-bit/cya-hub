import assert from "node:assert/strict";
import test from "node:test";
import { assertQaFixtureReadiness, REQUIRED_REGISTRATION_FIELDS } from "../fixture-readiness.mjs";

function validReadiness() {
  return {
    student: {
      contract: "qa-student-onboarded",
      expectedState: "PORTAL_READY",
      state: "PORTAL_READY",
      portalReady: true,
      missing: [],
      source: "public.registration_profile_status",
    },
    student_onboarding: {
      contract: "qa-student-onboarding-required",
      expectedState: "ONBOARDING_REQUIRED",
      state: "ONBOARDING_REQUIRED",
      portalReady: false,
      missing: [...REQUIRED_REGISTRATION_FIELDS],
      source: "public.registration_profile_status",
    },
  };
}

test("portal-ready and onboarding-required fixtures satisfy distinct contracts", () => {
  const result = assertQaFixtureReadiness(validReadiness());
  assert.equal(result.portalReady, true);
  assert.equal(result.onboardingRequired, true);
});

test("declared portal-ready fixture fails immediately when onboarding is required", () => {
  const readiness = validReadiness();
  readiness.student.portalReady = false;
  readiness.student.state = "ONBOARDING_REQUIRED";
  readiness.student.missing = ["phone"];

  assert.throws(
    () => assertQaFixtureReadiness(readiness),
    /QA fixture expected portal-ready student but onboarding is required\. Missing: phone\./,
  );
});

test("onboarding-required fixture must reset every current registration field", () => {
  const readiness = validReadiness();
  readiness.student_onboarding.missing = ["first_name", "last_name", "phone"];

  assert.throws(
    () => assertQaFixtureReadiness(readiness),
    /did not reset required profile fields: country_code/,
  );
});

test("readiness must be sourced from the product registration status function", () => {
  const readiness = validReadiness();
  readiness.student.source = "nav-visible";
  assert.throws(
    () => assertQaFixtureReadiness(readiness),
    /must come from public\.registration_profile_status/,
  );
});
