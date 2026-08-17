import { expect, test, type TestInfo } from "@playwright/test";
import { loginAs } from "./visual-auth";

test.describe("canonical CYA split control", () => {
  for (const width of [320, 390, 430, 768]) {
    test(`Dar clase split control is centered and premium-safe at ${width}px`, async ({ page }, testInfo: TestInfo) => {
      await page.setViewportSize({ width, height: 844 });
      await loginAs(page, "teacher", "Profesor");

      const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
      const primary = nav.locator('button[data-nav-item="live"]');
      const secondary = nav.getByRole("button", { name: "Más opciones de clase" });
      await expect(nav).toBeVisible({ timeout: 20_000 });
      await expect(primary).toBeVisible();
      await expect(secondary).toBeVisible();

      const geometry = await page.evaluate(() => {
        const primary = document.querySelector<HTMLElement>('.mobile-nav button[data-nav-item="live"]');
        const secondary = document.querySelector<HTMLElement>('.mobile-nav .mobile-nav-secondary');
        const nav = document.querySelector<HTMLElement>('.mobile-nav');
        if (!primary || !secondary || !nav) throw new Error("Central controls are missing");
        const a = primary.getBoundingClientRect();
        const b = secondary.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        const styleA = getComputedStyle(primary);
        const styleB = getComputedStyle(secondary);
        return {
          primary: { left: a.left, right: a.right, top: a.top, bottom: a.bottom, width: a.width, height: a.height },
          secondary: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height },
          nav: { left: n.left, right: n.right, width: n.width, centerX: n.left + n.width / 2 },
          primaryRadius: styleA.borderRadius,
          secondaryRadius: styleB.borderRadius,
          viewportWidth: window.innerWidth,
        };
      });

      const groupLeft = Math.min(geometry.primary.left, geometry.secondary.left);
      const groupRight = Math.max(geometry.primary.right, geometry.secondary.right);
      const groupCenter = (groupLeft + groupRight) / 2;
      const seam = geometry.secondary.left - geometry.primary.right;

      expect(Math.abs(groupCenter - geometry.nav.centerX)).toBeLessThanOrEqual(4);
      expect(Math.abs(geometry.primary.top - geometry.secondary.top)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.primary.bottom - geometry.secondary.bottom)).toBeLessThanOrEqual(2);
      expect(Math.abs(seam)).toBeLessThanOrEqual(3);
      expect(geometry.primary.height).toBeGreaterThanOrEqual(48);
      expect(geometry.secondary.width).toBeGreaterThanOrEqual(44);
      expect(geometry.secondary.height).toBeGreaterThanOrEqual(44);
      expect(groupLeft).toBeGreaterThanOrEqual(0);
      expect(groupRight).toBeLessThanOrEqual(geometry.viewportWidth);

      await testInfo.attach(`central-control-professor-${width}`, {
        body: await page.screenshot({ fullPage: false }),
        contentType: "image/png",
      });

      await secondary.click();
      await expect(secondary).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator('.mobile-class-sheet[role="menu"]')).toBeVisible();
    });
  }
});
