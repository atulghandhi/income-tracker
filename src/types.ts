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
};

export type Goal = {
  id: string;
  name: string;
  saved: number;
  target: number;
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
  goal: Goal;
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
};

export type CurrencyCode = "GBP" | "USD" | "EUR" | "CAD" | "AUD" | "INR" | "JPY";
