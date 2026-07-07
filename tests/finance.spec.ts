import { expect, test } from "@playwright/test";
import {
  buildFinancialSignals,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateDebtSummary,
  calculateHealthScore,
  calculateProjection,
  monthlyRateFromAnnual,
  rollForwardDebtBalances,
} from "../src/finance";
import type { Account, ExpenseEntry, MonthBudget } from "../src/types";

const emptyMonth: MonthBudget = { incomes: [], expenses: [], note: "" };

function debtAccount(overrides: Partial<Account>): Account {
  return {
    id: "debt-1",
    name: "Card",
    accountClass: "debt",
    type: "credit-card",
    balance: 1000,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 0,
    creditLimit: 2000,
    minimumPayment: 100,
    dueDay: 1,
    balanceAsOf: "2026-01",
    includeInNetWorth: true,
    color: "#12b886",
    note: "",
    ...overrides,
  };
}

function linkedPayment(amount: number, debtAccountId: string, id = "expense-1"): ExpenseEntry {
  return {
    id,
    name: "Card payment",
    category: "Debt payments",
    amount,
    color: "#6c5ce7",
    recurring: false,
    debtAccountId,
  };
}

test.describe("finance projections", () => {
  test("delays credit card interest until the interest-free period ends", () => {
    const card = debtAccount({ name: "0% card", rate: 12, promoRate: 0, promoMonths: 2 });

    const points = buildNetWorthOutlook({
      accounts: [card],
      projection: calculateProjection(emptyMonth),
      months: 3,
      startDate: new Date(2026, 0, 1),
    });

    const monthlyRate = monthlyRateFromAnnual(12);
    expect(points[1].interestCharged).toBe(0);
    expect(points[2].interestCharged).toBe(0);
    expect(points[3].interestCharged).toBeCloseTo(800 * monthlyRate, 6);
    expect(points[3].debtBalance).toBeCloseTo(800 + 800 * monthlyRate - 100, 6);
  });

  test("flags high credit utilisation and negative cash flow as financial signals", () => {
    const month: MonthBudget = {
      incomes: [{ id: "income-1", source: "Salary", amount: 2000, color: "#12b886", recurring: true }],
      expenses: [{ id: "expense-1", name: "Rent", amount: 2300, category: "Home", color: "#6c5ce7", recurring: true }],
      note: "",
    };
    const card = debtAccount({ name: "High card", balance: 2850, creditLimit: 3000, rate: 24.9, minimumPayment: 50, dueDay: 15 });
    const projection = calculateProjection(month);
    const debtSummary = calculateDebtSummary([card]);
    const assetSummary = calculateAssetSummary([]);
    const signals = buildFinancialSignals({ projection, debtSummary, accounts: [card], assetSummary, month, savingsTarget: 20 });
    const titles = signals.map((signal) => signal.title);

    expect(titles).toContain("Outflow is higher than income");
    expect(titles).toContain("Card utilisation over 90%");
    expect(titles).toContain("Overall credit utilisation over 80%");
  });

  test("calculates a contextual health score with rough credit estimate", () => {
    const month: MonthBudget = {
      incomes: [{ id: "income-1", source: "Salary", amount: 3000, color: "#12b886", recurring: true }],
      expenses: [{ id: "expense-1", name: "Bills", amount: 2100, category: "Home", color: "#6c5ce7", recurring: true }],
      note: "",
    };
    const card = debtAccount({ name: "Everyday card", creditLimit: 5000, rate: 19.9, promoMonths: 6, dueDay: 15 });

    const health = calculateHealthScore({
      projection: calculateProjection(month),
      debtSummary: calculateDebtSummary([card]),
      accounts: [card],
      savingsTarget: 20,
    });

    expect(health.score).toBeGreaterThan(5);
    expect(health.estimatedCreditScore).toBeGreaterThanOrEqual(300);
    expect(health.estimatedCreditScore).toBeLessThanOrEqual(850);
    expect(health.detail).toContain("not a bureau score");
  });
});

test.describe("debt balance roll-forward", () => {
  test("reduces the balance by the scheduled monthly payment for each elapsed month", () => {
    const card = debtAccount({ balance: 1000, minimumPayment: 100, balanceAsOf: "2026-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-04" });

    expect(rolled.balance).toBe(700);
    // The stored snapshot is untouched — the roll-forward is a pure derivation.
    expect(card.balance).toBe(1000);
  });

  test("charges interest before each payment when the APR is active", () => {
    const card = debtAccount({ balance: 1000, rate: 12, minimumPayment: 100, balanceAsOf: "2026-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-03" });

    const monthlyRate = monthlyRateFromAnnual(12);
    const afterFeb = 1000 * (1 + monthlyRate) - 100;
    const afterMar = afterFeb * (1 + monthlyRate) - 100;
    expect(rolled.balance).toBeCloseTo(Number(afterMar.toFixed(2)), 2);
  });

  test("uses the promo rate for elapsed months while an intro window is active", () => {
    const card = debtAccount({ balance: 1000, rate: 24.9, promoRate: 0, promoMonths: 12, minimumPayment: 100, balanceAsOf: "2026-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-03" });

    expect(rolled.balance).toBe(800);
  });

  test("linked ledger payments replace the scheduled payment for their month", () => {
    const card = debtAccount({ balance: 1000, minimumPayment: 100, balanceAsOf: "2026-01" });
    const months = {
      // An overpayment in February replaces the £100 schedule — it does not stack on top.
      "2026-02": { ...emptyMonth, expenses: [linkedPayment(300, card.id)] },
    };

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months, currentMonthKey: "2026-04" });

    // Feb: 1000 - 300 = 700, Mar + Apr scheduled: 700 - 100 - 100 = 500.
    expect(rolled.balance).toBe(500);
  });

  test("importing the regular payment does not double-count against the schedule", () => {
    const card = debtAccount({ balance: 1000, minimumPayment: 100, balanceAsOf: "2026-01" });
    const months = {
      "2026-02": { ...emptyMonth, expenses: [linkedPayment(100, card.id)] },
    };

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months, currentMonthKey: "2026-02" });

    expect(rolled.balance).toBe(900);
  });

  test("sums multiple linked payments in the same month and ignores other accounts' links", () => {
    const card = debtAccount({ balance: 1000, minimumPayment: 100, balanceAsOf: "2026-01" });
    const months = {
      "2026-02": {
        ...emptyMonth,
        expenses: [
          linkedPayment(150, card.id, "expense-1"),
          linkedPayment(50, card.id, "expense-2"),
          linkedPayment(400, "some-other-account", "expense-3"),
        ],
      },
    };

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months, currentMonthKey: "2026-02" });

    expect(rolled.balance).toBe(800);
  });

  test("leaves accounts without a scheduled payment or linked payments untouched", () => {
    const card = debtAccount({ balance: 1000, rate: 24.9, minimumPayment: 0, balanceAsOf: "2025-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-04" });

    // No payment set up: the balance stays a static snapshot instead of silently growing.
    expect(rolled.balance).toBe(1000);
    expect(rolled).toBe(card);
  });

  test("floors the balance at zero once the debt is cleared", () => {
    const card = debtAccount({ balance: 250, minimumPayment: 100, balanceAsOf: "2026-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-08" });

    expect(rolled.balance).toBe(0);
  });

  test("does not roll accounts anchored to the current month, or asset accounts", () => {
    const card = debtAccount({ balance: 1000, minimumPayment: 100, balanceAsOf: "2026-04" });
    const savings = debtAccount({ id: "asset-1", accountClass: "savings", type: "isa", balance: 5000, balanceAsOf: "2025-01" });

    const rolled = rollForwardDebtBalances({ accounts: [card, savings], months: {}, currentMonthKey: "2026-04" });

    expect(rolled[0].balance).toBe(1000);
    expect(rolled[1]).toBe(savings);
  });
});
