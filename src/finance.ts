import type {
  CurrencyCode,
  DebtAccount,
  DebtSummary,
  ExpenseEntry,
  FinancialSignal,
  HealthScoreBreakdown,
  IncomeEntry,
  LedgerState,
  MonthBudget,
  MonthlyFlowPoint,
  NetWorthPoint,
  Projection,
} from "./types";

export const CURRENT_SCHEMA_VERSION = 4;

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
    debts: [],
    categoryRules: [],
    importBatches: [],
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

export function calculateDebtSummary(debts: DebtAccount[]): DebtSummary {
  const activeDebts = debts.filter((debt) => debt.balance > 0);
  const totalDebt = activeDebts.reduce((sum, debt) => sum + Number(debt.balance || 0), 0);
  const totalCreditLimit = debts.reduce((sum, debt) => sum + Math.max(0, Number(debt.creditLimit || 0)), 0);
  const availableCredit = Math.max(0, totalCreditLimit - totalDebt);
  const utilization = totalCreditLimit > 0 ? (totalDebt / totalCreditLimit) * 100 : 0;
  const monthlyMinimums = activeDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.minimumPayment || 0)), 0);
  const weightedApr =
    totalDebt > 0 ? activeDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.apr || 0)) * debt.balance, 0) / totalDebt : 0;
  const nextDueDay = activeDebts
    .map((debt) => clampDueDay(debt.dueDay))
    .sort((a, b) => a - b)[0] ?? null;

  return {
    totalDebt,
    totalCreditLimit,
    availableCredit,
    utilization,
    monthlyMinimums,
    weightedApr,
    nextDueDay,
  };
}

export function buildNetWorthOutlook({
  debts,
  projection,
  startingCash,
  months,
  startDate = new Date(),
}: {
  debts: DebtAccount[];
  projection: Projection;
  startingCash: number;
  months: number;
  startDate?: Date;
}): NetWorthPoint[] {
  const debtBalances = debts.map((debt) => ({
    balance: Math.max(0, Number(debt.balance || 0)),
    monthlyPayment: Math.max(0, Number(debt.minimumPayment || 0)),
    apr: Math.max(0, Number(debt.apr || 0)),
    interestFreeMonths: Math.max(0, Math.round(Number(debt.interestFreeMonths || 0))),
    includeInNetWorth: debt.includeInNetWorth !== false,
  }));
  let projectedCash = startingCash;

  return Array.from({ length: months + 1 }, (_, monthIndex) => {
    let interestCharged = 0;

    if (monthIndex > 0) {
      projectedCash += projection.monthlySurplus;
      debtBalances.forEach((debt) => {
        if (debt.balance <= 0) return;
        const interestApplies = monthIndex > debt.interestFreeMonths;
        const monthlyInterest = interestApplies ? debt.balance * (debt.apr / 100 / 12) : 0;
        interestCharged += monthlyInterest;
        debt.balance = Math.max(0, debt.balance + monthlyInterest - debt.monthlyPayment);
      });
    }

    const debtBalance = debtBalances
      .filter((debt) => debt.includeInNetWorth)
      .reduce((sum, debt) => sum + debt.balance, 0);
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + monthIndex, 1);

    return {
      monthIndex,
      label: new Intl.DateTimeFormat("en", { month: "short", year: monthIndex % 12 === 0 ? "2-digit" : undefined }).format(date),
      netWorth: projectedCash - debtBalance,
      debtBalance,
      projectedCash,
      interestCharged,
    };
  });
}

export function buildMonthlyFlowPoints(ledger: LedgerState): MonthlyFlowPoint[] {
  const [year] = ledger.selectedMonth.split("-").map(Number);

  return Array.from({ length: 12 }, (_, index) => {
    const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
    const month = ledger.months[monthKey];
    const projection = calculateProjection(month ?? emptyBudget);

    return {
      monthKey,
      label: new Date(year, index, 1).toLocaleString("en", { month: "short" }),
      income: projection.monthlyIncome,
      expenses: projection.monthlyExpenses,
      surplus: projection.monthlySurplus,
      hasData: Boolean(month && (month.incomes.length || month.expenses.length || month.note)),
    };
  });
}

export function calculateHealthScore({
  projection,
  debtSummary,
  debts,
  savingsTarget,
}: {
  projection: Projection;
  debtSummary: DebtSummary;
  debts: DebtAccount[];
  savingsTarget: number;
}): HealthScoreBreakdown {
  const income = projection.monthlyIncome;
  const expenseRatio = income > 0 ? projection.monthlyExpenses / income : projection.monthlyExpenses > 0 ? 2 : 0;
  const paymentPressure = income > 0 ? debtSummary.monthlyMinimums / income : debtSummary.monthlyMinimums > 0 ? 1 : 0;
  const cardStats = calculateCreditCardStats(debts);
  const activeHighAprDebt = debts.some((debt) => debt.balance > 0 && debt.apr >= 20 && debt.interestFreeMonths <= 0);
  const paymentNotReducingDebt = debts.some((debt) => {
    if (debt.balance <= 0 || debt.apr <= 0 || debt.interestFreeMonths > 0) return false;
    return debt.minimumPayment <= debt.balance * (debt.apr / 100 / 12);
  });

  const cashFlowScore = clampPercent(
    income <= 0
      ? projection.monthlyExpenses > 0 || debtSummary.monthlyMinimums > 0
        ? 20
        : 70
      : 100 - Math.max(0, expenseRatio - 0.65) * 115 + Math.max(0, projection.savingsRate) * 0.25,
  );
  const debtLoadScore = clampPercent(100 - Math.min(60, Math.max(0, debtSummary.totalDebt / Math.max(income * 12, 1)) * 45));
  const utilizationScore = clampPercent(100 - cardStats.totalUtilization * 0.95 - Math.max(0, cardStats.maxUtilization - 70) * 0.55);
  const paymentPressureScore = clampPercent(100 - paymentPressure * 190);
  const savingsScore = clampPercent(60 + projection.savingsRate * 1.7 - Math.max(0, savingsTarget - projection.savingsRate) * 1.1);

  let score = cashFlowScore * 0.32 + debtLoadScore * 0.16 + utilizationScore * 0.22 + paymentPressureScore * 0.18 + savingsScore * 0.12;
  if (projection.monthlySurplus < 0) score -= 10;
  if (cardStats.maxUtilization >= 90) score -= 8;
  if (cardStats.totalUtilization >= 80) score -= 9;
  if (paymentPressure >= 0.35) score -= 7;
  if (activeHighAprDebt) score -= 4;
  if (paymentNotReducingDebt) score -= 9;
  score = clampPercent(score);

  const estimatedCreditScore = estimateCreditScore({
    projection,
    debtSummary,
    totalUtilization: cardStats.totalUtilization,
    maxUtilization: cardStats.maxUtilization,
    paymentPressure,
    activeHighAprDebt,
  });

  return {
    score: roundTo(score / 10, 1),
    estimatedCreditScore,
    cashFlowScore: roundTo(cashFlowScore, 0),
    debtLoadScore: roundTo(debtLoadScore, 0),
    utilizationScore: roundTo(utilizationScore, 0),
    paymentPressureScore: roundTo(paymentPressureScore, 0),
    savingsScore: roundTo(savingsScore, 0),
    summary: score >= 78 ? "Strong" : score >= 58 ? "Stable" : score >= 38 ? "Tight" : "At risk",
    detail:
      "Calculated from income cover, outflow, savings rate, debt balance, monthly payment pressure, card utilisation, active APR exposure, and whether payments appear to reduce balances. The credit score is a rough local estimate, not a bureau score.",
  };
}

export function buildFinancialSignals({
  projection,
  debtSummary,
  debts,
  month,
  savingsTarget,
}: {
  projection: Projection;
  debtSummary: DebtSummary;
  debts: DebtAccount[];
  month: MonthBudget;
  savingsTarget: number;
}): FinancialSignal[] {
  const signals: FinancialSignal[] = [];
  const income = projection.monthlyIncome;
  const expenseRatio = income > 0 ? (projection.monthlyExpenses / income) * 100 : projection.monthlyExpenses > 0 ? 100 : 0;
  const paymentPressure = income > 0 ? (debtSummary.monthlyMinimums / income) * 100 : debtSummary.monthlyMinimums > 0 ? 100 : 0;
  const cardStats = calculateCreditCardStats(debts);

  if (income <= 0 && (projection.monthlyExpenses > 0 || debtSummary.monthlyMinimums > 0)) {
    signals.push({
      id: "missing-income",
      title: "Income missing",
      summary: "Outflows or debt payments exist but no income is entered for this month.",
      detail: "Without income, cash-flow and debt pressure are likely overstated. Add regular pay or other inflows before trusting the forecast.",
      tone: "warning",
    });
  }

  if (income > 0 && projection.monthlyExpenses > income) {
    signals.push({
      id: "outflow-pressure",
      title: "Outflow is higher than income",
      summary: `Outflow is ${formatRatio(expenseRatio)} of income for the selected month.`,
      detail: "Spending more than income usually means savings fall or debt rises unless this is a planned one-off month.",
      tone: "danger",
    });
  }

  const over90Cards = cardStats.cards.filter((card) => card.utilization >= 90);
  over90Cards.slice(0, 3).forEach((card) => {
    signals.push({
      id: `card-utilization-${card.id}`,
      title: "Card utilisation over 90%",
      summary: `${card.name} is at ${formatRatio(card.utilization)} of its credit limit.`,
      detail: "Very high utilisation can drag down a credit-score estimate and leaves little room for interest, fees, or unexpected spending.",
      tone: "danger",
    });
  });

  if (cardStats.totalLimit > 0 && cardStats.totalUtilization >= 80) {
    signals.push({
      id: "total-credit-utilization",
      title: "Overall credit utilisation over 80%",
      summary: `Cards use ${formatRatio(cardStats.totalUtilization)} of available credit.`,
      detail: "High total utilisation is a classic pressure signal. Paying balances below 50%, then below 30%, usually gives the forecast more breathing room.",
      tone: cardStats.totalUtilization >= 90 ? "danger" : "warning",
    });
  }

  if (paymentPressure >= 35) {
    signals.push({
      id: "debt-payment-pressure-high",
      title: "Debt payments are heavy",
      summary: `Tracked monthly payments are ${formatRatio(paymentPressure)} of income.`,
      detail: "When debt payments take more than about a third of income, missed payments and new borrowing become easier to trigger.",
      tone: "danger",
    });
  } else if (paymentPressure >= 20) {
    signals.push({
      id: "debt-payment-pressure",
      title: "Debt payments need watching",
      summary: `Tracked monthly payments are ${formatRatio(paymentPressure)} of income.`,
      detail: "This payment load can limit saving and absorb cash-flow shocks, especially if income varies month to month.",
      tone: "warning",
    });
  }

  debts
    .filter((debt) => debt.balance > 0 && debt.apr >= 20 && debt.interestFreeMonths <= 0)
    .slice(0, 2)
    .forEach((debt) => {
      signals.push({
        id: `high-apr-${debt.id}`,
        title: "High interest is active",
        summary: `${debt.name} has ${formatRatio(debt.apr)} APR applying now.`,
        detail: "High APR compounds the balance quickly, so paying above the monthly minimum has an outsized effect on future net worth.",
        tone: "warning",
      });
    });

  debts
    .filter((debt) => debt.balance > 0 && debt.apr > 0 && debt.interestFreeMonths > 0 && debt.interestFreeMonths <= 3)
    .slice(0, 2)
    .forEach((debt) => {
      signals.push({
        id: `promo-ending-${debt.id}`,
        title: "Interest-free period ending soon",
        summary: `${debt.name} has ${debt.interestFreeMonths} 0% ${debt.interestFreeMonths === 1 ? "month" : "months"} left.`,
        detail: "The net-worth forecast starts applying APR after the 0% period. Plan payments before that date if the balance is still material.",
        tone: "warning",
      });
    });

  debts
    .filter((debt) => {
      if (debt.balance <= 0 || debt.apr <= 0 || debt.interestFreeMonths > 0) return false;
      return debt.minimumPayment <= debt.balance * (debt.apr / 100 / 12);
    })
    .slice(0, 2)
    .forEach((debt) => {
      signals.push({
        id: `interest-only-${debt.id}`,
        title: "Payment may not reduce balance",
        summary: `${debt.name}'s monthly payment is at or below estimated monthly interest.`,
        detail: "If the payment only covers interest, the balance may stall or grow. Increase payment or reduce APR to improve the outlook.",
        tone: "danger",
      });
    });

  if (income > 0 && projection.savingsRate < 0) {
    signals.push({
      id: "negative-savings-rate",
      title: "Negative savings rate",
      summary: `Savings rate is ${formatRatio(projection.savingsRate)}.`,
      detail: "A negative savings rate means the month is funded from existing cash, credit, or overdraft unless there is a planned one-off reason.",
      tone: "danger",
    });
  } else if (income > 0 && projection.savingsRate < savingsTarget) {
    signals.push({
      id: "savings-target-gap",
      title: "Savings target gap",
      summary: `Savings rate is ${formatRatio(projection.savingsRate)} against a ${formatRatio(savingsTarget)} target.`,
      detail: "Missing the savings target is not always urgent, but repeated misses weaken the net-worth forecast.",
      tone: "info",
    });
  }

  const uncategorizedShare = projection.monthlyExpenses > 0 ? (projection.unpaidTotal / projection.monthlyExpenses) * 100 : 0;
  if (uncategorizedShare > 30 && month.expenses.length > 0) {
    signals.push({
      id: "categorization-gap",
      title: "Uncategorised spend is high",
      summary: `${formatRatio(uncategorizedShare)} of outflow is not categorised.`,
      detail: "This weakens category insights and can hide which spending area is causing pressure. Full categorisation is healthy, not an anomaly.",
      tone: "info",
    });
  }

  if (!signals.length) {
    signals.push({
      id: "no-urgent-signals",
      title: "No urgent financial signals",
      summary: "Income covers outflow and tracked credit pressure is under the main warning thresholds.",
      detail: "This does not guarantee everything is perfect, but nothing in the current local data crosses a high-risk threshold.",
      tone: "good",
    });
  }

  return signals.slice(0, 6);
}

export function sumAmounts(items: Array<IncomeEntry | ExpenseEntry>): number {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function clampDueDay(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(31, Math.round(value)));
}

export function clampWholeNumber(value: number, max = 600): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function calculateCreditCardStats(debts: DebtAccount[]) {
  const cards = debts
    .filter((debt) => debt.type === "credit-card" && debt.creditLimit > 0)
    .map((debt) => ({
      id: debt.id,
      name: debt.name,
      balance: Math.max(0, Number(debt.balance || 0)),
      limit: Math.max(0, Number(debt.creditLimit || 0)),
      utilization: (Math.max(0, Number(debt.balance || 0)) / Math.max(1, Number(debt.creditLimit || 0))) * 100,
    }));
  const totalBalance = cards.reduce((sum, card) => sum + card.balance, 0);
  const totalLimit = cards.reduce((sum, card) => sum + card.limit, 0);
  const totalUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const maxUtilization = cards.reduce((max, card) => Math.max(max, card.utilization), 0);

  return {
    cards,
    totalBalance,
    totalLimit,
    totalUtilization,
    maxUtilization,
  };
}

function estimateCreditScore({
  projection,
  debtSummary,
  totalUtilization,
  maxUtilization,
  paymentPressure,
  activeHighAprDebt,
}: {
  projection: Projection;
  debtSummary: DebtSummary;
  totalUtilization: number;
  maxUtilization: number;
  paymentPressure: number;
  activeHighAprDebt: boolean;
}) {
  let estimate = 700;

  if (totalUtilization >= 90) estimate -= 120;
  else if (totalUtilization >= 80) estimate -= 95;
  else if (totalUtilization >= 50) estimate -= 50;
  else if (totalUtilization >= 30) estimate -= 20;
  else if (totalUtilization > 0 && totalUtilization <= 10) estimate += 30;

  if (maxUtilization >= 90) estimate -= 40;
  else if (maxUtilization >= 80) estimate -= 24;

  if (paymentPressure >= 0.35) estimate -= 45;
  else if (paymentPressure >= 0.2) estimate -= 22;

  if (projection.monthlyIncome <= 0 && debtSummary.totalDebt > 0) estimate -= 70;
  else if (projection.monthlySurplus < 0) estimate -= 55;
  else if (projection.savingsRate >= 20) estimate += 20;

  if (activeHighAprDebt) estimate -= 15;
  if (debtSummary.totalDebt === 0 && projection.monthlyIncome > 0) estimate += 20;

  return Math.max(300, Math.min(850, Math.round(estimate)));
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatRatio(value: number) {
  return `${roundTo(value, 1).toLocaleString("en", { maximumFractionDigits: 1 })}%`;
}

export function buildCsvExport(state: LedgerState): string {
  const rows = [["month", "currency", "type", "date", "name", "category", "amount", "note"]];

  Object.entries(state.months).forEach(([monthKey, month]) => {
    month.incomes.forEach((income) => {
      rows.push([monthKey, state.currency, "income", income.date ?? "", income.source, "", String(income.amount), ""]);
    });

    month.expenses.forEach((expense) => {
      rows.push([monthKey, state.currency, "expense", expense.date ?? "", expense.name, expense.category, String(expense.amount), ""]);
    });

    if (month.note) {
      rows.push([monthKey, state.currency, "note", "", "month note", "", "", month.note]);
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
