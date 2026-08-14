import { expect, type Page } from "@playwright/test";

const SECTION_GROUP: Record<string, string> = {
  "General": "Sistema",
  "Equipo y roles": "Sistema",
  "Seguridad": "Sistema",
  "Formularios": "Enseñanza",
  "Enseñanza": "Enseñanza",
  "Misiones": "Enseñanza",
  "Notificaciones": "Enseñanza",
  "Tarifas": "Negocio",
  "BZ Points": "Negocio",
  "Feedback Online": "Negocio",
  "Academia Online": "Negocio",
  "Datos": "Datos",
  "Integraciones": "Datos",
  "Apariencia": "Apariencia",
};

export async function openAdminSection(page: Page, section: string) {
  const group = SECTION_GROUP[section];
  if (!group) throw new Error(`Unknown Administration section: ${section}`);

  const groupNav = page.getByRole("navigation", { name: "Áreas de Administración" });
  const localNav = page.getByRole("navigation", { name: `Opciones de ${group}` });
  const currentLocal = localNav.getByRole("button", { name: section, exact: true });

  if (!(await currentLocal.isVisible().catch(() => false))) {
    const groupButton = groupNav.getByRole("button", { name: new RegExp(`^${group}(?:\s|$)`) });
    await expect(groupButton).toBeVisible({ timeout: 15_000 });
    await groupButton.click();
  }

  const button = page.getByRole("navigation", { name: `Opciones de ${group}` }).getByRole("button", { name: section, exact: true });
  await expect(button).toBeVisible({ timeout: 15_000 });
  await button.click();
}
