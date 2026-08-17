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

test("Playground: student brand is anchored to the real left edge", async ({ page }) => {
  await page.goto("/staging-lab/header-playground", { waitUntil: "domcontentloaded" });
  const header = page.getByTestId("student-header-playground");
  const brand = header.getByRole("button", { name: "Ir a Inicio" });
  await expect(header).toBeVisible();
  await expect(brand).toBeVisible();
  const headerBox = await header.boundingBox();
  const brandBox = await brand.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(brandBox).not.toBeNull();
  const inset = (brandBox?.x ?? 0) - (headerBox?.x ?? 0);
  expect(inset).toBeGreaterThanOrEqual(8);
  expect(inset).toBeLessThanOrEqual(12);
  await page.screenshot({ path: "test-results-visual/student-header-playground.png", fullPage: false });
});

test("Student portal: real header uses the same left-edge geometry and Progreso keeps its own heading", async ({ page }) => {
  await loginStudent(page);
  const brand = page.getByRole("button", { name: "Ir a Inicio" });
  await expect(brand).toBeVisible();
  const box = await brand.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? 999).toBeGreaterThanOrEqual(8);
  expect(box?.x ?? 999).toBeLessThanOrEqual(14);

  await page.getByRole("button", { name: /^Progreso$/ }).click();
  const progressHeading = page.getByRole("heading", { name: "En qué enfocarte ahora" });
  await expect(progressHeading).toBeVisible();
  const headingBox = await progressHeading.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox?.x ?? 999).toBeLessThan(40);
  await page.screenshot({ path: "test-results-visual/student-progress-after-header-fix.png", fullPage: false });
});
