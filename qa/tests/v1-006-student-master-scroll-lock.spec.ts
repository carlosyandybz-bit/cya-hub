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
}

test("V1-006 student master semantic dialog freezes background and preserves internal scroll", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginTeacher(page);

  const alumnado = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
  await alumnado.click();
  await expect(page.getByRole("heading", { name: "Personas, sin ruido" })).toBeVisible({ timeout: 20_000 });

  await page.evaluate(() => window.scrollTo(0, Math.min(180, Math.max(0, document.documentElement.scrollHeight - innerHeight))));
  const before = await page.evaluate(() => window.scrollY);

  const row = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
  await expect(row).toBeVisible();
  await row.locator(".student-row-main").click();

  const dialog = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog).toHaveAttribute("aria-modal", "true");

  await expect.poll(async () => page.evaluate(() => ({
    locked: document.body.classList.contains("cya-overlay-open"),
    bodyPosition: getComputedStyle(document.body).position,
    rootOverflow: getComputedStyle(document.documentElement).overflow,
    savedY: Number(document.body.dataset.cyaScrollLockY ?? Number.NaN),
    bodyTop: parseFloat(getComputedStyle(document.body).top || "0"),
  }))).toMatchObject({
    locked: true,
    bodyPosition: "fixed",
    rootOverflow: "hidden",
    savedY: before,
    bodyTop: -before,
  });

  const frozenBefore = await page.evaluate(() => ({
    top: getComputedStyle(document.body).top,
    savedY: document.body.dataset.cyaScrollLockY,
  }));

  await page.mouse.move(4, 300);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(150);

  const frozenAfter = await page.evaluate(() => ({
    top: getComputedStyle(document.body).top,
    savedY: document.body.dataset.cyaScrollLockY,
    position: getComputedStyle(document.body).position,
  }));
  expect(frozenAfter.position).toBe("fixed");
  expect(frozenAfter.top).toBe(frozenBefore.top);
  expect(frozenAfter.savedY).toBe(frozenBefore.savedY);

  const scrollable = dialog.locator("div").filter({ has: page.getByText("Ficha maestra del alumno", { exact: true }) });
  const internal = dialog.locator('[class*="body"]').first();
  if (await internal.count()) {
    const dimensions = await internal.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
    if (dimensions.scrollHeight > dimensions.clientHeight + 4) {
      await internal.evaluate((el) => { el.scrollTop = Math.min(160, el.scrollHeight - el.clientHeight); });
      expect(await internal.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    }
  }
  void scrollable;

  await testInfo.attach("v1-006-student-master-open", {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });

  await dialog.getByRole("button", { name: /cerrar/i }).first().click();
  await expect(dialog).toBeHidden();

  await expect.poll(async () => page.evaluate(() => ({
    locked: document.body.classList.contains("cya-overlay-open"),
    position: getComputedStyle(document.body).position,
    scrollY: window.scrollY,
  }))).toMatchObject({ locked: false, position: "static", scrollY: before });
});
