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

test("PR-F Progreso exposes the complete evidence-backed hierarchy without mobile overflow", async ({ page }) => {
  await loginStudent(page);
  await page.getByRole("button", { name: /^Progreso$/ }).click();
  await expect(page.getByRole("heading", { name: "En qué enfocarte ahora" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Última foto de tu progreso" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Qué ha mejorado" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cómo ha ido cambiando" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pasos que ya forman parte de tu camino" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mis vídeos" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
});
