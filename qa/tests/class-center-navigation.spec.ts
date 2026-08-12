import { expect, test, type Page } from "@playwright/test";
import { isolateInitialEvaluationGateForUnrelatedQa } from "./known-audit-isolation";

type QaRole = "teacher";

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = credentialsFor("teacher");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

test("Dar clase opens as a navigable class center before a class is active", async ({ page }) => {
  // CYA-AUD-013/P0E is deliberately isolated here: this test validates class-center chrome, not baseline evaluation.
  await isolateInitialEvaluationGateForUnrelatedQa(page);
  await login(page);

  const darClase = page.locator("nav button:visible").filter({ hasText: /^Dar clase$/ }).first();
  await expect(darClase).toBeVisible();
  await darClase.click();
  await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible({ timeout: 20_000 });

  if ((page.viewportSize()?.width ?? 9999) <= 720) {
    const mobileNav = page.locator(".mobile-nav");
    await expect(mobileNav).toBeVisible();
    for (const label of ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]) {
      await expect(mobileNav.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeVisible();
    }
  } else {
    const sidebar = page.locator(".sidebar nav");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole("button", { name: /^Dar clase$/ })).toBeVisible();
  }
});
