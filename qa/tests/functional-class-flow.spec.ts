import { expect, test, type Page, type TestInfo } from "@playwright/test";

type QaRole = "teacher" | "student" | "admin";
type ProjectFixture = {
  classId: number;
  durationMinutes: number;
  durationLabel: string;
  creditLabel: string;
};
type QaFixtures = {
  studentName: string;
  style: string;
  role: string;
  level: string;
  projects: Record<string, ProjectFixture>;
};

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

function qaFixtures(): QaFixtures {
  const raw = process.env.QA_FIXTURES_JSON;
  if (!raw) throw new Error("QA_FIXTURES_JSON is missing");
  return JSON.parse(raw) as QaFixtures;
}

async function login(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function resetBrowserSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 20_000 });
}

async function attachCheckpoint(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test.describe("CYA Hub functional class lifecycle", () => {
  test.describe.configure({ retries: 0 });

  test("teacher closes a QA class, student receives it, and admin remains healthy", async ({ page }, testInfo) => {
    // P0F: evaluation is the student's shared optional state. P0G: correction metrics/note are selected before adding and the collapsed card stays compact.
    const fixtures = qaFixtures();
    const fixture = fixtures.projects[testInfo.project.name];
    if (!fixture) throw new Error(`No functional fixture for ${testInfo.project.name}`);
    const runId = process.env.QA_RUN_ID || "local";
    const correctionTitle = `QA E2E corrección ${runId} ${testInfo.project.name}`;
    const correctionObservation = `QA E2E observación corrección ${runId} ${testInfo.project.name}`;
    const observation = `QA E2E observación ${runId} ${testInfo.project.name}`;
    const studentSummary = `QA E2E resumen ${runId} ${testInfo.project.name}`;

    await login(page, "teacher");
    const visibleClassNav = page.locator("nav button:visible").filter({ hasText: /^Dar clase$/ }).first();
    await expect(visibleClassNav).toBeVisible();
    await visibleClassNav.click();
    await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible();
    if ((page.viewportSize()?.width ?? 9999) <= 720) {
      await expect(page.locator(".mobile-nav")).toBeVisible();
      for (const label of ["Inicio", "Alumnado", "Dar clase", "Enseñanza", "Marketing"]) {
        await expect(page.locator(".mobile-nav").getByRole("button", { name: new RegExp(`^${label}$`) })).toBeVisible();
      }
    }

    const classRow = page.locator(".scheduled-section .class-center-row")
      .filter({ hasText: fixtures.studentName })
      .filter({ hasText: fixture.durationLabel })
      .first();
    await expect(classRow).toBeVisible();
    await classRow.click();

    const startClassButton = page.getByRole("main").getByRole("button", { name: "Dar clase", exact: true });
    await expect(startClassButton).toBeVisible();
    if ((page.viewportSize()?.width ?? 9999) <= 720) await expect(page.locator(".mobile-nav")).toBeVisible();
    await startClassButton.click();
    await expect(page.getByText("EN CLASE", { exact: true })).toBeVisible({ timeout: 20_000 });
    if ((page.viewportSize()?.width ?? 9999) <= 720) await expect(page.locator(".mobile-nav")).toBeHidden();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-teacher-live-start`);

    const observationsTab = page.getByRole("button", { name: "Observaciones", exact: true }).first();
    await expect(observationsTab).toBeVisible();
    await observationsTab.click();
    const studentNoteCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Observación" }) });
    await studentNoteCard.locator('textarea[placeholder="Mensaje o recomendación para el resumen…"]').fill(observation);
    await studentNoteCard.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(observation, { exact: true })).toBeVisible({ timeout: 15_000 });

    const workTab = page.getByRole("button", { name: "Trabajo", exact: true }).first();
    await expect(workTab).toBeVisible();
    await workTab.click();

    const quickCreate = page.locator("details.quick-content-create");
    await quickCreate.locator("summary").click();
    await quickCreate.locator("select").first().selectOption("correction");
    await quickCreate.locator('input[placeholder="Título corto"]').fill(correctionTitle);
    await quickCreate.getByLabel("Frecuencia inicial").selectOption("50");
    await quickCreate.getByLabel("Influencia inicial").selectOption("75");
    await quickCreate.locator('textarea[placeholder="Algo concreto de este alumno…"]').fill(correctionObservation);
    await quickCreate.getByLabel("Visibilidad de la observación inicial").selectOption("internal");
    await quickCreate.getByRole("button", { name: "Crear", exact: true }).click();
    await expect(page.getByText(correctionTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("EN CLASE", { exact: true })).toBeVisible();

    const createdCorrection = page.locator(".live-content-card").filter({ hasText: correctionTitle }).first();
    await expect(createdCorrection).toBeVisible();
    await expect(createdCorrection.getByText("Pend.", { exact: true })).toBeVisible();
    await expect(createdCorrection.locator('[aria-label="Frecuencia: A menudo"]')).toBeVisible();
    await expect(createdCorrection.locator('[aria-label="Influencia: Limita claramente el movimiento"]')).toBeVisible();
    await expect(createdCorrection.getByText("+ Medir", { exact: true })).toHaveCount(0);
    await expect(createdCorrection.getByText("NUEVO", { exact: true })).toBeVisible();

    await createdCorrection.getByRole("button", { name: `Abrir Corrección: ${correctionTitle}` }).click();
    const correctionDialog = page.getByRole("dialog", { name: `Corrección: ${correctionTitle}` });
    await expect(correctionDialog).toBeVisible();
    await expect(correctionDialog.getByLabel(`Estado de ${correctionTitle}`)).toHaveValue("pending");
    await expect(correctionDialog.getByLabel(`Frecuencia de ${correctionTitle}`)).toHaveValue("50");
    await expect(correctionDialog.getByLabel(`Influencia de ${correctionTitle}`)).toHaveValue("75");
    await expect(correctionDialog.getByLabel("Observación del alumno")).toHaveValue(correctionObservation);
    await correctionDialog.getByRole("button", { name: "Cerrar contenido" }).click();

    await page.getByRole("button", { name: /^Terminar$/ }).click();
    const finishDialog = page.locator("section:visible").filter({ has: page.getByRole("heading", { name: "Terminar clase" }) }).last();
    await expect(finishDialog.getByRole("heading", { name: "Terminar clase" })).toBeVisible();
    await expect(finishDialog.locator("select").first()).not.toHaveValue("");
    await finishDialog.getByRole("button", { name: "Terminar clase" }).click();

    await expect(page.getByText("Administración terminada", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/nunca bloquea el cierre de esta clase/)).toBeVisible();
    await page.getByRole("button", { name: /Preparar resumen/ }).click();
    await expect(page.getByRole("heading", { name: "Resumen de la clase" })).toBeVisible();
    await page.locator('textarea[placeholder="Resumen, recomendaciones o recordatorio visible"]').fill(studentSummary);
    await page.getByRole("button", { name: /Cerrar y enviar al alumno/ }).click();
    await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible({ timeout: 20_000 });
    if ((page.viewportSize()?.width ?? 9999) <= 720) await expect(page.locator(".mobile-nav")).toBeVisible();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-teacher-class-closed`);

    await resetBrowserSession(page);
    await login(page, "student");
    await expect(page.getByText("Profesor · CARLOS Y ANDY", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("QA · Profesor", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Resumen de mis clases" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(studentSummary, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observaciones de mis clases" })).toBeVisible();
    await expect(page.getByText(observation, { exact: true })).toBeVisible();
    const classHistory = page.locator("article").filter({ has: page.getByRole("heading", { name: "Mis clases" }) });
    await expect(classHistory.getByText("Realizada", { exact: true }).first()).toBeVisible();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-student-received-class`);

    await resetBrowserSession(page);
    await login(page, "admin");
    const adminEntry = page.getByRole("button", { name: /Administración/ });
    await expect(adminEntry).toBeVisible({ timeout: 20_000 });
    await adminEntry.click();
    await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Equipo y roles/ }).click();
    const adminPanel = page.getByRole("main");
    await expect(adminPanel.getByText("QA · Profesor", { exact: true }).first()).toBeVisible();
    await expect(adminPanel.getByText("QA · Alumno", { exact: true }).first()).toBeVisible();
    await expect(adminPanel.getByText("QA · Administrador", { exact: true }).first()).toBeVisible();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-admin-healthy`);
  });
});