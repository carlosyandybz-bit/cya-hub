import { expect, test, type Page } from "@playwright/test";

function teacherCredentials() {
  const email = process.env.QA_TEACHER_EMAIL;
  const password = process.env.QA_TEACHER_PASSWORD;
  if (!email || !password) throw new Error("Teacher QA credentials are missing");
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = teacherCredentials();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

test.describe("v49 canonical central control", () => {
  test("Dar clase and Más remain centered, stacked and compact on mobile", async ({ page }) => {
    await login(page);
    const viewport = page.viewportSize();
    if (!viewport || viewport.width > 720) return;

    const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
    const primary = nav.locator('button[data-nav-item="live"]');
    const secondary = nav.getByRole("button", { name: "Más opciones de clase" });

    await expect(nav).toBeVisible();
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    const geometry = await page.evaluate(() => {
      const primary = document.querySelector<HTMLElement>('.mobile-nav button[data-nav-item="live"]');
      const secondary = document.querySelector<HTMLElement>('.mobile-nav .mobile-nav-secondary');
      const nav = document.querySelector<HTMLElement>('.mobile-nav');
      if (!primary || !secondary || !nav) throw new Error("Central controls are missing");
      const a = primary.getBoundingClientRect();
      const b = secondary.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return {
        primary: { left: a.left, right: a.right, top: a.top, bottom: a.bottom, width: a.width, height: a.height, cx: a.left + a.width / 2 },
        secondary: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height, cx: b.left + b.width / 2 },
        nav: { left: n.left, right: n.right, width: n.width, cx: n.left + n.width / 2 },
        viewportWidth: window.innerWidth,
      };
    });

    expect(Math.abs(geometry.primary.cx - geometry.secondary.cx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(geometry.primary.cx - geometry.nav.cx)).toBeLessThanOrEqual(3);
    expect(geometry.primary.width).toBeGreaterThanOrEqual(70);
    expect(geometry.primary.height).toBeGreaterThanOrEqual(60);
    expect(geometry.secondary.width).toBeGreaterThanOrEqual(58);
    expect(geometry.secondary.height).toBeGreaterThanOrEqual(44);
    expect(geometry.secondary.top).toBeLessThan(geometry.primary.top);

    const overlap = geometry.secondary.bottom - geometry.primary.top;
    expect(overlap).toBeGreaterThanOrEqual(8);
    expect(overlap).toBeLessThanOrEqual(20);

    expect(geometry.primary.left).toBeGreaterThanOrEqual(0);
    expect(geometry.primary.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.secondary.left).toBeGreaterThanOrEqual(0);
    expect(geometry.secondary.right).toBeLessThanOrEqual(geometry.viewportWidth);

    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('.mobile-class-sheet[role="menu"]')).toBeVisible();
  });
});
