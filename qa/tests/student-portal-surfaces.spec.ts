import { expect, test } from "@playwright/test";
import { loginAs } from "./visual-auth";

function luminance(value: string) {
  const rgb = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (rgb.length !== 3) return 1;
  const [r, g, b] = rgb.map((v) => v / 255);
  return .2126 * r + .7152 * g + .0722 * b;
}

for (const width of [390, 1280]) {
  test(`student portal surfaces stay canonical at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await loginAs(page, "student", "Alumno");
    await expect(page.getByRole("button", { name: "Mi formación", exact: true })).toBeVisible({ timeout: 20_000 });

    const feedbackHeading = page.getByRole("heading", { name: "¿Quieres que veamos tu baile?" });
    await expect(feedbackHeading).toBeVisible();
    const feedbackSection = feedbackHeading.locator("xpath=ancestor::section[1]");
    const feedbackStyle = await feedbackSection.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius };
    });
    expect(luminance(feedbackStyle.background)).toBeLessThan(.32);
    expect(feedbackStyle.border).not.toBe("rgb(255, 255, 255)");
    expect(Number.parseFloat(feedbackStyle.radius)).toBeGreaterThanOrEqual(16);

    const feedbackButton = feedbackSection.getByRole("button", { name: /Enviar vídeo/ });
    const feedbackBox = await feedbackButton.boundingBox();
    expect(feedbackBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const formation = page.getByRole("button", { name: "Mi formación", exact: true });
    await formation.click();
    const toggle = page.getByRole("button", { name: /Abrir apartados de Mi formación|Cerrar apartados de Mi formación/ });
    await toggle.click();
    const menu = page.getByRole("menu", { name: "Apartados de Mi formación" });
    await expect(menu).toBeVisible();
    const sheetStyle = await menu.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(luminance(sheetStyle.background)).toBeLessThan(.32);
    expect(sheetStyle.border).not.toBe("rgb(255, 255, 255)");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
