import { expect, test, type Page, type TestInfo } from "@playwright/test";

type QaRole = "teacher" | "student" | "admin";

type Credentials = {
  email?: string;
  password?: string;
};

function credentialsFor(role: QaRole): Credentials {
  const prefix = `QA_${role.toUpperCase()}`;
  return {
    email: process.env[`${prefix}_EMAIL`],
    password: process.env[`${prefix}_PASSWORD`],
  };
}

async function login(page: Page, role: QaRole, testInfo: TestInfo) {
  const credentials = credentialsFor(role);
  test.skip(!credentials.email || !credentials.password, `${role} QA credentials are not configured`);

  const consoleErrors: string[] = [];
  const failedRequests: Array<{ url: string; error: string }> = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText || "unknown request failure",
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(credentials.email!);
  await page.locator('input[name="password"]').fill(credentials.password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();

  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText("El email o la contraseña no son correctos.");
  await expect(page.locator("body")).not.toContainText("CYA Hub no ha podido conectar con sus datos.");

  await testInfo.attach(`${role}-authenticated-screen`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await testInfo.attach(`${role}-browser-observations`, {
    body: Buffer.from(JSON.stringify({ consoleErrors, failedRequests }, null, 2)),
    contentType: "application/json",
  });
}

async function openAccountMenu(page: Page) {
  const headerTrigger = page.getByRole("button", { name: "Abrir cuenta y preferencias" });
  if (await headerTrigger.isVisible().catch(() => false)) {
    await headerTrigger.click();
    return;
  }
  const sidebarTrigger = page.locator('button[aria-haspopup="menu"]:visible').last();
  await expect(sidebarTrigger).toBeVisible();
  await sidebarTrigger.click();
}

async function selectExperience(page: Page, label: "Profesor" | "Alumno" | "Administrador") {
  await openAccountMenu(page);
  await expect(page.getByText("Ver como", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${label}(?:,|\\.)`) }).click();
}

for (const role of ["teacher", "student", "admin"] as const) {
  test(`${role} account can authenticate and render its shell`, async ({ page }, testInfo) => {
    await login(page, role, testInfo);
  });
}

test("teacher primary navigation is rendered after login", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);

  for (const label of ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]) {
    await expect(page.locator("body")).toContainText(label);
  }
});

test("teacher can open Academia Online workspace", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);
  await page.getByRole("button", { name: "Academia Online", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Programas y formación online" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Programas");
  await expect(page.locator("body")).toContainText("Matrículas activas");
});

test("student portal renders approved PR-F1 header and five-item navigation", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);

  await expect(page.getByRole("button", { name: "Ir a Inicio" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Notificaciones/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir cuenta y preferencias" })).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(nav).toBeVisible();
  for (const label of ["Inicio", "Progreso", "Mi formación", "Descubre", "Misiones"]) {
    await expect(nav.getByText(label, { exact: true })).toBeVisible();
  }

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(horizontalOverflow).toBe(false);

  await testInfo.attach("student-prf1-home", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("student with a scheduled class sees the collaborative preparation entry", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByRole("heading", { name: "¿Qué te apetece trabajar cuando nos veamos?" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Envíanos un vídeo", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Pega un enlace de Instagram, YouTube…")).toBeVisible();
});

test("student discovers Academia Online from Descubre instead of a competing home module", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  await nav.getByRole("button", { name: /Descubre/i }).click();
  await expect(page.locator("body")).toContainText("APRENDE ONLINE");
  await expect(page.locator("body")).toContainText("EVENTOS");
  await expect(page.locator("body")).toContainText("Academia Online");
  await expect(page.getByRole("heading", { name: "Próximamente" })).toBeVisible();
});

test("PR-F2 authorized multi-role account switches Profesor → Alumno → Administrador → Profesor in the same tab", async ({ page }, testInfo) => {
  await login(page, "admin", testInfo);

  await selectExperience(page, "Profesor");
  await expect(page.locator("body")).toContainText("Dar clase");

  await selectExperience(page, "Alumno");
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Abrir cuenta y preferencias" })).toBeVisible();

  await selectExperience(page, "Administrador");
  await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });

  await selectExperience(page, "Profesor");
  await expect(page.locator("body")).toContainText("Dar clase");

  await testInfo.attach("prf2-authorized-experience-cycle", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("PR-F2 pure student cannot manufacture Administrador by local storage or a UI event", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible();

  await page.evaluate(() => {
    window.localStorage.setItem("cya:experience", "admin");
    window.dispatchEvent(new CustomEvent("cya:experience-change", { detail: "admin" }));
  });

  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toHaveCount(0);

  await openAccountMenu(page);
  await expect(page.getByText("Ver como", { exact: true })).toHaveCount(0);
});
