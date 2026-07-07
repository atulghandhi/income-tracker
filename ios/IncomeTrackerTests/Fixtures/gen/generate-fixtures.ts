/**
 * generate-fixtures.ts
 *
 * Run with:  npx tsx generate-fixtures.ts
 * (from within ios/IncomeTrackerTests/Fixtures/gen/)
 *
 * Imports the TypeScript finance engine directly via tsx and produces a comprehensive
 * set of input→output pairs used to validate the Swift engine in FinanceEngineTests.swift.
 * Output: ../data/fixtures.json
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import {
  calculateProjection,
  calculateDebtSummary,
  calculateAssetSummary,
  calculateNetWorthSummary,
  buildNetWorthOutlook,
  buildMonthlyFlowPoints,
  calculateHealthScore,
  buildFinancialSignals,
  runGoalSequence,
  seedMonthFromPrevious,
  DEFAULT_INVESTMENT_RETURN,
  CURRENT_SCHEMA_VERSION,
} from "../../../../src/finance.js";

import type {
  Account,
  LedgerState,
  MonthBudget,
  SavingsGoal,
  IncomeEntry,
  ExpenseEntry,
} from "../../../../src/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

function makeState(partial: Partial<LedgerState> = {}): LedgerState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    currency: "GBP",
    selectedMonth: "2025-06",
    months: {},
    goals: [],
    goalPlannerSurplus: null,
    goalsHorizonMonths: 60,
    ledgerGoalId: null,
    savingsTarget: 20,
    accounts: [],
    assumedInvestmentReturn: DEFAULT_INVESTMENT_RETURN,
    categoryRules: [],
    importBatches: [],
    privacyMode: false,
    lastSavedAt: "2025-06-01T00:00:00.000Z",
    ...partial,
  };
}

function inc(id: string, source: string, amount: number, recurring = true, date?: string): IncomeEntry {
  return { id, source, amount, color: "#12b886", recurring, date };
}

function exp(id: string, name: string, category: string, amount: number, recurring = true, date?: string): ExpenseEntry {
  return { id, name, category, amount, color: "#6c5ce7", recurring, date };
}

function account(overrides: Partial<Account> & { id: string; name: string; accountClass: Account["accountClass"] }): Account {
  return {
    type: overrides.accountClass === "debt" ? "credit-card" : "current",
    balance: 0,
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    // Fixed anchor so fixtures stay deterministic; the engine fixtures never roll forward.
    balanceAsOf: "2025-06",
    includeInNetWorth: true,
    color: "#12b886",
    note: "",
    ...overrides,
  };
}

function goal(overrides: Partial<SavingsGoal> & { id: string; name: string; target: number }): SavingsGoal {
  return {
    saved: 0,
    color: "#6c5ce7",
    priority: 1,
    fundingMode: "fixed",
    monthlyAmount: 100,
    deadlineMonths: 0,
    interestRate: 0,
    note: "",
    createdAt: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// A fixed start date so label strings are deterministic
const START_DATE = new Date(2025, 5, 1); // 1 Jun 2025

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

type EngineOutputs = {
  projection: ReturnType<typeof calculateProjection>;
  debtSummary: ReturnType<typeof calculateDebtSummary>;
  assetSummary: ReturnType<typeof calculateAssetSummary>;
  netWorthSummary: ReturnType<typeof calculateNetWorthSummary>;
  netWorthOutlook?: ReturnType<typeof buildNetWorthOutlook>;
  monthlyFlow?: ReturnType<typeof buildMonthlyFlowPoints>;
  healthScore?: ReturnType<typeof calculateHealthScore>;
  signals?: ReturnType<typeof buildFinancialSignals>;
  goalSequence?: ReturnType<typeof runGoalSequence>;
  seededMonth?: ReturnType<typeof seedMonthFromPrevious>;
};

type Fixture = {
  testName: string;
  input: {
    month: MonthBudget;
    state: LedgerState;
    accounts: Account[];
    goals: SavingsGoal[];
    savingsTarget: number;
    monthlySurplus?: number;
    horizonMonths?: number;
    previousMonth?: MonthBudget;
  };
  output: EngineOutputs;
};

const fixtures: Fixture[] = [];

function computeOutputs(params: {
  month: MonthBudget;
  state: LedgerState;
  accounts: Account[];
  goals: SavingsGoal[];
  savingsTarget: number;
  monthlySurplus?: number;
  horizonMonths?: number;
  previousMonth?: MonthBudget;
}): EngineOutputs {
  const { month, state, accounts, goals, savingsTarget, monthlySurplus, horizonMonths, previousMonth } = params;
  const projection = calculateProjection(month);
  const debtSummary = calculateDebtSummary(accounts);
  const assetSummary = calculateAssetSummary(accounts);
  const netWorthSummary = calculateNetWorthSummary(accounts);

  const out: EngineOutputs = { projection, debtSummary, assetSummary, netWorthSummary };

  if (horizonMonths !== undefined) {
    out.netWorthOutlook = buildNetWorthOutlook({
      accounts,
      projection,
      months: horizonMonths,
      startDate: START_DATE,
    });
  }

  if (state.months && Object.keys(state.months).length > 0) {
    out.monthlyFlow = buildMonthlyFlowPoints(state);
  }

  out.healthScore = calculateHealthScore({ projection, debtSummary, accounts, savingsTarget });

  out.signals = buildFinancialSignals({
    projection,
    debtSummary,
    accounts,
    assetSummary,
    month,
    savingsTarget,
  });

  if (goals.length > 0) {
    out.goalSequence = runGoalSequence({
      goals,
      monthlySurplus: monthlySurplus ?? projection.recurringMonthlySurplus,
      horizonMonths: horizonMonths ?? 36,
      startDate: START_DATE,
    });
  }

  if (previousMonth !== undefined) {
    out.seededMonth = seedMonthFromPrevious(previousMonth);
  }

  return out;
}

// 1. empty_month — empty MonthBudget, no accounts
{
  const month: MonthBudget = { incomes: [], expenses: [], note: "" };
  const state = makeState({ months: { "2025-06": month } });
  const accounts: Account[] = [];
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20 };
  fixtures.push({ testName: "empty_month", input, output: computeOutputs(input) });
}

// 2. basic_month — 2 incomes, 3 expenses, mix recurring/one-off
{
  const month: MonthBudget = {
    incomes: [
      inc("i1", "Salary", 3500, true),
      inc("i2", "Freelance bonus", 400, false, "2025-06-15"),
    ],
    expenses: [
      exp("e1", "Rent",      "Home",          1200, true),
      exp("e2", "Groceries", "Food",           320, true),
      exp("e3", "New laptop","Work",          1100, false, "2025-06-10"),
    ],
    note: "June baseline",
  };
  const state = makeState({ months: { "2025-06": month } });
  const accounts: Account[] = [];
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20 };
  fixtures.push({ testName: "basic_month", input, output: computeOutputs(input) });
}

// 3. debt_heavy — 4 debt accounts at various utilizations and rates, some with promo periods
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 4000, true)],
    expenses: [
      exp("e1", "Rent", "Home", 1400, true),
      exp("e2", "Food", "Food",  400, true),
    ],
    note: "",
  };
  const accounts: Account[] = [
    account({ id: "d1", name: "Amex Platinum",    accountClass: "debt", type: "credit-card", balance: 4800, creditLimit: 6000, rate: 24.9, minimumPayment: 96, dueDay: 15 }),
    account({ id: "d2", name: "Barclaycard",       accountClass: "debt", type: "credit-card", balance: 1500, creditLimit: 5000, rate: 0,    promoRate: 0, promoMonths: 14, minimumPayment: 30, dueDay: 22 }),
    account({ id: "d3", name: "Car loan",           accountClass: "debt", type: "loan",        balance: 8200, creditLimit: 0,    rate: 6.9,  minimumPayment: 240, dueDay: 5 }),
    account({ id: "d4", name: "Overdraft",          accountClass: "debt", type: "overdraft",   balance: 350,  creditLimit: 1000, rate: 39.9, minimumPayment: 10, dueDay: 1 }),
  ];
  const state = makeState({ months: { "2025-06": month }, accounts });
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20, horizonMonths: 24 };
  fixtures.push({ testName: "debt_heavy", input, output: computeOutputs(input) });
}

// 4. investment_portfolio — 3 asset accounts (cash, savings, investment) with different rates
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 5000, true)],
    expenses: [exp("e1", "Living expenses", "Bills", 2000, true)],
    note: "",
  };
  const accounts: Account[] = [
    account({ id: "a1", name: "Current account", accountClass: "cash",       type: "current",    balance: 8000,  rate: 0,   monthlyContribution: 500 }),
    account({ id: "a2", name: "ISA",              accountClass: "savings",    type: "isa",        balance: 15000, rate: 4.5, monthlyContribution: 300, promoRate: 5.0, promoMonths: 6 }),
    account({ id: "a3", name: "S&P 500 ETF",      accountClass: "investment", type: "investment", balance: 32000, rate: 7.0, monthlyContribution: 200 }),
  ];
  const state = makeState({ months: { "2025-06": month }, accounts });
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20, horizonMonths: 60 };
  fixtures.push({ testName: "investment_portfolio", input, output: computeOutputs(input) });
}

// 5. goals_basic — 3 goals, 2 with deadlines that are achievable, waterfall over 36 months.
// surplus=1800/mo, goal1 needs (6000-1000)/200=25 months < 36, goal2 needs (2500-200)/100=23 < 36
// Both finish within deadline so the at-risk recursive solver is never triggered.
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 3200, true)],
    expenses: [
      exp("e1", "Rent", "Home", 1000, true),
      exp("e2", "Food", "Food",  400, true),
    ],
    note: "",
  };
  const accounts: Account[] = [];
  const goals: SavingsGoal[] = [
    goal({ id: "g1", name: "Emergency fund", target: 6000, saved: 1000, priority: 1, fundingMode: "fixed", monthlyAmount: 200, deadlineMonths: 36 }),
    goal({ id: "g2", name: "Holiday",         target: 2500, saved: 200,  priority: 2, fundingMode: "fixed", monthlyAmount: 100, deadlineMonths: 36 }),
    goal({ id: "g3", name: "New car deposit", target: 5000, saved: 0,    priority: 3, fundingMode: "fill",  monthlyAmount: 0,   deadlineMonths: 0 }),
  ];
  const state = makeState({ months: { "2025-06": month }, goals });
  const input = { month, state, accounts, goals, savingsTarget: 20, monthlySurplus: 1800, horizonMonths: 36 };
  fixtures.push({ testName: "goals_basic", input, output: computeOutputs(input) });
}

// 6. goals_interest — goals with interest rates.
// No deadlines set on goals so the at-risk recursive solver is never triggered.
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 4000, true)],
    expenses: [exp("e1", "Rent", "Home", 1200, true)],
    note: "",
  };
  const accounts: Account[] = [];
  const goals: SavingsGoal[] = [
    goal({ id: "g1", name: "High-yield savings",  target: 10000, saved: 1000, priority: 1, fundingMode: "fixed", monthlyAmount: 300, deadlineMonths: 0, interestRate: 4.5 }),
    goal({ id: "g2", name: "Investment pot",       target: 20000, saved: 500,  priority: 2, fundingMode: "fill",  monthlyAmount: 0,   deadlineMonths: 0, interestRate: 7.0 }),
  ];
  const state = makeState({ months: { "2025-06": month }, goals });
  const input = { month, state, accounts, goals, savingsTarget: 20, monthlySurplus: 2500, horizonMonths: 48 };
  fixtures.push({ testName: "goals_interest", input, output: computeOutputs(input) });
}

// 7. health_score_good — inputs that should produce score > 70
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 5000, true)],
    expenses: [
      exp("e1", "Rent",   "Home",  1200, true),
      exp("e2", "Food",   "Food",   500, true),
      exp("e3", "Travel", "Travel", 100, true),
    ],
    note: "",
  };
  const accounts: Account[] = [
    account({ id: "a1", name: "Savings", accountClass: "savings", type: "isa", balance: 12000, rate: 3.5 }),
  ];
  const state = makeState({ months: { "2025-06": month }, accounts });
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20 };
  fixtures.push({ testName: "health_score_good", input, output: computeOutputs(input) });
}

// 8. health_score_poor — debt > income, high utilization, negative surplus
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Part-time job", 1200, true)],
    expenses: [
      exp("e1", "Rent",        "Home",          900, true),
      exp("e2", "Credit card", "Debt payments", 500, true),
      exp("e3", "Food",        "Food",           400, true),
    ],
    note: "",
  };
  const accounts: Account[] = [
    account({ id: "d1", name: "Maxed card",   accountClass: "debt", type: "credit-card", balance: 4900, creditLimit: 5000, rate: 39.9, minimumPayment: 98 }),
    account({ id: "d2", name: "Personal loan",accountClass: "debt", type: "loan",        balance: 8000, creditLimit: 0,    rate: 29.9, minimumPayment: 280 }),
  ];
  const state = makeState({ months: { "2025-06": month }, accounts });
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 20 };
  fixtures.push({ testName: "health_score_poor", input, output: computeOutputs(input) });
}

// 9. net_worth_outlook_60 — 5 accounts, 60-month projection
{
  const month: MonthBudget = {
    incomes: [inc("i1", "Salary", 6000, true)],
    expenses: [
      exp("e1", "Mortgage",    "Home",  1800, true),
      exp("e2", "Living costs","Bills", 1200, true),
    ],
    note: "",
  };
  const accounts: Account[] = [
    account({ id: "a1", name: "Current account", accountClass: "cash",       type: "current",    balance: 5000,  rate: 0,   monthlyContribution: 500 }),
    account({ id: "a2", name: "Cash ISA",         accountClass: "savings",    type: "isa",        balance: 20000, rate: 3.8, monthlyContribution: 400 }),
    account({ id: "a3", name: "S&S ISA",          accountClass: "investment", type: "investment", balance: 45000, rate: 7.0, monthlyContribution: 600 }),
    account({ id: "d1", name: "Mortgage",          accountClass: "debt",       type: "loan",       balance: 180000,rate: 4.5, minimumPayment: 1800 }),
    account({ id: "d2", name: "Credit card",       accountClass: "debt",       type: "credit-card",balance: 2000, creditLimit: 8000, rate: 22.9, minimumPayment: 40 }),
  ];
  const state = makeState({ months: { "2025-06": month }, accounts });
  const goals: SavingsGoal[] = [];
  const input = { month, state, accounts, goals, savingsTarget: 25, horizonMonths: 60 };
  fixtures.push({ testName: "net_worth_outlook_60", input, output: computeOutputs(input) });
}

// 10. seed_from_previous — recurring + one-off items, verify only note carries forward
{
  const previousMonth: MonthBudget = {
    incomes: [
      inc("i1", "Salary",        3000, true),
      inc("i2", "One-off bonus",  500, false),
    ],
    expenses: [
      exp("e1", "Rent",       "Home",  900, true),
      exp("e2", "Annual fees","Work", 2000, false),
      exp("e3", "Food",       "Food",  350, true),
    ],
    note: "Previous month note",
  };
  const month: MonthBudget = { incomes: [], expenses: [], note: "" };
  const accounts: Account[] = [];
  const goals: SavingsGoal[] = [];
  const state = makeState({
    months: {
      "2025-05": previousMonth,
      "2025-06": month,
    },
  });
  const input = { month, state, accounts, goals, savingsTarget: 20, previousMonth };
  fixtures.push({ testName: "seed_from_previous", input, output: computeOutputs(input) });
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const outDir = resolve(__dir, "../data");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "fixtures.json");
writeFileSync(outPath, JSON.stringify(fixtures, null, 2), "utf8");
console.log(`Wrote ${fixtures.length} fixtures to ${outPath}`);
