import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function loginTeacher(page: Page, testInfo: TestInfo) {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  test.skip(!email || !password, "teacher QA credentials are not configured");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".mobile-nav")).toBeVisible({ timeout: 20_000 });
  await testInfo.attach("mobile-icon-alignment", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("mobile header and professor navigation icons are geometrically centered", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await loginTeacher(page, testInfo);

  const geometry = await page.evaluate(() => {
    const centerOf = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
    };

    const relativeCenter = (child: Element, parent: Element) => {
      const c = centerOf(child);
      const p = centerOf(parent);
      return { dx: c.x - p.x, dy: c.y - p.y };
    };

    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    const header = document.querySelector<HTMLElement>(".mobile-head");
    const headerBrand = document.querySelector<HTMLElement>(".mobile-head-brand");
    const nav = document.querySelector<HTMLElement>(".mobile-nav");
    const primary = document.querySelector<HTMLElement>(".mobile-nav button.primary");
    const secondary = document.querySelector<HTMLElement>(".mobile-nav .mobile-nav-secondary");

    const iconOffsets = Array.from(document.querySelectorAll<HTMLElement>(".mobile-head button, .mobile-nav button"))
      .filter(isVisible)
      .map((button) => {
        const icon = button.querySelector("svg");
        if (!icon) return null;
        return {
          className: button.className,
          ariaLabel: button.getAttribute("aria-label"),
          ...relativeCenter(icon, button),
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    return {
      headerBrandVsHeader: header && headerBrand ? relativeCenter(headerBrand, header) : null,
      primaryVsNav: nav && primary ? { dx: centerOf(primary).x - centerOf(nav).x } : null,
      secondaryVsPrimary: primary && secondary ? {
        dx: centerOf(secondary).x - centerOf(primary).x,
        dy: centerOf(secondary).y - centerOf(primary).y,
      } : null,
      secondaryIconVsButton: secondary?.querySelector("svg") ? relativeCenter(secondary.querySelector("svg")!, secondary) : null,
      iconOffsets,
    };
  });

  console.log("CYA_MOBILE_ICON_ALIGNMENT", JSON.stringify(geometry));

  if (geometry.headerBrandVsHeader) {
    expect(Math.abs(geometry.headerBrandVsHeader.dx), "mobile header brand must be centered in the header").toBeLessThanOrEqual(2);
  }

  if (geometry.primaryVsNav) {
    expect(Math.abs(geometry.primaryVsNav.dx), "primary bottom-nav action must be centered in the bar").toBeLessThanOrEqual(2);
  }

  if (geometry.secondaryVsPrimary) {
    expect(Math.abs(geometry.secondaryVsPrimary.dx), "secondary action must sit directly above the primary action, not beside it").toBeLessThanOrEqual(2);
  }

  if (geometry.secondaryIconVsButton) {
    expect(Math.abs(geometry.secondaryIconVsButton.dx), "secondary arrow/logo must be horizontally centered").toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.secondaryIconVsButton.dy), "secondary arrow/logo must be vertically centered").toBeLessThanOrEqual(2);
  }

  for (const offset of geometry.iconOffsets) {
    expect(Math.abs(offset.dx), `icon must be horizontally centered in ${offset.className}`).toBeLessThanOrEqual(2);
    expect(Math.abs(offset.dy), `icon must be vertically centered in ${offset.className}`).toBeLessThanOrEqual(2);
  }
});
