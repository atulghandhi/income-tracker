import { expect, test, type Page } from "@playwright/test";
import { starterLayout } from "../src/layout";

// The starter dashboard's last row, card heights within a row, the Credit & debt figures, and
// the floating Done button while customising.

async function openDashboard(page: Page, storedLayout?: unknown) {
  await page.addInitScript((layout) => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    // Seed once per tab: the init script runs again on reload, which must not undo the test's own changes.
    if (layout && !sessionStorage.getItem("layoutSeeded")) {
      localStorage.setItem("it_layout_dashboard_gb", JSON.stringify(layout));
      sessionStorage.setItem("layoutSeeded", "1");
    }
  }, storedLayout ?? null);
  await page.goto("/dashboard");
  await expect(page.locator("[data-widget-id='spending-pace']")).toBeVisible();
}

const box = (page: Page, id: string) => page.locator(`[data-widget-id='${id}'] .widgetBody > *`).first().boundingBox();

test("the starter layout gives Spending pace and Top categories half the row each", () => {
  const sizes = Object.fromEntries(starterLayout("dashboard", "GB").widgets.map((widget) => [widget.id, widget.size]));
  expect(sizes).toEqual({ snapshot: "xl", "cash-flow": "xl", "spending-pace": "m", categories: "m" });
});

test("on a wide screen the two starter cards share the row and line up top and bottom", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "Phones show one card per row.");
  await openDashboard(page);
  const pace = await box(page, "spending-pace");
  const categories = await box(page, "categories");
  expect(pace && categories).toBeTruthy();
  expect(Math.abs(pace!.width - categories!.width)).toBeLessThan(2);
  expect(Math.abs(pace!.y - categories!.y)).toBeLessThan(2);
  expect(Math.abs(pace!.height - categories!.height)).toBeLessThan(2);
  // Together they fill the row: no empty third beside them.
  const grid = await page.locator(".widgetGrid").boundingBox();
  expect(categories!.x + categories!.width).toBeGreaterThan(grid!.x + grid!.width - 2);
});

test("a saved starter layout nobody changed moves to the half-and-half row; a customised one is kept", async ({ page }) => {
  const oldStarter = {
    version: 2,
    widgets: [
      { id: "snapshot", size: "xl" },
      { id: "cash-flow", size: "xl" },
      { id: "spending-pace", size: "s" },
      { id: "categories", size: "s" },
    ],
  };
  await openDashboard(page, oldStarter);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("it_layout_dashboard_gb") ?? "{}"));
  expect(stored.widgets.map((widget: { size: string }) => widget.size)).toEqual(["xl", "xl", "m", "m"]);

  const customised = { ...oldStarter, widgets: [...oldStarter.widgets.slice(0, 3), { id: "categories", size: "m" }] };
  await page.evaluate((layout) => localStorage.setItem("it_layout_dashboard_gb", JSON.stringify(layout)), customised);
  await page.reload();
  await expect(page.locator("[data-widget-id='spending-pace']")).toBeVisible();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("it_layout_dashboard_gb") ?? "{}"));
  expect(kept.widgets.map((widget: { size: string }) => widget.size)).toEqual(["xl", "xl", "s", "m"]);
});

test("while customising, a floating Done appears once the header's Done has scrolled away", async ({ page }) => {
  await openDashboard(page);
  await page.locator("[data-layout-edit]").click();
  await expect(page.locator(".widgetGrid.isEditing")).toBeVisible();
  await expect(page.locator(".floatingLayoutDone")).toHaveCount(0);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const floating = page.locator(".floatingLayoutDone");
  await expect(floating).toBeVisible();
  // Fixed to the screen, inside the viewport.
  const position = await floating.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { position: getComputedStyle(element).position, bottom: rect.bottom, viewport: window.innerHeight };
  });
  expect(position.position).toBe("fixed");
  expect(position.bottom).toBeLessThanOrEqual(position.viewport);

  await floating.click();
  await expect(page.locator(".widgetGrid.isEditing")).toHaveCount(0);
  await expect(floating).toHaveCount(0);
});
