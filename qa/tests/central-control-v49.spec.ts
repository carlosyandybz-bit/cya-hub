import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { loginAs } from "./visual-auth";

type Geometry = {
  primary: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  secondary: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  nav: { left: number; right: number; width: number; centerX: number };
  viewportWidth: number;
};

const REQUIRED_MOBILE_WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430] as const;

async function professorGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const primary = document.querySelector<HTMLElement>('.mobile-nav button[data-nav-item="live"]');
    const secondary = document.querySelector<HTMLElement>('.mobile-nav .mobile-nav-secondary');
    const nav = document.querySelector<HTMLElement>('nav.mobile-nav[aria-label="Navegación principal"]');
    if (!primary || !secondary || !nav) throw new Error("Professor central controls are missing");
    const a = primary.getBoundingClientRect(); const b = secondary.getBoundingClientRect(); const n = nav.getBoundingClientRect();
    return {
      primary: { left:a.left,right:a.right,top:a.top,bottom:a.bottom,width:a.width,height:a.height },
      secondary: { left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height },
      nav: { left:n.left,right:n.right,width:n.width,centerX:n.left+n.width/2 }, viewportWidth: window.innerWidth,
    };
  });
}

async function studentGeometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
    const primary = nav?.querySelector<HTMLElement>('[class*="formationMain"]');
    const secondary = nav?.querySelector<HTMLElement>('button[aria-label="Abrir apartados de Mi formación"]');
    if (!primary || !secondary || !nav) throw new Error("Student central controls are missing");
    const a = primary.getBoundingClientRect(); const b = secondary.getBoundingClientRect(); const n = nav.getBoundingClientRect();
    return {
      primary: { left:a.left,right:a.right,top:a.top,bottom:a.bottom,width:a.width,height:a.height },
      secondary: { left:b.left,right:b.right,top:b.top,bottom:b.bottom,width:b.width,height:b.height },
      nav: { left:n.left,right:n.right,width:n.width,centerX:n.left+n.width/2 }, viewportWidth: window.innerWidth,
    };
  });
}

function assertIntegratedSplit(geometry: Geometry) {
  const primaryCenter = (geometry.primary.left + geometry.primary.right) / 2;
  expect(Math.abs(primaryCenter - geometry.nav.centerX)).toBeLessThanOrEqual(4);
  expect(Math.abs(geometry.primary.top - geometry.secondary.top)).toBeLessThanOrEqual(2);
  expect(Math.abs(geometry.primary.bottom - geometry.secondary.bottom)).toBeLessThanOrEqual(2);
  expect(geometry.primary.height).toBeGreaterThanOrEqual(48);
  expect(geometry.secondary.width).toBeGreaterThanOrEqual(44);
  expect(geometry.secondary.height).toBeGreaterThanOrEqual(44);

  // The secondary action is intentionally an invisible 44px hit target inside
  // the right side of the same visual chassis. Its right edge must therefore
  // align with the primary edge rather than extending the visual control.
  expect(Math.abs(geometry.primary.right - geometry.secondary.right)).toBeLessThanOrEqual(2);
  expect(geometry.secondary.left).toBeGreaterThanOrEqual(geometry.primary.left);
  expect(geometry.secondary.right).toBeLessThanOrEqual(geometry.primary.right + 2);

  expect(geometry.primary.left).toBeGreaterThanOrEqual(0);
  expect(geometry.primary.right).toBeLessThanOrEqual(geometry.viewportWidth);
}

async function attach(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
}

async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

test.describe("canonical CYA integrated split control", () => {
  for (const width of REQUIRED_MOBILE_WIDTHS) {
    test(`Professor and student central controls stay homologous at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });

      await loginAs(page, "teacher", "Profesor");
      const professorNav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
      await expect(professorNav).toBeVisible({ timeout: 20_000 });
      const professorPrimary = professorNav.locator('button[data-nav-item="live"]');
      const professorSecondary = professorNav.getByRole("button", { name: "Más opciones de clase" });
      await expect(professorPrimary).toBeVisible(); await expect(professorSecondary).toBeVisible();
      const professor = await professorGeometry(page);
      assertIntegratedSplit(professor);
      await attach(page, testInfo, `central-control-professor-${width}`);

      await resetSession(page);
      await loginAs(page, "student", "Alumno");
      const studentNav = page.getByRole("navigation", { name: "Portal CYA" });
      await expect(studentNav).toBeVisible({ timeout: 20_000 });
      const studentPrimary = studentNav.getByRole("button", { name: "Mi formación", exact: true });
      const studentSecondary = studentNav.getByRole("button", { name: "Abrir apartados de Mi formación", exact: true });
      await expect(studentPrimary).toBeVisible(); await expect(studentSecondary).toBeVisible();
      const student = await studentGeometry(page);
      assertIntegratedSplit(student);
      await attach(page, testInfo, `central-control-student-${width}`);

      expect(Math.abs(professor.primary.height - student.primary.height)).toBeLessThanOrEqual(2);
      expect(Math.abs(professor.secondary.width - student.secondary.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(professor.secondary.height - student.secondary.height)).toBeLessThanOrEqual(2);

      await studentSecondary.click();
      await expect(studentSecondary).toHaveAttribute("aria-expanded", "true");
    });
  }
});
