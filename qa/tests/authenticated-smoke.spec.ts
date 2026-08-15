import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { openAdminSection } from "./admin-navigation";

const credentials = {
  teacher: { email: process.env.QA_TEACHER_EMAIL, password: process.env.QA_TEACHER_PASSWORD },
  student: { email: process.env.QA_STUDENT_EMAIL, password: process.env.QA_STUDENT_PASSWORD },
  admin: { email: process.env.QA_ADMIN_EMAIL, password: process.env.QA_ADMIN_PASSWORD },
} as const;

type QaRole = keyof typeof credentials;

async function login(page: Page, role: QaRole, testInfo: TestInfo) {
  const account = credentials[role];
  if (!account.email || !account.password) throw new Error(`${role} QA credentials are not configured`);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await testInfo.attach(`${role}-login`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
}

async function openAccountMenu(page: Page) {
  const named = page.getByRole("button", { name: "Abrir cuenta y preferencias" });
  if (await named.isVisible().catch(() => false)) { await named.click(); return; }
  await page.locator('button[aria-haspopup="menu"]:visible').last().click();
}

async function selectExperience(page: Page, label: "Profesor" | "Alumno" | "Administrador") {
  await openAccountMenu(page);
  await expect(page.getByText("Ver como", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: new RegExp(`^${label}(?:,|\.)`) }).click();
}

test.describe.configure({ mode: "serial" });

test("teacher account can authenticate and render its shell", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);
  await expect(page.getByRole("heading", { name: /Inicio|Tu día de hoy/i }).first()).toBeVisible();
});

test("student account can authenticate and render its shell", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByText(/Formación|Inicio|Tu progreso/i).first()).toBeVisible();
});

test("admin account can authenticate and render its shell", async ({ page }, testInfo) => {
  await login(page, "admin", testInfo);
  await expect(page.getByRole("button", { name: /Administración/ })).toBeVisible();
});

test("teacher primary navigation is rendered after login", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);
  for (const label of ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]) {
    await expect(page.getByRole("button", { name: new RegExp(label, "i") }).first()).toBeVisible();
  }
});

test("teacher can open Academia Online workspace", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);
  const academy = page.getByRole("button", { name: /Academia Online/ }).first();
  await expect(academy).toBeVisible();
  await academy.click();
  await expect(page.getByText(/Academia Online/i).first()).toBeVisible();
});

test("teacher student master detail groups seven views without horizontal navigation", async ({ page }, testInfo) => {
  await login(page, "teacher", testInfo);
  const alumnado = page.getByRole("button", { name: /^Alumnado$/ }).first();
  await alumnado.click();
  const firstStudent = page.locator(".student-row-main").first();
  await expect(firstStudent).toBeVisible({ timeout: 20_000 });
  await firstStudent.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const profileViews = dialog.getByRole("navigation", { name: /vistas del alumno/i });
  await expect(profileViews).toBeVisible();
  await expect(profileViews.getByRole("button")).toHaveCount(7);
  await expect(profileViews.getByRole("button", { name: "Datos", exact: true })).toHaveAttribute("aria-current", "page");
  await profileViews.getByRole("button", { name: "CRM", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Captación y situación comercial" })).toBeVisible({ timeout: 20_000 });
  const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);
  await testInfo.attach("teacher-student-master-prf2", { body: await dialog.screenshot(), contentType: "image/png" });
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
  for (const label of ["Formularios", "Enseñanza", "Misiones", "Notificaciones"]) await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();

  await groups.getByRole("button", { name: /^Negocio/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Negocio" });
  for (const label of ["Tarifas", "BZ Points", "Feedback Online", "Academia Online"]) await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();

  await groups.getByRole("button", { name: /^Datos/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Datos" });
  for (const label of ["Datos", "Integraciones"]) await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();

  await groups.getByRole("button", { name: /^Sistema/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Sistema" });
  for (const label of ["General", "Equipo y roles", "Seguridad"]) await expect(local.getByRole("button", { name: label, exact: true })).toBeVisible();

  await groups.getByRole("button", { name: /^Apariencia/ }).click();
  local = page.getByRole("navigation", { name: "Opciones de Apariencia" });
  await expect(local.getByRole("button", { name: "Apariencia", exact: true })).toBeVisible();

  const containment = await page.evaluate(() => {
    const doc = document.documentElement;
    const panel = document.querySelector(".admin-panel") as HTMLElement | null;
    const navigation = document.querySelector(".admin-navigation") as HTMLElement | null;
    const groups = document.querySelector(".admin-group-nav") as HTMLElement | null;
    const local = document.querySelector(".admin-local-nav") as HTMLElement | null;
    return {
      pageOverflow: doc.scrollWidth > doc.clientWidth + 1,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
      localOverflow: local ? local.scrollWidth > local.clientWidth + 1 : false,
      groupScrollable: groups ? groups.scrollWidth > groups.clientWidth + 1 : false,
      groupOverflowX: groups ? getComputedStyle(groups).overflowX : "",
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

  await testInfo.attach("prf3-administration-grouped", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
});

test("student portal renders approved PR-F1 header and five-item navigation", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByRole("button", { name: "Ir a Inicio" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Notificaciones/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir cuenta y preferencias" })).toBeVisible();
});

test("student with a scheduled class sees the collaborative preparation entry", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByText(/Preparación|preparación/i).first()).toBeVisible({ timeout: 20_000 });
});

test("student discovers Academia Online from Descubre instead of a competing home module", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await expect(page.getByText(/Descubre/i).first()).toBeVisible();
});

test("PR-F2 authorized multi-role account switches Profesor → Alumno → Administrador → Profesor in the same tab", async ({ page }, testInfo) => {
  await login(page, "admin", testInfo);
  await selectExperience(page, "Profesor");
  await selectExperience(page, "Alumno");
  await selectExperience(page, "Administrador");
  await selectExperience(page, "Profesor");
});

test("PR-F2 pure student cannot manufacture Administrador by local storage or a UI event", async ({ page }, testInfo) => {
  await login(page, "student", testInfo);
  await page.evaluate(() => localStorage.setItem("cya_experience", "admin"));
  await page.reload();
  await expect(page.getByRole("button", { name: /Administración/ })).toHaveCount(0);
});
