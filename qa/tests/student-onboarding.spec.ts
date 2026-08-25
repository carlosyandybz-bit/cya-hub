import { expect, test } from "@playwright/test";
import { loginAs } from "./visual-auth";

test("QA onboarding-required student completes registration profile and stays portal-ready after reload and relogin", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const initial = await loginAs(page, "student_onboarding", "Alumno", { expectedStudentState: "ONBOARDING_REQUIRED" });
  expect(initial.studentEntry).toBe("ONBOARDING_REQUIRED");

  const heading = page.getByRole("heading", { name: "Completa tus datos personales", exact: true });
  await expect(heading).toBeVisible();

  const firstName = page.getByLabel("Nombre *");
  const lastName = page.getByLabel("Apellidos *");
  const phone = page.getByLabel("Teléfono *");
  const country = page.getByLabel("País *");
  await expect(firstName).toHaveAttribute("required", "");
  await expect(lastName).toHaveAttribute("required", "");
  await expect(phone).toHaveAttribute("required", "");
  await expect(country).toHaveValue("");

  await testInfo.attach("student-onboarding-required-initial", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await firstName.fill("QA");
  await lastName.fill("Alumno Onboarding");
  await phone.fill("+34999999002");
  await page.getByRole("button", { name: "Guardar y entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Completa todos los datos obligatorios para continuar.");

  await country.selectOption("ES");
  await page.getByRole("button", { name: "Guardar y entrar", exact: true }).click();

  const portal = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(portal).toBeVisible({ timeout: 20_000 });
  await expect(heading).toHaveCount(0);

  await testInfo.attach("student-onboarding-completed-portal", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(portal).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Completa tus datos personales", exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload({ waitUntil: "domcontentloaded" });

  const relogin = await loginAs(page, "student_onboarding", "Alumno", { expectedStudentState: "PORTAL_READY" });
  expect(relogin.studentEntry).toBe("PORTAL_READY");
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible();
});
