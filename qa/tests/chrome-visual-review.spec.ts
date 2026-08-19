import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./visual-auth";

const REQUIRED_MOBILE_WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430] as const;
const APPROVED_COMPACT_DISCLOSURES = new Set([
  "Más opciones de clase",
  "Abrir apartados de Mi formación",
]);

async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });
}

async function attach(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function assertContained(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertTouchTargets(nav: ReturnType<Page["locator"]>) {
  for (const button of await nav.locator("button:visible").all()) {
    const label = (await button.getAttribute("aria-label")) ?? (await button.innerText()).trim();
    const box = await button.boundingBox();
    if (APPROVED_COMPACT_DISCLOSURES.has(label)) {
      expect(box?.width ?? 0, `${label} must remain the approved compact v50 disclosure`).toBeGreaterThanOrEqual(19);
      expect(box?.height ?? 0, `${label} must remain vertically usable`).toBeGreaterThanOrEqual(62);
      continue;
    }
    expect(box?.width ?? 0, `${label} must remain at least 44px wide`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${label} must remain at least 44px high`).toBeGreaterThanOrEqual(44);
  }
}

async function assertViewportCentered(page: Page, button: ReturnType<Page["locator"]>) {
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  const center = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(Math.abs(center - viewportWidth / 2)).toBeLessThanOrEqual(2);
}

for (const width of REQUIRED_MOBILE_WIDTHS) {
  test(`CYA dual-action mobile chrome visual review ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });

    await loginAs(page, "teacher", "Profesor");
    const teacherNav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
    await expect(teacherNav).toBeVisible({ timeout: 20_000 });
    const teacherMain = teacherNav.locator('button[data-nav-item="live"]');
    const teacherToggle = teacherNav.getByRole("button", { name: "Más opciones de clase" });
    await expect(teacherMain).toBeVisible();
    await expect(teacherToggle).toBeVisible();
    await assertViewportCentered(page, teacherMain);
    await assertTouchTargets(teacherNav);
    await assertContained(page);
    await attach(page, testInfo, `professor-dual-action-${width}`);

    await resetSession(page);
    await loginAs(page, "student", "Alumno");
    const studentNav = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(studentNav).toBeVisible({ timeout: 20_000 });
    const studentMain = studentNav.getByRole("button", { name: "Mi formación", exact: true });
    const studentToggle = studentNav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await expect(studentMain).toBeVisible();
    await expect(studentToggle).toBeVisible();
    await assertViewportCentered(page, studentMain);
    await assertTouchTargets(studentNav);
    await assertContained(page);
    await attach(page, testInfo, `student-dual-action-${width}`);
  });
}
