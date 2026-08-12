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
type EvaluationSession = {
  id: number;
  person_id: number;
  style_term_id: number;
  role_term_id: number;
  level_term_id: number;
  status: string;
};
type ProgressRow = { id: number };
type ParticipantRow = { person_id: number };
type ScaleRow = { id: number };
type SessionIdRow = { id: number };

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

async function supabaseRequest<T>(page: Page, path: string, method = "GET", body?: Record<string, unknown>): Promise<T> {
  const result = await page.evaluate(async ({ path, method, body }) => {
    const configResponse = await fetch("/api/runtime-config", { cache: "no-store" });
    const config = await configResponse.json() as { supabaseUrl?: string; supabasePublishableKey?: string };
    if (!config.supabaseUrl || !config.supabasePublishableKey) throw new Error("Missing runtime Supabase config");

    const authKey = Object.keys(window.localStorage).find((key) => key.startsWith("sb-") && key.endsWith("-auth-token"));
    if (!authKey) throw new Error("Missing Supabase auth storage");
    const auth = JSON.parse(window.localStorage.getItem(authKey) || "{}") as { access_token?: string };
    if (!auth.access_token) throw new Error("Missing Supabase access token");

    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${auth.access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase ${method} ${path}: ${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }, { path, method, body });
  return result as T;
}

async function rpc<T>(page: Page, name: string, body: Record<string, unknown>): Promise<T> {
  return supabaseRequest<T>(page, `rpc/${name}`, "POST", body);
}

async function firstEvaluationScale(page: Page) {
  const rows = await supabaseRequest<ScaleRow[]>(page, "catalog_terms?taxonomy=eq.evaluation_scale&active=eq.true&select=id&order=sort_order.asc&limit=1");
  if (!rows[0]?.id) throw new Error("QA evaluation scale is missing");
  return rows[0].id;
}

async function reviewSession(page: Page, session: EvaluationSession, scaleId: number) {
  const query = [
    "student_aptitude_progress?select=id",
    `person_id=eq.${session.person_id}`,
    `style_term_id=eq.${session.style_term_id}`,
    `role_term_id=eq.${session.role_term_id}`,
    `level_term_id=eq.${session.level_term_id}`,
  ].join("&");
  const progress = await supabaseRequest<ProgressRow[]>(page, query);
  if (!progress.length) throw new Error(`Evaluation session ${session.id} has no progress questions`);
  for (const row of progress) {
    await rpc(page, "review_evaluation_question", {
      p_session_id: session.id,
      p_progress_id: row.id,
      p_scale_term_id: scaleId,
      p_descriptor_id: null,
      p_note: null,
    });
  }
}

async function completeQaPostClassEvaluation(page: Page, classId: number) {
  const participants = await supabaseRequest<ParticipantRow[]>(page, `class_participants?class_id=eq.${classId}&select=person_id`);
  if (!participants.length) throw new Error(`QA class ${classId} has no participants`);
  const scaleId = await firstEvaluationScale(page);
  for (const participant of participants) {
    const raw = await rpc<EvaluationSession | EvaluationSession[]>(page, "prepare_post_class_evaluations", {
      p_class_id: classId,
      p_person_id: participant.person_id,
    });
    const sessions = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (!sessions.length) throw new Error(`QA class ${classId} has no post-class evaluation session`);
    for (const session of sessions) {
      if (session.status === "completed") continue;
      await reviewSession(page, session, scaleId);
      await rpc(page, "complete_post_class_evaluation", { p_session_id: session.id });
    }
  }
}

test.describe("CYA Hub functional class lifecycle", () => {
  test.describe.configure({ retries: 0 });

  test("teacher closes a QA class, student receives it, and admin remains healthy", async ({ page }, testInfo) => {
    // P0E: the teacher works before any baseline exists; the post-class review may become the first valid evaluation.
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
    await expect(page.getByText("DANDO CLASE", { exact: true })).toBeVisible({ timeout: 20_000 });
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

    const quickCreate = page.locator("details").filter({ hasText: "Crear nuevo" });
    await quickCreate.locator("summary").click();
    await quickCreate.locator("select").first().selectOption("correction");
    await quickCreate.locator('input[placeholder="Título corto"]').fill(correctionTitle);
    await quickCreate.locator("label").filter({ hasText: "Medir por" }).locator("select").selectOption("both");
    await quickCreate.locator("label").filter({ hasText: /^Frecuencia/ }).locator("select").selectOption("50");
    await quickCreate.locator("label").filter({ hasText: /^Importancia/ }).locator("select").selectOption("75");
    await quickCreate.getByRole("button", { name: "Guardar pendiente" }).click();
    await expect(page.getByText(correctionTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("DANDO CLASE", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /^Terminar$/ }).click();
    const finishDialog = page.locator("section:visible").filter({ has: page.getByRole("heading", { name: "Terminar clase" }) }).last();
    await expect(finishDialog.getByRole("heading", { name: "Terminar clase" })).toBeVisible();
    await expect(finishDialog.locator("select").first()).not.toHaveValue("");
    await finishDialog.getByRole("button", { name: "Terminar clase" }).click();

    await completeQaPostClassEvaluation(page, fixture.classId);
    await expect(page.getByText("Administración terminada", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /Sí, preparar resumen/ }).click();
    await expect(page.getByRole("heading", { name: "Resumen de la clase" })).toBeVisible();
    await page.locator('textarea[placeholder="Resumen, recomendaciones o recordatorio visible"]').fill(studentSummary);
    await page.getByRole("button", { name: /Cerrar y enviar al alumno/ }).click();
    await expect(page.getByRole("heading", { name: "Centro de clases" })).toBeVisible({ timeout: 20_000 });
    if ((page.viewportSize()?.width ?? 9999) <= 720) await expect(page.locator(".mobile-nav")).toBeVisible();
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
