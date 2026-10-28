import { expect, test } from "@playwright/test";
import {
  annualLimitFor,
  contributionLimitGroups,
  employeeMonthlyContribution,
  employerMatchShortfalls,
  employerMonthlyContribution,
  limitYear,
  limitYearLabel,
  syncPlanContributions,
} from "../src/retirement";
import {
  accountInflow,
  buildFinancialSignals,
  buildNetWorthOutlook,
  calculateAssetSummary,
  calculateDebtSummary,
  calculateProjection,
  cashContribution,
  createInitialState,
  employerContribution,
  isPayrollContribution,
} from "../src/finance";
import { goalPlanInputs } from "../src/accountLinks";
import { buildPlanSignals } from "../src/planSignals";
import type { Account } from "../src/types";

function account(overrides: Partial<Account>): Account {
  return {
    id: "acc-1",
    name: "401(k)",
    accountClass: "investment",
    type: "401k",
    balance: 10000,
    rate: 6,
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
    taxTreatment: "pre-tax",
    contributionSource: "payroll",
    ...overrides,
  };
}

const SALARY = 85_000;

test.describe("contribution amounts", () => {
  test("a % of pay becomes a monthly amount once a salary is known", () => {
    expect(employeeMonthlyContribution(account({ contributionPercent: 6 }), SALARY)).toBe(425);
    // No salary: the typed monthly amount stands.
    expect(employeeMonthlyContribution(account({ contributionPercent: 6, monthlyContribution: 300 }), 0)).toBe(300);
    expect(employeeMonthlyContribution(account({ monthlyContribution: 300 }), SALARY)).toBe(300);
    expect(employeeMonthlyContribution(account({ accountClass: "debt", type: "loan", monthlyContribution: 300 }), SALARY)).toBe(0);
  });

  test("the employer match is a share of the employee's contribution, capped at a % of pay", () => {
    // 50% of the first 6%: employee at 6% gets the full 3% of pay.
    expect(employerMonthlyContribution(account({ contributionPercent: 6, employerMatchPercent: 50, employerMatchCapPercent: 6 }), SALARY)).toBe(212.5);
    // Employee at 4%: 50% × 4% = 2% of pay.
    expect(employerMonthlyContribution(account({ contributionPercent: 4, employerMatchPercent: 50, employerMatchCapPercent: 6 }), SALARY)).toBe(141.67);
    // Employee at 8%: the match stops at the 6% cap.
    expect(employerMonthlyContribution(account({ contributionPercent: 8, employerMatchPercent: 50, employerMatchCapPercent: 6 }), SALARY)).toBe(212.5);
    // A dollar-for-dollar match with no cap follows the contribution.
    expect(employerMonthlyContribution(account({ contributionPercent: 5, employerMatchPercent: 100 }), SALARY)).toBe(354.17);
    // A typed monthly amount implies the employee %.
    expect(employerMonthlyContribution(account({ monthlyContribution: 425, employerMatchPercent: 50, employerMatchCapPercent: 6 }), SALARY)).toBe(212.5);
  });

  test("fixed employer contributions add on, and typed amounts stand in without a salary", () => {
    // UK auto-enrolment style: employer pays 3% whatever the employee does.
    expect(employerMonthlyContribution(account({ type: "pension", employerContributionPercent: 3 }), SALARY)).toBe(212.5);
    expect(employerMonthlyContribution(account({ contributionPercent: 5, employerMatchPercent: 100, employerMatchCapPercent: 4, employerContributionPercent: 3 }), SALARY)).toBe(495.83);
    expect(employerMonthlyContribution(account({ employerMatchPercent: 50, employerMatchCapPercent: 6, employerMonthlyContribution: 100 }), 0)).toBe(100);
    expect(employerMonthlyContribution(account({ employerMonthlyContribution: 100 }), SALARY)).toBe(100);
  });

  test("the sync keeps salary-based amounts in step with the tax profile", () => {
    const state = createInitialState("US");
    state.taxProfile.grossAnnualSalary = SALARY;
    state.accounts = [
      account({ id: "plan", contributionPercent: 6, employerMatchPercent: 50, employerMatchCapPercent: 6 }),
      account({ id: "typed", monthlyContribution: 300 }),
    ];
    const synced = syncPlanContributions(state);
    expect(synced.accounts[0].monthlyContribution).toBe(425);
    expect(synced.accounts[0].employerMonthlyContribution).toBe(212.5);
    // Accounts without salary rules are untouched, and a second pass changes nothing.
    expect(synced.accounts[1]).toBe(state.accounts[1]);
    expect(syncPlanContributions(synced)).toBe(synced);
    // No salary: nothing to sync.
    state.taxProfile.grossAnnualSalary = 0;
    expect(syncPlanContributions(state)).toBe(state);
  });

  test("flags free employer money left on the table", () => {
    const shortfalls = employerMatchShortfalls(
      [
        account({ id: "short", name: "Short", contributionPercent: 4, employerMatchPercent: 100, employerMatchCapPercent: 5 }),
        account({ id: "full", name: "Full", contributionPercent: 6, employerMatchPercent: 100, employerMatchCapPercent: 5 }),
        account({ id: "no-match", name: "None", contributionPercent: 1 }),
      ],
      SALARY,
    );
    expect(shortfalls).toEqual([{ accountId: "short", name: "Short", currentPercent: 4, neededPercent: 5, missedAnnual: 850 }]);
    expect(employerMatchShortfalls([account({ contributionPercent: 1, employerMatchPercent: 100, employerMatchCapPercent: 5 })], 0)).toEqual([]);
  });
});

test.describe("annual limits", () => {
  test("the limit year is the calendar year in the US and the April tax year in the UK", () => {
    expect(limitYear("US", new Date(2026, 9, 12))).toBe(2026);
    expect(limitYear("GB", new Date(2026, 9, 12))).toBe(2026);
    expect(limitYear("GB", new Date(2026, 2, 1))).toBe(2025);
    expect(limitYear("GB", new Date(2026, 3, 6))).toBe(2026);
    expect(limitYearLabel("GB", 2026)).toBe("2026/27");
    expect(limitYearLabel("US", 2026)).toBe("2026");
  });

  test("statutory limits by type, year, catch-up and coverage", () => {
    expect(annualLimitFor(account({}), "US", 2025)?.limit).toBe(23_500);
    expect(annualLimitFor(account({}), "US", 2026)?.limit).toBe(24_500);
    expect(annualLimitFor(account({ catchUpEligible: true }), "US", 2025)?.limit).toBe(31_000);
    expect(annualLimitFor(account({ type: "403b" }), "US", 2026)?.key).toBe("401k");
    expect(annualLimitFor(account({ type: "roth-ira" }), "US", 2025)?.limit).toBe(7_000);
    expect(annualLimitFor(account({ type: "traditional-ira", catchUpEligible: true }), "US", 2026)?.limit).toBe(8_600);
    expect(annualLimitFor(account({ accountClass: "savings", type: "hsa" }), "US", 2025)?.limit).toBe(4_300);
    expect(annualLimitFor(account({ accountClass: "savings", type: "hsa", coverage: "family" }), "US", 2025)?.limit).toBe(8_550);
    expect(annualLimitFor(account({ accountClass: "savings", type: "hsa", coverage: "family", catchUpEligible: true }), "US", 2026)?.limit).toBe(9_750);
    expect(annualLimitFor(account({ accountClass: "savings", type: "fsa" }), "US", 2026)?.limit).toBe(3_400);
    expect(annualLimitFor(account({ accountClass: "savings", type: "isa" }), "GB", 2026)?.limit).toBe(20_000);
    expect(annualLimitFor(account({ accountClass: "savings", type: "lisa" }), "GB", 2026)?.limit).toBe(4_000);
    expect(annualLimitFor(account({ type: "pension" }), "GB", 2025)?.limit).toBe(60_000);
    // Future years fall back to the latest table; brokerage accounts have no limit.
    expect(annualLimitFor(account({}), "US", 2031)?.limit).toBe(24_500);
    expect(annualLimitFor(account({ type: "investment" }), "US", 2026)).toBeNull();
    // An override wins.
    const overridden = annualLimitFor(account({ annualLimitOverride: 10_000 }), "US", 2026)!;
    expect(overridden.limit).toBe(10_000);
    expect(overridden.overridden).toBe(true);
  });

  test("groups contributions by the limit they share and reports headroom", () => {
    const groups = contributionLimitGroups(
      [
        account({ id: "k", monthlyContribution: 500, employerMonthlyContribution: 200 }),
        account({ id: "t", name: "Trad IRA", type: "traditional-ira", monthlyContribution: 300 }),
        account({ id: "r", name: "Roth IRA", type: "roth-ira", monthlyContribution: 400 }),
        account({ id: "h", name: "HSA", accountClass: "savings", type: "hsa", monthlyContribution: 200, employerMonthlyContribution: 100 }),
        account({ id: "b", name: "Brokerage", type: "investment", monthlyContribution: 1000 }),
      ],
      "US",
      2026,
    );
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    // 401(k): employee money only counts; employer money is reported separately.
    expect(byKey["401k"]).toMatchObject({ limit: 24_500, counted: 6_000, employerAnnual: 2_400, remaining: 18_500, usedPercent: 24.49, monthlyToMax: 1541.67 });
    // IRAs share one limit and together exceed it.
    expect(byKey.ira).toMatchObject({ limit: 7_500, counted: 8_400, remaining: 0, usedPercent: 100 });
    expect(byKey.ira.accounts.map((item) => item.name)).toEqual(["Trad IRA", "Roth IRA"]);
    // HSA limit includes the employer's share.
    expect(byKey.hsa).toMatchObject({ limit: 4_400, counted: 3_600, remaining: 800 });
    expect(byKey.investment).toBeUndefined();
  });

  test("a lifetime ISA counts within the overall ISA allowance", () => {
    const groups = contributionLimitGroups(
      [
        account({ id: "cash-isa", accountClass: "savings", type: "isa", monthlyContribution: 1000 }),
        account({ id: "lisa", accountClass: "savings", type: "lisa", monthlyContribution: 300 }),
      ],
      "GB",
      2026,
    );
    const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
    expect(byKey.isa.counted).toBe(15_600);
    expect(byKey.lisa.counted).toBe(3_600);
    expect(byKey.isa.yearLabel).toBe("2026/27");
  });
});

test.describe("payroll and employer money in the forecasts", () => {
  const projection = calculateProjection({
    incomes: [{ id: "i", source: "Salary (take-home)", amount: 4000, color: "#1", recurring: true }],
    expenses: [{ id: "e", name: "Rent", category: "", amount: 3000, color: "#2", recurring: true }],
    note: "",
  });

  test("helpers tell cash, payroll and employer money apart", () => {
    const payroll = account({ monthlyContribution: 425, employerMonthlyContribution: 212.5 });
    const personal = account({ type: "roth-ira", contributionSource: "personal", monthlyContribution: 300 });
    expect(isPayrollContribution(payroll)).toBe(true);
    expect(isPayrollContribution(personal)).toBe(false);
    expect(employerContribution(payroll)).toBe(212.5);
    expect(cashContribution(payroll, {})).toBe(0);
    expect(cashContribution(personal, {})).toBe(300);
    expect(accountInflow(payroll, {})).toBe(637.5);
    expect(accountInflow(personal, {})).toBe(300);
    // A linked ledger row is real money leaving the budget, whatever the source says.
    expect(cashContribution(payroll, { "acc-1": 425 })).toBe(425);
  });

  test("payroll contributions grow the account without draining the budget's cash", () => {
    const payroll = account({ id: "k", balance: 0, rate: 0, monthlyContribution: 425, employerMonthlyContribution: 212.5 });
    const points = buildNetWorthOutlook({ accounts: [payroll], projection, months: 2 });
    expect(points[1].investmentBalance).toBeCloseTo(637.5, 6);
    // Surplus 1,000 stays in cash: the 401(k) money never came out of take-home pay.
    expect(points[1].cashBalance).toBeCloseTo(1000, 6);
    expect(points[1].netWorth).toBeCloseTo(1637.5, 6);
    expect(points[2].investmentBalance).toBeCloseTo(1275, 6);
  });

  test("a personal contribution still moves out of cash, and employer money still arrives", () => {
    const ira = account({ id: "r", type: "roth-ira", contributionSource: "personal", balance: 0, rate: 0, monthlyContribution: 300, employerMonthlyContribution: 50 });
    const points = buildNetWorthOutlook({ accounts: [ira], projection, months: 1 });
    expect(points[1].investmentBalance).toBeCloseTo(350, 6);
    expect(points[1].cashBalance).toBeCloseTo(700, 6);
  });

  test("the asset summary and goal planner see payroll money as already spoken for", () => {
    const accounts = [
      account({ id: "k", monthlyContribution: 425, employerMonthlyContribution: 212.5 }),
      account({ id: "s", accountClass: "savings", type: "savings", contributionSource: "personal", monthlyContribution: 100 }),
    ];
    const summary = calculateAssetSummary(accounts);
    expect(summary.monthlyContributions).toBe(737.5);
    expect(summary.cashContributions).toBe(100);
    expect(summary.payrollContributions).toBe(425);
    expect(summary.employerContributions).toBe(212.5);

    const inputs = goalPlanInputs({
      goals: [{ id: "g", name: "Retire", target: 1_000_000, saved: 0, color: "#1", priority: 1, fundingMode: "fixed", monthlyAmount: 0, deadlineMonths: 0, interestRate: 0, note: "", createdAt: "", accountId: "k" }],
      accounts,
      month: { incomes: [], expenses: [], note: "" },
      recurringSurplus: 1000,
      override: null,
    });
    // The goal receives everything the 401(k) gets, but none of it leaves the shared surplus.
    expect(inputs.dedicatedMonthly).toEqual({ g: 637.5 });
    expect(inputs.routedToGoals).toBe(0);
    expect(inputs.routedElsewhere).toBe(100);
    expect(inputs.monthlySurplus).toBe(900);
  });

  test("payroll contributions never trigger the over-allocation warning", () => {
    const accounts = [account({ id: "k", monthlyContribution: 1500, employerMonthlyContribution: 500 })];
    const signals = buildFinancialSignals({
      projection,
      debtSummary: calculateDebtSummary([]),
      accounts,
      assetSummary: calculateAssetSummary(accounts),
      month: { incomes: [], expenses: [], note: "" },
      savingsTarget: 20,
    });
    expect(signals.map((signal) => signal.id)).not.toContain("contribution-over-allocation");
  });

  test("plan signals: match shortfall, exceeded limit, expiring FSA", () => {
    const state = createInitialState("US");
    state.taxProfile.grossAnnualSalary = SALARY;
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
    const signals = buildPlanSignals({
      accounts: [
        account({ id: "k", name: "Work 401(k)", contributionPercent: 2, monthlyContribution: 141.67, employerMatchPercent: 100, employerMatchCapPercent: 4 }),
        account({ id: "r", name: "Roth", type: "roth-ira", contributionSource: "personal", monthlyContribution: 800 }),
        account({ id: "f", name: "FSA", accountClass: "savings", type: "fsa", balance: 600 }),
      ],
      taxProfile: state.taxProfile,
      healthPlan: state.healthPlan,
      months: {},
      region: "US",
      formatter,
      today: new Date(2026, 10, 15),
    });
    const ids = signals.map((signal) => signal.id);
    expect(ids).toContain("match-shortfall-k");
    expect(ids).toContain("limit-exceeded-ira");
    expect(ids).toContain("fsa-expiring");
    expect(signals.find((signal) => signal.id === "match-shortfall-k")?.detail).toContain("$1,700");
  });
});
