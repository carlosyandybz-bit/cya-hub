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
  await expect(page.locator(".mobile-head")).toBeVisible({ timeout: 20_000 });
}

for (const width of [320, 360, 375, 390, 393, 402, 414, 430]) {
  test(`UX-01b professor header mirrors student CYA Hub identity at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginTeacher(page);

    const header = page.locator(".mobile-head");
    const brandContainer = header.locator(".mobile-head-brand");
    const brand = brandContainer.locator(".brand");
    const logoBox = brand.locator(".brand-logo");
    const logoImage = logoBox.locator("img");
    const wordmark = brand.locator(".brand-wordmark");
    const owner = header.locator(".mobile-owner-name");
    const actions = header.locator(".mobile-head-actions");

    await expect(brand).toBeVisible();
    await expect(logoBox).toBeVisible();
    await expect(logoImage).toBeVisible();
    await expect(wordmark).toBeVisible();
    await expect(wordmark).toContainText("CYA");
    await expect(wordmark).toContainText("Hub");
    await expect(owner).toBeHidden();
    await expect(actions).toBeVisible();

    const state = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>(".mobile-head")!;
      const brand = document.querySelector<HTMLElement>(".mobile-head .mobile-head-brand")!;
      const logo = document.querySelector<HTMLElement>(".mobile-head .brand-logo")!;
      const image = logo.querySelector<HTMLImageElement>("img")!;
      const wordmark = document.querySelector<HTMLElement>(".mobile-head .brand-wordmark")!;
      const actions = document.querySelector<HTMLElement>(".mobile-head .mobile-head-actions")!;
      const headerRect = header.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const wordmarkRect = wordmark.getBoundingClientRect();
      const actionsRect = actions.getBoundingClientRect();
      return {
        header: { left: headerRect.left, right: headerRect.right, width: headerRect.width, height: headerRect.height },
        brand: { left: brandRect.left, right: brandRect.right, width: brandRect.width, height: brandRect.height },
        logo: { left: logoRect.left, right: logoRect.right, top: logoRect.top, bottom: logoRect.bottom, width: logoRect.width, height: logoRect.height },
        image: { left: imageRect.left, right: imageRect.right, top: imageRect.top, bottom: imageRect.bottom, width: imageRect.width, height: imageRect.height },
        wordmark: { left: wordmarkRect.left, right: wordmarkRect.right, width: wordmarkRect.width, height: wordmarkRect.height },
        actions: { left: actionsRect.left, right: actionsRect.right, width: actionsRect.width, height: actionsRect.height },
        headerDisplay: getComputedStyle(header).display,
        logoOverflow: getComputedStyle(logo).overflow,
      };
    });

    expect(state.headerDisplay).toBe("flex");
    expect(state.brand.left).toBeGreaterThanOrEqual(0);
    expect(state.brand.right).toBeLessThanOrEqual(width);
    expect(state.actions.right).toBeLessThanOrEqual(width + 1);
    expect(state.brand.right).toBeLessThanOrEqual(state.actions.left + 1);
    expect(state.wordmark.width).toBeGreaterThan(45);
    expect(state.logo.width).toBeGreaterThanOrEqual(width <= 350 ? 49 : 56);
    expect(state.logo.height).toBeGreaterThanOrEqual(37);
    expect(state.image.width).toBeGreaterThanOrEqual(63);
    expect(state.image.height).toBeGreaterThanOrEqual(63);
    expect(state.logoOverflow).toBe("hidden");

    await testInfo.attach(`ux01b-professor-brand-${width}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
