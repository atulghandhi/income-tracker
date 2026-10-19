import { expect, test } from "@playwright/test";
import { isHealthPremium, isMedicalExpense, planYearMonths, summarizeMedical } from "../src/medical";
import { EXPERIAN_BANDS, FICO_BANDS, bandFor, interpretCreditScore, toExperianScale } from "../src/creditScore";
import {
  addWidget,
  availableWidgets,
  cycleWidgetSize,
  defaultLayout,
  hiddenWidgets,
  layoutStorageKey,
  mergeLegacyLayouts,
  moveWidget,
  moveWidgetBefore,
  normalizeLayout,
  removeWidget,
  resizeWidget,
  spanFor,
} from "../src/layout";
import { APP_VIEWS, isAppPath, pathForView, viewFromPath } from "../src/routes";
import { INSIGHT_WIDGET_SPECS } from "../src/InsightWidgetCard";
import { normalizeInsightsState, setWidgetVariant, widgetInstance } from "../src/insightsState";
import { DEFAULT_HEALTH_PLAN } from "../src/finance";
import type { Account, MonthBudget } from "../src/types";

// ─── Medical spending ───────────────────────────────────────────────────────

function hsa(overrides: Partial<Account>): Account {
  return {
    id: "hsa",
    name: "HSA",
    accountClass: "savings",
    type: "hsa",
    balance: 1200,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 150,
    employerMonthlyContribution: 50,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: "2026-01",
    promoAsOf: "2026-01",
    includeInNetWorth: true,
    color: "#1",
    note: "",
    ...overrides,
  };
}

test.describe("medical spending", () => {
  test("the plan year is counted from its start month up to today", () => {
    expect(planYearMonths(1, new Date(2026, 9, 12))).toMatchObject({ startKey: "2026-01", endKey: "2026-12", monthsLeft: 2 });
    expect(planYearMonths(1, new Date(2026, 9, 12)).months).toHaveLength(10);
    expect(planYearMonths(7, new Date(2026, 9, 12))).toMatchObject({ startKey: "2026-07", monthsLeft: 8 });
    expect(planYearMonths(7, new Date(2026, 2, 1))).toMatchObject({ startKey: "2025-07", endKey: "2026-06", monthsLeft: 3 });
  });

  test("medical categories count towards the deductible, premiums do not", () => {
    expect(isMedicalExpense({ name: "Dr Smith visit", category: "Medical" })).toBe(true);
    expect(isMedicalExpense({ name: "CVS pharmacy", category: "" })).toBe(true);
    expect(isMedicalExpense({ name: "Health insurance premium", category: "Medical" })).toBe(false);
    expect(isHealthPremium({ name: "Health insurance", category: "Medical" })).toBe(true);
    expect(isMedicalExpense({ name: "Groceries", category: "Food" })).toBe(false);
  });

  test("summarises spend against the deductible and out-of-pocket maximum with HSA/FSA balances", () => {
    const months: Record<string, MonthBudget> = {
      "2025-12": { incomes: [], expenses: [{ id: "old", name: "Dentist", category: "Medical", amount: 400, color: "#1", recurring: false }], note: "" },
      "2026-03": {
        incomes: [],
        expenses: [
          { id: "a", name: "Doctor visit", category: "Medical", amount: 300, color: "#1", recurring: false },
          { id: "b", name: "Health insurance", category: "Medical", amount: 200, color: "#1", recurring: true },
        ],
        note: "",
      },
      "2026-08": { incomes: [], expenses: [{ id: "c", name: "Pharmacy", category: "Health", amount: 150, color: "#1", recurring: false }], note: "" },
    };
    const summary = summarizeMedical({
      months,
      healthPlan: { ...DEFAULT_HEALTH_PLAN, planType: "hdhp", deductible: 1_500, outOfPocketMax: 4_000 },
      accounts: [hsa({}), hsa({ id: "fsa", type: "fsa", balance: 300, monthlyContribution: 50, employerMonthlyContribution: 0 })],
      today: new Date(2026, 9, 12),
    });
    // Last year's dentist is outside the plan year; the premium is tracked separately.
    expect(summary.spentThisPlanYear).toBe(450);
    expect(summary.premiumsThisPlanYear).toBe(200);
    expect(summary.deductiblePercent).toBe(30);
    expect(summary.remainingDeductible).toBe(1_050);
    expect(summary.deductibleMet).toBe(false);
    expect(summary.outOfPocketPercent).toBe(11.25);
    expect(summary.hsaBalance).toBe(1_200);
    expect(summary.fsaBalance).toBe(300);
    expect(summary.hsaMonthly).toBe(200);
    expect(summary.fsaMonthly).toBe(50);
    expect(summary.monthsLeftInPlanYear).toBe(2);
    expect(summary.hasPlan).toBe(true);
    expect(summary.hasAccounts).toBe(true);
  });

  test("an empty plan reports nothing set up", () => {
    const summary = summarizeMedical({ months: {}, healthPlan: DEFAULT_HEALTH_PLAN, accounts: [] });
    expect(summary.hasPlan).toBe(false);
    expect(summary.hasAccounts).toBe(false);
    expect(summary.deductiblePercent).toBe(0);
  });
});

// ─── Credit score interpretation ─────────────────────────────────────────────

test.describe("credit score interpretation", () => {
  test("US readings carry FICO and VantageScore bands", () => {
    const good = interpretCreditScore(700, "US");
    expect(good.primary).toMatchObject({ scale: "FICO", score: 700, min: 300, max: 850 });
    expect(good.primary.band.label).toBe("Good");
    expect(good.secondary?.scale).toBe("VantageScore");
    expect(good.secondary?.band.label).toBe("Good");
    expect(interpretCreditScore(800, "US").primary.band.label).toBe("Exceptional");
    expect(interpretCreditScore(800, "US").secondary?.band.label).toBe("Excellent");
    expect(interpretCreditScore(500, "US").primary.band.label).toBe("Poor");
    expect(interpretCreditScore(500, "US").secondary?.band.label).toBe("Poor");
    expect(interpretCreditScore(640, "US").primary.band.label).toBe("Fair");
    expect(interpretCreditScore(900, "US").primary.score).toBe(850);
  });

  test("UK readings translate onto Experian's 0–999 scale", () => {
    expect(toExperianScale(300)).toBe(0);
    expect(toExperianScale(850)).toBe(999);
    expect(toExperianScale(700)).toBe(727);
    const fair = interpretCreditScore(700, "GB");
    expect(fair.primary).toMatchObject({ scale: "Experian", score: 727, min: 0, max: 999 });
    expect(fair.primary.band.label).toBe("Fair");
    expect(fair.secondary).toBeUndefined();
    expect(interpretCreditScore(850, "GB").primary.band.label).toBe("Excellent");
    expect(interpretCreditScore(300, "GB").primary.band.label).toBe("Very poor");
  });

  test("bands cover their scales without gaps", () => {
    for (const bands of [FICO_BANDS, EXPERIAN_BANDS]) {
      for (let index = 1; index < bands.length; index += 1) expect(bands[index].min).toBe(bands[index - 1].max + 1);
    }
    expect(bandFor(579, FICO_BANDS).label).toBe("Poor");
    expect(bandFor(580, FICO_BANDS).label).toBe("Fair");
  });
});

// ─── Page layouts ────────────────────────────────────────────────────────────

test.describe("page layouts", () => {
  const ids = (layout: { widgets: Array<{ id: string }> }) => layout.widgets.map((widget) => widget.id);

  test("one dashboard: the month, the trends and the region panels, with nothing shown twice", () => {
    const gb = ids(defaultLayout("dashboard", "GB"));
    expect(gb.slice(0, 3)).toEqual(["snapshot", "cash-flow", "health"]);
    expect(gb).toEqual(expect.arrayContaining(["net-worth", "chart", "categories", "anomalies", "debt-overview", "payoff", "subscriptions", "annual"]));
    expect(gb).not.toContain("paycheck");
    const us = ids(defaultLayout("dashboard", "US"));
    expect(us).toEqual(expect.arrayContaining(["retirement", "paycheck", "credit", "medical", "loans"]));
    for (const region of ["GB", "US"] as const) {
      const available = ids({ widgets: availableWidgets("dashboard", region) });
      expect(new Set(available).size).toBe(available.length);
      // Accounts and imports repeated other widgets; the pages' duplicates live on under one id each.
      for (const gone of ["accounts-imports", "summary", "recurring", "limits"]) expect(available).not.toContain(gone);
    }
    // Medical is a US-only widget.
    expect(ids({ widgets: availableWidgets("dashboard", "GB") })).not.toContain("medical");
    expect(ids({ widgets: availableWidgets("dashboard", "US") })).toContain("medical");
  });

  test("the money-flow family of widgets is offered in both regions, each with a renderer", () => {
    for (const region of ["GB", "US"] as const) {
      const available = ids({ widgets: availableWidgets("dashboard", region) });
      for (const id of Object.keys(INSIGHT_WIDGET_SPECS)) expect(available).toContain(id);
      expect(ids(defaultLayout("dashboard", region))).toEqual(expect.arrayContaining(["cash-flow", "spending-pace", "savings-rate"]));
    }
    // Opt-in widgets wait in the tray.
    expect(ids({ widgets: hiddenWidgets(defaultLayout("dashboard", "GB"), "dashboard", "GB") })).toEqual(
      expect.arrayContaining(["todo", "notes", "calendar", "upcoming", "month-compare", "take-home", "goals"]),
    );
  });

  test("the two layouts saved before the pages merged become one", () => {
    const dashboard = { version: 1, widgets: [{ id: "net-worth", size: "m" }, { id: "accounts-imports", size: "xl" }, { id: "snapshot", size: "xl" }] };
    const insights = { version: 1, widgets: [{ id: "summary", size: "xl" }, { id: "cash-flow", size: "l" }, { id: "recurring", size: "m" }, { id: "limits", size: "m" }] };
    // Dashboard first, Accounts and imports replaced by Credit & debt, Insights' copies folded into
    // the dashboard's ids.
    expect(mergeLegacyLayouts(dashboard, insights, "US").widgets).toEqual([
      { id: "net-worth", size: "m" },
      { id: "debt-overview", size: "xl" },
      { id: "snapshot", size: "xl" },
      { id: "cash-flow", size: "l" },
      { id: "subscriptions", size: "m" },
      { id: "retirement", size: "m" },
    ]);
    // A page that was never customised brings its old defaults.
    const onlyInsights = ids(mergeLegacyLayouts(null, insights, "GB"));
    expect(onlyInsights.slice(0, 3)).toEqual(["snapshot", "net-worth", "debt-overview"]);
    expect(onlyInsights).toEqual(expect.arrayContaining(["cash-flow", "subscriptions"]));
    expect(ids(mergeLegacyLayouts(dashboard, null, "GB"))).toEqual(expect.arrayContaining(["net-worth", "snapshot", "cash-flow", "anomalies", "annual"]));
    expect(ids(mergeLegacyLayouts(dashboard, null, "GB"))).not.toContain("accounts-imports");
    expect(ids(mergeLegacyLayouts(dashboard, null, "GB"))).toContain("debt-overview");
    // Nothing customised: the new default.
    expect(mergeLegacyLayouts(null, null, "US")).toEqual(defaultLayout("dashboard", "US"));
  });

  test("sizes map to a six-column grid", () => {
    expect([spanFor("s"), spanFor("m"), spanFor("l"), spanFor("xl")]).toEqual([2, 3, 4, 6]);
  });

  test("stored layouts are cleaned: unknown, foreign-region and duplicate widgets are dropped", () => {
    const layout = normalizeLayout(
      { widgets: [{ id: "net-worth", size: "m" }, { id: "bogus", size: "s" }, { id: "medical", size: "m" }, { id: "net-worth", size: "xl" }, { id: "snapshot", size: "nope" }, { id: "summary", size: "xl" }] },
      "dashboard",
      "GB",
    );
    expect(layout.widgets).toEqual([
      { id: "net-worth", size: "m" },
      { id: "snapshot", size: "xl" },
    ]);
    expect(normalizeLayout(null, "dashboard", "GB")).toEqual(defaultLayout("dashboard", "GB"));
    expect(normalizeLayout({ widgets: [{ id: "bogus" }] }, "dashboard", "US")).toEqual(defaultLayout("dashboard", "US"));
    expect(layoutStorageKey("dashboard", "US")).toBe("it_layout_dashboard_us");
  });

  const three = normalizeLayout({ widgets: [{ id: "snapshot" }, { id: "net-worth" }, { id: "goals" }] }, "dashboard", "GB");

  test("widgets move, drop before or after each other, and clamp at the ends", () => {
    expect(ids(moveWidget(three, "goals", -1))).toEqual(["snapshot", "goals", "net-worth"]);
    expect(moveWidget(three, "snapshot", -1)).toBe(three);
    expect(moveWidget(three, "missing", 1)).toBe(three);
    expect(ids(moveWidgetBefore(three, "goals", "snapshot"))).toEqual(["goals", "snapshot", "net-worth"]);
    expect(ids(moveWidgetBefore(three, "snapshot", "net-worth", "after"))).toEqual(["net-worth", "snapshot", "goals"]);
  });

  test("resizing steps through the widget's allowed sizes", () => {
    const narrower = cycleWidgetSize(three, "dashboard", "net-worth", -1);
    expect(narrower.widgets.find((widget) => widget.id === "net-worth")?.size).toBe("l");
    expect(cycleWidgetSize(three, "dashboard", "net-worth", 1)).toBe(three);
    expect(resizeWidget(three, "dashboard", "snapshot", "s")).toBe(three);
    expect(resizeWidget(three, "dashboard", "snapshot", "l").widgets[0].size).toBe("l");
  });

  test("removing hides a widget, the tray lists it, and adding brings it back at its default size", () => {
    const without = removeWidget(three, "net-worth");
    expect(ids(without)).toEqual(["snapshot", "goals"]);
    expect(ids({ widgets: hiddenWidgets(without, "dashboard", "GB") })).toContain("net-worth");
    expect(ids({ widgets: hiddenWidgets(three, "dashboard", "GB") })).toEqual(expect.arrayContaining(["retirement", "take-home", "loans", "housing", "credit", "cash-flow"]));
    const back = addWidget(without, "dashboard", "GB", "net-worth");
    expect(back.widgets[back.widgets.length - 1]).toEqual({ id: "net-worth", size: "xl" });
    expect(addWidget(back, "dashboard", "GB", "net-worth")).toBe(back);
    expect(addWidget(back, "dashboard", "GB", "medical")).toBe(back);
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────

test.describe("routes", () => {
  test("every view has a path and unknown paths are not views", () => {
    for (const view of APP_VIEWS) expect(viewFromPath(pathForView(view))).toBe(view);
    expect(viewFromPath("/")).toBeNull();
    expect(viewFromPath("/guides/")).toBeNull();
    expect(viewFromPath("/Accounts/")).toBe("accounts");
    // Insights merged into the Dashboard; old links land there.
    expect(APP_VIEWS).not.toContain("insights");
    expect(viewFromPath("/insights")).toBe("dashboard");
    expect(isAppPath("/ledger")).toBe(true);
    expect(isAppPath("/index.html")).toBe(false);
  });
});
