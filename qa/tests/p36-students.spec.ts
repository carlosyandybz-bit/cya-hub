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
  await page.getByRole("button", { name: /Alumnado/i }).first().click();
  await expect(page.getByRole("heading", { name: /Personas, sin ruido/i })).toBeVisible({ timeout: 20_000 });
}

for (const width of [390, 430, 1280] as const) {
  test(`P36 students directory is compact and operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1000 ? 844 : 800 });
    await loginTeacher(page);
    await expect(page.getByPlaceholder(/Buscar nombre, teléfono o email/i)).toBeVisible();

    const rows = page.locator(".student-row:visible");
    const count = await rows.count();
    if (count) {
      const first = rows.first();
      await expect(first.locator(".student-row-main")).toBeVisible();
      const smallActions = await first.locator(".student-row-actions button:visible").evaluateAll((buttons) => buttons.filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).length);
      expect(smallActions).toBe(0);
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
