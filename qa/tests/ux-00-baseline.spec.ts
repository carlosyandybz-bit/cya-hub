import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { collectPairClearance, collectUndersizedTouchTargets, collectViewportGeometry } from "./ux-audit-utils";

type QaRole = "teacher" | "student";

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

async function login(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function attachBaseline(testInfo: TestInfo, name: string, observation: unknown, page: Page) {
  await testInfo.attach(`${name}-observation`, {
    body: Buffer.from(JSON.stringify(observation, null, 2)),
    contentType: "application/json",
  });
  await testInfo.attach(`${name}-screenshot`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

for (const width of [390, 430] as const) {
  test(`UX-00 freezes teacher baseline at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "teacher");
    const navigation = page.locator(".mobile-nav");
    await expect(navigation).toBeVisible();

    const observation = {
      role: "teacher",
      width,
      geometry: await collectViewportGeometry(page),
      navigationTargetsUnder44: await collectUndersizedTouchTargets(navigation),
      headerBrandVsActions: await collectPairClearance(page, ".brand-wordmark", ".app-header-actions, .header-actions"),
      primaryClassControl: await page.getByRole("button", { name: /^Dar clase$/ }).boundingBox(),
      secondaryClassControl: await page.getByRole("button", { name: /Más opciones de clase/ }).boundingBox(),
    };

    console.log("[CYA_UX00_BASELINE]", JSON.stringify(observation));
    await attachBaseline(testInfo, `ux00-teacher-${width}`, observation, page);

    expect(observation.geometry.horizontalOverflowPx).toBeLessThanOrEqual(4);
  });

  test(`UX-00 freezes student baseline at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "student");
    const navigation = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(navigation).toBeVisible();

    const observation = {
      role: "student",
      width,
      geometry: await collectViewportGeometry(page),
      navigationTargetsUnder44: await collectUndersizedTouchTargets(navigation, "button"),
      formationControl: await navigation.getByRole("button", { name: /Mi formación/i }).first().boundingBox().catch(() => null),
      formationDisclosure: await navigation.getByRole("button", { name: /Abrir apartados de Mi formación/i }).boundingBox().catch(() => null),
    };

    console.log("[CYA_UX00_BASELINE]", JSON.stringify(observation));
    await attachBaseline(testInfo, `ux00-student-${width}`, observation, page);

    expect(observation.geometry.horizontalOverflowPx).toBeLessThanOrEqual(4);
  });
}

test("UX-00 records desktop teacher baseline", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page, "teacher");
  const observation = {
    role: "teacher",
    width: 1280,
    geometry: await collectViewportGeometry(page),
    primaryNavigation: await page.locator("nav button:visible").allTextContents(),
  };
  console.log("[CYA_UX00_BASELINE]", JSON.stringify(observation));
  await attachBaseline(testInfo, "ux00-teacher-1280", observation, page);
  expect(observation.geometry.horizontalOverflowPx).toBeLessThanOrEqual(4);
});
