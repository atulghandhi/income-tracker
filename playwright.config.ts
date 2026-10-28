import { defineConfig, devices } from "@playwright/test";
import { sandboxLaunchOptions } from "./playwright.browser";

export default defineConfig({
  testDir: "./tests",
  // The static-site checks need the production build served by `vite preview`; they run through
  // playwright.seo.config.ts (`npm run test:seo`) rather than against the dev server.
  testIgnore: ["**/seo-pages.spec.ts", "**/bing-seo.spec.ts"],
  // Generous for slower machines: the dev server compiles on first request.
  timeout: 45_000,
  expect: {
    timeout: 7_000,
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    // Remote sandboxes ship pinned Chromium builds rather than letting Playwright download
    // the one it wants; when that build is missing the newest pinned one is used instead
    // (or PW_CHROMIUM_PATH, if set). See playwright.browser.ts.
    ...sandboxLaunchOptions(),
  },
  webServer: {
    // --strictPort: if 5173 is taken by something else, fail loudly instead of silently starting
    // on another port and timing out. A dev server already running on 5173 is reused as before.
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    // Cold starts pre-bundle dependencies; allow for a slow machine.
    timeout: 120_000,
    // The dev server seeds fresh browsers with sample data for people; tests start empty.
    env: { VITE_DEV_SAMPLE: "0" },
  },
  // Plain line-per-test output everywhere (the default switches to the terse dot reporter under CI).
  reporter: [["list"]],
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
