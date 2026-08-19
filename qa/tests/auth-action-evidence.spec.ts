import { expect, test } from "@playwright/test";
import { ActionEvidence } from "./action-evidence";

type QaRole = "teacher" | "student" | "admin";

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

test.describe("Authentication — per-action visual evidence", () => {
  test("invalid credentials expose a clear validation state", async ({ page }, testInfo) => {
    const evidence = new ActionEvidence(page, testInfo, "autenticacion", "inicio-sesion-invalido");

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await evidence.capture("abrir pantalla", "inicial");

    const email = page.locator('input[name="email"]');
    const password = page.locator('input[name="password"]');
    await evidence.after("escribir email invalido", () => email.fill("qa-invalid@example.invalid"), "escrito");
    await evidence.after("escribir password invalido", () => password.fill("CyaQA-invalid-password"), "escrito");
    await evidence.after("pulsar entrar invalido", () => page.getByRole("button", { name: /^Entrar$/ }).click(), "validacion");

    await expect(page.locator("body")).toContainText("El email o la contraseña no son correctos.");
    await evidence.capture("mensaje credenciales incorrectas", "error-visible");
  });

  for (const role of ["teacher", "student", "admin"] as const) {
    test(`${role} login is evidenced after every interaction`, async ({ page }, testInfo) => {
      const credentials = credentialsFor(role);
      const evidence = new ActionEvidence(page, testInfo, "autenticacion", `inicio-sesion-${role}`);

      await page.goto("/", { waitUntil: "domcontentloaded" });
      await evidence.capture("abrir pantalla", "inicial");

      const email = page.locator('input[name="email"]');
      const password = page.locator('input[name="password"]');
      await evidence.after("escribir email", () => email.fill(credentials.email), "escrito");
      await evidence.after("escribir password", () => password.fill(credentials.password), "escrito");
      await evidence.after("pulsar entrar", () => page.getByRole("button", { name: /^Entrar$/ }).click(), "transicion");

      await expect(email).toBeHidden({ timeout: 20_000 });
      if (role === "student") {
        await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible();
      } else {
        await expect(page.locator("body")).toContainText("Dar clase");
      }
      await evidence.capture("sesion autenticada", "exito");
    });
  }
});
