import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: ['seo-pages.spec.ts', 'bing-seo.spec.ts'],
  timeout: 30_000, expect: { timeout: 7_000 },
  use: { baseURL: 'http://127.0.0.1:4177', trace: 'retain-on-failure', ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
  webServer: { command: 'npm run preview -- --port 4177 --strictPort', url: 'http://127.0.0.1:4177', reuseExistingServer: false },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['Pixel 5'] } }],
});
