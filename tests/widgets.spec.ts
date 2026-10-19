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
  moveWidget,
  moveWidgetBefore,
  normalizeLayout,
  removeWidget,
  resizeWidget,
  spanFor,
} from "../src/layout";
import { APP_VIEWS, isAppPath, pathForView, viewFromPath } from "../src/routes";
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
  test("defaults: the UK dashboard keeps its original panels, the US one adds its own", () => {
    expect(defaultLayout("dashboard", "GB").widgets.map((widget) => widget.id)).toEqual(["snapshot", "net-worth", "accounts-imports"]);
    const us = defaultLayout("dashboard", "US").widgets.map((widget) => widget.id);
    expect(us).toEqual(expect.arrayContaining(["retirement", "take-home", "medical", "loans"]));
    expect(defaultLayout("insights", "GB").widgets.map((widget) => widget.id)).not.toContain("take-home-full");
    expect(defaultLayout("insights", "US").widgets.map((widget) => widget.id)).toEqual(expect.arrayContaining(["take-home-full", "limits", "credit", "medical"]));
    // Medical is a US-only widget.
    expect(availableWidgets("dashboard", "GB").map((widget) => widget.id)).not.toContain("medical");
    expect(availableWidgets("dashboard", "US").map((widget) => widget.id)).toContain("medical");
  });

  test("sizes map to a six-column grid", () => {
    expect([spanFor("s"), spanFor("m"), spanFor("l"), spanFor("xl")]).toEqual([2, 3, 4, 6]);
  });

  test("stored layouts are cleaned: unknown, foreign-region and duplicate widgets are dropped", () => {
    const layout = normalizeLayout(
      { widgets: [{ id: "net-worth", size: "m" }, { id: "bogus", size: "s" }, { id: "medical", size: "m" }, { id: "net-worth", size: "xl" }, { id: "snapshot", size: "nope" }] },
      "dashboard",
      "GB",
    );
    expect(layout.widgets).toEqual([
      { id: "net-worth", size: "m" },
      { id: "snapshot", size: "xl" },
    ]);
    expect(normalizeLayout(null, "dashboard", "GB")).toEqual(defaultLayout("dashboard", "GB"));
    expect(normalizeLayout({ widgets: [{ id: "bogus" }] }, "insights", "US")).toEqual(defaultLayout("insights", "US"));
    expect(layoutStorageKey("dashboard", "US")).toBe("it_layout_dashboard_us");
  });

  test("widgets move, drop before or after each other, and clamp at the ends", () => {
    const layout = defaultLayout("dashboard", "GB");
    expect(moveWidget(layout, "accounts-imports", -1).widgets.map((widget) => widget.id)).toEqual(["snapshot", "accounts-imports", "net-worth"]);
    expect(moveWidget(layout, "snapshot", -1)).toBe(layout);
    expect(moveWidget(layout, "missing", 1)).toBe(layout);
    expect(moveWidgetBefore(layout, "accounts-imports", "snapshot").widgets.map((widget) => widget.id)).toEqual(["accounts-imports", "snapshot", "net-worth"]);
    expect(moveWidgetBefore(layout, "snapshot", "net-worth", "after").widgets.map((widget) => widget.id)).toEqual(["net-worth", "snapshot", "accounts-imports"]);
  });

  test("resizing steps through the widget's allowed sizes", () => {
    const layout = defaultLayout("dashboard", "GB");
    const narrower = cycleWidgetSize(layout, "dashboard", "net-worth", -1);
    expect(narrower.widgets.find((widget) => widget.id === "net-worth")?.size).toBe("l");
    expect(cycleWidgetSize(layout, "dashboard", "net-worth", 1)).toBe(layout);
    expect(resizeWidget(layout, "dashboard", "snapshot", "s")).toBe(layout);
    expect(resizeWidget(layout, "dashboard", "snapshot", "l").widgets[0].size).toBe("l");
  });

  test("removing hides a widget, the tray lists it, and adding brings it back at its default size", () => {
    const layout = defaultLayout("dashboard", "GB");
    const without = removeWidget(layout, "net-worth");
    expect(without.widgets.map((widget) => widget.id)).toEqual(["snapshot", "accounts-imports"]);
    expect(hiddenWidgets(without, "dashboard", "GB").map((widget) => widget.id)).toContain("net-worth");
    expect(hiddenWidgets(layout, "dashboard", "GB").map((widget) => widget.id)).toEqual(expect.arrayContaining(["retirement", "take-home", "loans", "housing", "credit", "goals"]));
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
    expect(isAppPath("/ledger")).toBe(true);
    expect(isAppPath("/index.html")).toBe(false);
  });
});
