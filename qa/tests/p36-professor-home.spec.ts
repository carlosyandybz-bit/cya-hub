import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function loginTeacher(page: Page, testInfo: TestInfo) {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  test.skip(!email || !password, "teacher QA credentials are not configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".home-hero")).toBeVisible({ timeout: 20_000 });
  await testInfo.attach("p36-professor-home", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

for (const width of [390, 430, 1280] as const) {
  test(`P36 professor home is an accessible operational brief at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 1000 ? 844 : 800 });
    await loginTeacher(page, testInfo);

    const focus = page.locator(".focus").first();
    const quick = page.getByRole("region", { name: "Acciones rápidas" });
    await expect(focus).toBeVisible();
    await expect(quick).toBeVisible();

    const geometry = await page.evaluate(() => {
      const focusElement = document.querySelector<HTMLElement>(".focus");
      const quickElement = document.querySelector<HTMLElement>('[aria-label="Acciones rápidas"]');
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        focusTop: focusElement?.getBoundingClientRect().top ?? 0,
        focusHeight: focusElement?.getBoundingClientRect().height ?? 0,
        quickTop: quickElement?.getBoundingClientRect().top ?? 0,
      };
    });
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.focusHeight).toBeGreaterThan(width < 760 ? 120 : 170);
    expect(geometry.quickTop).toBeGreaterThan(geometry.focusTop + 80);

    const smallQuickActions = await quick.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).length);
    expect(smallQuickActions).toBe(0);

    await expect(page.getByRole("heading", { name: /Agenda del día/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Lo importante después/i })).toBeVisible();
  });
}
