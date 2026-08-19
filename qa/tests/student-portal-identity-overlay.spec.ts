import { expect, test, type Page } from "@playwright/test";

function studentCredentials() {
  return { email: process.env.QA_STUDENT_EMAIL, password: process.env.QA_STUDENT_PASSWORD };
}

async function loginStudent(page: Page) {
  const { email, password } = studentCredentials();
  test.skip(!email || !password, "Student QA credentials are not configured");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email!);
  await page.locator('input[name="password"]').fill(password!);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.getByRole("navigation", { name: "Portal CYA" })).toBeVisible({ timeout: 20_000 });
}

const screens = [
  ["Inicio", "student-home"],
  ["Progreso", "student-progress"],
  ["Mi formación", "student-formation"],
  ["Descubre", "student-discover"],
  ["Misiones", "student-missions"],
] as const;

test("student portal applies stable module identity to every primary screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginStudent(page);
  const nav = page.getByRole("navigation", { name: "Portal CYA" });

  const seenAccents = new Set<string>();
  for (const [label, theme] of screens) {
    await nav.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page.locator("body")).toHaveAttribute("data-cya-module", theme);

    const identity = await page.evaluate(() => {
      const portalNav = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]');
      const root = portalNav?.parentElement;
      const rootBefore = root ? getComputedStyle(root, "::before") : null;
      return {
        accent: getComputedStyle(document.body).getPropertyValue("--cya-module-accent").trim(),
        watermark: rootBefore?.backgroundImage || "none",
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(identity.accent).not.toBe("");
    expect(identity.watermark).toContain("cya-logo.png");
    expect(identity.overflow).toBeLessThanOrEqual(1);
    seenAccents.add(identity.accent);
  }

  expect(seenAccents.size).toBe(screens.length);
});

test("student formation menu stays between sticky header and bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginStudent(page);

  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  const toggle = nav.getByRole("button", { name: "Abrir apartados de Mi formación" });
  await toggle.click();

  const menu = page.getByRole("menu", { name: "Apartados de Mi formación" });
  await expect(menu).toBeVisible();

  const geometry = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="Apartados de Mi formación"]')!;
    const nav = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]')!;
    const root = nav.parentElement!;
    const header = root.querySelector<HTMLElement>(":scope > header")!;
    const menuBox = menu.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const headerBox = header.getBoundingClientRect();
    return {
      menuTop: menuBox.top,
      menuBottom: menuBox.bottom,
      headerBottom: headerBox.bottom,
      navTop: navBox.top,
      viewportHeight: window.innerHeight,
      headerPosition: getComputedStyle(header).position,
      navPosition: getComputedStyle(nav).position,
      menuPosition: getComputedStyle(menu).position,
    };
  });

  expect(geometry.headerPosition).toBe("sticky");
  expect(geometry.navPosition).toBe("fixed");
  expect(geometry.menuPosition).toBe("fixed");
  expect(geometry.menuTop).toBeGreaterThanOrEqual(geometry.headerBottom + 4);
  expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.navTop - 2);
  expect(geometry.menuTop).toBeGreaterThanOrEqual(0);
  expect(geometry.menuBottom).toBeLessThanOrEqual(geometry.viewportHeight);

  await menu.getByRole("button", { name: /A practicar/i }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator("body")).toHaveAttribute("data-cya-module", "student-formation");
});

test("student bottom navigation does not hide the final content at scroll end", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginStudent(page);
  const nav = page.getByRole("navigation", { name: "Portal CYA" });

  for (const label of ["Progreso", "Descubre", "Misiones"] as const) {
    await nav.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(80);
    const clearance = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Portal CYA"]')!;
      const main = nav.parentElement!.querySelector<HTMLElement>(":scope > main")!;
      return {
        navTop: nav.getBoundingClientRect().top,
        viewportHeight: window.innerHeight,
        bottomPadding: Number.parseFloat(getComputedStyle(main).paddingBottom) || 0,
      };
    });
    expect(clearance.bottomPadding).toBeGreaterThanOrEqual(clearance.viewportHeight - clearance.navTop - 2);
  }
});
