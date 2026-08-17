import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./visual-auth";

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth - document.documentElement.clientWidth, body: document.body.scrollWidth - document.body.clientWidth }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 430, 768]) {
  test(`student Portal CYA navigation is stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await loginAs(page, "student", "Alumno");

    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    for (const label of ["Inicio", "Progreso", "Mi formación", "Descubre", "Misiones"]) {
      await expect(nav.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeVisible();
    }

    const geometry = await nav.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll<HTMLElement>("button")].map((button) => {
        const box = button.getBoundingClientRect();
        return { label: button.getAttribute("aria-label") || button.textContent?.trim() || "", left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height, centerX: box.left + box.width / 2 };
      });
      return { nav: { left: rect.left, right: rect.right, width: rect.width, centerX: rect.left + rect.width / 2 }, buttons, viewportWidth: window.innerWidth };
    });

    expect(geometry.nav.left).toBeGreaterThanOrEqual(0);
    expect(geometry.nav.right).toBeLessThanOrEqual(geometry.viewportWidth);
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    const formation = geometry.buttons.find((button) => button.label === "Mi formación");
    const toggle = geometry.buttons.find((button) => button.label === "Abrir apartados de Mi formación");
    if (!formation || !toggle) throw new Error("Student formation controls are missing");
    const groupCenter = (Math.min(formation.left, toggle.left) + Math.max(formation.right, toggle.right)) / 2;
    expect(Math.abs(groupCenter - geometry.nav.centerX)).toBeLessThanOrEqual(4);
    expect(Math.abs(formation.top - toggle.top)).toBeLessThanOrEqual(2);
    expect(Math.abs(formation.bottom - toggle.bottom)).toBeLessThanOrEqual(2);

    await noHorizontalOverflow(page);
    const toggleButton = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    const sheet = page.getByRole("menu", { name: "Apartados de Mi formación" });
    await expect(sheet).toBeVisible();
    await noHorizontalOverflow(page);
    await sheet.getByRole("button", { name: "Cerrar" }).click();
    await expect(sheet).toBeHidden();
  });
}

test("student navigation remains contained at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginAs(page, "student", "Alumno");
  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(nav).toBeVisible();
  await noHorizontalOverflow(page);
  const box = await nav.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1281);
});
