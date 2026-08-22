import { expect, test } from "@playwright/test";

const widths = [320, 390, 430];
const concepts = ["apex", "prism", "wing", "orbit", "arc", "split"];

for (const width of widths) {
  test(`central controls visual lab · ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 932 });
    await page.goto("/labs/central-controls");
    await expect(page.getByRole("heading", { name: "Controles centrales complementarios" })).toBeVisible();

    for (const concept of concepts) {
      const card = page.getByTestId(`concept-${concept}`);
      await expect(card).toBeVisible();

      for (const portal of ["teacher", "student"]) {
        const pair = page.getByTestId(`pair-${concept}-${portal}`);
        const primary = pair.locator("button").nth(1);
        const secondary = pair.locator("button").nth(0);
        const [mainBox, secondaryBox] = await Promise.all([primary.boundingBox(), secondary.boundingBox()]);

        expect(mainBox, `${concept}/${portal}: primary bbox`).not.toBeNull();
        expect(secondaryBox, `${concept}/${portal}: secondary bbox`).not.toBeNull();
        if (!mainBox || !secondaryBox) continue;

        expect(mainBox.height, `${concept}/${portal}: primary touch height`).toBeGreaterThanOrEqual(44);
        expect(mainBox.width, `${concept}/${portal}: primary touch width`).toBeGreaterThanOrEqual(44);
        expect(secondaryBox.height, `${concept}/${portal}: secondary touch height`).toBeGreaterThanOrEqual(44);
        expect(secondaryBox.width, `${concept}/${portal}: secondary touch width`).toBeGreaterThanOrEqual(44);

        const secondaryBottom = secondaryBox.y + secondaryBox.height;
        expect(
          secondaryBottom <= mainBox.y,
          `${concept}/${portal}: controls must not overlap (${secondaryBottom.toFixed(1)} <= ${mainBox.y.toFixed(1)})`,
        ).toBeTruthy();

        const mainCenter = mainBox.x + mainBox.width / 2;
        const secondaryCenter = secondaryBox.x + secondaryBox.width / 2;
        expect(Math.abs(mainCenter - secondaryCenter), `${concept}/${portal}: shared central axis`).toBeLessThanOrEqual(1.5);
      }
    }

    const screenshotPath = testInfo.outputPath(`central-controls-${width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach(`central-controls-${width}`, { path: screenshotPath, contentType: "image/png" });
  });
}

test("secondary controls are icon-only and interactive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/labs/central-controls");

  for (const concept of concepts) {
    const pair = page.getByTestId(`pair-${concept}-teacher`);
    const secondary = pair.getByRole("button", { name: "Abrir opciones de Dar clase" });
    await expect(secondary).toHaveText("");
    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "false");
  }
});
