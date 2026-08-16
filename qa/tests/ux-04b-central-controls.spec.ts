import { expect, test, type Page } from "@playwright/test";

const widths = [320, 390, 430] as const;

async function login(page: Page, role: "teacher" | "student") {
  const email = process.env[`QA_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`QA_${role.toUpperCase()}_PASSWORD`];
  test.skip(!email || !password, `${role} QA credentials are not configured`);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function geometry(primary: ReturnType<Page["locator"]>, secondary: ReturnType<Page["locator"]>) {
  const [p, s] = await Promise.all([primary.boundingBox(), secondary.boundingBox()]);
  expect(p).not.toBeNull();
  expect(s).not.toBeNull();
  return {
    primary: p!,
    secondary: s!,
    primaryCenter: p!.x + p!.width / 2,
    secondaryCenter: s!.x + s!.width / 2,
    overlap: s!.y + s!.height - p!.y,
  };
}

for (const width of widths) {
  test(`UX-04B professor central control is canonical at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "teacher");

    const nav = page.locator("nav.mobile-nav:visible");
    const primary = nav.getByRole("button", { name: /^Dar clase$/ });
    const secondary = nav.getByRole("button", { name: "Más opciones de clase" });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();
    await expect(secondary).toContainText("Más");

    const g = await geometry(primary, secondary);
    expect(g.primary.width).toBeCloseTo(72, 0);
    expect(g.primary.height).toBeCloseTo(72, 0);
    expect(g.secondary.width).toBeCloseTo(width <= 350 ? 58 : 60, 0);
    expect(g.secondary.height).toBeCloseTo(48, 0);
    expect(Math.abs(g.primaryCenter - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.secondaryCenter - g.primaryCenter)).toBeLessThanOrEqual(1);
    expect(g.overlap).toBeGreaterThanOrEqual(4);
    expect(g.overlap).toBeLessThanOrEqual(16);

    await secondary.click();
    await expect(secondary).toHaveClass(/open/);
    await expect(page.locator(".mobile-class-sheet:visible")).toBeVisible();

    await testInfo.attach(`ux04b-professor-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test(`UX-04B student central control is canonical at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "student");

    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    const primary = nav.getByRole("button", { name: "Mi formación", exact: true });
    const secondary = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const label = await secondary.evaluate((el) => getComputedStyle(el, "::before").content.replace(/["']/g, ""));
    expect(label).toBe("Más");

    const g = await geometry(primary, secondary);
    expect(g.primary.width).toBeCloseTo(72, 0);
    expect(g.primary.height).toBeCloseTo(72, 0);
    expect(g.secondary.width).toBeCloseTo(width <= 350 ? 58 : 60, 0);
    expect(g.secondary.height).toBeCloseTo(48, 0);
    expect(Math.abs(g.primaryCenter - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.secondaryCenter - g.primaryCenter)).toBeLessThanOrEqual(1);
    expect(g.overlap).toBeGreaterThanOrEqual(4);
    expect(g.overlap).toBeLessThanOrEqual(16);

    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu", { name: "Apartados de Mi formación" })).toBeVisible();

    await testInfo.attach(`ux04b-student-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}
