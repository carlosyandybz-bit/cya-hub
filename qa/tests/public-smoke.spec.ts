import { expect, test } from "@playwright/test";

test.describe("CYA Hub public shell", () => {
  test("login renders correctly and fits the viewport", async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const failedRequests: Array<{ url: string; error: string }> = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      failedRequests.push({
        url: request.url(),
        error: request.failure()?.errorText || "unknown request failure",
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Tu trabajo, en un solo sitio." })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: /^Entrar$/ })).toBeVisible();

    const viewport = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth + 1);

    await testInfo.attach("login-screen", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await testInfo.attach("browser-observations", {
      body: Buffer.from(JSON.stringify({ consoleErrors, failedRequests, viewport }, null, 2)),
      contentType: "application/json",
    });
  });

  test("runtime config exposes only valid public Supabase configuration", async ({ request }) => {
    const response = await request.get("/api/runtime-config", {
      headers: { accept: "application/json" },
    });
    expect(response.status()).toBe(200);

    const body = await response.json() as {
      configured?: boolean;
      supabaseUrl?: string;
      supabasePublishableKey?: string;
      [key: string]: unknown;
    };

    expect(body.configured).toBe(true);
    expect(body.supabaseUrl).toMatch(/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
    expect(body.supabasePublishableKey).toMatch(/^sb_publishable_/);

    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toContain("service_role");
    expect(serialized).not.toContain("sb_secret_");
  });
});
