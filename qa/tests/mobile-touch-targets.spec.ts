import { expect, test, type Page } from "@playwright/test";

type QaRole = "teacher" | "admin";
type TouchTarget = { tag: string; label: string; width: number; height: number };

function credentialsFor(role: QaRole) {
  const prefix = `QA_${role.toUpperCase()}`;
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${role} QA credentials are missing`);
  return { email, password };
}

async function login(page: Page, role: QaRole) {
  const { email, password } = credentialsFor(role);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await expect(page.locator('input[name="email"]')).toBeHidden({ timeout: 20_000 });
}

async function undersizedTargets(page: Page): Promise<TouchTarget[]> {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const style = getComputedStyle(element);
      const box = (element as HTMLElement).getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && box.width > 0 && box.height > 0;
    };
    const labelFor = (element: Element) => {
      const html = element as HTMLElement;
      return (element.getAttribute("aria-label") || element.getAttribute("title") || html.innerText || (element as HTMLInputElement).placeholder || (element as HTMLInputElement).name || "")
        .replace(/\s+/g, " ").trim().slice(0, 160);
    };
    const effectiveTarget = (element: Element) => {
      const input = element as HTMLInputElement;
      if (element.tagName === "INPUT" && ["checkbox", "radio"].includes(input.type)) {
        const label = element.closest("label");
        if (label && visible(label)) return label;
      }
      return element;
    };

    const interactives = Array.from(document.querySelectorAll("button,a,input,select,textarea,summary,[role='button']")).filter(visible);
    const seen = new Set<Element>();
    return interactives.flatMap((element) => {
      const target = effectiveTarget(element);
      if (seen.has(target)) return [];
      seen.add(target);
      const box = (target as HTMLElement).getBoundingClientRect();
      if (box.width >= 44 && box.height >= 44) return [];
      return [{
        tag: target.tagName.toLowerCase(),
        label: labelFor(target) || labelFor(element),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }];
    });
  });
}

async function assertMobileSurface(page: Page, surface: string) {
  if ((page.viewportSize()?.width ?? 9999) > 720) return;
  await page.waitForTimeout(250);
  const targets = await undersizedTargets(page);
  expect(targets, `${surface}: every visible interactive target must be at least 44x44 CSS px on mobile`).toEqual([]);
}

async function clickMobileNav(page: Page, label: string) {
  const button = page.locator(".mobile-nav button:visible").filter({ hasText: new RegExp(`^${label}$`, "i") }).first();
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
}

test.describe("P0C mobile touch target gate", () => {
  test.describe.configure({ retries: 0 });

  test("teacher audited surfaces keep effective targets at or above 44px", async ({ page }) => {
    // CYA-AUD-013/P0E is outside P0C and is hidden only inside this unrelated audit.
    await login(page, "teacher");
    if ((page.viewportSize()?.width ?? 9999) > 720) return;

    await assertMobileSurface(page, "teacher-Inicio");
    await clickMobileNav(page, "Alumnado"); await assertMobileSurface(page, "teacher-Alumnado");
    await clickMobileNav(page, "Dar clase"); await assertMobileSurface(page, "teacher-Dar clase");
    await clickMobileNav(page, "Enseñanza"); await assertMobileSurface(page, "teacher-Enseñanza");
    await clickMobileNav(page, "Marketing"); await assertMobileSurface(page, "teacher-Marketing");
  });

  test("administration audited surfaces keep effective targets at or above 44px", async ({ page }) => {
    await login(page, "admin");
    if ((page.viewportSize()?.width ?? 9999) > 720) return;

    const adminEntry = page.getByRole("button", { name: /Administración/ });
    await expect(adminEntry).toBeVisible({ timeout: 20_000 });
    await adminEntry.click();
    await expect(page.getByRole("heading", { name: "Estado de CYA Hub" })).toBeVisible({ timeout: 20_000 });
    await assertMobileSurface(page, "admin-General");

    for (const section of ["Equipo y roles", "Formularios", "Enseñanza", "Misiones", "Notificaciones", "Datos", "Integraciones", "Apariencia", "Seguridad"]) {
      const button = page.getByRole("main").getByRole("button", { name: new RegExp(`^${section}$`, "i") }).first();
      await expect(button).toBeVisible({ timeout: 15_000 });
      await button.click();
      await assertMobileSurface(page, `admin-${section}`);
    }
  });
});
