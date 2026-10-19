import { expect, test } from "@playwright/test";
import { estimateUsTakeHome, federalIncomeTax, federalTableYear, stateTaxFor } from "../src/taxUS";
import { estimateUkTakeHome, ukIncomeTax, ukNationalInsurance, ukPersonalAllowance, ukTaxYearFor } from "../src/taxUK";
import { computeTakeHome, payrollDeductionsFromAccounts } from "../src/takeHome";
import { createInitialState } from "../src/finance";
import type { Account } from "../src/types";

// Every figure below is worked by hand from the published brackets and thresholds, so the
// estimators are checked against the rules rather than against themselves.

test.describe("US federal income tax", () => {
  test("single filer, 2025: the brackets stack on taxable income after the standard deduction", () => {
    const result = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2025 });
    expect(result.standardDeduction).toBe(15_750);
    expect(result.federalTaxableIncome).toBe(69_250);
    // 10% × 11,925 + 12% × 36,550 + 22% × 20,775
    expect(result.federalTax).toBe(10_149);
    expect(result.marginalRate).toBe(22);
    expect(result.federalBrackets.map((bracket) => bracket.rate)).toEqual([10, 12, 22]);
    expect(result.socialSecurity).toBe(5_270);
    expect(result.medicare).toBe(1_232.5);
    expect(result.stateTax).toBe(0);
    expect(result.totalTax).toBe(16_651.5);
    expect(result.net).toBe(68_348.5);
    expect(result.netMonthly).toBe(5_695.71);
    expect(result.effectiveTaxRate).toBe(19.59);
  });

  test("married filing jointly and head of household use their own tables", () => {
    const joint = estimateUsTakeHome({ grossAnnualSalary: 120_000, filingStatus: "married-joint", state: "", year: 2025 });
    expect(joint.federalTaxableIncome).toBe(88_500);
    expect(joint.federalTax).toBe(10_143);
    expect(joint.marginalRate).toBe(12);
    const head = federalIncomeTax(70_000, "head", 2025);
    // 10% × 17,000 + 12% × 47,850 + 22% × 5,150
    expect(head.tax).toBe(8_575);
  });

  test("2026 tables apply from 2026 and later years fall back to the newest table", () => {
    expect(federalTableYear(2024)).toBe(2025);
    expect(federalTableYear(2026)).toBe(2026);
    expect(federalTableYear(2030)).toBe(2026);
    const result = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2026 });
    expect(result.standardDeduction).toBe(16_100);
    // 10% × 12,400 + 12% × 38,000 + 22% × 18,500
    expect(result.federalTax).toBe(9_870);
  });

  test("pre-tax 401(k) money skips income tax but not FICA; HSA and premiums skip both", () => {
    const withRetirement = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2025, preTaxRetirementAnnual: 5_100 });
    expect(withRetirement.federalTaxableIncome).toBe(64_150);
    expect(withRetirement.federalTax).toBe(9_027);
    expect(withRetirement.socialSecurity).toBe(5_270);
    expect(withRetirement.net).toBe(64_370.5);

    const withHsa = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2025, preTaxHsaAnnual: 3_000 });
    expect(withHsa.socialSecurity).toBe(5_084);
    expect(withHsa.medicare).toBe(1_189);
    expect(withHsa.federalTaxableIncome).toBe(66_250);

    const roth = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2025, afterTaxPayrollAnnual: 2_400 });
    expect(roth.federalTax).toBe(10_149);
    expect(roth.net).toBe(68_348.5 - 2_400);
  });

  test("Social Security stops at the wage base and additional Medicare starts at the threshold", () => {
    const high = estimateUsTakeHome({ grossAnnualSalary: 250_000, filingStatus: "single", state: "", year: 2025 });
    expect(high.socialSecurity).toBe(10_918.2);
    // 1.45% × 250,000 + 0.9% × 50,000
    expect(high.medicare).toBe(4_075);
    const joint = estimateUsTakeHome({ grossAnnualSalary: 250_000, filingStatus: "married-joint", state: "", year: 2025 });
    expect(joint.medicare).toBe(3_625);
  });

  test("state tax uses the table's rate, an override, or nothing for no-tax states", () => {
    expect(stateTaxFor("TX")?.kind).toBe("none");
    expect(stateTaxFor("PA")).toMatchObject({ rate: 3.07, kind: "flat" });
    expect(stateTaxFor("CA")?.kind).toBe("approx");
    const pennsylvania = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "PA", year: 2025 });
    expect(pennsylvania.stateTax).toBe(2_125.98);
    expect(pennsylvania.stateKind).toBe("flat");
    const texas = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "TX", year: 2025 });
    expect(texas.stateTax).toBe(0);
    const override = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "CA", stateRateOverride: 5, year: 2025 });
    expect(override.stateTax).toBe(3_462.5);
    expect(override.stateKind).toBe("override");
  });

  test("pay frequency splits the net into paychecks", () => {
    const biweekly = estimateUsTakeHome({ grossAnnualSalary: 85_000, filingStatus: "single", state: "", year: 2025, payFrequency: "biweekly" });
    expect(biweekly.payPeriods).toBe(26);
    expect(biweekly.netPerPaycheck).toBe(2_628.79);
    expect(estimateUsTakeHome({ grossAnnualSalary: 0, filingStatus: "single", state: "", year: 2025 }).net).toBe(0);
  });
});

test.describe("UK PAYE, National Insurance and student loans", () => {
  test("the tax year starts on 6 April", () => {
    expect(ukTaxYearFor(new Date(2026, 3, 5))).toBe(2025);
    expect(ukTaxYearFor(new Date(2026, 3, 6))).toBe(2026);
    expect(ukTaxYearFor(new Date(2026, 9, 12))).toBe(2026);
  });

  test("basic-rate taxpayer on £40,000 with a Plan 2 loan", () => {
    const result = estimateUkTakeHome({ grossAnnualSalary: 40_000, studentLoanPlan: "plan2", year: 2026 });
    expect(result.yearLabel).toBe("2026/27");
    expect(result.personalAllowance).toBe(12_570);
    expect(result.taxableIncome).toBe(27_430);
    expect(result.incomeTax).toBe(5_486);
    expect(result.nationalInsurance).toBe(2_194.4);
    // 9% of everything above £29,385.
    expect(result.studentLoan).toBe(955.35);
    expect(result.net).toBe(31_364.25);
    expect(result.netMonthly).toBe(2_613.69);
    // Basic rate + NI + student loan: what the next pound loses.
    expect(result.marginalDeductionRate).toBe(37);
    expect(result.effectiveDeductionRate).toBe(21.59);
  });

  test("higher-rate band and the 2% NI rate above the upper earnings limit", () => {
    const result = estimateUkTakeHome({ grossAnnualSalary: 60_000, year: 2026 });
    expect(result.incomeTax).toBe(11_432);
    expect(result.bands.map((band) => band.name)).toEqual(["Basic rate", "Higher rate"]);
    expect(result.nationalInsurance).toBe(3_210.6);
    expect(result.marginalRate).toBe(40);
    expect(result.marginalDeductionRate).toBe(42);
  });

  test("the personal allowance tapers above £100,000 and vanishes by £125,140", () => {
    expect(ukPersonalAllowance(110_000, 2026)).toBe(7_570);
    expect(ukPersonalAllowance(125_140, 2026)).toBe(0);
    expect(ukIncomeTax(110_000, 2026).tax).toBe(33_432);
    const top = ukIncomeTax(150_000, 2026);
    expect(top.tax).toBe(53_703);
    expect(top.bands.map((band) => band.name)).toEqual(["Basic rate", "Higher rate", "Additional rate"]);
    expect(top.marginalRate).toBe(45);
    // The 60% trap: 40% tax plus half the allowance withdrawn.
    expect(estimateUkTakeHome({ grossAnnualSalary: 110_000, year: 2026 }).marginalDeductionRate).toBe(62);
  });

  test("net-pay pension contributions cut income tax but not NI or student loan", () => {
    const result = estimateUkTakeHome({ grossAnnualSalary: 40_000, pensionAnnual: 2_000, studentLoanPlan: "plan2", year: 2026 });
    expect(result.incomeTax).toBe(5_086);
    expect(result.nationalInsurance).toBe(2_194.4);
    expect(result.studentLoan).toBe(955.35);
    expect(result.net).toBe(29_764.25);
  });

  test("postgraduate loans stack on an undergraduate plan; under the threshold nothing is taken", () => {
    const both = estimateUkTakeHome({ grossAnnualSalary: 40_000, studentLoanPlan: "plan1", postgradLoan: true, year: 2026 });
    expect(both.studentLoan).toBe(1_179);
    expect(both.postgradLoan).toBe(1_140);
    expect(both.marginalDeductionRate).toBe(43);
    expect(ukNationalInsurance(12_000, 2026)).toBe(0);
    expect(estimateUkTakeHome({ grossAnnualSalary: 12_000, studentLoanPlan: "plan2", year: 2026 }).net).toBe(12_000);
  });
});

test.describe("take-home from the ledger's own accounts", () => {
  function account(overrides: Partial<Account>): Account {
    return {
      id: "a",
      name: "Plan",
      accountClass: "investment",
      type: "401k",
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
      color: "#1",
      note: "",
      contributionSource: "payroll",
      taxTreatment: "pre-tax",
      ...overrides,
    };
  }

  test("payroll contributions are sorted into pre-tax, health-account and after-tax buckets", () => {
    const deductions = payrollDeductionsFromAccounts(
      [
        account({ id: "k", monthlyContribution: 425 }),
        account({ id: "r", type: "roth-ira", taxTreatment: "roth", monthlyContribution: 100 }),
        account({ id: "h", accountClass: "savings", type: "hsa", taxTreatment: "triple", monthlyContribution: 250 }),
        account({ id: "p", contributionSource: "personal", monthlyContribution: 999 }),
      ],
      "US",
    );
    expect(deductions).toEqual({ preTaxRetirementAnnual: 5_100, preTaxHealthAccountsAnnual: 3_000, afterTaxAnnual: 1_200 });
    expect(payrollDeductionsFromAccounts([account({ type: "pension", monthlyContribution: 200 })], "GB").preTaxRetirementAnnual).toBe(2_400);
  });

  test("computeTakeHome picks the right country and feeds it the accounts", () => {
    const state = createInitialState("US");
    state.taxProfile.grossAnnualSalary = 85_000;
    const us = computeTakeHome("US", state.taxProfile, [account({ id: "k", monthlyContribution: 425 })], new Date(2025, 5, 1));
    expect(us.hasSalary).toBe(true);
    expect(us.us?.federalTax).toBe(9_027);
    expect(us.netMonthly).toBe(5_364.21);

    const uk = createInitialState("GB");
    uk.taxProfile.grossAnnualSalary = 40_000;
    uk.taxProfile.studentLoanPlan = "plan2";
    const gb = computeTakeHome("GB", uk.taxProfile, [account({ type: "pension", monthlyContribution: 166.67 })], new Date(2026, 9, 12));
    expect(gb.uk?.pension).toBe(2_000.04);
    expect(gb.uk?.studentLoan).toBe(955.35);
    expect(computeTakeHome("GB", createInitialState("GB").taxProfile, []).hasSalary).toBe(false);
  });
});
