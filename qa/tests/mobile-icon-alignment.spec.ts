import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "TEACHER" | "STUDENT") {
  const email = process.env[`QA_${role}_EMAIL`];
  const password = process.env[`QA_${role}_PASSWORD`];
  test.skip(!email || !password, `${role.toLowerCase()} QA credentials are not configured`);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

test("mobile header and professor class controls are geometrically centered", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await login(page, "TEACHER");
  await expect(page.locator(".mobile-nav")).toBeVisible({ timeout: 20_000 });
  const geometry = await page.evaluate(() => {
    const centerOf = (element: Element) => { const rect = element.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height }; };
    const relativeCenter = (child: Element, parent: Element) => { const c = centerOf(child); const p = centerOf(parent); return { dx: c.x - p.x, dy: c.y - p.y }; };
    const header = document.querySelector<HTMLElement>(".mobile-head");
    const headerBrand = document.querySelector<HTMLElement>(".mobile-head-brand");
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    const primary = document.querySelector<HTMLElement>(".mobile-nav button.primary");
    const secondary = document.querySelector<HTMLElement>(".mobile-nav .mobile-nav-secondary");
    const secondaryIcon = secondary?.querySelector("svg") ?? null;
    const secondaryLabel = secondary?.querySelector("span") ?? null;
    const headerActionIcons = Array.from(document.querySelectorAll<HTMLElement>(".mobile-head button")).map((button) => { const icon = button.querySelector("svg"); if (!icon) return null; return { className: button.className, ariaLabel: button.getAttribute("aria-label"), ...relativeCenter(icon, button) }; }).filter((value): value is NonNullable<typeof value> => Boolean(value));
    let secondaryContentVsButton = null as null | { dx: number; labelWidth: number; iconWidth: number };
    if (secondary && secondaryIcon && secondaryLabel) {
      const buttonRect = secondary.getBoundingClientRect(); const labelRect = secondaryLabel.getBoundingClientRect(); const iconRect = secondaryIcon.getBoundingClientRect();
      const contentLeft = Math.min(labelRect.left, iconRect.left); const contentRight = Math.max(labelRect.right, iconRect.right);
      secondaryContentVsButton = { dx: (contentLeft + contentRight) / 2 - (buttonRect.left + buttonRect.width / 2), labelWidth: labelRect.width, iconWidth: iconRect.width };
    }
    return {
      headerBrandVsHeader: header && headerBrand ? relativeCenter(headerBrand, header) : null,
      primaryVsNav: nav && primary ? { dx: centerOf(primary).x - centerOf(nav).x } : null,
      secondaryVsPrimary: primary && secondary ? { dx: centerOf(secondary).x - centerOf(primary).x, dy: centerOf(secondary).y - centerOf(primary).y, width: centerOf(secondary).width, height: centerOf(secondary).height } : null,
      secondaryContentVsButton,
      headerActionIcons,
    };
  });
  console.log("CYA_MOBILE_ICON_ALIGNMENT", JSON.stringify(geometry));
  expect(geometry.headerBrandVsHeader).not.toBeNull();
  expect(Math.abs(geometry.headerBrandVsHeader!.dx)).toBeLessThanOrEqual(2);
  expect(geometry.primaryVsNav).not.toBeNull();
  expect(Math.abs(geometry.primaryVsNav!.dx)).toBeLessThanOrEqual(2);
  expect(geometry.secondaryVsPrimary).not.toBeNull();
  expect(Math.abs(geometry.secondaryVsPrimary!.dx)).toBeLessThanOrEqual(2);
  expect(geometry.secondaryVsPrimary!.width).toBeGreaterThanOrEqual(58);
  expect(geometry.secondaryVsPrimary!.height).toBeGreaterThanOrEqual(48);
  expect(geometry.secondaryContentVsButton).not.toBeNull();
  expect(geometry.secondaryContentVsButton!.labelWidth).toBeGreaterThan(0);
  expect(geometry.secondaryContentVsButton!.iconWidth).toBeGreaterThan(0);
  expect(Math.abs(geometry.secondaryContentVsButton!.dx)).toBeLessThanOrEqual(2);
  for (const offset of geometry.headerActionIcons) { expect(Math.abs(offset.dx)).toBeLessThanOrEqual(2); expect(Math.abs(offset.dy)).toBeLessThanOrEqual(2); }
  await testInfo.attach("professor-mobile-alignment-after-fix", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("student portal navigation remains visually unchanged by professor alignment fix", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await login(page, "STUDENT");
  await expect(page.locator('nav[aria-label="Portal CYA"]')).toBeVisible({ timeout: 20_000 });
  await testInfo.attach("student-mobile-navigation-regression-check", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
