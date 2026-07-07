export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  color: string;
  // Whether this inflow repeats every month. Recurring items drive the annual run-rate and
  // net-worth forecast; one-offs are counted once. Manual entries default to recurring,
  // imported bank rows default to one-off.
  recurring: boolean;
  date?: string;
  imported?: ImportedTransactionMeta;
};

export type ExpenseEntry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  color: string;
  // See IncomeEntry.recurring — same meaning for outflows.
  recurring: boolean;
  date?: string;
  imported?: ImportedTransactionMeta;
  // Links this payment to a debt account. For any month that has linked payments, their sum
  // replaces that account's scheduled monthly payment in the balance roll-forward — so an
  // imported overpayment reduces the debt by the real amount instead of the scheduled one.
  debtAccountId?: string;
};

export type GoalFundingMode = "fixed" | "fill" | "auto";

export type SavingsGoal = {
  id: string;
  name: string;
  target: number;
  saved: number;            // already saved (seed value counts from day 0)
  color: string;
  priority: number;         // 1 = highest; goals sorted ascending
  fundingMode: GoalFundingMode;
  monthlyAmount: number;    // contribution per month (fixed/auto); engine writes auto
  deadlineMonths: number;   // 0 = no deadline; >0 = must complete within N months
  interestRate: number;     // optional AER % compounded monthly on accumulated balance; 0 = flat
  note: string;
  createdAt: string;
};

export type MonthBudget = {
  incomes: IncomeEntry[];
  expenses: ExpenseEntry[];
  note: string;
};

export type ImportedTransactionMeta = {
  batchId: string;
  fileName: string;
  rowNumber: number;
  hash: string;
  originalDescription: string;
  importedAt: string;
};

export type ImportedTransactionRef = {
  monthKey: string;
  entryId: string;
  kind: "income" | "expense";
};

export type ImportBatch = {
  id: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  transactionRefs: ImportedTransactionRef[];
};

export type TransactionKind = "income" | "expense" | "debt-payment" | "transfer";

export type CategoryRule = {
  id: string;
  pattern: string;
  category: string;
  kind: TransactionKind;
  // For debt-payment rules: future imports matching this pattern auto-link to this account.
  debtAccountId?: string;
  createdAt: string;
  updatedAt: string;
};

export type DebtAccountType = "credit-card" | "loan" | "overdraft" | "other";

// Asset sub-types (for the savings/debit/investment side)
export type AssetAccountType = "current" | "savings" | "isa" | "investment" | "pension" | "other-asset";

// The high-level class decides whether the balance adds to or subtracts from net worth,
// and which fields are meaningful.
export type AccountClass = "cash" | "savings" | "investment" | "debt";

export type AccountType = DebtAccountType | AssetAccountType;

export type Account = {
  id: string;
  name: string;
  accountClass: AccountClass;
  type: AccountType;
  balance: number;
  // Growth — unified across every class.
  // rate    = ongoing annual %: APR for debt, AER for savings, expected return for investment.
  // promoRate / promoMonths = an intro offer that applies for the first N months, then `rate` takes over.
  //   A 0%-for-18-months credit card is { promoRate: 0, promoMonths: 18, rate: 24.9 }.
  //   A 5%-for-12-months intro saver is { promoRate: 5, promoMonths: 12, rate: 2 }.
  rate: number;
  promoRate: number;
  promoMonths: number;
  // Assets only: how much monthly surplus is routed into this account.
  monthlyContribution: number;
  // Debt only.
  creditLimit: number;
  minimumPayment: number;
  dueDay: number;
  // Month key ("YYYY-MM") the stored balance was last set in. Debt balances are never shown
  // raw: they are rolled forward from this anchor to the current month, paying the scheduled
  // monthly payment (or that month's linked ledger payments) and charging interest along the
  // way. Editing the balance re-anchors to the current month.
  balanceAsOf: string;
  // Shared.
  includeInNetWorth: boolean;
  color: string;
  note: string;
};

// Back-compat alias for code/signatures still referring to a debt account shape.
export type DebtAccount = Account;

export type LedgerState = {
  schemaVersion: number;
  currency: CurrencyCode;
  selectedMonth: string;
  months: Record<string, MonthBudget>;
  /** Multi-goal list, ordered by priority ascending. Replaces the old single `goal`. */
  goals: SavingsGoal[];
  /** Surplus figure used by the goal planner. null = derive from live ledger recurring surplus. */
  goalPlannerSurplus: number | null;
  /** How many months the goal waterfall simulates. Default 60. */
  goalsHorizonMonths: number;
  /** Which goal ID the Ledger view widget shows. null = show goals[0]. */
  ledgerGoalId: string | null;
  savingsTarget: number;
  accounts: Account[];
  assumedInvestmentReturn: number;
  categoryRules: CategoryRule[];
  importBatches: ImportBatch[];
  privacyMode: boolean;
  lastSavedAt: string;
};

export type Projection = {
  // Actuals for the selected month — every item, recurring and one-off.
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  // Recurring-only run rate — the steady monthly flow that repeats. Used by the net-worth forecast.
  recurringMonthlyIncome: number;
  recurringMonthlyExpenses: number;
  recurringMonthlySurplus: number;
  // Annual projection: recurring items × 12, plus this month's one-offs counted once.
  annualIncome: number;
  annualExpenses: number;
  annualSurplus: number;
  savingsRate: number;
  paidTotal: number;
  unpaidTotal: number;
  // How many items in the selected month are flagged one-off (excluded from the run rate).
  oneOffCount: number;
};

export type DebtSummary = {
  totalDebt: number;
  totalCreditLimit: number;
  availableCredit: number;
  utilization: number;
  monthlyMinimums: number;
  weightedApr: number;
  nextDueDay: number | null;
};

export type AssetSummary = {
  totalAssets: number;
  totalCash: number;
  totalSavings: number;
  totalInvestments: number;
  monthlyContributions: number;
  weightedAssetRate: number;
};

export type NetWorthSummary = {
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
};

export type NetWorthPoint = {
  monthIndex: number;
  label: string;
  netWorth: number;
  assetBalance: number;
  cashBalance: number;
  savingsBalance: number;
  investmentBalance: number;
  debtBalance: number;
  interestCharged: number;
  growthEarned: number;
};

export type MonthlyFlowPoint = {
  monthKey: string;
  label: string;
  income: number;
  expenses: number;
  surplus: number;
  hasData: boolean;
};

export type FinancialSignalTone = "good" | "info" | "warning" | "danger";

export type FinancialSignal = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  tone: FinancialSignalTone;
};

export type HealthScoreBreakdown = {
  score: number;
  estimatedCreditScore: number;
  cashFlowScore: number;
  debtLoadScore: number;
  utilizationScore: number;
  paymentPressureScore: number;
  savingsScore: number;
  summary: string;
  detail: string;
  /** True when there is no income, expense, or debt data to score against. */
  noData: boolean;
};

// ─── Goal sequencing ─────────────────────────────────────────────────────────

export type GoalMonthPoint = {
  month: number;       // 1-based index in the simulation
  label: string;       // e.g. "Jul 2025"
  perGoal: Record<string, {
    accumulated: number;
    contribution: number;
    complete: boolean;
  }>;
  unallocated: number; // surplus left after all goals this month
};

export type GoalStatus = "complete" | "on-track" | "tight" | "at-risk" | "no-deadline";

export type GoalOutcome = {
  goalId: string;
  name: string;
  color: string;
  target: number;
  completionMonth: number | null; // null = not reached within horizon
  completionDate: string | null;
  shortfall: number;
  extraMonthlyNeeded: number;     // add this much per month to hit deadline
  extraMonthsNeeded: number;      // extend deadline by this many months
  status: GoalStatus;
};

export type GoalSequenceResult = {
  timeline: GoalMonthPoint[];
  goals: GoalOutcome[];
  horizonMonths: number;
  avgUnallocatedSurplus: number;
};

export type CurrencyCode = "GBP" | "USD" | "EUR" | "CAD" | "AUD" | "INR" | "JPY";
