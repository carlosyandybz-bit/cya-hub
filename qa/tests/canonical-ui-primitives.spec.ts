import { expect, test, type Page } from "@playwright/test";

function teacherCredentials() {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  if (!email || !password) throw new Error("Teacher QA credentials are missing");
  return { email, password };
}

function rgbLuminance(value: string) {
  const numbers = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (numbers.length !== 3) return 1;
  const [r, g, b] = numbers.map((channel) => channel / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function login(page: Page) {
  const { email, password } = teacherCredentials();
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const emailInput = page.locator('input[name="email"]');
  await expect(emailInput).toBeVisible();

  const loginStyle = await emailInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderColor };
  });
  expect(rgbLuminance(loginStyle.background)).toBeLessThan(0.28);
  expect(rgbLuminance(loginStyle.color)).toBeGreaterThan(0.45);

  await emailInput.fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(emailInput).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
}

for (const width of [390, 1280]) {
  test(`canonical surfaces and forms remain dark and legible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await login(page);

    const surface = page.locator('.card:visible, .quick:visible, .student-row:visible, .agenda-row:visible, .focus:visible').first();
    await expect(surface).toBeVisible();

    const style = await surface.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        background: computed.backgroundColor,
        border: computed.borderColor,
        color: computed.color,
        radius: computed.borderRadius,
      };
    });

    expect(rgbLuminance(style.background)).toBeLessThan(0.32);
    expect(rgbLuminance(style.color)).toBeGreaterThan(0.45);
    expect(style.border).not.toBe("rgb(255, 255, 255)");
    expect(Number.parseFloat(style.radius)).toBeGreaterThanOrEqual(14);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
