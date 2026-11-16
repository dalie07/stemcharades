import { defineConfig, devices } from "@playwright/test";

const PORT = 3150;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1, // several browsers per test already; keep runs deterministic on the small CI machine
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Locally use the installed Google Chrome; CI installs Playwright's own Chromium.
    channel: process.env.CI ? undefined : "chrome",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: process.env.CI ? undefined : "chrome" } }],
  webServer: {
    command: "npm run build && npm start",
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000, // a busy or small machine can take well over a minute to build and boot
    env: { PORT: String(PORT), NODE_ENV: "production", ALLOW_DRAFT_CARDS: "1" },
  },
});
