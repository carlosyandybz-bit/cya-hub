import { expect, test, type Page } from "@playwright/test";

const widths = [320, 390, 430];

async function login(page: Page, role: "teacher" | "student") {
  const email = process.env[`QA_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`QA_${role.toUpperCase()}_PASSWORD`];
  test.skip(!email || !password, `${role} QA credentials are not configured`);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function assertScrollableContentClearsBottomChrome(page: Page, nav: ReturnType<Page["locator"]>, main: ReturnType<Page["locator"]>) {
  await expect(nav).toBeVisible();
  await expect(main).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(120);

  const result = await page.evaluate(() => {
    const visible = (el: Element) => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const mains = [...document.querySelectorAll("main")].filter(visible) as HTMLElement[];
    const fixedNavs = [...document.querySelectorAll("nav")].filter((el) => {
      if (!visible(el)) return false;
      const style = getComputedStyle(el);
      return style.position === "fixed" && (el as HTMLElement).getBoundingClientRect().bottom >= innerHeight - 2;
    }) as HTMLElement[];
    const activeMain = mains.at(-1);
    const activeNav = fixedNavs.at(-1);
    if (!activeMain || !activeNav) return null;

    const navRect = activeNav.getBoundingClientRect();
    const candidates = [...activeMain.querySelectorAll("button,a,input,select,textarea,[role='button'],section,article")]
      .filter(visible) as HTMLElement[];
    const lowest = candidates
      .map((el) => ({ text: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80), rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom <= innerHeight + 1)
      .sort((a, b) => b.rect.bottom - a.rect.bottom)[0];

    return {
      viewportHeight: innerHeight,
      navTop: navRect.top,
      navHeight: navRect.height,
      mainPaddingBottom: parseFloat(getComputedStyle(activeMain).paddingBottom || "0"),
      lowest: lowest ? { text: lowest.text, top: lowest.rect.top, bottom: lowest.rect.bottom } : null,
      documentBottomGap: document.documentElement.scrollHeight - (scrollY + innerHeight),
    };
  });

  expect(result).not.toBeNull();
  expect(result!.mainPaddingBottom).toBeGreaterThanOrEqual(result!.navHeight + 8);
  if (result!.lowest) expect(result!.lowest.bottom).toBeLessThanOrEqual(result!.navTop + 1);
  expect(result!.documentBottomGap).toBeLessThanOrEqual(2);
}

for (const width of widths) {
  test(`UX-04 teacher content clears fixed bottom navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "teacher");

    const nav = page.locator("nav.mobile-nav:visible");
    const main = page.locator("main.main:visible");
    await assertScrollableContentClearsBottomChrome(page, nav, main);

    await testInfo.attach(`ux04-teacher-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });

  test(`UX-04 student portal content clears fixed bottom navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "student");

    const nav = page.locator("nav:visible").filter({ has: page.getByRole("button", { name: /^Inicio$/ }) }).last();
    const main = page.locator("main:visible").last();
    await assertScrollableContentClearsBottomChrome(page, nav, main);

    await testInfo.attach(`ux04-student-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  });
}

test("UX-04 student master dialog remains fully operable inside the mobile viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "teacher");

  const alumnado = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
  await alumnado.click();
  await expect(page.getByRole("heading", { name: "Personas, sin ruido" })).toBeVisible({ timeout: 20_000 });
  const row = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
  await row.locator(".student-row-main").click();

  const dialog = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, viewport: innerHeight, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewport + 1);

  const close = dialog.getByRole("button", { name: /cerrar/i }).first();
  await expect(close).toBeVisible();
  await close.click();
  await expect(dialog).toBeHidden();

  await testInfo.attach("ux04-student-master-dialog", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});
