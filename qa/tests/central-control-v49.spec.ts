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

test.describe("canonical CYA split control", () => {
  test("Dar clase and disclosure form one centered horizontal control on mobile", async ({ page }) => {
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
        primary: { left: a.left, right: a.right, top: a.top, bottom: a.bottom, width: a.width, height: a.height, cy: a.top + a.height / 2 },
        secondary: { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height, cy: b.top + b.height / 2 },
        nav: { left: n.left, right: n.right, width: n.width, cx: n.left + n.width / 2 },
        groupCx: (a.left + b.right) / 2,
        viewportWidth: window.innerWidth,
      };
    });

    expect(Math.abs(geometry.primary.cy - geometry.secondary.cy)).toBeLessThanOrEqual(2);
    expect(Math.abs(geometry.groupCx - geometry.nav.cx)).toBeLessThanOrEqual(6);
    expect(geometry.primary.width).toBeGreaterThanOrEqual(94);
    expect(geometry.primary.height).toBeGreaterThanOrEqual(54);
    expect(geometry.secondary.width).toBeGreaterThanOrEqual(40);
    expect(geometry.secondary.height).toBeGreaterThanOrEqual(54);

    const seam = geometry.secondary.left - geometry.primary.right;
    expect(Math.abs(seam)).toBeLessThanOrEqual(8);

    expect(geometry.primary.left).toBeGreaterThanOrEqual(0);
    expect(geometry.secondary.right).toBeLessThanOrEqual(geometry.viewportWidth);

    const primaryStyle = await primary.evaluate((el) => getComputedStyle(el));
    expect(primaryStyle.backgroundImage).toContain("gradient");

    await secondary.click();
    await expect(secondary).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator('.mobile-class-sheet[role="menu"]')).toBeVisible();
  });
});
