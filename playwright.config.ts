import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  // The static-site checks need the production build served by `vite preview`; they run through
  // playwright.seo.config.ts (`npm run test:seo`) rather than against the dev server.
  testIgnore: ["**/seo-pages.spec.ts", "**/bing-seo.spec.ts"],
  // Generous for slower machines: the dev server compiles on first request.
  timeout: 45_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    // Remote sandboxes ship a pinned Chromium rather than letting Playwright
    // download one. Point PW_CHROMIUM_PATH at it to run the browser specs there.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
    // The dev server seeds fresh browsers with sample data for people; tests start empty.
    env: { VITE_DEV_SAMPLE: "0" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
