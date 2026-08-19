import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./visual-auth";

const WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430] as const;
const MAX_CHROME_FOOTPRINT_PX = 104;

async function resetSession(page: Page) {
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
}

async function footprint(page: Page, navSelector: string, centralSelector: string) {
  return page.evaluate(({ navSelector, centralSelector }) => {
    const nav = document.querySelector<HTMLElement>(navSelector);
    const central = document.querySelector<HTMLElement>(centralSelector);
    if (!nav || !central) throw new Error(`Missing bottom chrome: ${navSelector} / ${centralSelector}`);
    const n = nav.getBoundingClientRect();
    const c = central.getBoundingClientRect();
    const top = Math.min(n.top, c.top);
    const bottom = Math.max(n.bottom, c.bottom);
    return {
      top,
      bottom,
      footprint: bottom - top,
      viewportHeight: innerHeight,
      viewportShare: (bottom - top) / innerHeight,
      navHeight: n.height,
      centralHeight: c.height,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, { navSelector, centralSelector });
}

for (const width of WIDTHS) {
  test(`UX-007/012 bottom chrome remains compact at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });

    await loginAs(page, "teacher", "Profesor");
    const professor = await footprint(
      page,
      'nav.mobile-nav[aria-label="Navegación principal"]',
      '.mobile-nav button[data-nav-item="live"]',
    );
    expect(professor.footprint, "Professor bottom chrome must stay within the approved compact vertical budget").toBeLessThanOrEqual(MAX_CHROME_FOOTPRINT_PX);
    expect(professor.viewportShare, "Professor bottom chrome must not consume more than 13% of an 844px viewport").toBeLessThanOrEqual(0.13);
    expect(professor.horizontalOverflow).toBeLessThanOrEqual(1);

    await testInfo.attach(`ux05-professor-${width}-geometry`, {
      body: Buffer.from(JSON.stringify(professor, null, 2)),
      contentType: "application/json",
    });
    if ([320, 390, 430].includes(width)) {
      await testInfo.attach(`ux05-professor-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }

    await resetSession(page);
    await loginAs(page, "student", "Alumno");
    const student = await footprint(
      page,
      'nav[aria-label="Portal CYA"]',
      'nav[aria-label="Portal CYA"] [class*="formationMain"]',
    );
    expect(student.footprint, "Student bottom chrome must stay within the approved compact vertical budget").toBeLessThanOrEqual(MAX_CHROME_FOOTPRINT_PX);
    expect(student.viewportShare, "Student bottom chrome must not consume more than 13% of an 844px viewport").toBeLessThanOrEqual(0.13);
    expect(student.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(Math.abs(student.footprint - professor.footprint), "Professor and student chrome should occupy equivalent vertical space").toBeLessThanOrEqual(4);

    await testInfo.attach(`ux05-student-${width}-geometry`, {
      body: Buffer.from(JSON.stringify(student, null, 2)),
      contentType: "application/json",
    });
    if ([320, 390, 430].includes(width)) {
      await testInfo.attach(`ux05-student-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
  });
}
