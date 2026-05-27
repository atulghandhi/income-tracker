export type IncomeEntry = {
  id: string;
  source: string;
  amount: number;
  color: string;
};

export type ExpenseEntry = {
  id: string;
  name: string;
  category: string;
  amount: number;
  color: string;
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

export type LedgerState = {
  schemaVersion: number;
  currency: CurrencyCode;
  selectedMonth: string;
  months: Record<string, MonthBudget>;
  goal: Goal;
  savingsTarget: number;
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

export type CurrencyCode = "GBP" | "USD" | "EUR" | "CAD" | "AUD" | "INR" | "JPY";
