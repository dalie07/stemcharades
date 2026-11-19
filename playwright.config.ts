import { defineConfig, devices } from "@playwright/test";

const PORT = 3150;

// Locally the tests drive the installed Google Chrome. CI installs Playwright's own Chromium instead.
const channel = process.env.CI ? undefined : "chrome";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // Each test already opens several browsers; one worker keeps runs deterministic on small machines.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], channel } }],
  webServer: {
    // The real thing: the production build served by the real server, with draft cards allowed.
    command: "npm run build && npm start",
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000, // a busy or small machine can take well over a minute to build and boot
    env: { PORT: String(PORT), NODE_ENV: "production", ALLOW_DRAFT_CARDS: "1" },
  },
});
