import { defineConfig, devices } from '@playwright/test';
import { sandboxLaunchOptions } from './playwright.browser';
export default defineConfig({
  testDir: './tests', testMatch: ['seo-pages.spec.ts', 'bing-seo.spec.ts'],
  timeout: 30_000, expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://127.0.0.1:4177', trace: 'retain-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
    // Pinned-browser fallback for remote sandboxes, as in playwright.config.ts.
    ...sandboxLaunchOptions(),
  },
  webServer: { command: 'npm run preview -- --port 4177 --strictPort', url: 'http://127.0.0.1:4177', reuseExistingServer: false },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 5'] } }],
});
