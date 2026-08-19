import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./visual-auth";

async function resolvedCssColor(page: Page, variable: string) {
  return page.evaluate((variableName) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${variableName})`;
    probe.style.position = "fixed";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, variable);
}

async function cssSnapshot(page: Page, activeSelector: string, centralSelector: string) {
  return page.evaluate(({ activeSelector, centralSelector }) => {
    const active = document.querySelector<HTMLElement>(activeSelector);
    const central = document.querySelector<HTMLElement>(centralSelector);
    const probe = document.createElement("span");
    probe.style.color = "var(--cya-module-accent)";
    probe.style.position = "fixed";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      module: document.body.dataset.cyaModule || "",
      accent,
      activeColor: active ? getComputedStyle(active).color : "",
      centralBackground: central ? getComputedStyle(central).backgroundImage : "",
      centralFilter: central ? getComputedStyle(central).filter : "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, { activeSelector, centralSelector });
}

async function performTouchPullRefresh(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const indicator = page.getByTestId("cya-pull-refresh");
  await expect(indicator).toHaveAttribute("data-phase", "idle");

  await page.evaluate(() => {
    const target = document.body;
    const point = (clientY: number) => ({ clientX: Math.max(24, window.innerWidth / 2), clientY });
    const fire = (type: string, touches: Array<{ clientX: number; clientY: number }>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", { configurable: true, value: touches });
      Object.defineProperty(event, "changedTouches", { configurable: true, value: touches });
      target.dispatchEvent(event);
    };
    fire("touchstart", [point(18)]);
    fire("touchmove", [point(190)]);
    fire("touchend", []);
  });

  await expect(indicator).toHaveAttribute("data-phase", /refreshing|success/, { timeout: 5_000 });
  await expect(indicator).toHaveAttribute("data-phase", "idle", { timeout: 10_000 });
}

async function expectStableAfterRefresh(page: Page, expectedModule: string, activeSelector: string, centralSelector: string) {
  const before = await cssSnapshot(page, activeSelector, centralSelector);
  expect(before.module).toBe(expectedModule);
  await performTouchPullRefresh(page);
  await expect(page.locator("body")).toHaveAttribute("data-cya-module", expectedModule);
  const after = await cssSnapshot(page, activeSelector, centralSelector);
  expect(after.module).toBe(expectedModule);
  expect(after.accent).toBe(before.accent);
  expect(after.activeColor).toBe(before.activeColor);
}

test("teacher modules own their active accent and central control treatment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "teacher", "Profesor");
  const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
  const modules = [
    ["Inicio", "home"],
    ["Alumnado", "students"],
    ["Dar clase", "live"],
    ["Enseñanza", "teaching"],
    ["Marketing", "marketing"],
  ] as const;

  const accents = new Set<string>();
  const centralTreatments = new Set<string>();
  for (const [label, module] of modules) {
    await nav.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page.locator("body")).toHaveAttribute("data-cya-module", module);
    const snap = await cssSnapshot(
      page,
      'nav.mobile-nav[aria-label="Navegación principal"] button.active',
      'nav.mobile-nav[aria-label="Navegación principal"] button.primary',
    );
    expect(snap.module).toBe(module);
    expect(snap.accent).not.toBe("");
    expect(snap.activeColor).toBe(snap.accent);
    expect(snap.overflow).toBeLessThanOrEqual(1);
    accents.add(snap.accent);
    centralTreatments.add(`${snap.centralBackground}|${snap.centralFilter}`);
  }
  expect(accents.size).toBe(modules.length);
  expect(centralTreatments.size).toBeGreaterThanOrEqual(4);
});

test("teacher module identity survives real pull-to-refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "teacher", "Profesor");
  const nav = page.locator('nav.mobile-nav[aria-label="Navegación principal"]');
  await nav.getByRole("button", { name: /^Alumnado$/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-cya-module", "students");
  await expectStableAfterRefresh(
    page,
    "students",
    'nav.mobile-nav[aria-label="Navegación principal"] button.active',
    'nav.mobile-nav[aria-label="Navegación principal"] button.primary',
  );
});

test("student primary screens own distinct accents without color drift", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "student", "Alumno");
  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  const modules = [
    ["Inicio", "student-home"],
    ["Progreso", "student-progress"],
    ["Mi formación", "student-formation"],
    ["Descubre", "student-discover"],
    ["Misiones", "student-missions"],
  ] as const;

  const accents = new Set<string>();
  for (const [label, module] of modules) {
    await nav.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).click();
    await expect(page.locator("body")).toHaveAttribute("data-cya-module", module);
    const snap = await cssSnapshot(
      page,
      'nav[aria-label="Portal CYA"] button[class*="active"]',
      'nav[aria-label="Portal CYA"] [class*="formationMain"]',
    );
    expect(snap.module).toBe(module);
    expect(snap.accent).not.toBe("");
    expect(snap.activeColor).toBe(snap.accent);
    expect(snap.overflow).toBeLessThanOrEqual(1);
    accents.add(snap.accent);
  }
  expect(accents.size).toBe(modules.length);
});

test("student screen identity survives real pull-to-refresh", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "student", "Alumno");
  const nav = page.getByRole("navigation", { name: "Portal CYA" });
  await nav.getByRole("button", { name: /^Progreso$/i }).click();
  await expect(page.locator("body")).toHaveAttribute("data-cya-module", "student-progress");
  await expectStableAfterRefresh(
    page,
    "student-progress",
    'nav[aria-label="Portal CYA"] button[class*="active"]',
    'nav[aria-label="Portal CYA"] [class*="formationMain"]',
  );
});

test("administration keeps one teal identity across every admin category", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "admin", "Administrador");
  await expect(page.locator("body")).toHaveAttribute("data-cya-module", "admin");

  const accent = await resolvedCssColor(page, "--cya-module-accent");
  const groups = page.getByRole("navigation", { name: "Áreas de Administración" });
  for (const label of ["Sistema", "Enseñanza", "Negocio", "Datos", "Apariencia"]) {
    const button = groups.getByRole("button", { name: new RegExp(`^${label}`) });
    await button.click();
    await expect(page.locator("body")).toHaveAttribute("data-cya-module", "admin");
    const currentAccent = await resolvedCssColor(page, "--cya-module-accent");
    expect(currentAccent).toBe(accent);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});

test("portal semantic badge keeps success colour instead of module accent", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "teacher", "Profesor");
  await page.locator('nav.mobile-nav[aria-label="Navegación principal"]').getByRole("button", { name: /^Alumnado$/i }).click();
  const portalBadge = page.locator(".student-row .badge.portal").first();
  test.skip((await portalBadge.count()) === 0, "No portal badge is present in the QA dataset");
  const success = await resolvedCssColor(page, "--cya-success");
  const accent = await resolvedCssColor(page, "--cya-module-accent");
  const actual = await portalBadge.evaluate((element) => getComputedStyle(element).color);
  expect(actual).toBe(success);
  expect(actual).not.toBe(accent);
});

test("reduced motion disables v57/v58 transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, "teacher", "Profesor");
  const control = page.locator('nav.mobile-nav[aria-label="Navegación principal"] button').filter({ hasText: "Alumnado" }).first();
  await expect(control).toBeVisible();
  const transition = await control.evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transition.split(",").every((part) => part.trim() === "0s")).toBe(true);
});
