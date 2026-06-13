import type {
  Account,
  AccountClass,
  AssetSummary,
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
  NetWorthSummary,
  Projection,
} from "./types";

export const CURRENT_SCHEMA_VERSION = 6;

export const DEFAULT_INVESTMENT_RETURN = 6;

export const ASSET_CLASSES: AccountClass[] = ["cash", "savings", "investment"];

export function isDebtClass(account: Account): boolean {
  return account.accountClass === "debt";
}

// Geometric monthly rate from an annual percentage — more accurate than a flat /12.
export function monthlyRateFromAnnual(annualPercent: number): number {
  const r = Math.max(-99.9, Number(annualPercent) || 0) / 100;
  return Math.pow(1 + r, 1 / 12) - 1;
}

// The rate in effect at a given simulated month: promo rate during the intro window, then standard.
export function effectiveAnnualRate(account: { rate: number; promoRate: number; promoMonths: number }, monthIndex: number): number {
  const promoMonths = Math.max(0, Math.round(Number(account.promoMonths) || 0));
  return monthIndex <= promoMonths ? Number(account.promoRate) || 0 : Number(account.rate) || 0;
}

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
    accounts: [],
    assumedInvestmentReturn: DEFAULT_INVESTMENT_RETURN,
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

// A transaction repeats unless it has been explicitly flagged one-off. Treating undefined as
// recurring keeps the steady run rate stable for any data that predates the recurring flag.
export function isRecurring(item: { recurring?: boolean }): boolean {
  return item.recurring !== false;
}

export function calculateProjection(month: MonthBudget): Projection {
  const monthlyIncome = sumAmounts(month.incomes);
  const monthlyExpenses = sumAmounts(month.expenses);

  // Recurring-only run rate: the part of this month that repeats every month.
  const recurringMonthlyIncome = sumAmounts(month.incomes.filter(isRecurring));
  const recurringMonthlyExpenses = sumAmounts(month.expenses.filter(isRecurring));
  const recurringMonthlySurplus = recurringMonthlyIncome - recurringMonthlyExpenses;

  // One-offs happen once, not twelve times — so annual = recurring × 12 + this month's one-offs.
  const oneOffIncome = monthlyIncome - recurringMonthlyIncome;
  const oneOffExpenses = monthlyExpenses - recurringMonthlyExpenses;
  const oneOffCount =
    month.incomes.filter((income) => !isRecurring(income)).length +
    month.expenses.filter((expense) => !isRecurring(expense)).length;

  const paidTotal = month.expenses
    .filter((expense) => expense.category.trim())
    .reduce((sum, expense) => sum + expense.amount, 0);
  const unpaidTotal = monthlyExpenses - paidTotal;
  const monthlySurplus = monthlyIncome - monthlyExpenses;
  const annualIncome = recurringMonthlyIncome * 12 + oneOffIncome;
  const annualExpenses = recurringMonthlyExpenses * 12 + oneOffExpenses;
  const annualSurplus = annualIncome - annualExpenses;
  const savingsRate = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0;

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    recurringMonthlyIncome,
    recurringMonthlyExpenses,
    recurringMonthlySurplus,
    annualIncome,
    annualExpenses,
    annualSurplus,
    savingsRate,
    paidTotal,
    unpaidTotal,
    oneOffCount,
  };
}

export function getDebtAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.accountClass === "debt");
}

export function getAssetAccounts(accounts: Account[]): Account[] {
  return accounts.filter((account) => account.accountClass !== "debt");
}

export function calculateDebtSummary(accounts: DebtAccount[]): DebtSummary {
  const debts = getDebtAccounts(accounts);
  const activeDebts = debts.filter((debt) => debt.balance > 0);
  const totalDebt = activeDebts.reduce((sum, debt) => sum + Number(debt.balance || 0), 0);
  const totalCreditLimit = debts.reduce((sum, debt) => sum + Math.max(0, Number(debt.creditLimit || 0)), 0);
  const availableCredit = Math.max(0, totalCreditLimit - totalDebt);
  const utilization = totalCreditLimit > 0 ? (totalDebt / totalCreditLimit) * 100 : 0;
  const monthlyMinimums = activeDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.minimumPayment || 0)), 0);
  const weightedApr =
    totalDebt > 0 ? activeDebts.reduce((sum, debt) => sum + Math.max(0, Number(debt.rate || 0)) * debt.balance, 0) / totalDebt : 0;
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

export function calculateAssetSummary(accounts: Account[]): AssetSummary {
  const assets = getAssetAccounts(accounts);
  const byClass = (cls: AccountClass) =>
    assets.filter((a) => a.accountClass === cls).reduce((sum, a) => sum + Math.max(0, Number(a.balance || 0)), 0);

  const totalCash = byClass("cash");
  const totalSavings = byClass("savings");
  const totalInvestments = byClass("investment");
  const totalAssets = totalCash + totalSavings + totalInvestments;
  const monthlyContributions = assets.reduce((sum, a) => sum + Math.max(0, Number(a.monthlyContribution || 0)), 0);
  const weightedAssetRate =
    totalAssets > 0
      ? assets.reduce((sum, a) => sum + Math.max(0, Number(a.rate || 0)) * Math.max(0, Number(a.balance || 0)), 0) / totalAssets
      : 0;

  return { totalAssets, totalCash, totalSavings, totalInvestments, monthlyContributions, weightedAssetRate };
}

export function calculateNetWorthSummary(accounts: Account[]): NetWorthSummary {
  const totalAssets = getAssetAccounts(accounts)
    .filter((a) => a.includeInNetWorth !== false)
    .reduce((sum, a) => sum + Math.max(0, Number(a.balance || 0)), 0);
  const totalDebt = getDebtAccounts(accounts)
    .filter((a) => a.includeInNetWorth !== false)
    .reduce((sum, a) => sum + Math.max(0, Number(a.balance || 0)), 0);
  return { netWorth: totalAssets - totalDebt, totalAssets, totalDebt };
}

// Projects net worth forward by routing each month's surplus into the user's accounts,
// then growing/shrinking every balance at its own (promo-aware, compounding) rate.
//
// The guiding rule: moving money between a person's own accounts does not change net worth.
// Only three things move it month to month — fresh surplus in, asset growth, and debt interest.
// So contributions and debt payments are modelled as transfers out of a "cash" bucket, never as
// extra inflows/outflows. Leftover surplus collects in that cash bucket (which may go negative,
// representing drawing down reserves).
export function buildNetWorthOutlook({
  accounts,
  projection,
  months,
  startDate = new Date(),
}: {
  accounts: Account[];
  projection: Projection;
  months: number;
  startDate?: Date;
}): NetWorthPoint[] {
  const working = accounts.map((account) => ({
    accountClass: account.accountClass,
    balance: Math.max(0, Number(account.balance || 0)),
    rate: Number(account.rate || 0),
    promoRate: Number(account.promoRate || 0),
    promoMonths: Math.max(0, Math.round(Number(account.promoMonths || 0))),
    contribution: Math.max(0, Number(account.monthlyContribution || 0)),
    payment: Math.max(0, Number(account.minimumPayment || 0)),
    includeInNetWorth: account.includeInNetWorth !== false,
  }));

  // Surplus that has not been explicitly routed to a named account lands here. Always counted in
  // net worth (it is real money); allowed to go negative when contributions/payments outrun surplus.
  let unallocatedCash = 0;

  return Array.from({ length: months + 1 }, (_, monthIndex) => {
    let interestCharged = 0;
    let growthEarned = 0;

    if (monthIndex > 0) {
      // 1. Fresh surplus arrives. Only the recurring run rate repeats month to month — a one-off
      //    expense or windfall this month should not be extrapolated across the whole forecast.
      unallocatedCash += projection.recurringMonthlySurplus;

      // 2. Route contributions into asset accounts (transfer out of cash — net worth unchanged).
      working.forEach((account) => {
        if (account.accountClass === "debt" || account.contribution <= 0) return;
        account.balance += account.contribution;
        unallocatedCash -= account.contribution;
      });

      // 3. Pay debts (transfer out of cash) and apply debt interest.
      working.forEach((account) => {
        if (account.accountClass !== "debt" || account.balance <= 0) return;
        const monthlyInterest = account.balance * monthlyRateFromAnnual(effectiveAnnualRate(account, monthIndex));
        interestCharged += monthlyInterest;
        const owed = account.balance + monthlyInterest;
        const actualPayment = Math.min(account.payment, owed);
        account.balance = Math.max(0, owed - actualPayment);
        unallocatedCash -= actualPayment;
      });

      // 4. Grow asset balances at their effective compounding rate.
      working.forEach((account) => {
        if (account.accountClass === "debt") return;
        const growth = account.balance * monthlyRateFromAnnual(effectiveAnnualRate(account, monthIndex));
        growthEarned += growth;
        account.balance += growth;
      });
    }

    let cashBalance = unallocatedCash;
    let savingsBalance = 0;
    let investmentBalance = 0;
    let debtBalance = 0;

    working.forEach((account) => {
      if (!account.includeInNetWorth) return;
      if (account.accountClass === "debt") debtBalance += account.balance;
      else if (account.accountClass === "savings") savingsBalance += account.balance;
      else if (account.accountClass === "investment") investmentBalance += account.balance;
      else cashBalance += account.balance;
    });

    const assetBalance = cashBalance + savingsBalance + investmentBalance;
    const date = new Date(startDate.getFullYear(), startDate.getMonth() + monthIndex, 1);

    return {
      monthIndex,
      label: new Intl.DateTimeFormat("en", { month: "short", year: monthIndex % 12 === 0 ? "2-digit" : undefined }).format(date),
      netWorth: assetBalance - debtBalance,
      assetBalance,
      cashBalance,
      savingsBalance,
      investmentBalance,
      debtBalance,
      interestCharged,
      growthEarned,
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
  accounts,
  savingsTarget,
}: {
  projection: Projection;
  debtSummary: DebtSummary;
  accounts: Account[];
  savingsTarget: number;
}): HealthScoreBreakdown {
  const debts = getDebtAccounts(accounts);
  const income = projection.monthlyIncome;
  const expenseRatio = income > 0 ? projection.monthlyExpenses / income : projection.monthlyExpenses > 0 ? 2 : 0;
  const paymentPressure = income > 0 ? debtSummary.monthlyMinimums / income : debtSummary.monthlyMinimums > 0 ? 1 : 0;
  const cardStats = calculateCreditCardStats(debts);
  const activeHighAprDebt = debts.some((debt) => debt.balance > 0 && debt.rate >= 20 && debt.promoMonths <= 0);
  const paymentNotReducingDebt = debts.some((debt) => {
    if (debt.balance <= 0 || debt.rate <= 0 || debt.promoMonths > 0) return false;
    return debt.minimumPayment <= debt.balance * (debt.rate / 100 / 12);
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
  accounts,
  assetSummary,
  month,
  savingsTarget,
}: {
  projection: Projection;
  debtSummary: DebtSummary;
  accounts: Account[];
  assetSummary: AssetSummary;
  month: MonthBudget;
  savingsTarget: number;
}): FinancialSignal[] {
  const signals: FinancialSignal[] = [];
  const debts = getDebtAccounts(accounts);
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
    .filter((debt) => debt.balance > 0 && debt.rate >= 20 && debt.promoMonths <= 0)
    .slice(0, 2)
    .forEach((debt) => {
      signals.push({
        id: `high-apr-${debt.id}`,
        title: "High interest is active",
        summary: `${debt.name} has ${formatRatio(debt.rate)} APR applying now.`,
        detail: "High APR compounds the balance quickly, so paying above the monthly minimum has an outsized effect on future net worth.",
        tone: "warning",
      });
    });

  debts
    .filter((debt) => debt.balance > 0 && debt.rate > 0 && debt.promoMonths > 0 && debt.promoMonths <= 3)
    .slice(0, 2)
    .forEach((debt) => {
      signals.push({
        id: `promo-ending-${debt.id}`,
        title: "Interest-free period ending soon",
        summary: `${debt.name} has ${debt.promoMonths} 0% ${debt.promoMonths === 1 ? "month" : "months"} left.`,
        detail: "The net-worth forecast starts applying APR after the 0% period. Plan payments before that date if the balance is still material.",
        tone: "warning",
      });
    });

  debts
    .filter((debt) => {
      if (debt.balance <= 0 || debt.rate <= 0 || debt.promoMonths > 0) return false;
      return debt.minimumPayment <= debt.balance * (debt.rate / 100 / 12);
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

  // Emergency fund: liquid cash + savings against monthly outflow.
  const liquidReserve = assetSummary.totalCash + assetSummary.totalSavings;
  const monthlyOutflow = projection.monthlyExpenses + debtSummary.monthlyMinimums;
  if (monthlyOutflow > 0 && (assetSummary.totalCash > 0 || assetSummary.totalSavings > 0)) {
    const monthsCovered = liquidReserve / monthlyOutflow;
    if (monthsCovered < 3) {
      signals.push({
        id: "emergency-fund-low",
        title: "Emergency fund under 3 months",
        summary: `Liquid savings cover about ${roundTo(monthsCovered, 1)} ${monthsCovered === 1 ? "month" : "months"} of outflow.`,
        detail: "A common guideline is 3–6 months of essential outflow in easy-access cash or savings before locking money into investments.",
        tone: monthsCovered < 1 ? "warning" : "info",
      });
    }
  }

  // Over-allocation: routing more into accounts each month than the surplus can fund.
  if (assetSummary.monthlyContributions > 0 && projection.monthlySurplus >= 0 && assetSummary.monthlyContributions > projection.monthlySurplus + 1) {
    signals.push({
      id: "contribution-over-allocation",
      title: "Contributions exceed surplus",
      summary: "Monthly contributions are more than this month's surplus.",
      detail: "Routing more into savings and investments than your surplus covers will draw down cash over time. The forecast lets cash go negative to show this — adjust contributions or income to stay sustainable.",
      tone: "warning",
    });
  }

  // Cash drag: a large idle cash pile earning nothing while reserves are already healthy.
  if (assetSummary.totalCash > 0 && monthlyOutflow > 0) {
    const cashMonths = assetSummary.totalCash / monthlyOutflow;
    if (cashMonths >= 9 && assetSummary.totalCash >= 5000) {
      signals.push({
        id: "cash-drag",
        title: "Large cash balance is idle",
        summary: `Cash covers about ${Math.round(cashMonths)} months of outflow.`,
        detail: "Beyond a healthy emergency fund, cash held at 0% loses value to inflation. Some of this could move to interest-bearing savings or longer-term investments, depending on your plans.",
        tone: "info",
      });
    }
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
