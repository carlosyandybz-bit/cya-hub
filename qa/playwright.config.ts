import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CYA_QA_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["line"],
    ["html", { outputFolder: "../playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "iphone-large-chromium",
      use: {
        ...devices["iPhone 15 Pro Max"],
        browserName: "chromium",
      },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
