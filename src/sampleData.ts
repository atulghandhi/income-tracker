import { colors, createId, createInitialState, getMonthKey, shiftMonth } from "./finance";
import { regionOf } from "./region";
import type { Account, CountryCode, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget, SavingsGoal } from "./types";

// Sample ledgers for trying the app out: one for the UK experience and one for the US, each with a
// realistic set of accounts (plan details included), three months of transactions, goals, a salary
// and — for the US — a health plan. The dev server loads one automatically for a fresh browser
// profile (see DEV_AUTO_SAMPLE in App.tsx); ?sample=us / ?sample=uk force a country and
// ?sample=blank starts empty. Production builds never load it.

type IncomeSpec = { source: string; amount: number; day: number; recurring?: boolean };
type ExpenseSpec = { name: string; category: string; amount: number; day: number; recurring?: boolean; varies?: number };
type GoalSpec = { name: string; target: number; saved: number; fundingMode?: SavingsGoal["fundingMode"]; deadlineMonths?: number; linkTo?: string };

type Spec = {
  incomes: IncomeSpec[];
  expenses: ExpenseSpec[];
  // Extra one-offs only in the current month / the previous months, to vary history.
  currentOnly: ExpenseSpec[];
  pastOnly: ExpenseSpec[];
  accounts: Array<Partial<Account> & Pick<Account, "name" | "accountClass" | "type" | "balance">>;
  goals: GoalSpec[];
  taxProfile: Partial<LedgerState["taxProfile"]>;
  healthPlan?: Partial<LedgerState["healthPlan"]>;
};

const US_SPEC: Spec = {
  incomes: [{ source: "Salary (take-home)", amount: 5_450, day: 1 }],
  expenses: [
    { name: "Property tax", category: "Housing", amount: 420, day: 1 },
    { name: "HOA dues", category: "Housing", amount: 95, day: 1 },
    { name: "Home insurance", category: "Housing", amount: 130, day: 3 },
    { name: "Electric", category: "Utilities", amount: 110, day: 6, varies: 30 },
    { name: "Internet", category: "Utilities", amount: 70, day: 8 },
    { name: "Cell phone", category: "Utilities", amount: 65, day: 10 },
    { name: "Groceries", category: "Food", amount: 540, day: 12, varies: 60 },
    { name: "Gas", category: "Transportation", amount: 140, day: 14, varies: 25 },
    { name: "Car insurance", category: "Transportation", amount: 125, day: 15 },
    { name: "Health insurance", category: "Medical", amount: 180, day: 1 },
    { name: "Netflix", category: "Subscriptions", amount: 15.49, day: 17 },
    { name: "Spotify", category: "Subscriptions", amount: 10.99, day: 19 },
    { name: "Gym", category: "Health", amount: 45, day: 2 },
    { name: "Dining out", category: "Food", amount: 210, day: 22, varies: 50 },
  ],
  currentOnly: [
    { name: "Doctor copay", category: "Medical", amount: 40, day: 5, recurring: false },
    { name: "CVS Pharmacy", category: "Medical", amount: 28.5, day: 9, recurring: false },
    { name: "Target", category: "", amount: 64.2, day: 11, recurring: false },
  ],
  pastOnly: [
    { name: "Dentist", category: "Medical", amount: 185, day: 7, recurring: false },
    { name: "Amazon", category: "", amount: 86.4, day: 13, recurring: false },
    { name: "Costco", category: "Food", amount: 212.7, day: 20, recurring: false },
  ],
  accounts: [
    { name: "Chase checking", accountClass: "cash", type: "current", balance: 3_200 },
    { name: "Ally HYSA", accountClass: "savings", type: "hysa", balance: 12_500, rate: 4.1, monthlyContribution: 250, contributionSource: "personal", taxTreatment: "taxable" },
    {
      name: "Fidelity 401(k)",
      accountClass: "investment",
      type: "401k",
      balance: 48_000,
      rate: 6,
      taxTreatment: "pre-tax",
      contributionSource: "payroll",
      contributionPercent: 6,
      employerMatchPercent: 50,
      employerMatchCapPercent: 6,
    },
    { name: "Vanguard Roth IRA", accountClass: "investment", type: "roth-ira", balance: 15_200, rate: 6, monthlyContribution: 300, contributionSource: "personal", taxTreatment: "roth" },
    { name: "Brokerage", accountClass: "investment", type: "investment", balance: 8_400, rate: 6, monthlyContribution: 150, contributionSource: "personal", taxTreatment: "taxable" },
    { name: "Home (estimated value)", accountClass: "investment", type: "other-asset", balance: 365_000, rate: 3 },
    {
      name: "HSA",
      accountClass: "savings",
      type: "hsa",
      balance: 2_100,
      rate: 0,
      taxTreatment: "triple",
      contributionSource: "payroll",
      monthlyContribution: 150,
      employerMonthlyContribution: 50,
      coverage: "self",
    },
    { name: "Chase Sapphire Visa", accountClass: "debt", type: "credit-card", balance: 1_850, creditLimit: 8_000, rate: 24.99, minimumPayment: 75, dueDay: 18 },
    { name: "Federal student loan", accountClass: "debt", type: "student-loan", balance: 18_400, rate: 5.5, minimumPayment: 200, dueDay: 21, studentLoanType: "federal", repaymentPlan: "standard" },
    { name: "Mortgage", accountClass: "debt", type: "mortgage", balance: 286_000, rate: 6.25, minimumPayment: 1_760, dueDay: 1, termMonths: 336 },
    { name: "Toyota auto loan", accountClass: "debt", type: "auto-loan", balance: 11_200, rate: 6.9, minimumPayment: 310, dueDay: 9, termMonths: 40 },
  ],
  goals: [
    { name: "Emergency fund", target: 18_000, saved: 0, fundingMode: "fixed", linkTo: "Ally HYSA" },
    { name: "Vacation", target: 3_000, saved: 900, fundingMode: "fill", deadlineMonths: 8 },
  ],
  taxProfile: { grossAnnualSalary: 95_000, payFrequency: "biweekly", filingStatus: "single", state: "CO", preTaxHealthPremiumMonthly: 180 },
  healthPlan: { planType: "hdhp", coverage: "self", premiumMonthly: 180, deductible: 1_650, outOfPocketMax: 4_000, planYearStartMonth: 1 },
};

const GB_SPEC: Spec = {
  incomes: [{ source: "Salary (take-home)", amount: 2_875, day: 28 }],
  expenses: [
    { name: "Rent", category: "Home", amount: 950, day: 1 },
    { name: "Council tax", category: "Bills", amount: 168, day: 1 },
    { name: "Energy", category: "Bills", amount: 120, day: 5, varies: 35 },
    { name: "Water", category: "Bills", amount: 38, day: 7 },
    { name: "Broadband", category: "Bills", amount: 32, day: 9 },
    { name: "Phone", category: "Bills", amount: 20, day: 11 },
    { name: "Groceries", category: "Food", amount: 280, day: 12, varies: 40 },
    { name: "Train season ticket", category: "Travel", amount: 140, day: 2 },
    { name: "Netflix", category: "Subscriptions", amount: 10.99, day: 17 },
    { name: "Spotify", category: "Subscriptions", amount: 10.99, day: 19 },
    { name: "Gym", category: "Health", amount: 32, day: 3 },
    { name: "Eating out", category: "Food", amount: 90, day: 22, varies: 30 },
  ],
  currentOnly: [
    { name: "Boots", category: "Health", amount: 18.6, day: 8, recurring: false },
    { name: "Amazon", category: "", amount: 45.3, day: 13, recurring: false },
  ],
  pastOnly: [
    { name: "Dentist", category: "Health", amount: 65, day: 7, recurring: false },
    { name: "John Lewis", category: "", amount: 120, day: 15, recurring: false },
    { name: "Tesco", category: "Food", amount: 84.2, day: 20, recurring: false },
  ],
  accounts: [
    { name: "Monzo current account", accountClass: "cash", type: "current", balance: 1_850 },
    { name: "Marcus easy access", accountClass: "savings", type: "savings", balance: 6_400, rate: 4, monthlyContribution: 150, contributionSource: "personal", taxTreatment: "taxable" },
    { name: "Cash ISA", accountClass: "savings", type: "isa", balance: 9_000, rate: 3.9, monthlyContribution: 100, contributionSource: "personal", taxTreatment: "tax-free" },
    { name: "Vanguard S&S ISA", accountClass: "investment", type: "isa", balance: 14_300, rate: 6, monthlyContribution: 150, contributionSource: "personal", taxTreatment: "tax-free" },
    {
      name: "Nest workplace pension",
      accountClass: "investment",
      type: "pension",
      balance: 21_500,
      rate: 6,
      taxTreatment: "pre-tax",
      contributionSource: "payroll",
      contributionPercent: 5,
      employerContributionPercent: 3,
    },
    { name: "Barclaycard", accountClass: "debt", type: "credit-card", balance: 1_150, creditLimit: 4_500, rate: 22.9, promoRate: 0, promoMonths: 6, minimumPayment: 60, dueDay: 12 },
    { name: "Student loan", accountClass: "debt", type: "student-loan", balance: 28_600, rate: 4.3, minimumPayment: 80, dueDay: 28, studentLoanPlan: "plan2" },
    { name: "Car finance", accountClass: "debt", type: "auto-loan", balance: 7_800, rate: 7.9, minimumPayment: 240, dueDay: 15, termMonths: 36 },
  ],
  goals: [
    { name: "Emergency fund", target: 8_000, saved: 0, fundingMode: "fixed", linkTo: "Marcus easy access" },
    { name: "Holiday", target: 1_500, saved: 400, fundingMode: "fill", deadlineMonths: 6 },
  ],
  taxProfile: { grossAnnualSalary: 45_000, payFrequency: "monthly", studentLoanPlan: "plan2" },
};

function clampDay(monthKey: string, day: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return `${monthKey}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

// Deterministic "random" so the same sample loads the same way every time.
function wobble(seed: number, spread: number): number {
  const unit = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1;
  return Math.round((unit - 0.5) * 2 * spread * 100) / 100;
}

function buildMonth(spec: Spec, monthKey: string, monthIndex: number, isCurrent: boolean, todayDay: number): MonthBudget {
  const incomes: IncomeEntry[] = spec.incomes.map((income, index) => ({
    id: createId("income"),
    source: income.source,
    amount: income.amount,
    color: colors[index % colors.length],
    recurring: income.recurring ?? true,
    date: clampDay(monthKey, income.day),
  }));
  const rows = [...spec.expenses, ...(isCurrent ? spec.currentOnly : spec.pastOnly)];
  const expenses: ExpenseEntry[] = rows
    // In the current month only what has already happened is in the ledger.
    .filter((expense) => !isCurrent || expense.day <= todayDay || (expense.recurring ?? true))
    .map((expense, index) => ({
      id: createId("expense"),
      name: expense.name,
      category: expense.category,
      amount: Math.round((expense.amount + (expense.varies ? wobble(monthIndex * 31 + index, expense.varies) : 0)) * 100) / 100,
      color: colors[(index + 2) % colors.length],
      recurring: expense.recurring ?? true,
      date: clampDay(monthKey, expense.day),
      categorySource: "user" as const,
    }));
  return { incomes, expenses, note: isCurrent ? "Sample data — edit or clear anything." : "" };
}

export function buildSampleLedger(country: CountryCode, today = new Date()): LedgerState {
  const region = regionOf(country);
  const spec = region === "US" ? US_SPEC : GB_SPEC;
  const base = createInitialState(country);
  const currentKey = getMonthKey(today);
  const months: Record<string, MonthBudget> = {};
  for (let offset = 2; offset >= 0; offset -= 1) {
    const key = shiftMonth(currentKey, -offset);
    months[key] = buildMonth(spec, key, offset, offset === 0, today.getDate());
  }

  const accounts: Account[] = spec.accounts.map((account, index) => ({
    id: createId("account"),
    rate: 0,
    promoRate: 0,
    promoMonths: 0,
    monthlyContribution: 0,
    creditLimit: 0,
    minimumPayment: 0,
    dueDay: 1,
    balanceAsOf: currentKey,
    promoAsOf: currentKey,
    // Balances are "as of today": earlier rows in the sample months are already in them.
    balanceSetOn: `${currentKey}-${String(today.getDate()).padStart(2, "0")}`,
    ledgerOffset: 0,
    includeInNetWorth: true,
    color: colors[index % colors.length],
    note: "",
    ...account,
  }));

  const goals: SavingsGoal[] = spec.goals.map((goal, index) => ({
    id: createId("goal"),
    name: goal.name,
    target: goal.target,
    saved: goal.saved,
    color: colors[(index + 4) % colors.length],
    priority: index + 1,
    fundingMode: goal.fundingMode ?? "fill",
    monthlyAmount: 0,
    deadlineMonths: goal.deadlineMonths ?? 0,
    interestRate: 0,
    note: "",
    createdAt: today.toISOString(),
    // A linked goal follows its account's balance and contributions (see accountLinks.ts).
    accountId: goal.linkTo ? accounts.find((account) => account.name === goal.linkTo)?.id : undefined,
  }));

  return {
    ...base,
    selectedMonth: currentKey,
    months,
    accounts,
    goals,
    defaultAccountId: accounts[0]?.id ?? null,
    taxProfile: { ...base.taxProfile, ...spec.taxProfile },
    healthPlan: { ...base.healthPlan, ...(spec.healthPlan ?? {}) },
    lastSavedAt: today.toISOString(),
  };
}

export type SampleKey = "us" | "uk";

export function sampleCountry(key: string | null): CountryCode | null {
  if (key === "us") return "US";
  if (key === "uk" || key === "gb") return "GB";
  return null;
}
