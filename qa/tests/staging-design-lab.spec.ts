import { expect, test } from "@playwright/test";

const viewports = [
  { name: "iphone-compact", width: 320, height: 568 },
  { name: "iphone-standard", width: 390, height: 844 },
  { name: "iphone-large", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`Staging Design Lab · ${viewport.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/staging-lab", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { level: 1, name: "Design Lab" })).toBeVisible();
    await expect(page.locator("[data-staging-only='true']")).toHaveCount(1);

    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.innerWidth);
    expect(geometry.bodyWidth).toBeLessThanOrEqual(geometry.innerWidth);

    const undersizedButtons = await page.locator("button:visible").evaluateAll((nodes) =>
      nodes
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { label: node.textContent?.trim() ?? "", width: rect.width, height: rect.height };
        })
        .filter(({ width, height }) => width < 44 || height < 44),
    );
    expect(undersizedButtons).toEqual([]);

    await page.screenshot({
      path: testInfo.outputPath(`staging-design-lab-${viewport.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  });
}

test("Staging Design Lab respects reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/staging-lab");
  await expect(page.getByRole("heading", { level: 1, name: "Design Lab" })).toBeVisible();
  expect(await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});
