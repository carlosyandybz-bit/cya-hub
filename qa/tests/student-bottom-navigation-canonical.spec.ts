import { expect, test, type Page } from "@playwright/test";

function studentCredentials() {
  const email = process.env.QA_STUDENT_EMAIL;
  const password = process.env.QA_STUDENT_PASSWORD;
  if (!email || !password) throw new Error("Student QA credentials are missing");
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = studentCredentials();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"]');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    await expect(emailInput).toBeHidden({ timeout: 20_000 });
  }
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
}

for (const width of [320, 390, 430, 768]) {
  test(`student Portal CYA navigation is stable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await login(page);

    const nav = page.getByRole("navigation", { name: "Portal CYA" });
    for (const label of ["Inicio", "Progreso", "Mi formación", "Descubre", "Misiones"]) {
      await expect(nav.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeVisible();
    }

    const geometry = await nav.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const buttons = [...element.querySelectorAll<HTMLElement>("button")].map((button) => {
        const box = button.getBoundingClientRect();
        return {
          label: button.getAttribute("aria-label") || button.textContent?.trim() || "",
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
          centerX: box.left + box.width / 2,
        };
      });
      return {
        nav: { left: rect.left, right: rect.right, width: rect.width, centerX: rect.left + rect.width / 2 },
        buttons,
        viewportWidth: window.innerWidth,
      };
    });

    expect(geometry.nav.left).toBeGreaterThanOrEqual(0);
    expect(geometry.nav.right).toBeLessThanOrEqual(geometry.viewportWidth);
    for (const button of geometry.buttons) {
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
    }

    const formation = geometry.buttons.find((button) => button.label === "Mi formación");
    const toggle = geometry.buttons.find((button) => button.label === "Abrir apartados de Mi formación");
    if (!formation || !toggle) throw new Error("Student formation controls are missing");
    expect(Math.abs(formation.centerX - toggle.centerX)).toBeLessThanOrEqual(3);
    expect(toggle.top).toBeLessThan(formation.top);

    await noHorizontalOverflow(page);

    const toggleButton = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
    await toggleButton.click();
    await expect(toggleButton).toHaveAttribute("aria-expanded", "true");
    const sheet = page.getByRole("menu", { name: "Apartados de Mi formación" });
    await expect(sheet).toBeVisible();
    for (const label of ["Resumen", "A practicar", "Clases realizadas", "Contenido"]) {
      await expect(sheet.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }
    await noHorizontalOverflow(page);

    await sheet.getByRole("button", { name: "Cerrar" }).click();
    await expect(sheet).toBeHidden();

    for (const label of ["Inicio", "Progreso", "Descubre", "Misiones"]) {
      const button = nav.getByRole("button", { name: new RegExp(`^${label}$`) });
      await button.click();
      await expect(button).toBeVisible();
      await noHorizontalOverflow(page);
    }
  });
}

test("student navigation remains contained at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  await expect(nav).toBeVisible();
  await noHorizontalOverflow(page);
  const box = await nav.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1281);
});
