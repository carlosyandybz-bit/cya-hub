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

async function completeInitialEvaluationIfPresent(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Evaluación inicial guiada" });
  const appeared = await dialog.waitFor({ state: "visible", timeout: 7_000 }).then(() => true).catch(() => false);
  if (!appeared) return false;

  const completeButton = dialog.getByRole("button", { name: "Completar evaluación inicial" });
  for (let guard = 0; guard < 30; guard += 1) {
    if (await completeButton.isEnabled()) break;
    const question = dialog.locator("section").filter({
      hasText: "¿Cuál de estas opciones describe mejor lo que observas ahora mismo?",
    }).last();
    await expect(question).toBeVisible({ timeout: 15_000 });
    const answers = question.getByRole("button");
    const answerCount = await answers.count();
    if (!answerCount) throw new Error("Initial evaluation has no answer options");
    const answer = answers.nth(Math.min(3, answerCount - 1));
    await expect(answer).toBeEnabled({ timeout: 15_000 });
    await answer.click();
  }

  await expect(completeButton).toBeEnabled({ timeout: 15_000 });
  await completeButton.click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  return true;
}

async function completePostClassEvaluation(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const dialog = page.getByRole("dialog", { name: "Evaluación posterior a la clase" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByRole("heading", { name: "Revisión de evaluación" })).toBeVisible();

  const selects = dialog.locator("select");
  const count = await selects.count();
  if (!count) throw new Error("Post-class evaluation has no questions");
  for (let index = 0; index < count; index += 1) {
    const select = selects.nth(index);
    await expect(select).toBeEnabled({ timeout: 15_000 });
    if ((await select.inputValue()) === "") {
      await select.selectOption({ index: 1 });
      await expect(select).not.toHaveValue("", { timeout: 15_000 });
    }
  }

  const registerButton = dialog.getByRole("button", { name: /Registrar revisión/ });
  await expect(registerButton).toBeEnabled({ timeout: 15_000 });
  await registerButton.click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test.describe("CYA Hub functional class lifecycle", () => {
  test.describe.configure({ retries: 0 });

  test("teacher closes a QA class, student receives it, and admin remains healthy", async ({ page }, testInfo) => {
    const fixtures = qaFixtures();
    const fixture = fixtures.projects[testInfo.project.name];
    if (!fixture) throw new Error(`No functional fixture for ${testInfo.project.name}`);
    const runId = process.env.QA_RUN_ID || "local";
    const correctionTitle = `QA E2E corrección ${runId} ${testInfo.project.name}`;
    const observation = `QA E2E observación ${runId} ${testInfo.project.name}`;
    const studentSummary = `QA E2E resumen ${runId} ${testInfo.project.name}`;

    await login(page, "teacher");
    const visibleClassNav = page.locator("nav button:visible").filter({ hasText: /^Dar clase$/ }).first();
    await expect(visibleClassNav).toBeVisible();
    await visibleClassNav.click();
    await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible();

    const classRow = page.locator(".scheduled-section .class-center-row")
      .filter({ hasText: fixtures.studentName })
      .filter({ hasText: fixture.durationLabel })
      .first();
    await expect(classRow).toBeVisible();
    await classRow.click();

    const startClassButton = page.getByRole("main").getByRole("button", { name: "Dar clase", exact: true });
    await expect(startClassButton).toBeVisible();
    await startClassButton.click();
    await expect(page.getByText("DANDO CLASE", { exact: true })).toBeVisible({ timeout: 20_000 });
    await completeInitialEvaluationIfPresent(page);
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-teacher-live-start`);

    const quickCreate = page.locator("details").filter({ hasText: "Crear nuevo" });
    await quickCreate.locator("summary").click();
    await quickCreate.locator("select").first().selectOption("correction");
    await quickCreate.locator('input[placeholder="Título corto"]').fill(correctionTitle);
    await quickCreate.locator("label").filter({ hasText: "Medir por" }).locator("select").selectOption("both");
    await quickCreate.locator("label").filter({ hasText: /^Frecuencia/ }).locator("select").selectOption("50");
    await quickCreate.locator("label").filter({ hasText: /^Importancia/ }).locator("select").selectOption("75");
    await quickCreate.getByRole("button", { name: "Guardar pendiente" }).click();
    await expect(page.getByText(correctionTitle, { exact: true })).toBeVisible({ timeout: 15_000 });

    const observationsTab = page.getByRole("button", { name: "Observaciones", exact: true }).first();
    await expect(observationsTab).toBeVisible();
    await observationsTab.click();
    const studentNoteCard = page.locator("article").filter({ has: page.getByRole("heading", { name: "Observación" }) });
    await studentNoteCard.locator('textarea[placeholder="Mensaje o recomendación para el resumen…"]').fill(observation);
    await studentNoteCard.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText(observation, { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /^Terminar$/ }).click();
    const finishDialog = page.locator("section:visible").filter({ has: page.getByRole("heading", { name: "Terminar clase" }) }).last();
    await expect(finishDialog.getByRole("heading", { name: "Terminar clase" })).toBeVisible();
    await expect(finishDialog.locator("select").first()).not.toHaveValue("");
    await finishDialog.getByRole("button", { name: "Terminar clase" }).click();

    await completePostClassEvaluation(page);
    await expect(page.getByText("Administración terminada", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Sí, preparar resumen/ }).click();
    await expect(page.getByRole("heading", { name: "Resumen de la clase" })).toBeVisible();
    await page.locator('textarea[placeholder="Resumen, recomendaciones o recordatorio visible"]').fill(studentSummary);
    await page.getByRole("button", { name: /Cerrar y enviar al alumno/ }).click();
    await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible({ timeout: 20_000 });
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-teacher-class-closed`);

    await resetBrowserSession(page);
    await login(page, "student");
    await expect(page.getByRole("heading", { name: "Resumen de mis clases" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(studentSummary, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Observaciones de mis clases" })).toBeVisible();
    await expect(page.getByText(observation, { exact: true })).toBeVisible();
    const classHistory = page.locator("article").filter({ has: page.getByRole("heading", { name: "Mis clases" }) });
    await expect(classHistory.getByText("Realizada", { exact: true }).first()).toBeVisible();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-student-received-class`);

    await resetBrowserSession(page);
    await login(page, "admin");
    await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Equipo y roles/ }).click();
    await expect(page.getByText("QA · Profesor", { exact: true })).toBeVisible();
    await expect(page.getByText("QA · Alumno", { exact: true })).toBeVisible();
    await expect(page.getByText("QA · Administrador", { exact: true })).toBeVisible();
    await attachCheckpoint(page, testInfo, `${testInfo.project.name}-admin-healthy`);
  });
});
