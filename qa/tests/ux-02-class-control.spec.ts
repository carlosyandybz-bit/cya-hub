import { expect, test, type Page } from "@playwright/test";

async function loginTeacher(page: Page) {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  test.skip(!email || !password, "teacher QA credentials are not configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".mobile-nav")).toBeVisible({ timeout: 20_000 });
}

const widths = [320, 360, 375, 390, 393, 402, 414, 430];

for (const width of widths) {
  test(`UX-02 professor class control is canonical at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginTeacher(page);

    const nav = page.locator(".mobile-nav");
    const primary = nav.locator('button[data-nav-item="live"]');
    const secondary = nav.getByRole("button", { name: "Más opciones de clase" });

    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    await expect(secondary.getByText("Más", { exact: true })).toBeVisible();
    await expect(secondary.locator("svg")).toBeVisible();

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>(".mobile-nav")!;
      const primary = nav.querySelector<HTMLElement>('button[data-nav-item="live"]')!;
      const secondary = nav.querySelector<HTMLElement>(".mobile-nav-secondary")!;
      const p = primary.getBoundingClientRect();
      const s = secondary.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return {
        nav: { left: n.left, right: n.right, width: n.width },
        primary: { left: p.left, right: p.right, top: p.top, bottom: p.bottom, width: p.width, height: p.height, centerX: p.left + p.width / 2 },
        secondary: { left: s.left, right: s.right, top: s.top, bottom: s.bottom, width: s.width, height: s.height, centerX: s.left + s.width / 2 },
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    });

    expect(geometry.primary.width).toBeGreaterThanOrEqual(72);
    expect(geometry.primary.height).toBeGreaterThanOrEqual(72);
    expect(geometry.secondary.width).toBeGreaterThanOrEqual(58);
    expect(geometry.secondary.height).toBeGreaterThanOrEqual(48);
    expect(Math.abs(geometry.primary.centerX - geometry.secondary.centerX), "Más must share the Dar clase axis").toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.primary.centerX - width / 2), "Dar clase must remain centered in viewport").toBeLessThanOrEqual(2);
    expect(geometry.secondary.left).toBeGreaterThanOrEqual(0);
    expect(geometry.secondary.right).toBeLessThanOrEqual(width);
    expect(geometry.scrollWidth, "UX-02 must not introduce horizontal overflow").toBeLessThanOrEqual(geometry.viewportWidth);

    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Opciones de clase" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Programar clase/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Clases/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Agenda/ })).toBeVisible();

    await testInfo.attach(`ux02-${width}-geometry`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
    if ([320, 390, 430].includes(width)) {
      await testInfo.attach(`ux02-${width}-screenshot`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    }
  });
}

test("UX-02 student Portal CYA remains outside professor control layer", async ({ page }) => {
  const email = process.env.QA_STUDENT_EMAIL;
  const password = process.env.QA_STUDENT_PASSWORD;
  test.skip(!email || !password, "student QA credentials are not configured");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  const portal = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(portal).toBeVisible({ timeout: 20_000 });
  await expect(portal.getByRole("button", { name: "Abrir apartados de Mi formación" })).toHaveCSS("min-height", "44px");
});
