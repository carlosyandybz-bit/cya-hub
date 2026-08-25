export const REQUIRED_REGISTRATION_FIELDS = ["first_name", "last_name", "phone", "country_code"];

function missingList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

export function assertQaFixtureReadiness(readiness) {
  const portal = readiness?.student;
  const onboarding = readiness?.student_onboarding;

  if (!portal || portal.contract !== "qa-student-onboarded") {
    throw new Error("QA portal-ready student readiness contract is missing.");
  }
  if (portal.source !== "public.registration_profile_status") {
    throw new Error("QA portal-ready readiness must come from public.registration_profile_status.");
  }
  if (portal.portalReady !== true || portal.state !== "PORTAL_READY") {
    const missing = missingList(portal.missing);
    const suffix = missing.length ? ` Missing: ${missing.join(", ")}.` : "";
    throw new Error(`QA fixture expected portal-ready student but onboarding is required.${suffix}`);
  }

  if (!onboarding || onboarding.contract !== "qa-student-onboarding-required") {
    throw new Error("QA onboarding-required student readiness contract is missing.");
  }
  if (onboarding.source !== "public.registration_profile_status") {
    throw new Error("QA onboarding-required readiness must come from public.registration_profile_status.");
  }
  if (onboarding.portalReady !== false || onboarding.state !== "ONBOARDING_REQUIRED") {
    throw new Error("QA onboarding-required fixture unexpectedly became portal-ready.");
  }

  const onboardingMissing = missingList(onboarding.missing);
  const notReset = REQUIRED_REGISTRATION_FIELDS.filter((field) => !onboardingMissing.includes(field));
  if (notReset.length) {
    throw new Error(`QA onboarding-required fixture did not reset required profile fields: ${notReset.join(", ")}.`);
  }

  return {
    portalReady: true,
    onboardingRequired: true,
    portalMissing: missingList(portal.missing),
    onboardingMissing,
  };
}
