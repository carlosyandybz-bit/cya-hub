import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CYA_QA_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests",
  outputDir: "../test-results-visual",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    browserName: "chromium",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "visual-gate",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
      },
    },
  ],
});
