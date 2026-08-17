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

async function assertFourVisibleDestinations(nav: ReturnType<Page["locator"]>) {
  const visibleButtons = nav.locator("button:visible");
  await expect(visibleButtons).toHaveCount(4);
  for (const button of await visibleButtons.all()) {
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
}

test("CYA mobile chrome master visual review 390px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await loginAs(page, "teacher", "Profesor");
  const teacherNav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
  await expect(teacherNav).toBeVisible({ timeout: 20_000 });
  await expect(teacherNav.locator('button[data-nav-item="live"]')).toBeHidden();
  await expect(teacherNav.getByRole("button", { name: "Más opciones de clase" })).toBeHidden();
  await assertFourVisibleDestinations(teacherNav);
  await assertContained(page);
  await attach(page, testInfo, "professor-390-master");

  await resetSession(page);
  await loginAs(page, "student", "Alumno");
  const studentNav = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(studentNav).toBeVisible({ timeout: 20_000 });
  await expect(studentNav.getByRole("button", { name: "Mi formación", exact: true })).toBeHidden();
  await expect(studentNav.getByRole("button", { name: "Abrir apartados de Mi formación" })).toBeHidden();
  await assertFourVisibleDestinations(studentNav);
  await assertContained(page);
  await attach(page, testInfo, "student-390-master");
});
