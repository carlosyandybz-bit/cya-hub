import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function metrics(page: Page, mode: "teacher" | "student") {
  return page.evaluate((currentMode) => {
    const nav = currentMode === "teacher"
      ? document.querySelector<HTMLElement>('nav.mobile-nav[aria-label="Navegación principal"]')
      : document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
    const header = currentMode === "teacher"
      ? document.querySelector<HTMLElement>('.shell .mobile-head')
      : document.querySelector<HTMLElement>('body header');
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

test.describe("professor and student canonical app chrome", () => {
  test("mobile headers and bottom docks are homologous", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const teacherEmail = process.env.QA_TEACHER_EMAIL;
    const teacherPassword = process.env.QA_TEACHER_PASSWORD;
    const studentEmail = process.env.QA_STUDENT_EMAIL;
    const studentPassword = process.env.QA_STUDENT_PASSWORD;
    if (!teacherEmail || !teacherPassword || !studentEmail || !studentPassword) {
      throw new Error("QA teacher/student credentials are missing");
    }

    await login(page, teacherEmail, teacherPassword);
    const teacher = await metrics(page, "teacher");

    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await login(page, studentEmail, studentPassword);
    const student = await metrics(page, "student");

    expect(Math.abs(teacher.navHeight - student.navHeight)).toBeLessThanOrEqual(4);
    expect(Math.abs(teacher.headerHeight - student.headerHeight)).toBeLessThanOrEqual(4);
    expect(teacher.navBorderRadius).toBe(student.navBorderRadius);
    expect(teacher.navBackground).toContain("gradient");
    expect(student.navBackground).toContain("gradient");
    expect(teacher.headerBackground).toContain("gradient");
    expect(student.headerBackground).toContain("gradient");
    expect(teacher.overflowX).toBeLessThanOrEqual(1);
    expect(student.overflowX).toBeLessThanOrEqual(1);
  });
});
