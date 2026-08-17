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
    overlapX: Math.min(p!.x + p!.width, s!.x + s!.width) - Math.max(p!.x, s!.x),
  };
}

for (const width of widths) {
  test(`UX-04B professor central control matches approved v50 at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "teacher");

    const nav = page.locator("nav.mobile-nav:visible");
    const primary = nav.getByRole("button", { name: /^Dar clase$/ });
    const secondary = nav.getByRole("button", { name: "Más opciones de clase" });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const g = await geometry(primary, secondary);
    expect(g.primary.width).toBeCloseTo(width <= 370 ? 100 : 104, 0);
    expect(g.primary.height).toBeCloseTo(width <= 370 ? 62 : 66, 0);
    expect(g.secondary.width).toBeCloseTo(width <= 370 ? 19 : 20, 0);
    expect(g.secondary.height).toBeCloseTo(width <= 370 ? 62 : 66, 0);
    expect(Math.abs(g.primaryCenter - width / 2)).toBeLessThanOrEqual(2);
    expect(g.overlapX).toBeGreaterThanOrEqual(g.secondary.width - 2);

    await secondary.click();
    await expect(secondary).toHaveClass(/open/);
    await expect(page.locator(".mobile-class-sheet:visible")).toBeVisible();

    await testInfo.attach(`ux04b-professor-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });

  test(`UX-04B student central control matches approved v50 at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "student");

    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    const primary = nav.getByRole("button", { name: "Mi formación", exact: true });
    const secondary = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const g = await geometry(primary, secondary);
    expect(g.primary.width).toBeCloseTo(width <= 370 ? 100 : 104, 0);
    expect(g.primary.height).toBeCloseTo(width <= 370 ? 62 : 66, 0);
    expect(g.secondary.width).toBeCloseTo(width <= 370 ? 19 : 20, 0);
    expect(g.secondary.height).toBeCloseTo(width <= 370 ? 62 : 66, 0);
    expect(Math.abs(g.primaryCenter - width / 2)).toBeLessThanOrEqual(2);
    expect(g.overlapX).toBeGreaterThanOrEqual(g.secondary.width - 2);

    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menu", { name: "Apartados de Mi formación" })).toBeVisible();

    await testInfo.attach(`ux04b-student-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}
