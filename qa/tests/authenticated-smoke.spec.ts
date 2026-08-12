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
