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
  test(`UX-01b professor header renders complete logo and owner identity at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginTeacher(page);

    const owner = page.locator(".mobile-head .mobile-owner-name");
    const brandContainer = page.locator(".mobile-head .mobile-head-brand");
    const logoBox = page.locator(".mobile-head .brand-logo");
    const logoImage = logoBox.locator("img");

    await expect(owner).toBeVisible();
    await expect(owner).toHaveText("Carlos & Andy");
    await expect(logoBox).toBeVisible();
    await expect(logoImage).toBeVisible();

    const state = await page.evaluate(() => {
      const owner = document.querySelector<HTMLElement>(".mobile-head .mobile-owner-name")!;
      const header = document.querySelector<HTMLElement>(".mobile-head")!;
      const brand = document.querySelector<HTMLElement>(".mobile-head .mobile-head-brand")!;
      const logo = document.querySelector<HTMLElement>(".mobile-head .brand-logo")!;
      const image = logo.querySelector<HTMLImageElement>("img")!;
      const ownerRect = owner.getBoundingClientRect();
      const brandRect = brand.getBoundingClientRect();
      const logoRect = logo.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const before = getComputedStyle(owner, "::before");
      const after = getComputedStyle(owner, "::after");
      const brandStyle = getComputedStyle(brand);
      const imageStyle = getComputedStyle(image);

      return {
        text: owner.textContent?.trim(),
        beforeContent: before.content,
        afterContent: after.content,
        headerDisplay: getComputedStyle(header).display,
        brandPosition: brandStyle.position,
        brandOverflowX: brandStyle.overflowX,
        owner: { left: ownerRect.left, right: ownerRect.right, width: ownerRect.width },
        brand: { left: brandRect.left, right: brandRect.right, width: brandRect.width },
        logo: { left: logoRect.left, right: logoRect.right, top: logoRect.top, bottom: logoRect.bottom, width: logoRect.width, height: logoRect.height },
        image: { left: imageRect.left, right: imageRect.right, top: imageRect.top, bottom: imageRect.bottom, width: imageRect.width, height: imageRect.height },
        imagePosition: imageStyle.position,
        imageObjectFit: imageStyle.objectFit,
      };
    });

    expect(state.text).toBe("Carlos & Andy");
    expect(["none", "normal", '""']).toContain(state.beforeContent);
    expect(["none", "normal", '""']).toContain(state.afterContent);
    expect(state.headerDisplay).toBe("block");
    expect(state.brandPosition).toBe("absolute");

    expect(state.brand.left).toBeGreaterThanOrEqual(0);
    expect(state.brand.right).toBeLessThanOrEqual(width);
    expect(state.owner.left).toBeGreaterThanOrEqual(state.brand.left - 1);
    expect(state.owner.right).toBeLessThanOrEqual(state.brand.right + 1);
    expect(state.owner.width).toBeGreaterThan(55);

    expect(state.logo.width).toBeGreaterThanOrEqual(width <= 350 ? 25 : 29);
    expect(state.logo.height).toBeGreaterThanOrEqual(width <= 350 ? 25 : 29);
    expect(state.image.left).toBeGreaterThanOrEqual(state.logo.left - 1);
    expect(state.image.right).toBeLessThanOrEqual(state.logo.right + 1);
    expect(state.image.top).toBeGreaterThanOrEqual(state.logo.top - 1);
    expect(state.image.bottom).toBeLessThanOrEqual(state.logo.bottom + 1);
    expect(state.imagePosition).toBe("static");
    expect(state.imageObjectFit).toBe("contain");

    await testInfo.attach(`ux01b-professor-brand-${width}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
