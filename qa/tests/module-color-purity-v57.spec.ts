import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./visual-auth";

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
