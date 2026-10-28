import type { Page } from "@playwright/test";
import { defaultLayout, layoutStorageKey } from "../../src/layout";

// New users start on the starter dashboard (four widgets). Tests about what a particular widget
// shows give the browser the full default instead, as an existing user would have. Only when no
// layout is saved yet, so a test that customises and reloads keeps its changes.
export async function useFullDashboard(page: Page) {
  const layouts = (["GB", "US"] as const).map((region) => [layoutStorageKey("dashboard", region), JSON.stringify(defaultLayout("dashboard", region))]);
  await page.addInitScript((entries) => {
    for (const [key, value] of entries) if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, layouts);
}
