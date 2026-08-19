import { expect, test, type Page, type TestInfo } from "@playwright/test";

function teacherCredentials() {
  return {
    email: process.env.QA_TEACHER_EMAIL,
    password: process.env.QA_TEACHER_PASSWORD,
  };
}

async function loginTeacher(page: Page, testInfo: TestInfo) {
  const credentials = teacherCredentials();
  test.skip(!credentials.email || !credentials.password, "teacher QA credentials are not configured");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(credentials.email!);
  await page.locator('input[name="password"]').fill(credentials.password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText("CYA Hub no ha podido conectar con sus datos.");

  await testInfo.attach("student-master-profile-login", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

async function openMasterData(page: Page, testInfo: TestInfo) {
  await loginTeacher(page, testInfo);

  const alumnado = page.locator("nav button:visible").filter({ hasText: /^Alumnado$/ }).first();
  await expect(alumnado).toBeVisible();
  await alumnado.click();
  await expect(page.getByRole("heading", { name: "Personas, sin ruido" })).toBeVisible({ timeout: 20_000 });

  const studentRow = page.locator(".student-row").filter({ hasText: "QA · Alumno" }).first();
  await expect(studentRow).toBeVisible();
  await studentRow.locator(".student-row-main").click();

  const dialog = page.getByRole("dialog").filter({ hasText: "QA · Alumno" });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByText("Ficha maestra del alumno", { exact: true })).toBeVisible();

  const groups = dialog.getByRole("navigation", { name: "Áreas de la ficha del alumno" });
  await groups.getByRole("button", { name: /^Perfil/ }).click();

  const profileViews = dialog.getByRole("navigation", { name: "Vistas de Perfil" });
  await expect(profileViews.getByRole("button", { name: "Datos", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.locator('[data-student-detail-tab="data"]')).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Datos principales" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Datos personales e históricos" })).toBeVisible();

  return dialog;
}

for (const width of [320, 390, 430]) {
  test(`student master Datos is a readable single-column mobile sheet at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const dialog = await openMasterData(page, testInfo);

    const dataRoot = dialog.locator(':scope > div:last-child > div');
    const sections = dataRoot.locator(":scope > section");
    await expect(sections).toHaveCount(4);

    const rootGeometry = await dataRoot.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      columns: getComputedStyle(element).gridTemplateColumns,
    }));
    expect(rootGeometry.scrollWidth).toBeLessThanOrEqual(rootGeometry.clientWidth + 1);

    const sectionWidths = await sections.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
    for (const sectionWidth of sectionWidths) expect(sectionWidth).toBeGreaterThanOrEqual(rootGeometry.width - 2);

    const identity = sections.filter({ hasText: "Datos principales" }).first();
    await expect(identity).toBeVisible();
    const facts = identity.locator(":scope > div:last-child > div");
    expect(await facts.count()).toBeGreaterThanOrEqual(6);

    const factGeometry = await facts.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      const value = node.querySelector("strong");
      const valueStyle = value ? getComputedStyle(value) : null;
      return {
        width: rect.width,
        height: rect.height,
        valueWhiteSpace: valueStyle?.whiteSpace,
        valueTextOverflow: valueStyle?.textOverflow,
      };
    }));

    const identityWidth = (await identity.boundingBox())?.width ?? 0;
    for (const fact of factGeometry) {
      expect(fact.width).toBeGreaterThanOrEqual(identityWidth - 30);
      expect(fact.height).toBeGreaterThanOrEqual(60);
      expect(fact.valueWhiteSpace).toBe("normal");
      expect(fact.valueTextOverflow).not.toBe("ellipsis");
    }

    await testInfo.attach(`student-master-data-${width}`, {
      body: await dialog.screenshot(),
      contentType: "image/png",
    });
  });
}

test("student master Datos keeps spacious two-column facts on desktop without four-column compression", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await openMasterData(page, testInfo);

  const dataRoot = dialog.locator(':scope > div:last-child > div');
  const sections = dataRoot.locator(":scope > section");
  await expect(sections).toHaveCount(4);

  const rootBox = await dataRoot.boundingBox();
  expect(rootBox).not.toBeNull();
  const sectionWidths = await sections.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  for (const sectionWidth of sectionWidths) expect(sectionWidth).toBeGreaterThanOrEqual((rootBox?.width ?? 0) - 2);

  const identity = sections.filter({ hasText: "Datos principales" }).first();
  await expect(identity).toBeVisible();
  const facts = identity.locator(":scope > div:last-child > div");
  const boxes = (await Promise.all((await facts.all()).map((fact) => fact.boundingBox()))).filter(Boolean);
  expect(boxes.length).toBeGreaterThanOrEqual(6);

  const identityWidth = (await identity.boundingBox())?.width ?? 0;
  for (const box of boxes) {
    expect(box!.width).toBeGreaterThan(identityWidth * 0.43);
    expect(box!.height).toBeGreaterThanOrEqual(60);
  }

  const overflow = await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);

  await testInfo.attach("student-master-data-desktop", {
    body: await dialog.screenshot(),
    contentType: "image/png",
  });
});
