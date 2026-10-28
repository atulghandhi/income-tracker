import { expect, test } from "@playwright/test";
import { createInitialState, shiftMonth } from "../src/finance";
import {
  buildCalendar,
  buildCategoryDeltas,
  buildFlowModel,
  buildInsightsModel,
  buildSpendingPace,
  buildUpcoming,
  visibleSignals,
} from "../src/insightsData";
import { buildDemoLedger } from "../src/demoData";
import { calculateProjection } from "../src/finance";
import type { Account, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget } from "../src/types";

// The insights model is what every widget draws from. These tests pin the numbers a user
// types to the numbers the widgets will show: £1,000 of income is £1,000 everywhere.

const MONTH = "2026-03";
const TODAY = "2026-03-12";
const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function income(overrides: Partial<IncomeEntry> & { amount: number }): IncomeEntry {
  return { id: `income-${Math.random().toString(36).slice(2)}`, source: "Salary", color: "#1baf7a", recurring: true, ...overrides };
}

function expense(overrides: Partial<ExpenseEntry> & { amount: number; name: string }): ExpenseEntry {
  return { id: `expense-${Math.random().toString(36).slice(2)}`, category: "", color: "#2f7fdd", recurring: true, ...overrides };
}

function ledgerWith(months: Record<string, MonthBudget>, extra: Partial<LedgerState> = {}): LedgerState {
  return { ...createInitialState(), selectedMonth: MONTH, months, ...extra };
}

function card(overrides: Partial<Account>): Account {
  return {
    id: "card-1",
    name: "Everyday Visa",
    accountClass: "debt",
    type: "credit-card",
    balance: 0,
    rate: 24.9,
    promoRate: 0,
    promoMonths: 0,
    promoAsOf: MONTH,
    monthlyContribution: 0,
    creditLimit: 3000,
    minimumPayment: 50,
    dueDay: 18,
    balanceAsOf: MONTH,
    balanceSetOn: TODAY,
    includeInNetWorth: true,
    color: "#e05656",
    note: "",
    ...overrides,
  };
}

test.describe("insights model", () => {
  test("summary figures equal the entered income and expenses, to the penny", () => {
    const ledger = ledgerWith({
      [MONTH]: {
        incomes: [income({ source: "Salary", amount: 1000 })],
        expenses: [expense({ name: "Rent", amount: 400, category: "Home" }), expense({ name: "Food shop", amount: 150.5, category: "Food" })],
        note: "",
      },
    });
    const model = buildInsightsModel(ledger, MONTH, { today: TODAY, formatter });
    expect(model.hasData).toBe(true);
    expect(model.projection.monthlyIncome).toBe(1000);
    expect(model.projection.monthlyExpenses).toBe(550.5);
    expect(model.projection.monthlySurplus).toBe(449.5);
    expect(model.projection.savingsRate).toBeCloseTo(44.95, 6);
    // Categories carry the month's real figure (not the annualised one the old page showed).
    expect(model.categories.map((row) => [row.name, row.monthly])).toEqual([
      ["Home", 400],
      ["Food", 150.5],
    ]);
    expect(model.categories[0].share).toBeCloseTo((400 / 550.5) * 100, 6);
  });

  test("changing the income for a month changes that month's insights and nothing else", () => {
    const base = ledgerWith({
      [MONTH]: { incomes: [income({ id: "i1", amount: 1000 })], expenses: [expense({ name: "Rent", amount: 400 })], note: "" },
      "2026-02": { incomes: [income({ amount: 900 })], expenses: [expense({ name: "Rent", amount: 400 })], note: "" },
    });
    const before = buildInsightsModel(base, MONTH, { today: TODAY, formatter });
    const edited: LedgerState = {
      ...base,
      months: { ...base.months, [MONTH]: { ...base.months[MONTH], incomes: [{ ...base.months[MONTH].incomes[0], amount: 1500 }] } },
    };
    const after = buildInsightsModel(edited, MONTH, { today: TODAY, formatter });
    expect(before.projection.monthlyIncome).toBe(1000);
    expect(after.projection.monthlyIncome).toBe(1500);
    expect(after.projection.monthlySurplus).toBe(1100);
    expect(after.flow.income).toBe(1500);
    expect(after.flow.sources[0].value).toBe(1500);
    expect(after.previous.projection.monthlyIncome).toBe(900);
    // The yearly chart carries both months' actual figures.
    expect(after.year.find((point) => point.monthKey === MONTH)?.income).toBe(1500);
    expect(after.year.find((point) => point.monthKey === "2026-02")?.income).toBe(900);
    expect(after.year.find((point) => point.monthKey === "2026-04")?.hasData).toBe(false);
  });

  test("the money flow conserves every pound: sources and targets both add up to the total", () => {
    const month: MonthBudget = {
      incomes: [income({ source: "Salary", amount: 2000 }), income({ source: "Freelance", amount: 300, recurring: false })],
      expenses: [
        expense({ name: "Rent", amount: 1000, category: "Home" }),
        expense({ name: "Tesco", amount: 200, category: "Food" }),
        expense({ name: "Lidl", amount: 100, category: "Food" }),
        expense({ name: "Odd thing", amount: 50 }),
      ],
      note: "",
    };
    const flow = buildFlowModel(month, calculateProjection(month));
    expect(flow.income).toBe(2300);
    expect(flow.expenses).toBe(1350);
    expect(flow.surplus).toBe(950);
    const sourceTotal = flow.sources.reduce((sum, node) => sum + node.value, 0);
    const targetTotal = flow.targets.reduce((sum, node) => sum + node.value, 0);
    expect(sourceTotal).toBeCloseTo(2300, 6);
    expect(targetTotal).toBeCloseTo(2300, 6);
    expect(flow.total).toBeCloseTo(2300, 6);
    // Savings is the first target and is exactly what is left over.
    expect(flow.targets[0]).toMatchObject({ id: "cat-savings", value: 950 });
    // Same-category expenses merge into one bucket carrying both transactions.
    const food = flow.targets.find((node) => node.label === "Food")!;
    expect(food.value).toBe(300);
    expect(food.items.map((item) => item.value)).toEqual([200, 100]);
    // An uncategorised expense becomes its own bucket named after the item.
    expect(flow.targets.some((node) => node.label === "Odd thing" && node.value === 50)).toBe(true);
  });

  test("a deficit month shows a shortfall source instead of savings", () => {
    const month: MonthBudget = {
      incomes: [income({ amount: 1000 })],
      expenses: [expense({ name: "Rent", amount: 1200, category: "Home" })],
      note: "",
    };
    const flow = buildFlowModel(month, calculateProjection(month));
    expect(flow.targets.some((node) => node.id === "cat-savings")).toBe(false);
    expect(flow.sources.find((node) => node.id === "src-shortfall")?.value).toBe(200);
    expect(flow.sources.reduce((sum, node) => sum + node.value, 0)).toBe(1200);
    expect(flow.total).toBe(1200);
  });

  test("an empty month reports no data and zeros, never NaN", () => {
    const model = buildInsightsModel(ledgerWith({}), MONTH, { today: TODAY, formatter });
    expect(model.hasData).toBe(false);
    expect(model.projection.monthlyIncome).toBe(0);
    expect(model.projection.savingsRate).toBe(0);
    expect(model.flow.total).toBe(0);
    expect(model.flow.sources).toEqual([]);
    expect(model.flow.targets).toEqual([]);
    expect(model.health.noData).toBe(true);
    expect(model.pace.spent).toBe(0);
    expect(Number.isNaN(model.pace.spentShare)).toBe(false);
    expect(model.categories).toEqual([]);
  });

  test("warnings include card utilisation and overspend, and dismissed ones stay hidden", () => {
    const ledger = ledgerWith(
      {
        [MONTH]: {
          incomes: [income({ amount: 2000 })],
          expenses: [expense({ name: "Rent", amount: 1700, category: "Home" }), expense({ name: "Food", amount: 600, category: "Food" })],
          note: "",
        },
      },
      { accounts: [card({ balance: 2850, creditLimit: 3000 })] },
    );
    const model = buildInsightsModel(ledger, MONTH, { today: TODAY, formatter });
    const ids = model.signals.map((signal) => signal.id);
    expect(ids).toContain("outflow-pressure");
    expect(ids).toContain("card-utilization-card-1");
    expect(ids).toContain("total-credit-utilization");
    expect(model.cards[0]).toMatchObject({ name: "Everyday Visa", balance: 2850, limit: 3000 });
    expect(model.cards[0].utilisation).toBeCloseTo(95, 6);

    const { shown, hiddenCount } = visibleSignals(model.signals, ["outflow-pressure", "never-raised"]);
    expect(hiddenCount).toBe(1);
    expect(shown.map((signal) => signal.id)).not.toContain("outflow-pressure");
    expect(shown.length).toBe(model.signals.length - 1);
  });

  test("a category that spikes against its recent average raises a warning with the real figures", () => {
    const months: Record<string, MonthBudget> = {};
    for (const key of ["2025-12", "2026-01", "2026-02"]) {
      months[key] = { incomes: [income({ amount: 2000 })], expenses: [expense({ name: "Eating out", amount: 100, category: "Eating out", recurring: false })], note: "" };
    }
    months[MONTH] = { incomes: [income({ amount: 2000 })], expenses: [expense({ name: "Eating out", amount: 400, category: "Eating out", recurring: false })], note: "" };
    const model = buildInsightsModel(ledgerWith(months), MONTH, { today: TODAY, formatter });
    const spike = model.signals.find((signal) => signal.id === "category-spike-eating out");
    expect(spike).toBeDefined();
    expect(spike?.summary).toContain("£400");
    expect(spike?.summary).toContain("£100");
    // And the month-on-month comparison reports the same move.
    expect(model.compare[0]).toMatchObject({ name: "Eating out", current: 400, previous: 100, delta: 300 });
  });

  test("spending pace uses only what has gone out so far in the live month", () => {
    const month: MonthBudget = {
      incomes: [income({ amount: 3100 })],
      expenses: [
        expense({ name: "Rent", amount: 1000, date: "2026-03-01" }),
        expense({ name: "Lunch", amount: 20, date: "2026-03-10", recurring: false }),
        expense({ name: "Future bill", amount: 500, date: "2026-03-28", recurring: false }),
      ],
      note: "",
    };
    const live = buildSpendingPace(month, calculateProjection(month), MONTH, TODAY);
    expect(live).toMatchObject({ isLive: true, daysInMonth: 31, daysElapsed: 12, spent: 1020, income: 3100 });
    expect(live.dailyAverage).toBeCloseTo(1020 / 12, 2);
    // Recurring spend counts once; the variable £20 over 12 days is projected across 31.
    expect(live.projectedSpend).toBeCloseTo(1000 + (20 / 12) * 31, 2);
    expect(live.safePerDay).toBeCloseTo((3100 - 1020) / 19, 2);

    const past = buildSpendingPace(month, calculateProjection(month), MONTH, "2026-05-02");
    expect(past).toMatchObject({ isLive: false, daysElapsed: 31, spent: 1520, projectedSpend: 1520, safePerDay: 0 });

    const future = buildSpendingPace(month, calculateProjection(month), MONTH, "2026-01-15");
    expect(future).toMatchObject({ isLive: false, daysElapsed: 0, spent: 0 });
  });

  test("the calendar sums dated spending per day and ignores undated rows", () => {
    const month: MonthBudget = {
      incomes: [],
      expenses: [
        expense({ name: "Coffee", amount: 3, date: "2026-03-02", recurring: false }),
        expense({ name: "Lunch", amount: 9, date: "2026-03-02", recurring: false }),
        expense({ name: "Undated", amount: 50, recurring: false }),
      ],
      note: "",
    };
    const calendar = buildCalendar(month, MONTH, TODAY);
    expect(calendar.length).toBe(31);
    expect(calendar[1]).toMatchObject({ day: 2, spent: 12, count: 2, intensity: 1, isFuture: false });
    expect(calendar[0].weekday).toBe(6); // 1 March 2026 is a Sunday (Monday-first index 6)
    expect(calendar[30].isFuture).toBe(true);
    expect(calendar.reduce((sum, day) => sum + day.spent, 0)).toBe(12);
  });

  test("upcoming payments combine detected bills and card due dates within two weeks", () => {
    const recurring = [
      { key: "netflix", label: "Netflix", kind: "expense" as const, category: "Subscriptions", color: "#000", cadence: "monthly" as const, typicalAmount: 10.99, monthlyEquivalent: 10.99, occurrences: 4, lastSeen: "2026-02-14", nextExpected: "2026-03-16", confidence: 0.8, alreadyRecurring: true, entryRefs: [] },
      { key: "annual", label: "Car insurance", kind: "expense" as const, category: "Bills", color: "#000", cadence: "annual" as const, typicalAmount: 500, monthlyEquivalent: 41.67, occurrences: 3, lastSeen: "2025-09-01", nextExpected: "2026-09-01", confidence: 0.8, alreadyRecurring: true, entryRefs: [] },
    ];
    const upcoming = buildUpcoming(recurring, [card({ balance: 900, minimumPayment: 50, dueDay: 18 })], TODAY);
    expect(upcoming.map((item) => [item.label, item.date, item.daysAway, item.amount])).toEqual([
      ["Netflix", "2026-03-16", 4, 10.99],
      ["Everyday Visa payment", "2026-03-18", 6, 50],
    ]);
  });

  test("month-on-month deltas rank the biggest movers first and flag brand-new categories", () => {
    const deltas = buildCategoryDeltas(
      [
        { name: "Food", monthly: 300, annual: 0, share: 0, color: "#1", count: 1 },
        { name: "Travel", monthly: 80, annual: 0, share: 0, color: "#2", count: 1 },
        { name: "Gifts", monthly: 120, annual: 0, share: 0, color: "#3", count: 1 },
      ],
      [
        { name: "Food", monthly: 250, annual: 0, share: 0, color: "#1", count: 1 },
        { name: "Travel", monthly: 180, annual: 0, share: 0, color: "#2", count: 1 },
      ],
    );
    expect(deltas.map((delta) => [delta.name, delta.delta])).toEqual([
      ["Gifts", 120],
      ["Travel", -100],
      ["Food", 50],
    ]);
    expect(deltas[0].percent).toBe(Number.POSITIVE_INFINITY);
    expect(deltas[2].percent).toBeCloseTo(20, 6);
  });
});

test.describe("demo ledger", () => {
  test("generates a deterministic year of realistic UK transactions", () => {
    const today = new Date(2026, 9, 12);
    const first = buildDemoLedger({ today });
    const second = buildDemoLedger({ today });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const keys = Object.keys(first.months).sort();
    expect(keys.length).toBe(12);
    expect(keys[0]).toBe("2025-11");
    expect(keys[11]).toBe("2026-10");
    expect(first.selectedMonth).toBe("2026-10");
    expect(first.currency).toBe("GBP");

    const ids = new Set<string>();
    for (const [monthKey, month] of Object.entries(first.months)) {
      const projection = calculateProjection(month);
      // Salary every month; rent, council tax and the card payment too.
      expect(month.incomes.some((entry) => entry.source.startsWith("Salary") && entry.amount === 2850)).toBe(true);
      expect(month.expenses.some((entry) => entry.name.startsWith("Rent"))).toBe(true);
      expect(month.expenses.some((entry) => entry.category === "Debt payments" && entry.debtAccountId)).toBe(true);
      // Plausible totals for one person: a couple of thousand out, usually some left over.
      expect(projection.monthlyExpenses).toBeGreaterThan(1800);
      expect(projection.monthlyExpenses).toBeLessThan(4200);
      for (const entry of [...month.incomes, ...month.expenses]) {
        expect(ids.has(entry.id)).toBe(false);
        ids.add(entry.id);
        expect(entry.date?.startsWith(monthKey)).toBe(true);
        expect(entry.amount).toBeGreaterThan(0);
      }
      for (const entry of month.expenses) expect(entry.category.length).toBeGreaterThan(0);
    }
    // Every category is present somewhere, with a stable colour per category.
    const categories = new Set(Object.values(first.months).flatMap((month) => month.expenses.map((expense) => expense.category)));
    for (const name of ["Home", "Bills", "Food", "Eating out", "Travel", "Subscriptions", "Shopping", "Health", "Debt payments"]) {
      expect(categories.has(name)).toBe(true);
    }
    // Accounts cover every class so the insights have something to score.
    expect(first.accounts.map((account) => account.accountClass).sort()).toEqual(["cash", "debt", "debt", "debt", "investment", "savings"]);
    expect(first.goals.length).toBe(2);
    // The live month only has variable spending up to today.
    const live = first.months["2026-10"];
    expect(live.expenses.filter((entry) => !entry.recurring).every((entry) => (entry.date ?? "") <= "2026-10-12")).toBe(true);
    expect(live.expenses.some((entry) => entry.recurring && (entry.date ?? "") > "2026-10-12")).toBe(true);
  });

  test("the demo ledger produces a complete insights model with warnings and recurring payments", () => {
    const today = new Date(2026, 9, 12);
    const ledger = buildDemoLedger({ today });
    const model = buildInsightsModel(ledger, shiftMonth("2026-10", -1), { today: "2026-10-12", formatter });
    expect(model.hasData).toBe(true);
    expect(model.previous.hasData).toBe(true);
    expect(model.health.noData).toBe(false);
    expect(model.health.score).toBeGreaterThan(0);
    expect(model.recurring.length).toBeGreaterThan(5);
    expect(model.recurring.some((candidate) => candidate.label === "Netflix")).toBe(true);
    expect(model.signals.length).toBeGreaterThan(0);
    expect(model.cards.length).toBe(2);
    expect(model.flow.targets.some((node) => node.id === "cat-savings")).toBe(true);
    expect(model.year.filter((point) => point.hasData).length).toBe(10);
    expect(model.netWorthOutlook[24].length).toBe(25);
  });
});
