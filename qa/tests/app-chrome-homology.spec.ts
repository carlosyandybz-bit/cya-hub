import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./visual-auth";

async function metrics(page: Page, mode: "teacher" | "student") {
  return page.evaluate((currentMode) => {
    const nav = currentMode === "teacher"
      ? document.querySelector<HTMLElement>('nav.mobile-nav[aria-label="Navegación principal"]')
      : document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
    const header = currentMode === "teacher"
      ? document.querySelector<HTMLElement>('.shell .mobile-head')
      : document.querySelector<HTMLElement>('body:has(nav[aria-label="Portal CYA"]) header');
    if (!nav || !header) throw new Error(`Missing ${currentMode} chrome`);
    const nr = nav.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const ns = getComputedStyle(nav);
    const hs = getComputedStyle(header);
    return {
      navHeight: nr.height,
      headerHeight: hr.height,
      navBackground: ns.backgroundImage || ns.backgroundColor,
      navBorderRadius: ns.borderTopLeftRadius,
      headerBackground: hs.backgroundImage || hs.backgroundColor,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
    };
  }, mode);
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

test.describe("professor and student canonical app chrome", () => {
  test("mobile headers and bottom docks are homologous", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await loginAs(page, "teacher", "Profesor");
    await expect(page.locator('nav.mobile-nav[aria-label="Navegación principal"]')).toBeVisible({ timeout: 20_000 });
    const teacher = await metrics(page, "teacher");
    await attachViewport(page, testInfo, "professor-chrome-390");

    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());

    await loginAs(page, "student", "Alumno");
    await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
    const student = await metrics(page, "student");
    await attachViewport(page, testInfo, "student-chrome-390");

    expect(Math.abs(teacher.navHeight - student.navHeight)).toBeLessThanOrEqual(4);
    expect(Math.abs(teacher.headerHeight - student.headerHeight)).toBeLessThanOrEqual(4);
    expect(teacher.navBorderRadius).toBe(student.navBorderRadius);
    expect(teacher.overflowX).toBeLessThanOrEqual(1);
    expect(student.overflowX).toBeLessThanOrEqual(1);
  });
});
