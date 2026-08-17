import { expect, type Page } from "@playwright/test";

export type VisualExperience = "Profesor" | "Alumno" | "Administrador";
type QaRole = "teacher" | "student" | "admin";

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

export async function loginAs(page: Page, role: QaRole, experience: VisualExperience) {
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

  const nativeExperience = (role === "student" && experience === "Alumno") ||
    (role === "teacher" && experience === "Profesor") ||
    (role === "admin" && experience === "Administrador");
  const shell = targetShell(page, experience);

  if (nativeExperience) {
    await expect(shell).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (await shell.isVisible({ timeout: 4_000 }).catch(() => false)) return;

  const menu = await openAccountMenu(page);
  const switchButton = menu.getByRole("button", { name: new RegExp(`^${experience}(?:,|\\.)`) });
  await expect(switchButton).toBeVisible({ timeout: 10_000 });
  await switchButton.click();
  await expect(shell).toBeVisible({ timeout: 20_000 });
}
