import { expect, test, type Page } from "@playwright/test";

async function loginStudent(page: Page) {
  const email = process.env.QA_STUDENT_EMAIL;
  const password = process.env.QA_STUDENT_PASSWORD;
  if (!email || !password) throw new Error("QA student credentials are not configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

test("PR-F Misiones exposes the four canonical groups without mobile overflow", async ({ page }) => {
  await loginStudent(page);
  await page.getByRole("button", { name: /^Misiones$/ }).click();
  await expect(page.getByRole("heading", { name: "Prioritarias" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Para cuando te venga bien" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lo que ya has empezado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lo que ya has hecho" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
