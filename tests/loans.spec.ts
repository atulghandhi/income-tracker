import { expect, test } from "@playwright/test";
import { amortizedPayment, incomeDrivenPayment, loanSuggestion, povertyGuideline, totalInterest, ukStudentLoanRepayment, ukStudentLoanThreshold } from "../src/loans";
import type { Account } from "../src/types";

function loan(overrides: Partial<Account>): Account {
  return {
    id: "loan-1",
    name: "Loan",
    accountClass: "debt",
    type: "student-loan",
    balance: 18_000,
    rate: 5.5,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 200,
    dueDay: 1,
    balanceAsOf: "2026-01",
    promoAsOf: "2026-01",
    includeInNetWorth: true,
    color: "#2f7fdd",
    note: "",
    ...overrides,
  };
}

test.describe("amortised loans", () => {
  test("level payments match the standard formula", () => {
    // The textbook 30-year mortgage: $200,000 at 6% is $1,199.10 a month.
    expect(amortizedPayment(200_000, 6, 360)).toBe(1199.1);
    // Ten years on $18,000 at 5.5%.
    expect(Math.abs(amortizedPayment(18_000, 5.5, 120) - 195.35)).toBeLessThan(0.02);
    // No interest: straight division. Nothing owed: nothing to pay.
    expect(amortizedPayment(12_000, 0, 24)).toBe(500);
    expect(amortizedPayment(0, 6, 24)).toBe(0);
    expect(totalInterest(200_000, 6, 360)).toBeCloseTo(1199.1 * 360 - 200_000, 2);
  });
});

test.describe("US student loans", () => {
  test("income-driven payments protect 150% of the poverty line", () => {
    expect(povertyGuideline(1)).toBe(15_650);
    expect(povertyGuideline(3)).toBe(26_650);
    const single = incomeDrivenPayment({ adjustedGrossIncome: 60_000, familySize: 1 });
    expect(single.discretionaryIncome).toBe(36_525);
    expect(single.monthly).toBe(304.38);
    const family = incomeDrivenPayment({ adjustedGrossIncome: 60_000, familySize: 3 });
    expect(family.monthly).toBe(166.88);
    expect(incomeDrivenPayment({ adjustedGrossIncome: 20_000, familySize: 1 }).monthly).toBe(0);
  });

  test("suggestions follow the repayment plan and say what is missing", () => {
    const profile = { grossAnnualSalary: 60_000 };
    const standard = loanSuggestion(loan({ studentLoanType: "federal", repaymentPlan: "standard" }), "US", profile, 2026);
    expect(Math.abs((standard.suggestedPayment ?? 0) - 195.35)).toBeLessThan(0.02);
    expect(standard.basis).toContain("Standard (10 years)");

    const extended = loanSuggestion(loan({ studentLoanType: "federal", repaymentPlan: "extended" }), "US", profile, 2026);
    expect(extended.suggestedPayment).toBe(amortizedPayment(18_000, 5.5, 300));

    const driven = loanSuggestion(loan({ studentLoanType: "federal", repaymentPlan: "income-driven", familySize: 1 }), "US", profile, 2026);
    expect(driven.suggestedPayment).toBe(304.38);
    expect(loanSuggestion(loan({ studentLoanType: "federal", repaymentPlan: "income-driven" }), "US", { grossAnnualSalary: 0 }, 2026).suggestedPayment).toBeNull();

    // Private loans need a term; with one they amortise.
    expect(loanSuggestion(loan({ studentLoanType: "private" }), "US", profile, 2026).suggestedPayment).toBeNull();
    expect(loanSuggestion(loan({ studentLoanType: "private", termMonths: 60 }), "US", profile, 2026).suggestedPayment).toBe(amortizedPayment(18_000, 5.5, 60));

    // Mortgages and car loans amortise over their remaining term.
    const mortgage = loanSuggestion(loan({ type: "mortgage", balance: 200_000, rate: 6, termMonths: 360 }), "US", profile, 2026);
    expect(mortgage.suggestedPayment).toBe(1199.1);
    expect(loanSuggestion(loan({ type: "auto-loan", termMonths: 0 }), "GB", profile, 2026).suggestedPayment).toBeNull();
    expect(loanSuggestion(loan({ type: "credit-card" }), "US", profile, 2026).suggestedPayment).toBeNull();
  });
});

test.describe("UK student loans", () => {
  test("repayments are 9% (6% postgraduate) of pay above the plan threshold", () => {
    expect(ukStudentLoanThreshold("plan2", 2026)).toBe(29_385);
    expect(ukStudentLoanThreshold("plan2", 2025)).toBe(28_470);
    expect(ukStudentLoanThreshold("plan5", 2026)).toBe(25_000);
    expect(ukStudentLoanThreshold("postgrad", 2026)).toBe(21_000);
    const plan2 = ukStudentLoanRepayment({ grossAnnualSalary: 40_000, plan: "plan2", year: 2026 });
    expect(plan2).toMatchObject({ threshold: 29_385, ratePercent: 9, annual: 955.35, monthly: 79.61 });
    expect(ukStudentLoanRepayment({ grossAnnualSalary: 40_000, plan: "plan2", year: 2025 }).annual).toBe(1037.7);
    expect(ukStudentLoanRepayment({ grossAnnualSalary: 40_000, plan: "postgrad", year: 2026 }).annual).toBe(1140);
    // Under the threshold nothing is taken; an override threshold is honoured.
    expect(ukStudentLoanRepayment({ grossAnnualSalary: 25_000, plan: "plan2", year: 2026 }).monthly).toBe(0);
    expect(ukStudentLoanRepayment({ grossAnnualSalary: 40_000, plan: "plan2", year: 2026, thresholdOverride: 30_000 }).annual).toBe(900);
  });

  test("a UK student loan account suggests the payroll deduction", () => {
    const withPlan = loanSuggestion(loan({ studentLoanPlan: "plan2" }), "GB", { grossAnnualSalary: 40_000 }, 2026);
    expect(withPlan.suggestedPayment).toBe(79.61);
    expect(withPlan.basis).toContain("9% of pay above £29,385");
    expect(loanSuggestion(loan({}), "GB", { grossAnnualSalary: 40_000 }, 2026).notes[0]).toContain("Pick the repayment plan");
    expect(loanSuggestion(loan({ studentLoanPlan: "plan2" }), "GB", { grossAnnualSalary: 0 }, 2026).suggestedPayment).toBeNull();
  });
});
