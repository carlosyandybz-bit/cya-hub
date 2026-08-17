import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./visual-auth";

async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function attach(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function assertContained(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 430, 768]) {
  test(`CYA mobile chrome visual review ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });

    await loginAs(page, "teacher", "Profesor");
    const teacherNav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
    await expect(teacherNav).toBeVisible({ timeout: 20_000 });
    const darClase = teacherNav.locator('button[data-nav-item="live"]');
    const more = teacherNav.getByRole("button", { name: "Más opciones de clase" });
    await expect(darClase).toBeVisible();
    await expect(more).toBeVisible();
    for (const button of await teacherNav.locator("button:visible").all()) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await assertContained(page);
    await attach(page, testInfo, `professor-${width}`);

    await resetSession(page);
    await loginAs(page, "student", "Alumno");
    const studentNav = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(studentNav).toBeVisible({ timeout: 20_000 });
    await expect(studentNav.getByRole("button", { name: "Mi formación", exact: true })).toBeVisible();
    await expect(studentNav.getByRole("button", { name: "Abrir apartados de Mi formación" })).toBeVisible();
    for (const button of await studentNav.locator("button:visible").all()) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await assertContained(page);
    await attach(page, testInfo, `student-${width}`);
  });
}
