export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  color: string;
  date?: string;
  imported?: ImportedTransactionMeta;
};

export type ExpenseEntry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  color: string;
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

export type DebtAccount = {
  id: string;
  name: string;
  type: DebtAccountType;
  balance: number;
  creditLimit: number;
  apr: number;
  interestFreeMonths: number;
  minimumPayment: number;
  dueDay: number;
  includeInNetWorth: boolean;
  color: string;
  note: string;
};

export type LedgerState = {
  schemaVersion: number;
  currency: CurrencyCode;
  selectedMonth: string;
  months: Record<string, MonthBudget>;
  goal: Goal;
  savingsTarget: number;
  debts: DebtAccount[];
  categoryRules: CategoryRule[];
  importBatches: ImportBatch[];
  privacyMode: boolean;
  lastSavedAt: string;
};

export type Projection = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  annualIncome: number;
  annualExpenses: number;
  annualSurplus: number;
  savingsRate: number;
  paidTotal: number;
  unpaidTotal: number;
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

export type NetWorthPoint = {
  monthIndex: number;
  label: string;
  netWorth: number;
  debtBalance: number;
  projectedCash: number;
  interestCharged: number;
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
