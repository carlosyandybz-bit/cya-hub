import { expect, test, type Page } from "@playwright/test";

function teacherCredentials() {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  if (!email || !password) throw new Error("Teacher QA credentials are missing");
  return { email, password };
}

function luminance(value: string) {
  const rgb = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  if (rgb.length !== 3) return 1;
  const [r, g, b] = rgb.map((v) => v / 255);
  return .2126 * r + .7152 * g + .0722 * b;
}

async function login(page: Page) {
  const { email, password } = teacherCredentials();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator(".shell")).toBeVisible({ timeout: 20_000 });
}

for (const width of [390, 1280]) {
  test(`account menu and profile use canonical dark material at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    await login(page);

    const trigger = page.locator('button[aria-label="Abrir cuenta y preferencias"]:visible').first();
    await expect(trigger).toBeVisible();
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(triggerBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await trigger.click();

    const menu = page.getByRole("menu", { name: "Cuenta CYA" });
    await expect(menu).toBeVisible();
    const menuStyle = await menu.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius };
    });
    expect(luminance(menuStyle.background)).toBeLessThan(.32);
    expect(menuStyle.border).not.toBe("rgb(255, 255, 255)");
    expect(Number.parseFloat(menuStyle.radius)).toBeGreaterThanOrEqual(14);

    await menu.getByRole("button", { name: /Cuenta y sesión/ }).click();
    const dialog = page.getByRole("dialog", { name: "Cuenta y sesión" });
    await expect(dialog).toBeVisible();
    const dialogStyle = await dialog.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(luminance(dialogStyle.background)).toBeLessThan(.32);
    expect(dialogStyle.border).not.toBe("rgb(255, 255, 255)");
    const close = dialog.getByRole("button", { name: "Cerrar", exact: true });
    const closeBox = await close.boundingBox();
    expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await close.click();

    await trigger.click();
    await page.getByRole("menu", { name: "Cuenta CYA" }).getByRole("button", { name: /Editar perfil/ }).click();
    await expect(page.getByRole("heading", { name: "Editar perfil" })).toBeVisible();
    const nameInput = page.getByLabel("Nombre de la cuenta");
    await expect(nameInput).toBeVisible();
    const inputStyle = await nameInput.evaluate((el) => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color, border: style.borderColor };
    });
    expect(luminance(inputStyle.background)).toBeLessThan(.32);
    expect(luminance(inputStyle.color)).toBeGreaterThan(.45);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
