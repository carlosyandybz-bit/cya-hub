import { expect, test, type Page, type TestInfo } from "@playwright/test";

type QaRole = "teacher" | "student" | "admin";

const MOBILE_WIDTHS = [320, 360, 375, 390, 393, 402, 414, 430] as const;
const REPRESENTATIVE_WIDTHS = [
  { width: 390, height: 844, name: "mobile" },
  { width: 768, height: 1024, name: "intermediate" },
  { width: 1280, height: 900, name: "desktop" },
] as const;

function credentialsFor(role: QaRole) {
  const prefix = "QA_" + role.toUpperCase();
  const email = process.env[prefix + "_EMAIL"];
  const password = process.env[prefix + "_PASSWORD"];
  if (!email || !password) throw new Error(role + " QA credentials are missing");
  return { email, password };
}

async function login(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText("CYA Hub no ha podido conectar con sus datos.");
}

async function clickPrimaryNav(page: Page, label: string) {
  const button = page.locator("nav button:visible").filter({ hasText: new RegExp("^" + label + "$", "i") }).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
  await page.waitForTimeout(180);
}

async function attachScreen(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name + "-viewport", {
    body: await page.screenshot({ fullPage: false, animations: "disabled" }),
    contentType: "image/png",
  });
  await testInfo.attach(name + "-full-page", {
    body: await page.screenshot({ fullPage: true, animations: "disabled" }),
    contentType: "image/png",
  });
}

async function assertDarkAndContained(page: Page, surface: string) {
  const audit = await page.evaluate(() => {
    const root = document.documentElement;
    const body = getComputedStyle(document.body);
    const rgb = body.backgroundColor.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
    const [r, g, b] = rgb.map((value) => value / 255);
    const convert = (value: number) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    const luminance = .2126 * convert(r) + .7152 * convert(g) + .0722 * convert(b);
    const logo = document.querySelector<HTMLImageElement>('img[src*="cya-logo"]');
    return {
      overflow: root.scrollWidth - root.clientWidth,
      bodyLuminance: luminance,
      bodyColor: body.backgroundColor,
      logoLoaded: Boolean(logo?.complete && logo.naturalWidth > 0),
    };
  });
  expect(audit.overflow, surface + ": horizontal overflow").toBeLessThanOrEqual(2);
  expect(audit.bodyLuminance, surface + ": canvas must stay dark (" + audit.bodyColor + ")").toBeLessThan(.08);
  expect(audit.logoLoaded, surface + ": CYA logo must be loaded").toBe(true);
}

test.describe("P37 CYA night visual system", () => {
  test.describe.configure({ mode: "serial", retries: 0 });

  test("mobile width matrix is dark, overflow-free and keeps the stacked class control usable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "one canonical browser is enough for the explicit width matrix");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "teacher");

    const observations: Array<Record<string, unknown>> = [];
    for (const width of MOBILE_WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(120);
      await assertDarkAndContained(page, "Inicio " + width + "px");

      const nav = page.getByRole("navigation", { name: "Navegación principal" });
      const classButton = nav.getByRole("button", { name: /^Dar clase$/i });
      const disclosure = nav.getByRole("button", { name: "Más opciones de clase" });
      await expect(nav).toBeVisible();
      await expect(classButton).toBeVisible();
      await expect(disclosure).toBeVisible();

      const geometry = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>(".mobile-nav")!;
        const main = document.querySelector<HTMLElement>('.mobile-nav [data-nav-item="live"]')!;
        const extra = document.querySelector<HTMLElement>(".mobile-nav-secondary")!;
        const navBox = nav.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        const extraBox = extra.getBoundingClientRect();
        return {
          navBottom: Math.round(navBox.bottom),
          viewportHeight: window.innerHeight,
          mainCenter: Math.round(mainBox.left + mainBox.width / 2),
          viewportCenter: Math.round(window.innerWidth / 2),
          extraBottom: Math.round(extraBox.bottom),
          mainTop: Math.round(mainBox.top),
          extraWidth: Math.round(extraBox.width),
          extraHeight: Math.round(extraBox.height),
        };
      });
      expect(Math.abs(geometry.mainCenter - geometry.viewportCenter), width + "px: DAR CLASE remains centered").toBeLessThanOrEqual(2);
      expect(geometry.navBottom, width + "px: bottom navigation remains within the viewport").toBeLessThanOrEqual(geometry.viewportHeight + 1);
      expect(geometry.extraBottom, width + "px: disclosure is stacked above/into the main class control").toBeLessThanOrEqual(geometry.mainTop + 20);
      expect(geometry.extraWidth).toBeGreaterThanOrEqual(36);
      expect(geometry.extraHeight).toBeGreaterThanOrEqual(28);
      observations.push({ width, ...geometry });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const disclosure = page.getByRole("button", { name: "Más opciones de clase" });
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Opciones de clase" });
    await expect(menu).toBeVisible();
    for (const label of ["Programar clase", "Clases", "Agenda"]) {
      const item = menu.getByRole("menuitem").filter({ hasText: label });
      await expect(item).toBeVisible();
      const box = await item.boundingBox();
      expect(box?.height ?? 0, label + ": touch target").toBeGreaterThanOrEqual(44);
    }
    await attachScreen(page, testInfo, "p37-mobile-class-disclosure");
    await disclosure.click();

    await testInfo.attach("p37-mobile-width-observations", {
      body: Buffer.from(JSON.stringify(observations, null, 2)),
      contentType: "application/json",
    });
  });

  test("teacher surfaces have representative mobile, intermediate and desktop visual evidence", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "one explicit screenshot matrix is enough");
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "teacher");

    for (const viewport of REPRESENTATIVE_WIDTHS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await clickPrimaryNav(page, "Inicio");
      await assertDarkAndContained(page, "Inicio " + viewport.name);
      await attachScreen(page, testInfo, "p37-" + viewport.name + "-inicio");

      await clickPrimaryNav(page, "Alumnado");
      await assertDarkAndContained(page, "Alumnado " + viewport.name);
      await attachScreen(page, testInfo, "p37-" + viewport.name + "-alumnado");

      const qaRow = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
      if (await qaRow.isVisible().catch(() => false)) {
        await qaRow.locator(".student-row-main").click();
        const detail = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
        await expect(detail).toBeVisible();
        await assertDarkAndContained(page, "Perfil alumno " + viewport.name);
        await attachScreen(page, testInfo, "p37-" + viewport.name + "-perfil-alumno");
        const close = detail.getByRole("button", { name: /Cerrar|Volver/i }).first();
        if (await close.isVisible().catch(() => false)) await close.click();
        else await page.keyboard.press("Escape");
        await expect(detail).toBeHidden();
      }

      await clickPrimaryNav(page, "Dar clase");
      await assertDarkAndContained(page, "Dar clase " + viewport.name);
      await attachScreen(page, testInfo, "p37-" + viewport.name + "-dar-clase");

      await clickPrimaryNav(page, "Enseñanza");
      await assertDarkAndContained(page, "Enseñanza " + viewport.name);
      await attachScreen(page, testInfo, "p37-" + viewport.name + "-ensenanza");

      await clickPrimaryNav(page, "Marketing");
      await assertDarkAndContained(page, "Marketing " + viewport.name);
      await attachScreen(page, testInfo, "p37-" + viewport.name + "-marketing");
    }
  });

  test("administration and student portal use the same visual system at three viewports", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "one explicit screenshot matrix is enough");

    const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin");
    const adminEntry = adminPage.getByRole("button", { name: /Administración/ });
    await expect(adminEntry).toBeVisible({ timeout: 20_000 });
    await adminEntry.click();
    await expect(adminPage.getByRole("heading", { name: "Administración" })).toBeVisible({ timeout: 20_000 });
    for (const viewport of REPRESENTATIVE_WIDTHS) {
      await adminPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await assertDarkAndContained(adminPage, "Administración " + viewport.name);
      await attachScreen(adminPage, testInfo, "p37-" + viewport.name + "-administracion");
    }
    await adminContext.close();

    const studentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const studentPage = await studentContext.newPage();
    await login(studentPage, "student");
    await expect(studentPage.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
    for (const viewport of REPRESENTATIVE_WIDTHS) {
      await studentPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await assertDarkAndContained(studentPage, "Panel alumno " + viewport.name);
      await attachScreen(studentPage, testInfo, "p37-" + viewport.name + "-panel-alumno");
    }
    await studentContext.close();
  });
});
