import { expect, type Page } from "@playwright/test";

export type VisualExperience = "Profesor" | "Alumno" | "Administrador";
export type StudentEntryState = "ONBOARDING_REQUIRED" | "PORTAL_READY";
type QaRole = "teacher" | "student" | "student_onboarding" | "admin";
type LoginOptions = { expectedStudentState?: StudentEntryState };
export type LoginResult = { auth: "AUTHENTICATED"; studentEntry?: StudentEntryState };

function credentials(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

async function openAccountMenu(page: Page) {
  const root = page.locator("[data-cya-account-menu]:visible").first();
  await expect(root).toBeVisible({ timeout: 20_000 });
  const menu = root.getByRole("menu", { name: "Cuenta CYA" });
  if (await menu.isVisible().catch(() => false)) return menu;
  await root.getByRole("button", { name: "Abrir cuenta y preferencias", exact: true }).click();
  await expect(menu).toBeVisible({ timeout: 10_000 });
  return menu;
}

function targetShell(page: Page, experience: VisualExperience) {
  if (experience === "Alumno") return page.locator('nav[aria-label="Portal CYA"]:visible').first();
  if (experience === "Profesor") return page.locator('nav.mobile-nav[aria-label="Navegación principal"]:visible, nav[aria-label="Módulos principales"]:visible').first();
  return page.locator('[data-cya-account-menu][data-experience="admin"]:visible').first();
}

async function waitForStudentEntryState(page: Page, timeout = 8_000): Promise<StudentEntryState> {
  const portal = targetShell(page, "Alumno");
  const onboarding = page.getByRole("heading", { name: "Completa tus datos personales", exact: true });
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await onboarding.isVisible().catch(() => false)) return "ONBOARDING_REQUIRED";
    if (await portal.isVisible().catch(() => false)) return "PORTAL_READY";
    await page.waitForTimeout(100);
  }

  throw new Error("Authenticated student reached neither onboarding nor Portal CYA within the QA state-detection window.");
}

function expectedStudentState(role: QaRole, options?: LoginOptions): StudentEntryState {
  return options?.expectedStudentState ?? (role === "student_onboarding" ? "ONBOARDING_REQUIRED" : "PORTAL_READY");
}

function assertStudentState(actual: StudentEntryState, expected: StudentEntryState) {
  if (actual === expected) return;
  if (expected === "PORTAL_READY") {
    throw new Error("QA fixture expected portal-ready student but onboarding is required.");
  }
  throw new Error("QA onboarding-required fixture unexpectedly reached Portal CYA before completing onboarding.");
}

export async function loginAs(
  page: Page,
  role: QaRole,
  experience: VisualExperience,
  options?: LoginOptions,
): Promise<LoginResult> {
  const { email, password } = credentials(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"]');

  const loginVisible = await emailInput.waitFor({ state: "visible", timeout: 12_000 }).then(() => true).catch(() => false);
  if (loginVisible) {
    await emailInput.fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await expect(emailInput).toBeHidden({ timeout: 20_000 });
  }

  const studentNative = (role === "student" || role === "student_onboarding") && experience === "Alumno";
  const nativeExperience = studentNative ||
    (role === "teacher" && experience === "Profesor") ||
    (role === "admin" && experience === "Administrador");
  const shell = targetShell(page, experience);

  if (studentNative) {
    const state = await waitForStudentEntryState(page);
    assertStudentState(state, expectedStudentState(role, options));
    return { auth: "AUTHENTICATED", studentEntry: state };
  }

  if (nativeExperience) {
    await expect(shell).toBeVisible({ timeout: 20_000 });
    return { auth: "AUTHENTICATED" };
  }

  if (await shell.isVisible({ timeout: 4_000 }).catch(() => false)) {
    return { auth: "AUTHENTICATED" };
  }

  const menu = await openAccountMenu(page);
  const switchButton = menu.getByRole("button", { name: new RegExp(`^${experience}(?:,|\\.)`) });
  await expect(switchButton).toBeVisible({ timeout: 10_000 });
  await switchButton.click();
  await expect(shell).toBeVisible({ timeout: 20_000 });
  return { auth: "AUTHENTICATED" };
}
