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

test("teacher student master detail groups seven views without horizontal navigation", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);

  const alumnado = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
  await expect(alumnado).toBeVisible();
  await alumnado.click();
  await expect(page.getByRole("heading", { name: "Personas, sin ruido" })).toBeVisible({ timeout: 20_000 });

  const studentRow = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
  await expect(studentRow).toBeVisible();
  await studentRow.locator(".student-row-main").click();

  const dialog = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole("button", { name: "Programar", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Bono", exact: true })).toBeVisible();

  const groups = dialog.getByRole("navigation", { name: "Áreas de la ficha del alumno" });
  await expect(groups).toBeVisible();
  for (const label of ["Ahora", "Aprendizaje", "Historial", "Perfil"]) {
    await expect(groups.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Aprendizaje/ }).click();
  const learningViews = dialog.getByRole("navigation", { name: "Vistas de Aprendizaje" });
  await expect(learningViews.getByRole("button", { name: "Formación", exact: true })).toHaveAttribute("aria-current", "page");
  await learningViews.getByRole("button", { name: "Evaluación", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Evolución por aptitud" })).toBeVisible({ timeout: 20_000 });

  await groups.getByRole("button", { name: /^Historial/ }).click();
  const historyViews = dialog.getByRole("navigation", { name: "Vistas de Historial" });
  await expect(historyViews.getByRole("button", { name: "Clases", exact: true })).toHaveAttribute("aria-current", "page");
  await historyViews.getByRole("button", { name: "Bonos", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Saldo e historial" })).toBeVisible({ timeout: 20_000 });

  await groups.getByRole("button", { name: /^Perfil/ }).click();
  const profileViews = dialog.getByRole("navigation", { name: "Vistas de Perfil" });
  await expect(profileViews.getByRole("button", { name: "Datos", exact: true })).toHaveAttribute("aria-current", "page");
  await profileViews.getByRole("button", { name: "CRM", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Captación y situación comercial" })).toBeVisible({ timeout: 20_000 });

  const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);

  await testInfo.attach("teacher-student-master-prf2", {
    body: await dialog.screenshot(),
    contentType: "image/png",
  });
});

test("PR-F3 Administration groups fourteen destinations with a contained P36 mobile category scroller", async ({ page }, testInfo) => {
  await login(page, "admin", testInfo);
  await selectExperience(page, "Administrador");
  await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });

  const groups = page.getByRole("navigation", { name: "Áreas de Administración" });
  await expect(groups).toBeVisible();
  for (const label of ["Sistema", "Enseñanza", "Negocio", "Datos", "Apariencia"]) {
    await expect(groups.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Enseñanza/ }).click();
  let local = page.getByRole("navigation", { name: "Opciones de Enseñanza" });
  for (const label of ["Formularios", "Enseñanza", "Misiones", "Notificaciones"]) {
    await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Negocio/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Negocio" });
  for (const label of ["Tarifas", "BZ Points", "Feedback Online", "Academia Online"]) {
    await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Datos/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Datos" });
  for (const label of ["Datos", "Integraciones"]) {
    await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Sistema/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Sistema" });
  for (const label of ["General", "Equipo y roles", "Seguridad"]) {
    await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await groups.getByRole("button", { name: /^Apariencia/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Apariencia" });
  await expect(local.getByRole("button", { name: "Apariencia", exact: true })).toBeVisible();

  const containment = await page.evaluate(() => {
    const doc = document.documentElement;
    const panel = document.querySelector(".admin-panel") as HTMLElement | null;
    const groupNav = document.querySelector(".admin-group-nav") as HTMLElement | null;
    const localNav = document.querySelector(".admin-local-nav") as HTMLElement | null;
    const navigation = document.querySelector(".admin-navigation") as HTMLElement | null;
    return {
      pageOverflow: doc.scrollWidth > doc.clientWidth + 1,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
      localOverflow: localNav ? localNav.scrollWidth > localNav.clientWidth + 1 : false,
      groupOverflowX: groupNav ? getComputedStyle(groupNav).overflowX : "",
      navigationOverflow: navigation ? navigation.scrollWidth > navigation.clientWidth + 1 : false,
    };
  });
  expect(containment.pageOverflow).toBe(false);
  expect(containment.panelOverflow).toBe(false);
  expect(containment.localOverflow).toBe(false);
  if ((page.viewportSize()?.width ?? 9999) <= 820) {
    expect(["auto", "scroll"]).toContain(containment.groupOverflowX);
  } else {
    expect(containment.navigationOverflow).toBe(false);
  }

  await testInfo.attach("prf3-administration-grouped", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
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
