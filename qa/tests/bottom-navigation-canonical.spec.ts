import { expect, test, type Page } from "@playwright/test";

function teacherCredentials() {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  if (!email || !password) throw new Error("Teacher QA credentials are missing");
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = teacherCredentials();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await expect(emailInput).toBeHidden({ timeout: 20_000 });
  }
  await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
  expect(overflow.bodyWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

for (const width of [320, 390, 430, 768]) {
  test(`canonical professor bottom navigation is stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);

    const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
    await expect(nav).toBeVisible();

    const destinations = ["home", "students", "live", "teaching", "marketing"] as const;
    for (const destination of destinations) {
      await expect(nav.locator(`button[data-nav-item="${destination}"]`)).toBeVisible();
    }

    const geometry = await nav.evaluate((element) => {
      const navRect = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll<HTMLElement>("button")].map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          navItem: button.dataset.navItem ?? null,
          className: button.className,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
        };
      });
      return {
        nav: {
          left: navRect.left,
          right: navRect.right,
          top: navRect.top,
          bottom: navRect.bottom,
          width: navRect.width,
          centerX: navRect.left + navRect.width / 2,
        },
        buttons,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometry.nav.left).toBeGreaterThanOrEqual(0);
    expect(geometry.nav.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.nav.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);

    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    const live = geometry.buttons.find((button) => button.navItem === "live");
    const more = geometry.buttons.find((button) => button.className.includes("mobile-nav-secondary"));
    if (!live || !more) throw new Error("Central navigation controls are missing");
    expect(Math.abs(live.centerX - geometry.nav.centerX)).toBeLessThanOrEqual(3);
    expect(Math.abs(more.centerX - live.centerX)).toBeLessThanOrEqual(2);
    expect(more.top).toBeLessThan(live.top);

    await assertNoHorizontalOverflow(page);

    const moreButton = nav.getByRole("button", { name: "Más opciones de clase" });
    await moreButton.click();
    await expect(moreButton).toHaveAttribute("aria-expanded", "true");
    const sheet = page.locator('.mobile-class-sheet[role="menu"]');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("menuitem", { name: /Programar clase/ })).toBeVisible();
    await expect(sheet.getByRole("menuitem", { name: /Clases/ })).toBeVisible();
    await expect(sheet.getByRole("menuitem", { name: /Agenda/ })).toBeVisible();
    await assertNoHorizontalOverflow(page);

    await moreButton.click();
    await expect(moreButton).toHaveAttribute("aria-expanded", "false");
    await expect(sheet).toBeHidden();

    for (const destination of ["home", "students", "teaching", "marketing"] as const) {
      const button = nav.locator(`button[data-nav-item="${destination}"]`);
      await button.click();
      await expect(button).toHaveAttribute("aria-current", "page");
      await expect(nav).toBeVisible();
      await assertNoHorizontalOverflow(page);
    }
  });
}

test("desktop swaps the bottom bar for desktop primary navigation at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);

  await expect(page.locator('nav.mobile-nav[aria-label="Navegación principal"]')).toBeHidden();
  const desktopNav = page.locator('nav[aria-label="Módulos principales"]');
  await expect(desktopNav).toBeVisible();
  await expect(desktopNav.getByRole("button", { name: /Dar clase/ })).toBeVisible();
  await assertNoHorizontalOverflow(page);
});
