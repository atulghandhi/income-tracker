import { expect, test } from "@playwright/test";
import { buildSampleLedger, sampleCountry } from "../src/sampleData";
import { calculateProjection } from "../src/finance";
import { isPayrollContribution } from "../src/finance";

test.describe("sample ledgers", () => {
  test("the US and UK samples differ in country, currency, instruments and language", () => {
    const us = buildSampleLedger("US", new Date(2026, 9, 12));
    const uk = buildSampleLedger("GB", new Date(2026, 9, 12));
    expect(us.country).toBe("US");
    expect(us.currency).toBe("USD");
    expect(uk.country).toBe("GB");
    expect(uk.currency).toBe("GBP");
    expect(us.accounts.map((account) => account.type)).toEqual(expect.arrayContaining(["401k", "roth-ira", "hsa", "hysa", "mortgage", "student-loan", "auto-loan"]));
    expect(uk.accounts.map((account) => account.type)).toEqual(expect.arrayContaining(["pension", "isa", "student-loan", "auto-loan"]));
    expect(uk.accounts.map((account) => account.type)).not.toContain("401k");
    const usNames = Object.values(us.months).flatMap((month) => month.expenses.map((expense) => expense.name));
    const ukNames = Object.values(uk.months).flatMap((month) => month.expenses.map((expense) => expense.name));
    expect(usNames).toEqual(expect.arrayContaining(["Property tax", "HOA dues", "Health insurance", "Doctor copay"]));
    expect(ukNames).toEqual(expect.arrayContaining(["Council tax", "Rent"]));
    expect(usNames).not.toContain("Council tax");
  });

  test("plan details, salary and health plan are filled in so every region widget has data", () => {
    const us = buildSampleLedger("US", new Date(2026, 9, 12));
    const plan = us.accounts.find((account) => account.type === "401k")!;
    expect(isPayrollContribution(plan)).toBe(true);
    expect(plan.employerMatchPercent).toBe(50);
    expect(plan.contributionPercent).toBe(6);
    expect(us.taxProfile.grossAnnualSalary).toBeGreaterThan(0);
    expect(us.healthPlan.deductible).toBeGreaterThan(0);
    expect(us.accounts.find((account) => account.type === "student-loan")?.studentLoanType).toBe("federal");
    const uk = buildSampleLedger("GB", new Date(2026, 9, 12));
    expect(uk.accounts.find((account) => account.type === "pension")?.employerContributionPercent).toBe(3);
    expect(uk.accounts.find((account) => account.type === "student-loan")?.studentLoanPlan).toBe("plan2");
    expect(uk.taxProfile.studentLoanPlan).toBe("plan2");
  });

  test("three months of dated rows, the current month selected, linked goals, and the same result every time", () => {
    const today = new Date(2026, 9, 12);
    const us = buildSampleLedger("US", today);
    expect(Object.keys(us.months).sort()).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(us.selectedMonth).toBe("2026-10");
    for (const month of Object.values(us.months)) {
      for (const expense of month.expenses) expect(expense.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Nothing dated after today sits in the current month unless it repeats.
    const current = us.months["2026-10"];
    expect(current.expenses.every((expense) => expense.recurring || Number(expense.date?.slice(8)) <= 12)).toBe(true);
    expect(calculateProjection(current).monthlyIncome).toBe(5450);
    const emergency = us.goals.find((goal) => goal.name === "Emergency fund")!;
    expect(emergency.accountId).toBe(us.accounts.find((account) => account.name === "Ally HYSA")?.id);
    // Amounts are deterministic across builds (only ids differ).
    const again = buildSampleLedger("US", today);
    expect(again.months["2026-08"].expenses.map((expense) => expense.amount)).toEqual(us.months["2026-08"].expenses.map((expense) => expense.amount));
  });

  test("sample keys map to countries", () => {
    expect(sampleCountry("us")).toBe("US");
    expect(sampleCountry("uk")).toBe("GB");
    expect(sampleCountry("gb")).toBe("GB");
    expect(sampleCountry("fr")).toBeNull();
    expect(sampleCountry(null)).toBeNull();
  });
});
