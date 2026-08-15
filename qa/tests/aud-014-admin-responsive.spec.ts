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

    for (const group of GROUPS) {
      await expect(page.getByRole("navigation", { name: "Áreas de Administración" }).getByRole("button", { name: new RegExp(`^${group}`) })).toBeVisible();
    }

    const groupNav = page.getByRole("navigation", { name: "Áreas de Administración" });
    const navStyle = await groupNav.evaluate((element) => getComputedStyle(element));
    if (width <= 820) expect(["auto", "scroll"]).toContain(navStyle.overflowX);

    for (const section of SECTIONS) {
      await openAdminSection(page, section);
      await page.waitForTimeout(120);

      const snapshot = await page.evaluate(({ width, section }) => {
        const visible = (element: Element) => {
          const style = getComputedStyle(element as HTMLElement);
          const rect = (element as HTMLElement).getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const effectiveRect = (element: HTMLElement) => {
          if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
            const label = element.closest("label");
            if (label && visible(label)) return label.getBoundingClientRect();
          }
          return element.getBoundingClientRect();
        };
        const root = document.documentElement;
        const panel = document.querySelector(".admin-panel") as HTMLElement | null;
        const smallTargets = [...document.querySelectorAll<HTMLElement>(".admin-layout button, .admin-layout [role='button'], .admin-layout input, .admin-layout select")]
          .filter(visible)
          .map((element) => {
            const rect = effectiveRect(element);
            return {
              tag: element.tagName.toLowerCase(),
              label: ((element.getAttribute("aria-label") || element.textContent || element.getAttribute("name") || "").trim()).slice(0, 80),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((item) => item.height < 44 || item.width < 44);
        return {
          width,
          section,
          documentOverflow: root.scrollWidth > root.clientWidth + 1,
          panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
          smallTargets,
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

  const overflows = findings.filter((item) => item.documentOverflow || item.panelOverflow);
  const progressAutomatic = findings.filter((item) => item.visibleProgressAutomatic);
  const touchIssues = findings.filter((item) => Array.isArray(item.smallTargets) && item.smallTargets.length > 0);

  expect(progressAutomatic, "Progreso automático must not be visible in Administración").toEqual([]);
  expect(overflows, "Administration content must not overflow horizontally").toEqual([]);
  expect(touchIssues, "Effective Administration touch targets must meet 44px").toEqual([]);
});
