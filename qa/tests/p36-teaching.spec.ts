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
  await page.getByRole("button", { name: /^Enseñanza$/ }).first().click();
  await expect(page.getByRole("heading", { name: /Tu biblioteca/i })).toBeVisible({ timeout: 20_000 });
}

for (const width of [390, 430, 1280] as const) {
  test(`P36 teaching workspace is readable and touch-safe at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 1000 ? 844 : 800 });
    await loginTeacher(page);

    for (const label of ["Biblioteca", "Enseñar alumnos", "Mapa"]) {
      await expect(page.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
    }
    for (const label of ["Correcciones", "Explicaciones", "Ejercicios", "Secuencias"]) {
      await expect(page.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
    }

    const smallPrimaryTargets = await page.locator(".teaching-switch button:visible,.teaching-kind-grid button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).length);
    expect(smallPrimaryTargets).toBe(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: /^Mapa$/ }).click();
    await expect(page.locator(".teaching-graph-shell")).toBeVisible({ timeout: 20_000 });
    const mapOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(mapOverflow).toBeLessThanOrEqual(1);
  });
}
