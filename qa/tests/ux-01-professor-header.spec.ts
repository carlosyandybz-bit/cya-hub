import { expect, test, type Page } from "@playwright/test";

async function loginTeacher(page: Page) {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  test.skip(!email || !password, "teacher QA credentials are not configured");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".mobile-head")).toBeVisible({ timeout: 20_000 });
}

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type HeaderGeometry = {
  header: Box;
  brand: Box & { centerX: number; scrollWidth: number; clientWidth: number };
  actions: Box;
  back: Box | null;
  actionTargets: Array<Box & { label: string }>;
  rightGap: number;
  leftGap: number | null;
};

async function readGeometry(page: Page): Promise<HeaderGeometry> {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const box = (element as HTMLElement).getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    const visible = (element: HTMLElement | null): element is HTMLElement => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity || "1") > 0
        && box.width > 0
        && box.height > 0;
    };

    const header = document.querySelector<HTMLElement>(".mobile-head")!;
    const brand = header.querySelector<HTMLElement>(".mobile-head-brand")!;
    const actions = header.querySelector<HTMLElement>(".mobile-head-actions")!;
    const notification = actions.querySelector<HTMLElement>(":scope > .notification-trigger");
    const accountTrigger = actions.querySelector<HTMLElement>(":scope > [data-cya-account-menu] > button");
    const backButton = header.querySelector<HTMLElement>(".mobile-head-back > .mobile-back");

    const canonicalTargets = [notification, accountTrigger].filter(visible);
    if (canonicalTargets.length !== 2) {
      throw new Error(`Expected exactly two canonical professor header actions, got ${canonicalTargets.length}`);
    }

    const actionTargets = canonicalTargets.map((button) => ({
      ...rect(button),
      label: button.getAttribute("aria-label") || button.innerText.trim() || button.className,
    }));
    const actionBox = {
      left: Math.min(...actionTargets.map((target) => target.left)),
      right: Math.max(...actionTargets.map((target) => target.right)),
      top: Math.min(...actionTargets.map((target) => target.top)),
      bottom: Math.max(...actionTargets.map((target) => target.bottom)),
      width: Math.max(...actionTargets.map((target) => target.right)) - Math.min(...actionTargets.map((target) => target.left)),
      height: Math.max(...actionTargets.map((target) => target.bottom)) - Math.min(...actionTargets.map((target) => target.top)),
    };
    const brandBox = rect(brand);
    const backBox = visible(backButton) ? rect(backButton) : null;

    return {
      header: rect(header),
      brand: {
        ...brandBox,
        centerX: brandBox.left + brandBox.width / 2,
        scrollWidth: brand.scrollWidth,
        clientWidth: brand.clientWidth,
      },
      actions: actionBox,
      back: backBox,
      actionTargets,
      rightGap: actionBox.left - brandBox.right,
      leftGap: backBox ? brandBox.left - backBox.right : null,
    };
  });
}

const widths = [320, 360, 375, 390, 393, 402, 414, 430];

for (const width of widths) {
  test(`UX-01 professor root header is collision-safe at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await loginTeacher(page);

    const geometry = await readGeometry(page);
    const headerCenter = geometry.header.left + geometry.header.width / 2;

    expect(Math.abs(geometry.brand.centerX - headerCenter), "brand must remain on the physical viewport axis").toBeLessThanOrEqual(1);
    expect(geometry.brand.left, "brand must not clip the left viewport edge").toBeGreaterThanOrEqual(0);
    expect(geometry.brand.right, "brand must not clip the right viewport edge").toBeLessThanOrEqual(width);
    expect(geometry.brand.scrollWidth, "brand content must remain fully visible without internal clipping").toBeLessThanOrEqual(geometry.brand.clientWidth + 1);
    expect(geometry.rightGap, "brand needs at least 10px clearance from canonical header actions").toBeGreaterThanOrEqual(10);
    expect(geometry.actions.right, "header actions must stay inside the viewport").toBeLessThanOrEqual(width);

    for (const target of geometry.actionTargets) {
      expect(target.width, `${target.label} must be at least 44px wide`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.label} must be at least 44px high`).toBeGreaterThanOrEqual(44);
    }

    await testInfo.attach(`ux01-root-${width}`, {
      body: JSON.stringify(geometry, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach(`ux01-root-${width}-screenshot`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

test("UX-01 detail and immersive headers preserve clearance and back navigation", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginTeacher(page);

  await page.getByRole("button", { name: "Alumnado", exact: true }).last().click();
  await expect(page.locator('.shell[data-view="students"]')).toBeVisible();
  const detail = await readGeometry(page);
  expect(detail.leftGap, "detail brand needs clearance from back action").not.toBeNull();
  expect(detail.leftGap!).toBeGreaterThanOrEqual(10);
  expect(detail.rightGap).toBeGreaterThanOrEqual(10);
  expect(detail.brand.scrollWidth).toBeLessThanOrEqual(detail.brand.clientWidth + 1);

  await page.getByRole("button", { name: "Dar clase", exact: true }).last().click();
  await expect(page.locator('.shell[data-view="live"]')).toBeVisible();
  const immersive = await readGeometry(page);
  expect(immersive.leftGap, "immersive brand needs clearance from back action").not.toBeNull();
  expect(immersive.leftGap!).toBeGreaterThanOrEqual(10);
  expect(immersive.rightGap).toBeGreaterThanOrEqual(10);
  expect(immersive.brand.scrollWidth).toBeLessThanOrEqual(immersive.brand.clientWidth + 1);

  await testInfo.attach("ux01-detail-immersive", {
    body: JSON.stringify({ detail, immersive }, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("ux01-immersive-screenshot", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});