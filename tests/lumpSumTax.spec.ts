import { expect, test } from "@playwright/test";
import { estimateLumpSumTax, selfAssessmentDueDate, ukCapitalGainsTax, ukClass4NI, ukDividendTax, ukSavingsInterestTax, ukStudentLoanOnLumpSum } from "../src/lumpSumTax";
import { DEFAULT_ALLOCATION_SETTINGS, buildPlanInputs, lumpSumTaxFor, normalizeAllocationSettings, resolveStudentLoan, simulatePlan, type PlanInputs } from "../src/allocate";

// Tax to set aside from an untaxed UK lump sum. Every figure is pinned by hand from the 2025/26
// rules: personal allowance £12,570 (tapered £1 per £2 over £100,000), basic-rate band £37,700,
// higher rate to £125,140; Class 4 NI 6% between £12,570 and £50,270 then 2%; starting rate for
// savings £5,000; Personal Savings Allowance £1,000 / £500 / nil; dividend allowance £500 at
// 8.75% / 33.75% / 39.35%; CGT annual exempt amount £3,000 at 18% / 24%.

const YEAR = 2025;

function estimate(overrides: Partial<Parameters<typeof estimateLumpSumTax>[0]>) {
  return estimateLumpSumTax({ amount: 5_000, source: "other-income", grossAnnualSalary: 30_000, priorThisYear: 0, year: YEAR, today: new Date(2026, 9, 18), ...overrides });
}

test.describe("income-type lump sums", () => {
  test("a basic-rate taxpayer pays 20% on extra income, with no Class 4 under the lower limit", () => {
    const result = estimate({ amount: 5_000, source: "self-employed", grossAnnualSalary: 30_000 });
    expect(result.tax).toBe(1_000);
    expect(result.net).toBe(4_000);
    expect(result.effectiveRate).toBe(20);
    expect(result.topRate).toBe(20);
    expect(result.lines.map((line) => [line.label, line.amount])).toEqual([["Income tax at basic rate", 1_000]]);
    expect(result.notes.some((note) => note.startsWith("No Class 4"))).toBe(true);
  });

  test("a lump sum that straddles the higher-rate threshold is split across the bands", () => {
    // £45,000 salary leaves £5,270 of the basic band: 5,270 × 20% + 4,730 × 40%.
    const result = estimate({ amount: 10_000, source: "other-income", grossAnnualSalary: 45_000 });
    expect(result.tax).toBe(1_054 + 1_892);
    expect(result.lines).toEqual([
      { label: "Income tax at basic rate", amount: 1_054, rate: 20, base: 5_270 },
      { label: "Income tax at higher rate", amount: 1_892, rate: 40, base: 4_730 },
    ]);
    expect(result.topRate).toBe(40);
    expect(result.notes.some((note) => note.includes("payments on account"))).toBe(true);
  });

  test("a higher-rate taxpayer pays 40% on rental profit, no National Insurance", () => {
    const result = estimate({ amount: 5_000, source: "rental", grossAnnualSalary: 60_000 });
    expect(result.tax).toBe(2_000);
    expect(result.lines).toHaveLength(1);
    expect(result.notes.some((note) => note.includes("property allowance"))).toBe(true);
  });

  test("self-employed profit above the lower limit adds Class 4 National Insurance, stacked on earlier profit", () => {
    // No salary. £10,000 already earned, £20,000 more: income tax on 30,000 − 12,570 = 17,430 at 20%;
    // Class 4 on (30,000 − 12,570) × 6% = 1,045.80, none of it already paid on the first 10,000.
    const result = estimate({ amount: 20_000, source: "self-employed", grossAnnualSalary: 0, priorThisYear: 10_000 });
    expect(result.lines.find((line) => line.label === "Income tax at basic rate")?.amount).toBe(3_486);
    expect(result.lines.find((line) => line.label === "Class 4 National Insurance")).toEqual({ label: "Class 4 National Insurance", amount: 1_045.8, rate: 6 });
    expect(result.tax).toBe(4_531.8);
    expect(ukClass4NI(60_000, YEAR)).toBe(round2((50_270 - 12_570) * 0.06 + (60_000 - 50_270) * 0.02));
    expect(ukClass4NI(12_570, YEAR)).toBe(0);
  });

  test("between £100,000 and £125,140 the allowance taper makes the effective rate 60%", () => {
    const result = estimate({ amount: 10_000, source: "other-income", grossAnnualSalary: 100_000 });
    expect(result.tax).toBe(6_000);
    expect(result.effectiveRate).toBe(60);
    expect(result.topRate).toBe(60);
    expect(result.lines.find((line) => line.label.startsWith("Extra tax from personal allowance"))?.amount).toBe(2_000);
    expect(result.notes.some((note) => note.includes("60%"))).toBe(true);
  });

  test("an additional-rate taxpayer pays 45%", () => {
    expect(estimate({ amount: 10_000, grossAnnualSalary: 150_000 }).tax).toBe(4_500);
  });

  test("with no salary the personal allowance covers the first £12,570", () => {
    const result = estimate({ amount: 15_000, grossAnnualSalary: 0 });
    expect(result.tax).toBe((15_000 - 12_570) * 0.2);
    expect(result.lines[0].base).toBe(2_430);
  });
});

test.describe("savings interest", () => {
  test("the Personal Savings Allowance comes off first at each band", () => {
    // Basic rate: £1,000 allowance, then 20%.
    expect(estimate({ amount: 3_000, source: "savings-interest", grossAnnualSalary: 30_000 }).tax).toBe(400);
    // Higher rate: £500 allowance, then 40%.
    expect(estimate({ amount: 3_000, source: "savings-interest", grossAnnualSalary: 60_000 }).tax).toBe(1_000);
    // Additional rate: no allowance.
    expect(estimate({ amount: 3_000, source: "savings-interest", grossAnnualSalary: 130_000 }).tax).toBe(1_350);
  });

  test("interest that pushes total income over the higher-rate threshold only gets the £500 allowance", () => {
    // £50,000 salary: taxable 37,430; with £3,000 interest the total is 40,430, so the allowance is
    // £500 and the remaining £2,500 sits above £37,700 at 40%.
    const result = estimate({ amount: 3_000, source: "savings-interest", grossAnnualSalary: 50_000 });
    expect(result.tax).toBe(1_000);
    expect(result.lines).toEqual([
      { label: "Personal Savings Allowance (0%)", amount: 0, rate: 0, base: 500 },
      { label: "Interest at higher rate", amount: 1_000, rate: 40, base: 2_500 },
    ]);
  });

  test("the starting rate for savings protects low earners", () => {
    // £15,000 salary: taxable non-savings 2,430 leaves 2,570 of the £5,000 starting-rate band.
    const low = estimate({ amount: 2_000, source: "savings-interest", grossAnnualSalary: 15_000 });
    expect(low.tax).toBe(0);
    expect(low.lines[0]).toEqual({ label: "Starting rate for savings (0%)", amount: 0, rate: 0, base: 2_000 });
    expect(low.notes[0]).toBe("Covered by your allowances: nothing to set aside.");
    // £4,000 of interest: 2,570 starting rate, 1,000 allowance, 430 at 20%.
    expect(estimate({ amount: 4_000, source: "savings-interest", grossAnnualSalary: 15_000 }).tax).toBe(86);
    expect(ukSavingsInterestTax(15_000, 4_000, YEAR)).toMatchObject({ startingUsed: 2_570, allowanceUsed: 1_000, basic: 430, total: 86 });
  });

  test("interest already received this year uses the allowance first", () => {
    // £1,000 already had at basic rate used the whole allowance; the next £1,000 is all taxed.
    expect(estimate({ amount: 1_000, source: "savings-interest", grossAnnualSalary: 30_000, priorThisYear: 1_000 }).tax).toBe(200);
  });
});

test.describe("dividends", () => {
  test("the £500 allowance comes off, then dividend rates by band", () => {
    expect(estimate({ amount: 5_000, source: "dividends", grossAnnualSalary: 30_000 }).tax).toBe(round2(4_500 * 0.0875));
    expect(estimate({ amount: 5_000, source: "dividends", grossAnnualSalary: 60_000 }).tax).toBe(round2(4_500 * 0.3375));
    expect(estimate({ amount: 5_000, source: "dividends", grossAnnualSalary: 130_000 }).tax).toBe(round2(4_500 * 0.3935));
  });

  test("dividends straddling the threshold split across rates, and the allowance uses band room", () => {
    // £45,000 salary: 5,270 of basic band left; 500 allowance (0%) takes the first 500 of it,
    // 4,770 at 8.75%, then 4,730 at 33.75%.
    const result = ukDividendTax(45_000, 10_000, YEAR);
    expect(result).toMatchObject({ allowanceUsed: 500, basic: 4_770, higher: 4_730 });
    expect(result.total).toBe(round2(4_770 * 0.0875 + 4_730 * 0.3375));
    const prior = estimate({ amount: 2_000, source: "dividends", grossAnnualSalary: 30_000, priorThisYear: 500 });
    expect(prior.tax).toBe(175);
  });
});

test.describe("capital gains", () => {
  test("the annual exempt amount comes off, then 18% in the basic band and 24% above", () => {
    expect(estimate({ amount: 13_000, source: "capital-gain", grossAnnualSalary: 30_000 }).tax).toBe(1_800);
    expect(estimate({ amount: 13_000, source: "capital-gain", grossAnnualSalary: 60_000 }).tax).toBe(2_400);
    // £45,000 salary: 5,270 of basic band left → 5,270 × 18% + 4,730 × 24%.
    const straddle = estimate({ amount: 13_000, source: "capital-gain", grossAnnualSalary: 45_000 });
    expect(straddle.tax).toBe(round2(5_270 * 0.18 + 4_730 * 0.24));
    expect(straddle.lines).toEqual([
      { label: "Annual exempt amount (0%)", amount: 0, rate: 0, base: 3_000 },
      { label: "Capital gains tax at basic rate", amount: 948.6, rate: 18, base: 5_270 },
      { label: "Capital gains tax at higher rate", amount: 1_135.2, rate: 24, base: 4_730 },
    ]);
    expect(straddle.notes.some((note) => note.includes("60 days"))).toBe(true);
  });

  test("gains already realised this year have used the exempt amount", () => {
    expect(estimate({ amount: 10_000, source: "capital-gain", grossAnnualSalary: 30_000, priorThisYear: 3_000 }).tax).toBe(1_800);
    expect(estimate({ amount: 2_000, source: "capital-gain", grossAnnualSalary: 30_000 }).tax).toBe(0);
    expect(ukCapitalGainsTax(30_000, 2_000, YEAR)).toMatchObject({ exemptUsed: 2_000, total: 0 });
  });
});

test.describe("student loan repayments through Self Assessment", () => {
  // 2025/26 thresholds: Plan 1 £26,065, Plan 2 £28,470, Plan 4 £32,745, Plan 5 £25,000, postgraduate £21,000.
  const plan2 = { plan: "plan2" as const, postgrad: false };

  test("9% of earned income above the threshold is added to the bill, on top of the tax", () => {
    const result = estimate({ amount: 5_000, source: "self-employed", grossAnnualSalary: 30_000, studentLoan: plan2 });
    expect(result.lines).toContainEqual({ label: "Student loan (Plan 2)", amount: 450, rate: 9, base: 5_000 });
    expect(result.studentLoan).toBe(450);
    expect(result.tax).toBe(1_000 + 450);
    expect(result.net).toBe(3_550);
    expect(result.effectiveRate).toBe(29);
  });

  test("only the part above the threshold is charged when salary is under it", () => {
    // £25,000 salary + £5,000 = £30,000; £1,530 over the Plan 2 threshold.
    const result = estimate({ amount: 5_000, source: "other-income", grossAnnualSalary: 25_000, studentLoan: plan2 });
    expect(result.studentLoan).toBe(137.7);
    expect(result.lines.find((line) => line.label.startsWith("Student loan"))?.base).toBe(1_530);
    // Plan 1 threshold is lower: £20,000 + £10,000 leaves £3,935 over £26,065.
    expect(estimate({ amount: 10_000, source: "other-income", grossAnnualSalary: 20_000, studentLoan: { plan: "plan1", postgrad: false } }).studentLoan).toBe(354.15);
    // Under the threshold altogether: nothing, and the note says so.
    const under = estimate({ amount: 2_000, source: "other-income", grossAnnualSalary: 20_000, studentLoan: plan2 });
    expect(under.studentLoan).toBe(0);
    expect(under.notes).toContain("Income is under the student loan threshold, so no repayment is due on it.");
  });

  test("a postgraduate loan is repaid alongside the undergraduate plan at 6%", () => {
    const both = estimate({ amount: 5_000, source: "self-employed", grossAnnualSalary: 30_000, studentLoan: { plan: "plan2", postgrad: true } });
    expect(both.studentLoan).toBe(450 + 300);
    expect(both.lines.filter((line) => line.label.startsWith("Student loan")).map((line) => line.label)).toEqual(["Student loan (Plan 2)", "Student loan (Postgraduate loan)"]);
    expect(estimate({ amount: 5_000, source: "self-employed", grossAnnualSalary: 30_000, studentLoan: { plan: null, postgrad: true } }).studentLoan).toBe(300);
  });

  test("unearned income only counts once it is over £2,000 in the year, then all of it counts", () => {
    const small = estimate({ amount: 1_500, source: "rental", grossAnnualSalary: 30_000, studentLoan: plan2 });
    expect(small.studentLoan).toBe(0);
    expect(small.notes.some((note) => note.includes("over £2,000"))).toBe(true);
    // £1,000 already had plus £1,500 now = £2,500: the whole £2,500 becomes liable.
    const tipped = estimate({ amount: 1_500, source: "rental", grossAnnualSalary: 30_000, priorThisYear: 1_000, studentLoan: plan2 });
    expect(tipped.studentLoan).toBe(225);
    // Already over the limit: just the new amount.
    expect(estimate({ amount: 1_500, source: "savings-interest", grossAnnualSalary: 30_000, priorThisYear: 2_500, studentLoan: plan2 }).studentLoan).toBe(135);
    expect(ukStudentLoanOnLumpSum({ plan: "plan2", salary: 30_000, priorThisYear: 1_000, amount: 1_500, source: "dividends", year: YEAR })).toEqual({ repayment: 225, counted: 2_500, rate: 9, threshold: 28_470 });
  });

  test("capital gains are not income, so no repayment is due on them", () => {
    const gain = estimate({ amount: 13_000, source: "capital-gain", grossAnnualSalary: 30_000, studentLoan: plan2 });
    expect(gain.studentLoan).toBe(0);
    expect(gain.tax).toBe(1_800);
    expect(gain.notes).toContain("Capital gains are not income, so they do not count towards student loan repayments.");
  });

  test("the plan comes from the tax profile unless set on Allocate", () => {
    expect(resolveStudentLoan({ studentLoan: null }, { studentLoanPlan: "plan2", postgradLoan: false })).toEqual({ repaying: true, plan: "plan2", postgrad: false });
    expect(resolveStudentLoan({ studentLoan: null }, { studentLoanPlan: "none", postgradLoan: true })).toEqual({ repaying: true, plan: null, postgrad: true });
    expect(resolveStudentLoan({ studentLoan: null }, { studentLoanPlan: "none", postgradLoan: false })).toEqual({ repaying: false, plan: null, postgrad: false });
    expect(resolveStudentLoan({ studentLoan: { repaying: false, plan: "plan1", postgrad: false } }, { studentLoanPlan: "plan2", postgradLoan: true })).toEqual({ repaying: false, plan: "plan1", postgrad: false });

    const settings = { ...DEFAULT_ALLOCATION_SETTINGS, lumpSum: 5_000, lumpSumTax: { taxable: true, source: "self-employed" as const, monthlySalary: null, priorThisYear: 0, studentLoan: null } };
    const today = new Date(2026, 9, 18);
    expect(lumpSumTaxFor({ settings, taxProfile: { grossAnnualSalary: 30_000, studentLoanPlan: "plan2", postgradLoan: false }, country: "GB", today })?.tax).toBe(1_450);
    expect(lumpSumTaxFor({ settings: { ...settings, lumpSumTax: { ...settings.lumpSumTax, studentLoan: { repaying: false, plan: "plan2", postgrad: false } } }, taxProfile: { grossAnnualSalary: 30_000, studentLoanPlan: "plan2", postgradLoan: false }, country: "GB", today })?.tax).toBe(1_000);
    expect(normalizeAllocationSettings({ lumpSumTax: { studentLoan: { repaying: true, plan: "plan9", postgrad: "yes" } } }).lumpSumTax.studentLoan).toEqual({ repaying: true, plan: null, postgrad: false });
  });
});

test.describe("due date and plumbing", () => {
  test("Self Assessment tax is due on 31 January after the tax year ends", () => {
    expect(selfAssessmentDueDate(new Date(2026, 9, 18))).toEqual({ year: 2026, dueDate: "2028-01-31", dueLabel: "31 January 2028", dueInMonths: 15 });
    expect(selfAssessmentDueDate(new Date(2027, 1, 10))).toMatchObject({ year: 2026, dueDate: "2028-01-31", dueInMonths: 11 });
    expect(selfAssessmentDueDate(new Date(2027, 3, 6))).toMatchObject({ year: 2027, dueDate: "2029-01-31", dueInMonths: 21 });
    expect(estimate({}).dueLabel).toBe("31 January 2028");
  });

  test("the estimate only applies to UK ledgers with a taxable lump sum, and follows the tax profile's salary", () => {
    const settings = { ...DEFAULT_ALLOCATION_SETTINGS, lumpSum: 5_000, lumpSumTax: { taxable: true, source: "other-income" as const, monthlySalary: null, priorThisYear: 0, studentLoan: null } };
    const profile = { grossAnnualSalary: 30_000, studentLoanPlan: "none" as const, postgradLoan: false };
    const today = new Date(2026, 9, 18);
    expect(lumpSumTaxFor({ settings, taxProfile: profile, country: "GB", today })?.tax).toBe(1_000);
    expect(lumpSumTaxFor({ settings, taxProfile: profile, country: "US", today })).toBeNull();
    expect(lumpSumTaxFor({ settings, taxProfile: profile, country: "IE", today })).toBeNull();
    expect(lumpSumTaxFor({ settings: { ...settings, lumpSumTax: { ...settings.lumpSumTax, taxable: false } }, taxProfile: profile, country: "GB", today })).toBeNull();
    expect(lumpSumTaxFor({ settings: { ...settings, lumpSum: 0 }, taxProfile: profile, country: "GB", today })).toBeNull();
    // A typed monthly salary overrides the profile: £5,000 a month is £60,000 a year → 40%.
    expect(lumpSumTaxFor({ settings: { ...settings, lumpSumTax: { ...settings.lumpSumTax, monthlySalary: 5_000 } }, taxProfile: profile, country: "GB", today })?.tax).toBe(2_000);
  });

  test("the tax is held back from the lump sum on day one and paid when the bill is due", () => {
    const base: PlanInputs = {
      debts: [{ id: "card", name: "Card", type: "credit-card", balance: 10_000, rate: 20, promoRate: 0, promoMonths: 0, minimumPayment: 200, creditLimit: 0, color: "#000" }],
      savers: [],
      goals: [],
      monthlyExtra: 0,
      lumpSum: 5_000,
      lumpSumTax: { amount: 1_000, dueInMonths: 15 },
      monthlyExpenses: 0,
      currentBuffer: 0,
      bufferMonths: 0,
      taxReserve: 0,
      taxDueInMonths: 6,
      horizonMonths: 24,
      assumedInvestmentReturn: 6,
      safeSavingsRate: 4,
      promoGuard: true,
      rollover: true,
      customShares: { debts: 60, buffer: 20, savings: 20 },
      customMethod: "avalanche",
      savingsPriority: "safe-rate",
      region: "GB",
      startDate: new Date(2026, 9, 1),
    };
    const result = simulatePlan(base, "interest");
    expect(result.summary.lumpSumSplit).toEqual({ tax: 1_000, buffer: 0, debt: 4_000, savings: 0 });
    expect(result.summary.lumpSumTaxHeld).toBe(1_000);
    expect(result.points[0].debtBalances.card).toBe(6_000);
    expect(result.points[0].taxReserve).toBe(1_000);
    expect(result.points[14].taxReserve).toBe(1_000);
    expect(result.points[15].taxReserve).toBe(0);
    // Minimums only also has to pay the tax, so the comparison stays like for like.
    const baseline = simulatePlan(base, "interest", { baseline: true });
    expect(baseline.points[0].savings).toBe(4_000);
    expect(baseline.points[0].taxReserve).toBe(1_000);
    // Without the tax flag the whole lump sum is allocated.
    expect(simulatePlan({ ...base, lumpSumTax: undefined }, "interest").summary.lumpSumSplit.debt).toBe(5_000);
  });

  test("the lump-sum tax is held once: 'Tax bill first' only adds a separate bill on top", () => {
    const base: PlanInputs = {
      debts: [{ id: "card", name: "Card", type: "credit-card", balance: 10_000, rate: 20, promoRate: 0, promoMonths: 0, minimumPayment: 200, creditLimit: 0, color: "#000" }],
      savers: [],
      goals: [],
      monthlyExtra: 300,
      lumpSum: 5_000,
      lumpSumTax: { amount: 1_000, dueInMonths: 15 },
      monthlyExpenses: 0,
      currentBuffer: 0,
      bufferMonths: 0,
      taxReserve: 0,
      taxDueInMonths: 6,
      horizonMonths: 24,
      assumedInvestmentReturn: 6,
      safeSavingsRate: 4,
      promoGuard: true,
      rollover: true,
      customShares: { debts: 60, buffer: 20, savings: 20 },
      customMethod: "avalanche",
      savingsPriority: "safe-rate",
      region: "GB",
      startDate: new Date(2026, 9, 1),
    };
    // No separate bill: "Tax bill first" holds exactly the £1,000 once and sends the rest to the card.
    const noBill = simulatePlan(base, "tax-buffer");
    expect(noBill.summary.lumpSumSplit).toEqual({ tax: 1_000, buffer: 0, debt: 4_000, savings: 0 });
    expect(noBill.summary.lumpSumTaxHeld).toBe(1_000);
    expect(noBill.points[1].allocations).toEqual({ tax: 0, buffer: 0, debt: 300, savings: 0 });
    // A separate £500 bill sits on top: £1,000 for the lump sum plus £500 for the bill.
    const withBill = simulatePlan({ ...base, taxReserve: 500 }, "tax-buffer");
    expect(withBill.summary.lumpSumSplit).toEqual({ tax: 1_500, buffer: 0, debt: 3_500, savings: 0 });
    expect(withBill.summary.lumpSumTaxHeld).toBe(1_000);
    expect(withBill.points[0].taxReserve).toBe(1_500);
    // The bill is paid in month 6; the lump-sum tax stays held until month 15.
    expect(withBill.points[6].taxReserve).toBe(1_000);
    expect(withBill.points[15].taxReserve).toBe(0);
    expect(withBill.summary.taxFundedMonth).toBe(0);
  });

  test("buildPlanInputs wires the estimate in for UK ledgers and leaves it out elsewhere", () => {
    const settings = { ...DEFAULT_ALLOCATION_SETTINGS, lumpSum: 5_000, lumpSumTax: { taxable: true, source: "other-income" as const, monthlySalary: null, priorThisYear: 0, studentLoan: null } };
    const shared = { accounts: [], goals: [], settings, monthlySurplus: 0, monthlyExpenses: 0, assumedInvestmentReturn: 6, taxProfile: { grossAnnualSalary: 30_000, studentLoanPlan: "none" as const, postgradLoan: false }, startDate: new Date(2026, 9, 18) };
    const gb = buildPlanInputs({ ...shared, region: "GB", country: "GB" });
    expect(gb.lumpSumTax).toEqual({ amount: 1_000, dueInMonths: 15 });
    expect(gb.lumpSumTaxResult?.net).toBe(4_000);
    expect(buildPlanInputs({ ...shared, region: "US", country: "US" }).lumpSumTax).toBeUndefined();
    // Nothing to set aside → nothing held back.
    expect(buildPlanInputs({ ...shared, region: "GB", country: "GB", settings: { ...settings, lumpSumTax: { ...settings.lumpSumTax, source: "capital-gain" }, lumpSum: 2_000 } }).lumpSumTax).toBeUndefined();
  });

  test("stored settings are cleaned", () => {
    expect(normalizeAllocationSettings({}).lumpSumTax).toEqual({ taxable: false, source: "self-employed", monthlySalary: null, priorThisYear: 0, studentLoan: null });
    expect(normalizeAllocationSettings({ lumpSumTax: { taxable: "yes", source: "lottery", monthlySalary: "2500", priorThisYear: -4 } }).lumpSumTax).toEqual({ taxable: false, source: "self-employed", monthlySalary: 2_500, priorThisYear: 0, studentLoan: null });
    expect(normalizeAllocationSettings({ lumpSumTax: { taxable: true, source: "dividends", monthlySalary: null, priorThisYear: 800 } }).lumpSumTax).toEqual({ taxable: true, source: "dividends", monthlySalary: null, priorThisYear: 800, studentLoan: null });
  });
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
