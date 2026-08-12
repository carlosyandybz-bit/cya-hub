import { expect, test, type Page, type TestInfo } from "@playwright/test";

type QaRole = "teacher" | "student" | "admin";

type BrowserObservation = {
  surface: string;
  viewport: { width: number; height: number } | null;
  heading: string | null;
  horizontalOverflow: number;
  unnamedButtons: Array<{ index: number; html: string }>;
  smallTouchTargets: Array<{ tag: string; text: string; width: number; height: number }>;
  offscreenControls: Array<{ tag: string; text: string; left: number; right: number; top: number; bottom: number }>;
  suspiciousText: string[];
  visibleButtons: Array<{ text: string; disabled: boolean; width: number; height: number }>;
  visibleInputs: Array<{ type: string; name: string; placeholder: string; value: string }>;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: Array<{ url: string; error: string }>;
  badResponses: Array<{ url: string; status: number }>;
};

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

function installTelemetry(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: Array<{ url: string; error: string }> = [];
  const badResponses: Array<{ url: string; status: number }> = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText || "unknown" }));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });
  return { consoleErrors, pageErrors, failedRequests, badResponses };
}

async function login(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function observeSurface(page: Page, testInfo: TestInfo, surface: string, telemetry: ReturnType<typeof installTelemetry>) {
  await page.waitForTimeout(700);
  const observation = await page.evaluate((surfaceName): Omit<BrowserObservation, "consoleErrors" | "pageErrors" | "failedRequests" | "badResponses"> => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const visible = (element: Element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element: Element) => {
      const node = element as HTMLElement;
      return (node.getAttribute("aria-label") || node.getAttribute("title") || node.innerText || "").trim().replace(/\s+/g, " ").slice(0, 180);
    };
    const focusables = Array.from(document.querySelectorAll("button,a[href],input,select,textarea,[role='button'],[role='switch']")).filter(visible);
    const unnamedButtons = Array.from(document.querySelectorAll("button,[role='button']")).filter(visible).map((element, index) => ({ element, index })).filter(({ element }) => !labelFor(element)).map(({ element, index }) => ({ index, html: element.outerHTML.slice(0, 300) }));
    const touchThreshold = viewport.width <= 500 ? 40 : 32;
    const smallTouchTargets = focusables.map((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), text: labelFor(element), width: Math.round(rect.width), height: Math.round(rect.height) };
    }).filter((item) => item.width < touchThreshold || item.height < touchThreshold).slice(0, 100);
    const offscreenControls = focusables.map((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), text: labelFor(element), left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
    }).filter((item) => item.right > viewport.width + 2 || item.left < -2).slice(0, 100);
    const bodyText = (document.body.innerText || "").replace(/\s+/g, " ");
    const suspiciousPatterns = [
      /\bundefined\b/gi, /\bNaN\b/g, /\[object Object\]/g,
      /pr[oó]ximamente/gi, /sin implementar/gi, /placeholder/gi,
      /no ha podido conectar/gi, /error inesperado/gi, /algo ha ido mal/gi,
      /cargando\.\.\./gi, /preparando cya hub…/gi
    ];
    const suspiciousText = suspiciousPatterns.flatMap((pattern) => bodyText.match(pattern) || []).slice(0, 50);
    const visibleButtons = Array.from(document.querySelectorAll("button,[role='button']")).filter(visible).map((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      return { text: labelFor(element), disabled: (element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true", width: Math.round(rect.width), height: Math.round(rect.height) };
    }).slice(0, 160);
    const visibleInputs = Array.from(document.querySelectorAll("input,select,textarea")).filter(visible).map((element) => {
      const input = element as HTMLInputElement;
      return { type: input.type || element.tagName.toLowerCase(), name: input.name || "", placeholder: input.placeholder || "", value: input.type === "password" ? "<password>" : String(input.value ?? "").slice(0, 120) };
    }).slice(0, 160);
    const heading = Array.from(document.querySelectorAll("main h1, main h2, h1, h2")).find(visible)?.textContent?.trim() || null;
    return {
      surface: surfaceName,
      viewport,
      heading,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      unnamedButtons,
      smallTouchTargets,
      offscreenControls,
      suspiciousText,
      visibleButtons,
      visibleInputs,
    };
  }, surface);

  const payload: BrowserObservation = {
    ...observation,
    consoleErrors: [...telemetry.consoleErrors],
    pageErrors: [...telemetry.pageErrors],
    failedRequests: [...telemetry.failedRequests],
    badResponses: [...telemetry.badResponses],
  };
  await testInfo.attach(`${surface}-audit.json`, { body: Buffer.from(JSON.stringify(payload, null, 2)), contentType: "application/json" });
  await testInfo.attach(`${surface}-screen.png`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

  expect.soft(observation.horizontalOverflow, `${surface}: horizontal overflow`).toBeLessThanOrEqual(2);
  expect.soft(observation.unnamedButtons, `${surface}: unnamed buttons`).toHaveLength(0);
  expect.soft(observation.offscreenControls, `${surface}: horizontally offscreen controls`).toHaveLength(0);
  expect.soft(telemetry.pageErrors, `${surface}: page errors`).toHaveLength(0);
  const relevantFailures = telemetry.failedRequests.filter((item) => item.url.includes("127.0.0.1") || item.url.includes("supabase.co"));
  expect.soft(relevantFailures, `${surface}: app/data request failures`).toHaveLength(0);
  const relevantBad = telemetry.badResponses.filter((item) => (item.url.includes("127.0.0.1") || item.url.includes("supabase.co")) && item.status >= 500);
  expect.soft(relevantBad, `${surface}: 5xx responses`).toHaveLength(0);
}

async function clickVisibleNamedButton(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true }).first();
  await expect(button, `Expected visible button: ${name}`).toBeVisible({ timeout: 10_000 });
  await button.click();
  await page.waitForTimeout(500);
}

test.describe("CYA Hub release-wide visual and navigation audit", () => {
  test.describe.configure({ retries: 0 });

  test("teacher primary modules render without browser/runtime failures", async ({ page }, testInfo) => {
    const telemetry = installTelemetry(page);
    await login(page, "teacher");
    for (const label of ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]) {
      const navButton = page.locator("nav button:visible").filter({ hasText: new RegExp(`^${label}$`) }).first();
      await expect(navButton).toBeVisible({ timeout: 10_000 });
      await navButton.click();
      await observeSurface(page, testInfo, `teacher-${label.toLowerCase().replace(/\s+/g, "-")}`, telemetry);
    }
  });

  test("admin control center renders every configured section", async ({ page }, testInfo) => {
    const telemetry = installTelemetry(page);
    await login(page, "admin");
    const adminEntry = page.getByRole("button", { name: /Administración/ }).first();
    await expect(adminEntry).toBeVisible({ timeout: 15_000 });
    await adminEntry.click();
    await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });
    await observeSurface(page, testInfo, "admin-general", telemetry);
    for (const section of ["Equipo y roles", "Formularios", "Enseñanza", "Misiones", "Notificaciones", "Datos", "Integraciones", "Apariencia", "Seguridad"]) {
      await clickVisibleNamedButton(page, section);
      await observeSurface(page, testInfo, `admin-${section.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}`, telemetry);
    }
  });

  test("student portal renders as a coherent isolated experience", async ({ page }, testInfo) => {
    const telemetry = installTelemetry(page);
    await login(page, "student");
    await expect(page.getByRole("heading", { name: "Resumen de mis clases" })).toBeVisible({ timeout: 20_000 });
    await observeSurface(page, testInfo, "student-portal", telemetry);
  });

  test("history navigation returns to prior app surface", async ({ page }) => {
    installTelemetry(page);
    await login(page, "teacher");
    const studentNav = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
    await studentNav.click();
    await expect(page.getByRole("main")).toContainText(/Alumno|Alumnado/i);
    const teachingNav = page.locator("nav button:visible").filter({ hasText: /^Enseñanza$/ }).first();
    await teachingNav.click();
    await expect(page.getByRole("main")).toContainText(/Enseñanza|Biblioteca|Correcciones/i);
    await page.goBack();
    await page.waitForTimeout(600);
    await expect(page.getByRole("main")).toContainText(/Alumno|Alumnado/i);
  });
});
