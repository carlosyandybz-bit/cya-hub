import { expect, test, type Page, type TestInfo } from "@playwright/test";

type QaRole = "teacher" | "student";

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  return { email: process.env[`${prefix}_EMAIL`], password: process.env[`${prefix}_PASSWORD`] };
}

async function login(page: Page, role: QaRole, testInfo: TestInfo) {
  const credentials = credentialsFor(role);
  test.skip(!credentials.email || !credentials.password, `${role} QA credentials are not configured`);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(credentials.email!);
  await page.locator('input[name="password"]').fill(credentials.password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await testInfo.attach(`aud020-${role}`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function openStudentDetail(page: Page) {
  const alumnado = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
  await expect(alumnado).toBeVisible();
  await alumnado.click();
  await expect(page.getByRole("heading", { name: "Personas, sin ruido" })).toBeVisible({ timeout: 20_000 });
  const row = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
  await expect(row).toBeVisible();
  await row.locator(".student-row-main").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  return dialog;
}

for (const width of [390, 430] as const) {
  test(`AUD-020 student portal keeps objective-first hierarchy at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page, "student", testInfo);

    const portalNav = page.getByRole("navigation", { name: "Portal CYA" });
    await expect(portalNav).toBeVisible();
    const now = page.locator('section[aria-labelledby="portal-now-title"]');
    await expect(now).toBeVisible();
    await expect(now.getByRole("heading", { name: "Lo que merece tu atención" })).toBeVisible();

    const summary = page.locator('section[aria-label="Resumen de tu espacio"]');
    await expect(summary).toBeVisible();
    await expect(summary.getByRole("button", { name: /BZ Points/i })).toBeVisible();
    await expect(summary.getByRole("button", { name: /Misiones/i })).toBeVisible();
    await expect(summary.getByRole("button", { name: /En progreso/i })).toBeVisible();

    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      nowOrder: Number.parseInt(getComputedStyle(document.querySelector('section[aria-labelledby="portal-now-title"]')!).order || "0", 10),
      summaryOrder: Number.parseInt(getComputedStyle(document.querySelector('section[aria-label="Resumen de tu espacio"]')!).order || "0", 10),
    }));
    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.nowOrder).toBeLessThan(metrics.summaryOrder);

    const undersized = await portalNav.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width < 44 || rect.height < 44;
    }).length);
    expect(undersized).toBe(0);
  });
}

test("AUD-020 teacher student detail behaves as four-goal cockpit without overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "teacher", testInfo);
  const dialog = await openStudentDetail(page);
  const groups = dialog.getByRole("navigation", { name: "Áreas de la ficha del alumno" });

  for (const label of ["Ahora", "Aprendizaje", "Historial", "Perfil"]) {
    const button = groups.getByRole("button", { name: new RegExp(`^${label}`) });
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const containment = await dialog.evaluate((element) => ({
    overflow: element.scrollWidth - element.clientWidth,
    width: element.getBoundingClientRect().width,
    viewport: document.documentElement.clientWidth,
  }));
  expect(containment.overflow).toBeLessThanOrEqual(1);
  expect(containment.width).toBeLessThanOrEqual(containment.viewport + 1);

  await groups.getByRole("button", { name: /^Aprendizaje/ }).click();
  await expect(dialog.getByRole("navigation", { name: "Vistas de Aprendizaje" })).toBeVisible();
  await groups.getByRole("button", { name: /^Historial/ }).click();
  await expect(dialog.getByRole("navigation", { name: "Vistas de Historial" })).toBeVisible();
  await groups.getByRole("button", { name: /^Perfil/ }).click();
  await expect(dialog.getByRole("navigation", { name: "Vistas de Perfil" })).toBeVisible();
});

test("AUD-020 desktop preserves hierarchy and privacy boundaries", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page, "student", testInfo);
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible();
  await expect(page.getByText("CRM", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Notas internas", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Incidencias de saldo", { exact: true })).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
