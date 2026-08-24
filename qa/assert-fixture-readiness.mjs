import { assertQaFixtureReadiness } from "./fixture-readiness.mjs";

const raw = process.env.QA_FIXTURE_READINESS_JSON;
if (!raw) throw new Error("QA fixture readiness payload is missing before Playwright.");

let readiness;
try {
  readiness = JSON.parse(raw);
} catch {
  throw new Error("QA fixture readiness payload is not valid JSON.");
}

const result = assertQaFixtureReadiness(readiness);
console.log(`QA fixture readiness PASS: portal-ready=${result.portalReady}; onboarding-required=${result.onboardingRequired}`);
