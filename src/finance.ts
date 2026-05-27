import type { CurrencyCode, ExpenseEntry, IncomeEntry, LedgerState, MonthBudget, Projection } from "./types";

export const CURRENT_SCHEMA_VERSION = 3;

export const colors = ["#12b886", "#6c5ce7", "#ff6b6b", "#f59f00", "#15aabf", "#845ef7", "#51cf66", "#ff922b"];

export const currencyOptions: Array<{ code: CurrencyCode; label: string; locale: string }> = [
  { code: "GBP", label: "GBP (£)", locale: "en-GB" },
  { code: "USD", label: "USD ($)", locale: "en-US" },
  { code: "EUR", label: "EUR (€)", locale: "en-IE" },
  { code: "CAD", label: "CAD ($)", locale: "en-CA" },
  { code: "AUD", label: "AUD ($)", locale: "en-AU" },
  { code: "INR", label: "INR (₹)", locale: "en-IN" },
  { code: "JPY", label: "JPY (¥)", locale: "ja-JP" },
];

export function getCurrencyFormatter(currency: CurrencyCode): Intl.NumberFormat {
  const option = currencyOptions.find((item) => item.code === currency) ?? currencyOptions[0];
  return new Intl.NumberFormat(option.locale, {
    style: "currency",
    currency: option.code,
    maximumFractionDigits: option.code === "JPY" ? 0 : 0,
  });
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  const formatter = getCurrencyFormatter(currency);
  return formatter.formatToParts(0).find((part) => part.type === "currency")?.value ?? currency;
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export function shiftMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return getMonthKey(new Date(year, month - 1 + offset, 1));
}

export const emptyBudget: MonthBudget = {
  incomes: [],
  expenses: [],
  note: "",
};

export function createInitialState(): LedgerState {
  const selectedMonth = getMonthKey();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    currency: "GBP",
    selectedMonth,
    months: {
      [selectedMonth]: emptyBudget,
    },
    goal: {
      id: createId("goal"),
      name: "",
      saved: 0,
      target: 0,
    },
    savingsTarget: 20,
    privacyMode: false,
    lastSavedAt: new Date().toISOString(),
  };
}

export function seedMonthFromPrevious(previous?: MonthBudget): MonthBudget {
  if (!previous) {
    return {
      incomes: [],
      expenses: [],
      note: "",
    };
  }

  return {
    incomes: [],
    expenses: [],
    note: previous.note,
  };
}

export function calculateProjection(month: MonthBudget): Projection {
  const monthlyIncome = sumAmounts(month.incomes);
  const monthlyExpenses = sumAmounts(month.expenses);
  const paidTotal = month.expenses
    .filter((expense) => expense.category.trim())
    .reduce((sum, expense) => sum + expense.amount, 0);
  const unpaidTotal = monthlyExpenses - paidTotal;
  const monthlySurplus = monthlyIncome - monthlyExpenses;
  const annualIncome = monthlyIncome * 12;
  const annualExpenses = monthlyExpenses * 12;
  const annualSurplus = monthlySurplus * 12;
  const savingsRate = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0;

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    annualIncome,
    annualExpenses,
    annualSurplus,
    savingsRate,
    paidTotal,
    unpaidTotal,
  };
}

export function sumAmounts(items: Array<IncomeEntry | ExpenseEntry>): number {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function buildCsvExport(state: LedgerState): string {
  const rows = [["month", "currency", "type", "name", "category", "amount", "note"]];

  Object.entries(state.months).forEach(([monthKey, month]) => {
    month.incomes.forEach((income) => {
      rows.push([monthKey, state.currency, "income", income.source, "", String(income.amount), ""]);
    });

    month.expenses.forEach((expense) => {
      rows.push([monthKey, state.currency, "expense", expense.name, expense.category, String(expense.amount), ""]);
    });

    if (month.note) {
      rows.push([monthKey, state.currency, "note", "month note", "", "", month.note]);
    }
  });

  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          return value.includes(",") || value.includes("\"") || value.includes("\n") ? `"${value.replaceAll("\"", "\"\"")}"` : value;
        })
        .join(","),
    )
    .join("\n");
}
