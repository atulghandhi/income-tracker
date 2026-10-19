import { expect, test } from "@playwright/test";
import {
  buildCsvExport,
  buildMonthlyFlowPoints,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateHealthScore,
  calculateDebtSummary,
  calculateNetWorthSummary,
  calculateProjection,
  createInitialState,
  effectiveAnnualRate,
  monthlyRateFromAnnual,
  runGoalSequence,
  seedMonthFromPrevious,
} from "../src/finance";
import { goalPlanInputs } from "../src/accountLinks";
import type { Account, MonthBudget, SavingsGoal } from "../src/types";

// Baseline coverage of the UK-era calculations, written before the US work so any change in these
// numbers shows up as a regression. Everything here uses accounts without plan details.

function account(overrides: Partial<Account>): Account {
  return {
    id: "acc-1",
    name: "Account",
    accountClass: "savings",
    type: "savings",
    balance: 0,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: "2026-01",
    promoAsOf: "2026-01",
    includeInNetWorth: true,
    color: "#2f7fdd",
    note: "",
    ...overrides,
  };
}

const month: MonthBudget = {
  incomes: [
    { id: "i1", source: "Salary", amount: 3000, color: "#1", recurring: true },
    { id: "i2", source: "Bonus", amount: 500, color: "#2", recurring: false },
  ],
  expenses: [
    { id: "e1", name: "Rent", category: "Home", amount: 1200, color: "#3", recurring: true },
    { id: "e2", name: "Food", category: "Food", amount: 400, color: "#4", recurring: true },
    { id: "e3", name: "Sofa", category: "", amount: 600, color: "#5", recurring: false },
  ],
  note: "",
};

test.describe("projection", () => {
  test("separates actuals, the recurring run rate and the annual figure", () => {
    const projection = calculateProjection(month);
    expect(projection.monthlyIncome).toBe(3500);
    expect(projection.monthlyExpenses).toBe(2200);
    expect(projection.monthlySurplus).toBe(1300);
    expect(projection.recurringMonthlyIncome).toBe(3000);
    expect(projection.recurringMonthlyExpenses).toBe(1600);
    expect(projection.recurringMonthlySurplus).toBe(1400);
    // Recurring × 12 plus this month's one-offs once.
    expect(projection.annualIncome).toBe(3000 * 12 + 500);
    expect(projection.annualExpenses).toBe(1600 * 12 + 600);
    expect(projection.annualSurplus).toBe(36500 - 19800);
    expect(projection.savingsRate).toBeCloseTo((1300 / 3500) * 100, 6);
    expect(projection.oneOffCount).toBe(2);
    // Categorised vs uncategorised spend.
    expect(projection.paidTotal).toBe(1600);
    expect(projection.unpaidTotal).toBe(600);
  });

  test("an empty month projects zeros without dividing by zero", () => {
    const projection = calculateProjection({ incomes: [], expenses: [], note: "" });
    expect(projection.monthlyIncome).toBe(0);
    expect(projection.savingsRate).toBe(0);
    expect(projection.annualSurplus).toBe(0);
  });
});

test.describe("rates", () => {
  test("monthly rate is the geometric twelfth of the annual rate", () => {
    expect(monthlyRateFromAnnual(12)).toBeCloseTo(Math.pow(1.12, 1 / 12) - 1, 10);
    expect(monthlyRateFromAnnual(0)).toBe(0);
    expect(monthlyRateFromAnnual(Number.NaN)).toBe(0);
  });

  test("the promo rate applies for the promo months then the standard rate", () => {
    const card = { rate: 24.9, promoRate: 0, promoMonths: 6 };
    expect(effectiveAnnualRate(card, 1)).toBe(0);
    expect(effectiveAnnualRate(card, 6)).toBe(0);
    expect(effectiveAnnualRate(card, 7)).toBe(24.9);
  });
});

test.describe("account summaries", () => {
  const accounts = [
    account({ id: "cash", accountClass: "cash", type: "current", balance: 1500 }),
    account({ id: "isa", accountClass: "savings", type: "isa", balance: 6000, rate: 4, monthlyContribution: 300 }),
    account({ id: "inv", accountClass: "investment", type: "investment", balance: 2500, rate: 6, monthlyContribution: 100 }),
    account({ id: "card", accountClass: "debt", type: "credit-card", balance: 900, creditLimit: 3000, minimumPayment: 50, rate: 21.9, dueDay: 15 }),
    account({ id: "loan", accountClass: "debt", type: "loan", balance: 4000, minimumPayment: 150, rate: 6.9, dueDay: 3 }),
    account({ id: "hidden", accountClass: "savings", type: "savings", balance: 999, includeInNetWorth: false }),
  ];

  test("asset summary totals by class and weights the rate by balance", () => {
    const summary = calculateAssetSummary(accounts);
    expect(summary.totalCash).toBe(1500);
    expect(summary.totalSavings).toBe(6999);
    expect(summary.totalInvestments).toBe(2500);
    expect(summary.totalAssets).toBe(10999);
    expect(summary.monthlyContributions).toBe(400);
    // New fields: without plan details every contribution is cash, none payroll or employer.
    expect(summary.cashContributions).toBe(400);
    expect(summary.payrollContributions).toBe(0);
    expect(summary.employerContributions).toBe(0);
    expect(summary.weightedAssetRate).toBeCloseTo((6000 * 4 + 2500 * 6) / 10999, 6);
  });

  test("debt summary counts cards for utilisation and every debt for payments", () => {
    const summary = calculateDebtSummary(accounts);
    expect(summary.totalDebt).toBe(4900);
    expect(summary.totalCreditLimit).toBe(3000);
    expect(summary.availableCredit).toBe(2100);
    expect(summary.utilization).toBe(30);
    expect(summary.monthlyMinimums).toBe(200);
    expect(summary.weightedApr).toBeCloseTo((21.9 * 900 + 6.9 * 4000) / 4900, 6);
    expect(summary.nextDueDay).toBe(3);
  });

  test("net worth excludes accounts flagged out of it", () => {
    const summary = calculateNetWorthSummary(accounts);
    expect(summary.totalAssets).toBe(10000);
    expect(summary.totalDebt).toBe(4900);
    expect(summary.netWorth).toBe(5100);
  });
});

test.describe("net worth outlook", () => {
  test("routes surplus into contributions and grows balances at the account rate", () => {
    const savings = account({ id: "s", accountClass: "savings", balance: 1000, rate: 12, monthlyContribution: 200 });
    const projection = calculateProjection({
      incomes: [{ id: "i", source: "Salary", amount: 1000, color: "#1", recurring: true }],
      expenses: [{ id: "e", name: "Rent", category: "", amount: 500, color: "#2", recurring: true }],
      note: "",
    });
    const points = buildNetWorthOutlook({ accounts: [savings], projection, months: 2, startDate: new Date(2026, 0, 1) });
    const r = monthlyRateFromAnnual(12);
    // Month 1: +500 surplus to cash, 200 of it into savings, savings grows at the monthly rate.
    expect(points[0].netWorth).toBe(1000);
    expect(points[1].cashBalance).toBeCloseTo(300, 6);
    expect(points[1].savingsBalance).toBeCloseTo(1200 * (1 + r), 6);
    expect(points[1].growthEarned).toBeCloseTo(1200 * r, 6);
    expect(points[1].netWorth).toBeCloseTo(300 + 1200 * (1 + r), 6);
    // Moving money between own accounts never changes net worth beyond surplus + growth.
    expect(points[2].cashBalance).toBeCloseTo(600, 6);
    expect(points[2].savingsBalance).toBeCloseTo((1200 * (1 + r) + 200) * (1 + r), 6);
  });

  test("a linked ledger transfer is counted once, not as expense and contribution", () => {
    const savings = account({ id: "s", accountClass: "savings", balance: 0, monthlyContribution: 200 });
    const projection = calculateProjection({
      incomes: [{ id: "i", source: "Salary", amount: 1000, color: "#1", recurring: true }],
      expenses: [{ id: "e", name: "Transfer to savings", category: "", amount: 200, color: "#2", recurring: true, toAccountId: "s" }],
      note: "",
    });
    const points = buildNetWorthOutlook({ accounts: [savings], projection, months: 1, linkedTransfers: { s: 200 } });
    // Surplus is 800 after the transfer row; the 200 is added back then moved into savings.
    expect(points[1].cashBalance).toBeCloseTo(800, 6);
    expect(points[1].savingsBalance).toBeCloseTo(200, 6);
    expect(points[1].netWorth).toBeCloseTo(1000, 6);
  });
});

test.describe("goal planner", () => {
  const goal = (overrides: Partial<SavingsGoal>): SavingsGoal => ({
    id: "g1",
    name: "Goal",
    target: 1000,
    saved: 0,
    color: "#1",
    priority: 1,
    fundingMode: "fixed",
    monthlyAmount: 100,
    deadlineMonths: 0,
    interestRate: 0,
    note: "",
    createdAt: "2026-01-01",
    ...overrides,
  });

  test("funds fixed goals by priority and finishes when the target is reached", () => {
    const result = runGoalSequence({
      goals: [goal({ id: "a", target: 300, monthlyAmount: 100 }), goal({ id: "b", priority: 2, target: 500, monthlyAmount: 100 })],
      monthlySurplus: 150,
      horizonMonths: 12,
      startDate: new Date(2026, 0, 1),
    });
    const a = result.goals.find((item) => item.goalId === "a")!;
    const b = result.goals.find((item) => item.goalId === "b")!;
    expect(a.completionMonth).toBe(3);
    // b gets 50 a month while a is funded, then 100: 50×3 + 100×4 = 550 ≥ 500 in month 7.
    expect(b.completionMonth).toBe(7);
    expect(result.timeline).toHaveLength(12);
  });

  test("a fill goal absorbs whatever is left and a deadline drives the status", () => {
    const result = runGoalSequence({
      goals: [goal({ id: "f", fundingMode: "fill", target: 1200, deadlineMonths: 4 })],
      monthlySurplus: 200,
      horizonMonths: 12,
      startDate: new Date(2026, 0, 1),
    });
    const outcome = result.goals[0];
    expect(outcome.completionMonth).toBe(6);
    expect(outcome.status).toBe("at-risk");
    expect(outcome.extraMonthlyNeeded).toBeGreaterThan(0);
    expect(outcome.extraMonthsNeeded).toBe(2);
  });

  test("dedicated account money funds its own goal before the shared surplus", () => {
    const result = runGoalSequence({
      goals: [goal({ id: "linked", target: 600, monthlyAmount: 0 })],
      monthlySurplus: 0,
      horizonMonths: 12,
      dedicatedMonthly: { linked: 300 },
    });
    expect(result.goals[0].completionMonth).toBe(2);
  });

  test("goal plan inputs take account contributions out of the shared surplus", () => {
    const accounts = [
      account({ id: "isa", accountClass: "savings", monthlyContribution: 300 }),
      account({ id: "other", accountClass: "savings", monthlyContribution: 100 }),
    ];
    const inputs = goalPlanInputs({
      goals: [goal({ id: "g", accountId: "isa" })],
      accounts,
      month: { incomes: [], expenses: [], note: "" },
      recurringSurplus: 1000,
      override: null,
    });
    expect(inputs.monthlySurplus).toBe(600);
    expect(inputs.dedicatedMonthly).toEqual({ g: 300 });
    expect(inputs.routedElsewhere).toBe(100);
    expect(inputs.routedToGoals).toBe(300);
  });
});

test.describe("state and exports", () => {
  test("the initial state is a GBP, UK ledger with empty profiles", () => {
    const state = createInitialState();
    expect(state.currency).toBe("GBP");
    expect(state.country).toBe("GB");
    expect(state.taxProfile.grossAnnualSalary).toBe(0);
    expect(state.healthPlan.deductible).toBe(0);
    expect(Object.keys(state.months)).toHaveLength(1);
  });

  test("seeding a new month carries recurring rows forward and tags their origin", () => {
    const seeded = seedMonthFromPrevious(month, { fromMonthKey: "2026-01", toMonthKey: "2026-02" });
    expect(seeded.incomes.map((income) => income.source)).toEqual(["Salary"]);
    expect(seeded.expenses.map((expense) => expense.name)).toEqual(["Rent", "Food"]);
    expect(seeded.incomes[0].seededFrom).toEqual({ monthKey: "2026-01", entryId: "i1" });
    // Going backwards never seeds.
    expect(seedMonthFromPrevious(month, { fromMonthKey: "2026-02", toMonthKey: "2026-01" }).incomes).toEqual([]);
  });

  test("monthly flow points cover the selected year and flag months with data", () => {
    const state = createInitialState();
    state.selectedMonth = "2026-03";
    state.months = { "2026-03": month };
    const points = buildMonthlyFlowPoints(state);
    expect(points).toHaveLength(12);
    expect(points[2]).toMatchObject({ monthKey: "2026-03", income: 3500, expenses: 2200, surplus: 1300, hasData: true });
    expect(points[0].hasData).toBe(false);
  });

  test("the CSV export lists every row with the ledger currency", () => {
    const state = createInitialState();
    state.months = { "2026-03": month };
    const csv = buildCsvExport(state);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("month,currency,type,date,name,category,amount,note");
    expect(lines).toContain("2026-03,GBP,income,,Salary,,3000,");
    expect(lines).toContain("2026-03,GBP,expense,,Rent,Home,1200,");
    expect(lines).toHaveLength(6);
  });

  test("the health score is blank without data and bounded with it", () => {
    const empty = calculateProjection({ incomes: [], expenses: [], note: "" });
    const blank = calculateHealthScore({ projection: empty, debtSummary: calculateDebtSummary([]), accounts: [], savingsTarget: 20 });
    expect(blank.noData).toBe(true);
    expect(blank.score).toBe(0);

    const projection = calculateProjection(month);
    const scored = calculateHealthScore({ projection, debtSummary: calculateDebtSummary([]), accounts: [], savingsTarget: 20 });
    expect(scored.noData).toBe(false);
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(10);
    expect(scored.estimatedCreditScore).toBeGreaterThanOrEqual(300);
    expect(scored.estimatedCreditScore).toBeLessThanOrEqual(850);
    expect(scored.summary).toBe("Strong");
  });
});
