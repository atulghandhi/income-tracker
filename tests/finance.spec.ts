import { expect, test } from "@playwright/test";
import {
  buildFinancialSignals,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateDebtSummary,
  calculateHealthScore,
  calculateProjection,
  deriveLiveAccounts,
  estimateDebtPayoff,
  monthlyRateFromAnnual,
  promoMonthsRemaining,
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
    promoAsOf: "2026-01",
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

test.describe("credit utilisation", () => {
  test("only counts credit cards, never loans or overdrafts", () => {
    const card = debtAccount({ id: "card", balance: 500, creditLimit: 2000 });
    const loan = debtAccount({ id: "loan", type: "loan", balance: 9000, creditLimit: 10000 });
    const loanNoLimit = debtAccount({ id: "loan-2", type: "loan", balance: 4000, creditLimit: 0 });
    const overdraft = debtAccount({ id: "od", type: "overdraft", balance: 300, creditLimit: 500 });

    const summary = calculateDebtSummary([card, loan, loanNoLimit, overdraft]);

    expect(summary.utilization).toBe(25);
    expect(summary.totalCreditLimit).toBe(2000);
    expect(summary.availableCredit).toBe(1500);
    // Loans still count as debt — they just are not "utilisation".
    expect(summary.totalDebt).toBe(13800);
  });

  test("is zero with only loans", () => {
    const loan = debtAccount({ type: "loan", balance: 9000, creditLimit: 0 });
    expect(calculateDebtSummary([loan]).utilization).toBe(0);
  });
});

test.describe("promo window countdown", () => {
  test("counts down from the month it was entered", () => {
    const card = debtAccount({ promoMonths: 12, promoAsOf: "2026-01" });

    expect(promoMonthsRemaining(card, "2026-01")).toBe(12);
    expect(promoMonthsRemaining(card, "2026-02")).toBe(11);
    expect(promoMonthsRemaining(card, "2026-12")).toBe(1);
    expect(promoMonthsRemaining(card, "2027-01")).toBe(0);
    expect(promoMonthsRemaining(card, "2028-06")).toBe(0);
  });

  test("live accounts show months left and re-anchor to the current month", () => {
    const card = debtAccount({ promoMonths: 12, promoAsOf: "2026-01", minimumPayment: 0 });
    const saver = debtAccount({ id: "isa", accountClass: "savings", type: "isa", promoRate: 5, promoMonths: 6, promoAsOf: "2026-01" });

    const [liveCard, liveSaver] = deriveLiveAccounts({ accounts: [card, saver], months: {}, currentMonthKey: "2026-04" });

    expect(liveCard.promoMonths).toBe(9);
    expect(liveCard.promoAsOf).toBe("2026-04");
    expect(liveSaver.promoMonths).toBe(3);
    // The stored snapshot is untouched.
    expect(card.promoMonths).toBe(12);
  });

  test("roll-forward starts charging APR the month the 0% window ends", () => {
    // 2 months of 0% entered in January: Feb and Mar are free, Apr is charged.
    const card = debtAccount({ balance: 1000, rate: 12, promoMonths: 2, promoAsOf: "2026-01", minimumPayment: 100, balanceAsOf: "2026-01" });

    const [rolled] = rollForwardDebtBalances({ accounts: [card], months: {}, currentMonthKey: "2026-04" });

    const afterMar = 800;
    const afterApr = afterMar * (1 + monthlyRateFromAnnual(12)) - 100;
    expect(rolled.balance).toBeCloseTo(Number(afterApr.toFixed(2)), 2);
  });

  test("an expired window drops out of the 0% warnings and forecast", () => {
    const card = debtAccount({ balance: 1000, rate: 24.9, promoMonths: 3, promoAsOf: "2026-01", minimumPayment: 0 });

    const [live] = deriveLiveAccounts({ accounts: [card], months: {}, currentMonthKey: "2026-06" });

    expect(live.promoMonths).toBe(0);
  });
});

test.describe("debt payoff estimate", () => {
  test("finds the payoff month and the payment that clears a 0% balance in time", () => {
    const card = debtAccount({ balance: 1200, rate: 24.9, promoMonths: 12, minimumPayment: 50 });

    const payoff = estimateDebtPayoff(card);

    expect(payoff.promoMonthsLeft).toBe(12);
    expect(payoff.paymentToClearInPromo).toBe(100);
    expect(payoff.monthsToPayoff).toBeGreaterThan(12);
  });

  test("returns null when the payment never outruns the interest", () => {
    const card = debtAccount({ balance: 5000, rate: 30, minimumPayment: 50 });
    expect(estimateDebtPayoff(card).monthsToPayoff).toBeNull();
  });

  test("clears a simple 0% loan on schedule", () => {
    const loan = debtAccount({ type: "loan", balance: 1000, rate: 0, minimumPayment: 100 });
    expect(estimateDebtPayoff(loan).monthsToPayoff).toBe(10);
  });
});
