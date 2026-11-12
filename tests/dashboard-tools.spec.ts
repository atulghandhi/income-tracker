import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { primaryNav } from "./helpers/shell";
import { buildInsightsModel, buildFlowModel } from "../src/insightsData";
import { flowChildren } from "../src/flowDrilldown";
import { calendarLayout } from "../src/insightWidgets";
import { buildDemoLedger } from "../src/demoData";
import { calculateProjection } from "../src/finance";
import type { MonthBudget } from "../src/types";

// Dashboard exports, the multi-month calendar, the money-flow drill-down, glossary hints and the
// guided tour.

test("calendar spans year boundaries and uses each month's actual entries", () => {
  const ledger = buildDemoLedger({ today: new Date("2026-02-12T12:00:00") });
  const model = buildInsightsModel(ledger, "2026-02", { today: "2026-02-12" });
  expect(model.calendarMonths.map((month) => month.monthKey)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  for (const month of model.calendarMonths) {
    expect(month.days).toEqual(buildInsightsModel(ledger, month.monthKey, { today: "2026-02-12" }).calendar);
  }
});

test("calendar months tile to the card's width", () => {
  expect(calendarLayout(280, "4")).toEqual({ count: 4, columns: 1, rows: 4 });
  expect(calendarLayout(520, "4")).toEqual({ count: 4, columns: 2, rows: 2 });
  // Three columns would leave one month on its own row: four months stay a 2×2 block.
  expect(calendarLayout(760, "4")).toEqual({ count: 4, columns: 2, rows: 2 });
  expect(calendarLayout(1100, "4")).toEqual({ count: 4, columns: 4, rows: 1 });
  expect(calendarLayout(760, "3")).toEqual({ count: 3, columns: 3, rows: 1 });
  expect(calendarLayout(520, undefined)).toEqual({ count: 1, columns: 1, rows: 1 });
  expect(calendarLayout(520, "nonsense")).toEqual({ count: 1, columns: 1, rows: 1 });
  expect(calendarLayout(520, "9").count).toBe(4);
});

test("Other keeps its categories, and payees group only when one repeats", () => {
  const month: MonthBudget = { note: "", incomes: [], expenses: Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Shop ${i}`, category: `Category ${i}`, amount: i + 1, color: "#123456", recurring: false })) };
  const flow = buildFlowModel(month, calculateProjection(month));
  const other = flow.targets.find((node) => node.id === "cat-other")!;
  expect(flowChildren(other)).toHaveLength(4);
  expect(flowChildren(other).reduce((total, node) => total + node.value, 0)).toBe(other.value);
  const group = { ...other, id: "cat-food", children: undefined, items: [
    { id: "a", label: "Shop", value: 10, recurring: false },
    { id: "b", label: "shop", value: 20, recurring: false },
    { id: "c", label: "Cafe", value: 5, recurring: false },
  ] };
  const children = flowChildren(group);
  expect(children.map((node) => node.value)).toEqual([30, 5]);
  expect(flowChildren(children[0])).toEqual([]);
  expect(children[0].items.map((item) => item.id)).toEqual(["a", "b"]);
  // Every payee appearing once: a payee level would only repeat the list of transactions.
  expect(flowChildren({ ...group, items: group.items.filter((item) => item.id !== "b") })).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenLanding", "1");
    localStorage.setItem("onboardingComplete", "1");
    localStorage.setItem("gettingStartedDismissed", "1");
    localStorage.setItem("tutorialSeenPages", JSON.stringify(["dashboard", "settings", "ledger"]));
    if (!localStorage.getItem("it_layout_dashboard_gb")) localStorage.setItem("it_layout_dashboard_gb", JSON.stringify({ version: 2, widgets: [{ id: "snapshot", size: "xl" }, { id: "cash-flow", size: "xl" }, { id: "calendar", size: "xl" }, { id: "notes", size: "xl" }] }));
  });
});

async function openDashboard(page: Page) {
  await page.goto("/dashboard?sample=uk");
  await page.addStyleTag({ content: "*, *::before, *::after { animation: none !important; transition: none !important; }" });
}

async function exportAs(page: Page, item: string) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: item }).click();
  return download;
}

test("calendar choice persists and the card grows to hold every month", async ({ page }) => {
  await openDashboard(page);
  const calendar = page.locator('[data-widget-id="calendar"]');
  const single = (await calendar.boundingBox())!.height;
  await calendar.getByRole("radio", { name: "4 months", exact: true }).click();
  await expect(calendar.locator(".multiMonthCalendar section")).toHaveCount(4);
  expect((await calendar.boundingBox())!.height).toBeGreaterThan(single);
  // Nothing spills out of the card, and day cells are the same size in every month.
  const cells = await calendar.evaluate((element) => {
    const card = element.querySelector(".insightCard")!.getBoundingClientRect();
    const boxes = [...element.querySelectorAll(".calendarCell:not(.pad)")].map((cell) => cell.getBoundingClientRect());
    return { inside: boxes.every((box) => box.bottom <= card.bottom && box.right <= card.right + 0.5), heights: new Set(boxes.map((box) => Math.round(box.height))).size };
  });
  expect(cells).toEqual({ inside: true, heights: 1 });
  await expect(page.locator(".saveStatusChip")).toHaveClass(/saved/);
  await page.reload();
  await expect(calendar.getByRole("radio", { name: "4 months", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("glossary hints open from the keyboard and leave the stat cards aligned", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "What is surplus?", exact: true }).focus();
  await expect(page.getByRole("tooltip")).toContainText("not your bank balance");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  // A label with a hint is no taller than one without: the figures share a baseline.
  const tops = await page.locator(".metricCard strong").evaluateAll((figures) => figures.map((figure) => Math.round(figure.getBoundingClientRect().top - figure.closest(".metricCard")!.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await (await primaryNav(page)).getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByText("Financial terms explained", { exact: true }).click();
  await expect(page.locator(".financialGlossary")).toContainText("Annual percentage rate");
});

test("the tour's chapters point at what they describe without covering it", async ({ page }) => {
  await openDashboard(page);
  await (await primaryNav(page)).locator(".sideTutorialBtn").click();
  const tour = page.getByRole("dialog", { name: /tutorial/ });
  await expect(tour).toBeFocused();
  await tour.getByRole("button", { name: "Compare your calendar", exact: true }).click();
  await expect(tour.getByRole("heading", { name: "Compare your calendar", exact: true })).toBeVisible();
  const spotlight = page.locator(".tourSpotlight");
  await expect(spotlight).toBeVisible();
  // The spotlight frames the calendar, and on a wide screen the card stays clear of it.
  const calendar = (await page.locator('[data-widget-id="calendar"]').boundingBox())!;
  await expect.poll(async () => Math.round((await spotlight.boundingBox())!.y)).toBe(Math.round(calendar.y - 6));
  if (page.viewportSize()!.width >= 1000) {
    const card = (await tour.boundingBox())!;
    expect(card.x).toBeGreaterThanOrEqual(calendar.x + calendar.width);
  }
  await tour.getByRole("button", { name: "Next", exact: true }).click();
  await expect(tour.getByRole("heading", { name: "Save a dashboard report", exact: true })).toBeVisible();
  await expect(tour.getByRole("button", { name: "Got it", exact: true })).toBeVisible();
  // Escape closes it wherever focus is.
  await page.locator("body").click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(spotlight).toHaveCount(0);
});

test("money flow opens a category, then a repeated payee, and steps back out", async ({ page }) => {
  await openDashboard(page);
  // Two visits to the same shop, so its category has a payee worth opening.
  await (await primaryNav(page)).getByRole("button", { name: "Ledger", exact: true }).click();
  const quickAdd = page.getByLabel("Quick add transaction");
  for (const entry of ["costa 4.35", "costa 3.10"]) {
    await quickAdd.fill(entry);
    await quickAdd.press("Enter");
    await expect(quickAdd).toHaveValue("");
  }
  await (await primaryNav(page)).getByRole("button", { name: "Dashboard", exact: true }).click();
  const flow = page.locator('[data-widget-id="cash-flow"]');
  const select = flow.getByLabel("Explore money flow");
  const group = flow.locator(".flowGroup button");
  for (const label of (await select.locator("option").allTextContents()).slice(1)) {
    await select.selectOption({ label });
    if (await group.count()) break;
  }
  await expect(group.first()).toBeVisible();
  await expect(flow.getByRole("navigation", { name: "Money flow path" })).toHaveCount(0);
  await group.first().click();
  await expect(flow.locator(".flowItems li")).toHaveCount(2);
  await expect(flow.locator(".flowDetailHead h4")).toBeFocused();
  await expect(flow.getByRole("navigation", { name: "Money flow path" })).toBeVisible();
  await flow.getByRole("button", { name: "Back to previous group" }).click();
  await expect(group.first()).toBeVisible();
  // Escape steps out one level at a time, and focus returns to the picker.
  await page.keyboard.press("Escape");
  await expect(flow.locator(".flowDetail")).not.toHaveClass(/open/);
  await expect(select).toBeFocused();
});

test("exports the full dashboard as PNG and paginated PDF", async ({ page }) => {
  test.setTimeout(120_000);
  await openDashboard(page);
  await page.locator('[data-widget-id="calendar"]').getByRole("radio", { name: "4 months", exact: true }).click();
  const png = await exportAs(page, "Image (PNG)");
  const image = await readFile((await png.path())!);
  expect(png.suggestedFilename()).toMatch(/^income-tracker-\d{4}-\d{2}\.png$/);
  expect(image.subarray(1, 4).toString()).toBe("PNG");
  expect(image.readUInt32BE(20)).toBeGreaterThan(1500);
  await expect(page.getByRole("status").filter({ hasText: "Dashboard image saved" })).toBeVisible();
  const pdf = await exportAs(page, "PDF document");
  const document = await readFile((await pdf.path())!);
  expect(document.subarray(0, 5).toString()).toBe("%PDF-");
  // Pages end between rows of widgets, so there are at least as many as a straight cut would give.
  const straightCut = Math.ceil(image.readUInt32BE(20) / Math.floor(image.readUInt32BE(16) * 277 / 190));
  expect(document.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(straightCut);
  await expect(page.getByRole("status").filter({ hasText: "Dashboard PDF saved" })).toBeVisible();
});

test("the export menu works from the keyboard and hides while customising", async ({ page }) => {
  await openDashboard(page);
  const button = page.getByRole("button", { name: "Export", exact: true });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Image (PNG)" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "PDF document" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Export dashboard" })).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.getByRole("button", { name: "Customise the dashboard layout" }).click();
  await expect(button).toHaveCount(0);
});

test("an export with amounts hidden contains dots, not blurred figures", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.getByRole("button", { name: "Hide amounts" }).click();
  await expect(page.locator(".privacy-on")).toBeVisible();
  const download = await exportAs(page, "Image (PNG)");
  expect((await readFile((await download.path())!)).subarray(1, 4).toString()).toBe("PNG");
  await download.saveAs(test.info().outputPath("private.png"));
});
