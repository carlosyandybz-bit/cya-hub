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
  test(`UX-01b professor header renders only the approved owner identity at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginTeacher(page);

    const owner = page.locator(".mobile-head .mobile-owner-name");
    await expect(owner).toBeVisible();
    await expect(owner).toHaveText("Carlos & Andy");

    const state = await owner.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const before = getComputedStyle(element, "::before");
      const after = getComputedStyle(element, "::after");
      const header = element.closest(".mobile-head") as HTMLElement;
      const brand = element.closest(".mobile-head-brand") as HTMLElement;
      return {
        text: element.textContent?.trim(),
        beforeContent: before.content,
        afterContent: after.content,
        beforeDisplay: before.display,
        afterDisplay: after.display,
        headerDisplay: getComputedStyle(header).display,
        brandPosition: getComputedStyle(brand).position,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      };
    });

    expect(state.text).toBe("Carlos & Andy");
    expect(["none", "normal", '""']).toContain(state.beforeContent);
    expect(["none", "normal", '""']).toContain(state.afterContent);
    expect(state.headerDisplay).toBe("block");
    expect(state.brandPosition).toBe("absolute");
    expect(state.left).toBeGreaterThanOrEqual(0);
    expect(state.right).toBeLessThanOrEqual(width);

    await testInfo.attach(`ux01b-professor-brand-${width}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });
}
