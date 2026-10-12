import { defineConfig, devices } from "@playwright/test";

// Signed-in sync end to end: the app talks to a fake Supabase that each test serves
// through page routes (see tests-sync/), so no real project or network is needed.
export default defineConfig({
  testDir: "./tests-sync",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:5174",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:5999",
      VITE_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
    },
  },
});
