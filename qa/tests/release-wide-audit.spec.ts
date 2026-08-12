import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { isolateInitialEvaluationGateForUnrelatedQa } from "./known-audit-isolation";

type QaRole = "teacher" | "student" | "admin";

type BrowserTelemetry = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; error: string }>;
  serverErrors: Array<{ url: string; status: number }>;
  dependencyWarnings: Array<{ url: string; status: number; dependency: string }>;
};

type TouchTarget = { tag: string; label: string; width: number; height: number };
type SurfaceAudit = {
  surface: string;
  url: string;
  title: string;
  viewport: { width: number; height: number } | null;
  documentWidth: number;
  horizontalOverflowPx: number;
  headings: string[];
  primaryNavLabels: string[];
  interactiveCount: number;
  undersizedTouchTargets: TouchTarget[];
  unlabeledButtons: Array<{ tag: string; html: string }>;
  telemetry: BrowserTelemetry;
};

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

function startTelemetry(page: Page) {
  const telemetry: BrowserTelemetry = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [], dependencyWarnings: [] };
  page.on("console", (message) => { if (message.type() === "error") telemetry.consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => telemetry.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText || "unknown request failure";
    if (!/ERR_ABORTED|NS_BINDING_ABORTED/i.test(error)) telemetry.failedRequests.push({ url: request.url(), error });
  });
  page.on("response", (response) => {
    if (response.status() < 500) return;
    if (response.status() === 503 && response.url().includes("/api/google-drive/media-ticket")) {
      telemetry.dependencyWarnings.push({ url: response.url(), status: response.status(), dependency: "google-drive-server-env" });
      return;
    }
    telemetry.serverErrors.push({ url: response.url(), status: response.status() });
  });
  return telemetry;
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

function cleanLabel(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

async function auditSurface(page: Page, testInfo: TestInfo, surface: string, telemetry: BrowserTelemetry) {
  await page.waitForTimeout(350);
  const viewport = page.viewportSize();
  const data = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = (element as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && box.width > 0 && box.height > 0;
    };
    const labelFor = (element: Element) => {
      const html = element as HTMLElement;
      return (element.getAttribute("aria-label") || element.getAttribute("title") || html.innerText || (element as HTMLInputElement).placeholder || (element as HTMLInputElement).name || "")
        .replace(/\s+/g, " ").trim().slice(0, 160);
    };
    const effectiveTarget = (element: Element) => {
      const input = element as HTMLInputElement;
      if (element.tagName === "INPUT" && ["checkbox", "radio"].includes(input.type)) {
        const label = element.closest("label");
        if (label && visible(label)) return label;
      }
      return element;
    };

    const interactives = Array.from(document.querySelectorAll("button,a,input,select,textarea,summary,[role='button']")).filter(visible);
    const seen = new Set<Element>();
    const undersized = interactives.flatMap((element) => {
      const target = effectiveTarget(element);
      if (seen.has(target)) return [];
      seen.add(target);
      const box = (target as HTMLElement).getBoundingClientRect();
      if (box.width >= 44 && box.height >= 44) return [];
      return [{ tag: target.tagName.toLowerCase(), label: labelFor(target) || labelFor(element), width: Math.round(box.width), height: Math.round(box.height) }];
    }).slice(0, 100);
    const unlabeledButtons = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter(visible)
      .filter((element) => !labelFor(element))
      .map((element) => ({ tag: element.tagName.toLowerCase(), html: (element as HTMLElement).outerHTML.slice(0, 300) }))
      .slice(0, 50);
    const primaryNavLabels = Array.from(document.querySelectorAll(".mobile-nav button, .sidebar nav button"))
      .filter(visible).map(labelFor).filter(Boolean);

    return {
      documentWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      headings: Array.from(document.querySelectorAll("h1,h2,h3")).filter(visible).map((heading) => (heading as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 50),
      primaryNavLabels,
      interactiveCount: interactives.length,
      undersized,
      unlabeledButtons,
    };
  });

  const observation: SurfaceAudit = {
    surface,
    url: page.url(),
    title: await page.title(),
    viewport,
    documentWidth: data.documentWidth,
    horizontalOverflowPx: Math.max(0, data.documentWidth - data.clientWidth),
    headings: data.headings.map(cleanLabel),
    primaryNavLabels: data.primaryNavLabels.map(cleanLabel),
    interactiveCount: data.interactiveCount,
    undersizedTouchTargets: viewport && viewport.width <= 720 ? data.undersized : [],
    unlabeledButtons: data.unlabeledButtons,
    telemetry: {
      consoleErrors: [...telemetry.consoleErrors], pageErrors: [...telemetry.pageErrors], failedRequests: [...telemetry.failedRequests],
      serverErrors: [...telemetry.serverErrors], dependencyWarnings: [...telemetry.dependencyWarnings],
    },
  };

  console.log("[CYA_AUDIT]", JSON.stringify({
    surface: observation.surface,
    viewport: observation.viewport,
    overflowPx: observation.horizontalOverflowPx,
    primaryNav: observation.primaryNavLabels,
    touchTargetsUnder44: observation.undersizedTouchTargets.length,
    undersized: observation.undersizedTouchTargets.slice(0, 20),
    unlabeledButtons: observation.unlabeledButtons.length,
    consoleErrors: observation.telemetry.consoleErrors.length,
    pageErrors: observation.telemetry.pageErrors.length,
    failedRequests: observation.telemetry.failedRequests.length,
    serverErrors: observation.telemetry.serverErrors.length,
    dependencyWarnings: observation.telemetry.dependencyWarnings,
  }));

  await testInfo.attach(`audit-${surface.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-screen`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
  await testInfo.attach(`audit-${surface.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-observations`, { body: Buffer.from(JSON.stringify(observation, null, 2)), contentType: "application/json" });

  expect.soft(observation.telemetry.pageErrors, `${surface}: uncaught page errors`).toEqual([]);
  expect.soft(observation.telemetry.serverErrors, `${surface}: unexpected HTTP 5xx responses`).toEqual([]);
  expect.soft(observation.telemetry.failedRequests, `${surface}: failed network requests`).toEqual([]);
  expect.soft(observation.horizontalOverflowPx, `${surface}: document-level horizontal overflow`).toBeLessThanOrEqual(4);

  telemetry.consoleErrors.length = 0; telemetry.pageErrors.length = 0; telemetry.failedRequests.length = 0;
  telemetry.serverErrors.length = 0; telemetry.dependencyWarnings.length = 0;
  return observation;
}

async function clickPrimaryNav(page: Page, label: string) {
  const button = page.locator("nav button:visible").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
}

test.describe("CYA Hub release-wide audit", () => {
  test.describe.configure({ retries: 0 });

  test("teacher core surfaces have no critical browser or viewport failure", async ({ page }, testInfo) => {
    await isolateInitialEvaluationGateForUnrelatedQa(page);
    const telemetry = startTelemetry(page);
    await login(page, "teacher");
    await auditSurface(page, testInfo, "teacher-inicio", telemetry);
    await clickPrimaryNav(page, "Alumnado"); await auditSurface(page, testInfo, "teacher-Alumnado", telemetry);
    await clickPrimaryNav(page, "Dar clase");
    const liveCenter = await auditSurface(page, testInfo, "teacher-Dar clase", telemetry);
    if (liveCenter.viewport && liveCenter.viewport.width <= 720) {
      expect.soft(liveCenter.primaryNavLabels, "Dar clase center should preserve primary mobile navigation before a class starts")
        .toEqual(expect.arrayContaining(["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]));
    }
    const exitLive = page.getByRole("button", { name: "Salir de Dar clase" });
    if (await exitLive.isVisible().catch(() => false)) await exitLive.click(); else await page.getByRole("button", { name: "Volver" }).click();
    await clickPrimaryNav(page, "Enseñanza"); await auditSurface(page, testInfo, "teacher-Enseñanza", telemetry);
    await clickPrimaryNav(page, "Marketing"); await auditSurface(page, testInfo, "teacher-Marketing", telemetry);
    await clickPrimaryNav(page, "Inicio"); await auditSurface(page, testInfo, "teacher-Inicio-final", telemetry);
  });

  test("student portal has no critical browser or viewport failure", async ({ page }, testInfo) => {
    const telemetry = startTelemetry(page); await login(page, "student"); await auditSurface(page, testInfo, "student-portal", telemetry);
  });

  test("all administration sections have no critical browser or viewport failure", async ({ page }, testInfo) => {
    await isolateInitialEvaluationGateForUnrelatedQa(page);
    const telemetry = startTelemetry(page); await login(page, "admin");
    const adminEntry = page.getByRole("button", { name: /Administración/ });
    await expect(adminEntry).toBeVisible({ timeout: 20_000 }); await adminEntry.click();
    await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });
    await auditSurface(page, testInfo, "admin-General", telemetry);
    for (const section of ["Equipo y roles", "Formularios", "Enseñanza", "Misiones", "Notificaciones", "Datos", "Integraciones", "Apariencia", "Seguridad"]) {
      const button = page.getByRole("main").getByRole("button", { name: new RegExp(`^${section}$`, "i") }).first();
      await expect(button).toBeVisible({ timeout: 15_000 }); await button.click(); await auditSurface(page, testInfo, `admin-${section}`, telemetry);
    }
  });
});
