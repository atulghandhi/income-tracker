import { expect, test } from "@playwright/test";
import { buildFinancialSignals, buildNetWorthOutlook, calculateDebtSummary, calculateHealthScore, calculateProjection } from "../src/finance";
import type { DebtAccount, MonthBudget } from "../src/types";

test.describe("finance projections", () => {
  test("delays credit card interest until the interest-free period ends", () => {
    const month: MonthBudget = {
      incomes: [],
      expenses: [],
      note: "",
    };
    const card: DebtAccount = {
      id: "debt-1",
      name: "0% card",
      type: "credit-card",
      balance: 1000,
      creditLimit: 2000,
      apr: 12,
      interestFreeMonths: 2,
      minimumPayment: 100,
      dueDay: 1,
      includeInNetWorth: true,
      color: "#12b886",
      note: "",
    };

    const points = buildNetWorthOutlook({
      debts: [card],
      projection: calculateProjection(month),
      startingCash: 0,
      months: 3,
      startDate: new Date(2026, 0, 1),
    });

    expect(points[1].interestCharged).toBe(0);
    expect(points[2].interestCharged).toBe(0);
    expect(points[3].interestCharged).toBeCloseTo(8, 2);
    expect(points[3].debtBalance).toBeCloseTo(708, 2);
  });

  test("flags high credit utilisation and negative cash flow as financial signals", () => {
    const month: MonthBudget = {
      incomes: [{ id: "income-1", source: "Salary", amount: 2000, color: "#12b886" }],
      expenses: [{ id: "expense-1", name: "Rent", amount: 2300, category: "Home", color: "#6c5ce7" }],
      note: "",
    };
    const card: DebtAccount = {
      id: "debt-1",
      name: "High card",
      type: "credit-card",
      balance: 2850,
      creditLimit: 3000,
      apr: 24.9,
      interestFreeMonths: 0,
      minimumPayment: 50,
      dueDay: 15,
      includeInNetWorth: true,
      color: "#12b886",
      note: "",
    };
    const projection = calculateProjection(month);
    const debtSummary = calculateDebtSummary([card]);
    const signals = buildFinancialSignals({ projection, debtSummary, debts: [card], month, savingsTarget: 20 });
    const titles = signals.map((signal) => signal.title);

    expect(titles).toContain("Outflow is higher than income");
    expect(titles).toContain("Card utilisation over 90%");
    expect(titles).toContain("Overall credit utilisation over 80%");
    expect(titles).not.toContain("Grouping coverage");
  });

  test("calculates a contextual health score with rough credit estimate", () => {
    const month: MonthBudget = {
      incomes: [{ id: "income-1", source: "Salary", amount: 3000, color: "#12b886" }],
      expenses: [{ id: "expense-1", name: "Bills", amount: 2100, category: "Home", color: "#6c5ce7" }],
      note: "",
    };
    const card: DebtAccount = {
      id: "debt-1",
      name: "Everyday card",
      type: "credit-card",
      balance: 1000,
      creditLimit: 5000,
      apr: 19.9,
      interestFreeMonths: 6,
      minimumPayment: 100,
      dueDay: 15,
      includeInNetWorth: true,
      color: "#12b886",
      note: "",
    };

    const health = calculateHealthScore({
      projection: calculateProjection(month),
      debtSummary: calculateDebtSummary([card]),
      debts: [card],
      savingsTarget: 20,
    });

    expect(health.score).toBeGreaterThan(5);
    expect(health.estimatedCreditScore).toBeGreaterThanOrEqual(300);
    expect(health.estimatedCreditScore).toBeLessThanOrEqual(850);
    expect(health.detail).toContain("not a bureau score");
  });
});
