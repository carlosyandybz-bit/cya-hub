import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./visual-auth";

async function viewportContainment(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const box = (element as HTMLElement).getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      position: getComputedStyle(element as HTMLElement).position,
    };
  });
}

function expectInsideViewport(box: Awaited<ReturnType<typeof viewportContainment>>) {
  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(box.viewportWidth + 1);
  expect(box.top).toBeGreaterThanOrEqual(-1);
  expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight + 1);
}

test.describe("cross portal overlay geometry", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("Professor central sheet stays above the dock and inside the viewport", async ({ page }) => {
    await loginAs(page, "teacher", "Profesor");
    const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]:visible').first();
    await expect(nav).toBeVisible({ timeout: 20_000 });
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    const toggle = nav.getByRole("button", { name: "Más opciones de clase" });
    await toggle.click();
    await expect(toggle).toHaveClass(/open/);

    const sheet = page.locator(".mobile-class-sheet:visible").first();
    await expect(sheet).toBeVisible();
    const [sheetBox, navBox] = await Promise.all([
      viewportContainment(page, ".mobile-class-sheet:visible"),
      viewportContainment(page, 'nav.mobile-nav[aria-label="Navegación principal"]:visible'),
    ]);
    expectInsideViewport(sheetBox);
    expect(sheetBox.bottom).toBeLessThanOrEqual(navBox.top + 1);
  });

  test("Alumno formation sheet preserves sticky header and fixed dock contracts", async ({ page }) => {
    await loginAs(page, "student", "Alumno");
    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    const header = page.locator('nav[aria-label="Portal CYA"]').locator("xpath=..").locator(":scope > header");
    await expect(header).toBeVisible();
    expect(await header.evaluate((el) => getComputedStyle(el).position)).toBe("sticky");

    await nav.getByRole("button", { name: "Abrir apartados de Mi formación" }).click();
    const menu = page.getByRole("menu", { name: "Apartados de Mi formación" });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");

    const [menuBox, navBox, headerBox] = await Promise.all([
      menu.evaluate((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, position: getComputedStyle(el as HTMLElement).position };
      }),
      nav.evaluate((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, position: getComputedStyle(el as HTMLElement).position };
      }),
      header.evaluate((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, position: getComputedStyle(el as HTMLElement).position };
      }),
    ]);
    expectInsideViewport(menuBox);
    expect(menuBox.top).toBeGreaterThanOrEqual(headerBox.bottom + 2);
    expect(menuBox.bottom).toBeLessThanOrEqual(navBox.top - 2);
  });

  test("Administrador grouped navigation and account overlay remain contained", async ({ page }) => {
    await loginAs(page, "admin", "Administrador");
    await expect(page.getByRole("navigation", { name: "Áreas de Administración" })).toBeVisible({ timeout: 20_000 });

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      adminPanel: (() => {
        const node = document.querySelector<HTMLElement>(".admin-panel");
        return node ? node.scrollWidth - node.clientWidth : 0;
      })(),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.adminPanel).toBeLessThanOrEqual(1);

    const accountRoot = page.locator('[data-cya-account-menu][data-experience="admin"]:visible').first();
    await expect(accountRoot).toBeVisible();
    await accountRoot.getByRole("button", { name: "Abrir cuenta y preferencias", exact: true }).click();
    const accountMenu = accountRoot.getByRole("menu", { name: "Cuenta CYA" });
    await expect(accountMenu).toBeVisible();
    const box = await accountMenu.evaluate((el) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, position: getComputedStyle(el as HTMLElement).position };
    });
    expectInsideViewport(box);
  });
});
