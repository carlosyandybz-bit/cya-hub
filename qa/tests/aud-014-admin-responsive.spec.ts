import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { openAdminSection } from "./admin-navigation";

const SECTIONS = [
  "General", "Equipo y roles", "Seguridad",
  "Formularios", "Enseñanza", "Misiones", "Notificaciones",
  "Tarifas", "BZ Points", "Feedback Online", "Academia Online",
  "Datos", "Integraciones", "Apariencia",
] as const;
const GROUPS = ["Sistema", "Enseñanza", "Negocio", "Datos", "Apariencia"] as const;

async function loginAdmin(page: Page) {
  const email = process.env.QA_ADMIN_EMAIL;
  const password = process.env.QA_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("QA admin credentials are not configured");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });

  const account = page.getByRole("button", { name: "Abrir cuenta y preferencias" });
  if (await account.isVisible().catch(() => false)) await account.click();
  else await page.locator('button[aria-haspopup="menu"]:visible').last().click();

  const adminExperience = page.getByRole("button", { name: /^Administrador(?:,|\.)/ });
  if (await adminExperience.isVisible().catch(() => false)) await adminExperience.click();
  await expect(page.getByRole("heading", { name: "Administración" })).toBeVisible({ timeout: 20_000 });
}

test("AUD-014 Administration stays compact, complete and overflow-free", async ({ page }, testInfo: TestInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "single canonical responsive audit is enough");
  await loginAdmin(page);

  const findings: Array<Record<string, unknown>> = [];
  for (const width of [390, 430, 1280]) {
    await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });

    const groupNav = page.getByRole("navigation", { name: "Áreas de Administración" });
    await expect(groupNav).toBeVisible();
    for (const group of GROUPS) {
      await expect(groupNav.getByRole("button", { name: new RegExp(`^${group}`) })).toBeVisible();
    }

    const navigationSnapshot = await groupNav.evaluate((element) => ({
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    if (width <= 820) {
      expect(["auto", "scroll"]).toContain(navigationSnapshot.overflowX);
    } else {
      expect(navigationSnapshot.scrollWidth <= navigationSnapshot.clientWidth + 1).toBe(true);
    }

    for (const section of SECTIONS) {
      await openAdminSection(page, section);
      await page.waitForTimeout(120);

      const snapshot = await page.evaluate(({ width, section }) => {
        const root = document.documentElement;
        const panel = document.querySelector(".admin-panel") as HTMLElement | null;
        const local = document.querySelector(".admin-local-nav") as HTMLElement | null;
        return {
          width,
          section,
          documentOverflow: root.scrollWidth > root.clientWidth + 1,
          panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
          localNavigationOverflow: local ? local.scrollWidth > local.clientWidth + 1 : false,
          visibleProgressAutomatic: document.body.innerText.includes("Progreso automático"),
        };
      }, { width, section });

      findings.push(snapshot);
    }
  }

  await testInfo.attach("aud014-responsive-findings", {
    body: Buffer.from(JSON.stringify(findings, null, 2)),
    contentType: "application/json",
  });

  const overflows = findings.filter((item) => item.documentOverflow || item.panelOverflow || item.localNavigationOverflow);
  const progressAutomatic = findings.filter((item) => item.visibleProgressAutomatic);

  expect(progressAutomatic, "Progreso automático must not be visible in Administración").toEqual([]);
  expect(overflows, "Administration content and local navigation must stay contained horizontally").toEqual([]);
});
