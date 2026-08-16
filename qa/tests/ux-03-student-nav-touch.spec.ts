import { expect, test, type Page } from "@playwright/test";
import { collectUndersizedTouchTargets } from "./ux-audit-utils";

async function loginStudent(page: Page) {
  const email = process.env.QA_STUDENT_EMAIL;
  const password = process.env.QA_STUDENT_PASSWORD;
  test.skip(!email || !password, "student QA credentials are not configured");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
}

const widths = [320, 360, 375, 390, 393, 402, 414, 430] as const;

for (const width of widths) {
  test(`UX-03 Portal CYA has no undersized navigation target at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginStudent(page);

    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    const disclosure = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await expect(disclosure).toBeVisible();

    const geometry = await disclosure.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const visual = getComputedStyle(element, "::before");
      return {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        visualWidth: Number.parseFloat(visual.width),
        visualHeight: Number.parseFloat(visual.height),
      };
    });

    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.visualWidth, "UX-03 must preserve the compact reveal-key appearance").toBe(40);
    expect(geometry.visualHeight, "UX-03 must preserve the compact reveal-key appearance").toBe(20);

    const undersized = await collectUndersizedTouchTargets(nav, "button");
    expect(undersized, `Portal CYA must expose zero visible button targets below 44×44 at ${width}px`).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "UX-03 must not introduce horizontal overflow").toBeLessThanOrEqual(1);

    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Apartados de Mi formación" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: /Resumen/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /A practicar/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Clases realizadas/ })).toBeVisible();
    await expect(menu.getByRole("button", { name: /Contenido/ })).toBeVisible();

    await testInfo.attach(`ux03-${width}-geometry`, {
      body: Buffer.from(JSON.stringify({ geometry, undersized, overflow }, null, 2)),
      contentType: "application/json",
    });

    if ([320, 390, 430].includes(width)) {
      await testInfo.attach(`ux03-${width}-screenshot`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    }
  });
}

test("UX-03 preserves the five approved Portal CYA destinations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginStudent(page);

  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  for (const label of ["Inicio", "Progreso", "Mi formación", "Descubre", "Misiones"]) {
    await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await expect(nav.locator(":scope > button, :scope > div")).toHaveCount(5);
});
